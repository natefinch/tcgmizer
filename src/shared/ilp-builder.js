import { TCGPLAYER_MIN_ORDER_PER_SELLER, DEFAULT_TOP_K_LISTINGS } from './constants.js';

/**
 * Builds a CPLEX LP format string for the cart optimization ILP.
 *
 * @param {Object} params
 * @param {Array<CardSlot>} params.cardSlots - One entry per card×quantity copy to buy.
 *   Each: { slotId, cardName, productId, originalSkuId, quantity: 1 }
 * @param {Object<string, SellerInfo>} params.sellers - sellerId → { sellerName, shippingCost, freeShippingThreshold }
 * @param {Array<Listing>} params.listings - All available listings (pre-filtered by rating, etc.)
 *   Each: { listingId, sellerId, slotId, price, skuId, condition, setName, language }
 * @param {Object} [params.options]
 * @param {number} [params.options.topK] - Max listings to keep per card slot (default: 25)
 * @param {number} [params.options.maxSellers] - Max number of sellers to use (null = unlimited)
 * @param {number} [params.options.maxCuts] - Max cards to skip/cut (0 = none allowed)
 * @returns {{ lp: string, variableMap: Object }} LP string and mapping from variable names to listing/seller info
 */
export function buildLP({ cardSlots, sellers, listings, options = {} }) {
  const topK = options.topK || DEFAULT_TOP_K_LISTINGS;
  const maxSellers = options.maxSellers || null;
  const maxCuts = options.maxCuts || 0;

  // When maxSellers is set, pre-filter to a candidate pool of high-coverage
  // sellers. Without this, topK pruning keeps the cheapest per-slot listings
  // which scatter across thousands of low-coverage sellers, making it impossible
  // to cover all slots with a small number of sellers.
  let filteredListings = listings;
  if (maxSellers != null && maxSellers > 0) {
    filteredListings = prefilterForMinVendors(listings, cardSlots, maxSellers);
  }

  // Group listings by slotId and prune to top-K cheapest (by price, since shipping is per-seller)
  const listingsBySlot = new Map();
  for (const listing of filteredListings) {
    if (!listingsBySlot.has(listing.slotId)) {
      listingsBySlot.set(listing.slotId, []);
    }
    listingsBySlot.get(listing.slotId).push(listing);
  }

  // Sort each slot's listings by price and keep top K
  // But preserve the cheapest Direct listing per slot even if outside top-K,
  // so the solver can choose Direct when shipping consolidation is worthwhile.
  for (const [slotId, slotListings] of listingsBySlot) {
    slotListings.sort((a, b) => a.price - b.price);
    if (slotListings.length > topK) {
      const topKListings = slotListings.slice(0, topK);

      // Check if any Direct listing made it into the top-K
      const hasDirectInTopK = topKListings.some((l) => l.directListing);
      if (!hasDirectInTopK) {
        // Find the cheapest Direct listing from the full list
        const cheapestDirect = slotListings.find((l) => l.directListing);
        if (cheapestDirect) {
          topKListings.push(cheapestDirect);
        }
      }

      listingsBySlot.set(slotId, topKListings);
    }
  }

  // Price pruning: discard listings far above the median price for each slot.
  // A card may have printings ranging from $1 to $100 — the expensive ones
  // will never be part of an optimal solution. Removing them dramatically
  // reduces the number of active sellers (and hence y/z variables and
  // constraints), which keeps the ILP small enough for HiGHS WASM.
  pruneExpensiveListings(listingsBySlot);

  // Validate: every slot must have at least one listing
  for (const slot of cardSlots) {
    const available = listingsBySlot.get(slot.slotId);
    if (!available || available.length === 0) {
      throw new Error(`No listings found for card: ${slot.cardName} (slot ${slot.slotId})`);
    }
  }

  // Collect active sellers (only those with remaining listings after pruning)
  const activeSellers = new Set();
  for (const [, slotListings] of listingsBySlot) {
    for (const listing of slotListings) {
      activeSellers.add(listing.sellerId);
    }
  }

  // Build variable names and maps
  // x_{slotIndex}_{listingIndex} : buy this listing for this slot
  // y_{sellerIndex} : seller is used
  // z_{sellerIndex} : seller hits free shipping threshold
  const sellerIndex = new Map(); // sellerId → index
  let sIdx = 0;
  for (const sid of activeSellers) {
    sellerIndex.set(sid, sIdx++);
  }

  const variableMap = {
    x: {}, // varName → { slotId, listing }
    y: {}, // varName → { sellerId }
    z: {}, // varName → { sellerId }
    skip: {}, // varName → { cardName } (only when maxCuts > 0)
  };

  // Build objective terms
  const objTerms = [];
  // x variable terms (item prices)
  const xVarsBySeller = new Map(); // sellerId → [{ varName, price }]
  const xVarsBySlot = new Map(); // slotId → [varName]
  const xVarsByInventory = new Map(); // "sellerId:productConditionId" → { vars: [varName], quantity }

  for (const slot of cardSlots) {
    const slotListings = listingsBySlot.get(slot.slotId);
    const slotVars = [];

    for (let li = 0; li < slotListings.length; li++) {
      const listing = slotListings[li];
      const si = sellerIndex.get(listing.sellerId);
      const varName = `x_s${slot.slotId}_l${li}`;

      variableMap.x[varName] = { slotId: slot.slotId, listing };
      slotVars.push(varName);

      if (listing.price > 0) {
        objTerms.push(`${formatCoeff(listing.price)} ${varName}`);
      }

      // Track per-seller x vars for threshold constraints
      if (!xVarsBySeller.has(listing.sellerId)) {
        xVarsBySeller.set(listing.sellerId, []);
      }
      xVarsBySeller.get(listing.sellerId).push({ varName, price: listing.price });

      // Track per-inventory-unit x vars for quantity constraints
      // Use originalSellerId for inventory keys when available (Direct listings are
      // remapped to a synthetic seller, but inventory is still per-original-seller)
      const invSellerId = listing.originalSellerId || listing.sellerId;
      const invKey = `${invSellerId}:${listing.productConditionId}`;
      if (!xVarsByInventory.has(invKey)) {
        xVarsByInventory.set(invKey, { vars: [], quantity: listing.quantity || 1 });
      }
      xVarsByInventory.get(invKey).vars.push(varName);
    }

    xVarsBySlot.set(slot.slotId, slotVars);
  }

  // Build skip variables (one per unique card name, when maxCuts > 0)
  // skip_c{i} = 1 means all slots for that card are skipped (not purchased)
  const skipVars = []; // [varName]
  const cardNameToSkipVar = new Map(); // cardName → varName
  if (maxCuts > 0) {
    const uniqueCardNames = [...new Set(cardSlots.map((s) => s.cardName))];
    for (let ci = 0; ci < uniqueCardNames.length; ci++) {
      const cardName = uniqueCardNames[ci];
      const varName = `skip_c${ci}`;
      skipVars.push(varName);
      cardNameToSkipVar.set(cardName, varName);
      variableMap.skip[varName] = { cardName };
      // Large penalty to discourage cutting unless needed for vendor feasibility
      objTerms.push(`10000 ${varName}`);
    }
  }

  // y variable terms (shipping costs)
  // z variable terms (free shipping savings)
  const yVars = [];
  const zVars = [];

  for (const sellerId of activeSellers) {
    const si = sellerIndex.get(sellerId);
    const seller = sellers[sellerId];
    if (!seller) continue;

    const yVar = `y_v${si}`;
    variableMap.y[yVar] = { sellerId };
    yVars.push(yVar);

    if (seller.shippingCost > 0) {
      objTerms.push(`${formatCoeff(seller.shippingCost)} ${yVar}`);
    }

    if (seller.freeShippingThreshold != null && seller.freeShippingThreshold > 0) {
      const zVar = `z_v${si}`;
      variableMap.z[zVar] = { sellerId };
      zVars.push(zVar);

      if (seller.shippingCost > 0) {
        objTerms.push(`${formatCoeff(-seller.shippingCost)} ${zVar}`);
      }
    }
  }

  // --- Build LP string ---
  const lines = [];
  lines.push('Minimize');

  // Guard against empty objective (would produce invalid CPLEX)
  if (objTerms.length === 0) {
    // Add a dummy zero-cost term using the first x variable
    const firstXVar = Object.keys(variableMap.x)[0];
    if (firstXVar) {
      objTerms.push(`0 ${firstXVar}`);
      console.warn('[TCGmizer ILP] No objective terms — all prices and shipping costs are zero');
    }
  }

  // CPLEX LP format: the objective and constraints can span multiple lines
  // as long as continuation lines start with whitespace. HiGHS has an internal
  // line-length limit (~560 chars), so we must split long expressions.
  pushExpressionLines(lines, 'obj', objTerms.join(' + ').replace(/\+ -/g, '- '), null);
  lines.push('');
  lines.push('Subject To');

  // Constraint 1: Coverage — each slot assigned exactly one listing (or skipped)
  for (const slot of cardSlots) {
    const vars = xVarsBySlot.get(slot.slotId);
    const skipVar = cardNameToSkipVar.get(slot.cardName);
    if (skipVar) {
      // sum(x) + skip = 1: either buy one listing or skip the card
      pushExpressionLines(lines, `cover_${slot.slotId}`, vars.join(' + ') + ' + ' + skipVar, '= 1');
    } else {
      pushExpressionLines(lines, `cover_${slot.slotId}`, vars.join(' + '), '= 1');
    }
  }

  // Constraint 2: Seller linking — if any x for seller s is 1, then y_s = 1
  // Aggregated form: sum(x_i for seller s) - N * y_s <= 0
  // where N = number of x-vars for this seller. This is equivalent to the
  // individual x_i - y_s <= 0 constraints but produces far fewer lines,
  // keeping the LP string small enough for HiGHS WASM on large models.
  for (const sellerId of activeSellers) {
    const si = sellerIndex.get(sellerId);
    const yVar = `y_v${si}`;
    const sellerXVars = xVarsBySeller.get(sellerId);
    if (!sellerXVars) continue;

    const N = sellerXVars.length;
    const terms = sellerXVars.map(({ varName }) => varName).join(' + ');
    pushExpressionLines(lines, `link_v${si}`, `${terms} - ${N} ${yVar}`, '<= 0');
  }

  // Constraint 3: Free shipping threshold — sum(price * x) >= threshold * z
  for (const sellerId of activeSellers) {
    const si = sellerIndex.get(sellerId);
    const seller = sellers[sellerId];
    if (!seller || !seller.freeShippingThreshold || seller.freeShippingThreshold <= 0) continue;

    const zVar = `z_v${si}`;
    const sellerXVars = xVarsBySeller.get(sellerId);
    if (!sellerXVars) continue;

    const terms = sellerXVars.map(({ varName, price }) => `${formatCoeff(price)} ${varName}`).join(' + ');
    pushExpressionLines(
      lines,
      `thresh_v${si}`,
      `${terms} - ${formatCoeff(seller.freeShippingThreshold)} ${zVar}`,
      '>= 0',
    );
  }

  // Constraint 4: z <= y (can't get free shipping if you don't use the seller)
  for (const sellerId of activeSellers) {
    const si = sellerIndex.get(sellerId);
    const seller = sellers[sellerId];
    if (!seller || !seller.freeShippingThreshold || seller.freeShippingThreshold <= 0) continue;

    const zVar = `z_v${si}`;
    const yVar = `y_v${si}`;
    lines.push(` zlink_v${si}: ${zVar} - ${yVar} <= 0`);
  }

  // Note: TCGPlayer's $1 minimum per seller is NOT enforced as a hard constraint.
  // It can make the ILP infeasible when cheap cards don't aggregate enough per seller.
  // Instead, we flag sellers below the minimum in the solution parser as a warning.

  // Constraint 5: Inventory quantity — don't assign more slots to a listing than its available quantity
  // Key is "sellerId:productConditionId" identifying a single inventory unit
  let invIdx = 0;
  for (const [invKey, { vars, quantity }] of xVarsByInventory) {
    // Only add constraint when the listing appears in more slots than its quantity
    if (vars.length > quantity) {
      pushExpressionLines(lines, `inv_${invIdx}`, vars.join(' + '), `<= ${quantity}`);
    }
    invIdx++;
  }

  // Constraint 6: Maximum number of sellers (optional)
  if (maxSellers != null && maxSellers > 0 && yVars.length > maxSellers) {
    pushExpressionLines(lines, 'maxsellers', yVars.join(' + '), `<= ${maxSellers}`);
  }

  // Constraint 7: Maximum number of card cuts (optional)
  if (maxCuts > 0 && skipVars.length > 0) {
    pushExpressionLines(lines, 'maxcuts', skipVars.join(' + '), `<= ${maxCuts}`);
  }

  lines.push('');
  lines.push('Binary');
  const allBinaryVars = [...Object.keys(variableMap.x), ...yVars, ...zVars, ...skipVars];
  // Write binary variables in groups to avoid very long lines
  // (some LP readers have internal line-length limits)
  for (let i = 0; i < allBinaryVars.length; i += 10) {
    lines.push(` ${allBinaryVars.slice(i, i + 10).join(' ')}`);
  }

  lines.push('');
  lines.push('End');

  const lpString = lines.join('\n');

  console.log(
    `[TCGmizer ILP] Built LP: ${cardSlots.length} slots, ${activeSellers.size} sellers, ${Object.keys(variableMap.x).length} x-vars, ${yVars.length} y-vars, ${zVars.length} z-vars, ${objTerms.length} obj terms, ${lpString.length} chars`,
  );
  console.log(`[TCGmizer ILP] LP preview (first 500 chars):\n${lpString.substring(0, 500)}`);
  console.log(`[TCGmizer ILP] LP tail (last 200 chars):\n${lpString.substring(lpString.length - 200)}`);

  return {
    lp: lpString,
    variableMap,
    sellerIndex: Object.fromEntries(sellerIndex),
  };
}

/**
 * Push an LP expression (objective or constraint) to the lines array,
 * splitting across multiple lines if needed to stay within a safe line length.
 *
 * CPLEX LP format allows continuation lines as long as they start with whitespace.
 * HiGHS's LP reader has an internal line buffer (~560 chars), so we split at ~500.
 *
 * @param {string[]} lines - Output lines array
 * @param {string} name - Constraint/objective name (before the colon)
 * @param {string} expr - The expression (sum of terms)
 * @param {string|null} rhs - Right-hand side (e.g., '= 1', '<= 0') or null for objective
 */
function pushExpressionLines(lines, name, expr, rhs) {
  const MAX_LINE = 500;
  const prefix = ` ${name}: `;
  const suffix = rhs ? ` ${rhs}` : '';

  // If the whole thing fits on one line, just push it
  const fullLine = `${prefix}${expr}${suffix}`;
  if (fullLine.length <= MAX_LINE) {
    lines.push(fullLine);
    return;
  }

  // Split the expression into tokens (terms separated by ' + ' or ' - ')
  // We split on ' + ' and ' - ' boundaries, keeping the operator with the next term
  const tokens = expr.split(/(?= [+-] )/g);

  let currentLine = prefix;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (currentLine.length + token.length > MAX_LINE && currentLine.length > prefix.length) {
      // Start a new continuation line (must start with whitespace)
      lines.push(currentLine);
      currentLine = '  ' + token.trimStart();
    } else {
      currentLine += token;
    }
  }
  // Append RHS to last line
  currentLine += suffix;
  lines.push(currentLine);
}

/**
 * Format a number as an LP coefficient string.
 * Keeps up to 4 decimal places to avoid floating point noise.
 */
function formatCoeff(n) {
  if (n == null || Number.isNaN(n)) {
    console.warn('[TCGmizer ILP] formatCoeff received invalid value:', n);
    return '0';
  }
  // Use enough precision for cents, but avoid scientific notation
  const s = Number(n).toFixed(4);
  // Strip trailing zeros after decimal point
  return s.replace(/\.?0+$/, '') || '0';
}
/**
 * Remove listings that are far above the median price for their slot.
 *
 * For each slot, computes the median listing price and removes any listing
 * priced above 2× the median. This eliminates expensive printings/versions
 * that would never be part of an optimal solution but whose sellers add
 * y/z variables and constraints to the ILP.
 *
 * Always keeps at least 3 listings per slot (never prunes below that).
 * Listings must already be sorted by price ascending.
 *
 * @param {Map<string, Array>} listingsBySlot - slotId → sorted listings array (mutated in place)
 */
function pruneExpensiveListings(listingsBySlot) {
  const PRICE_MULTIPLIER = 2; // keep listings up to 2× median
  const MIN_KEEP = 3; // never prune below this many per slot

  let totalBefore = 0;
  let totalAfter = 0;

  for (const [slotId, slotListings] of listingsBySlot) {
    totalBefore += slotListings.length;

    if (slotListings.length <= MIN_KEEP) {
      totalAfter += slotListings.length;
      continue;
    }

    // Listings are pre-sorted by price ascending (Direct listing may be appended at end)
    const medianIdx = Math.floor(slotListings.length / 2);
    const medianPrice = slotListings[medianIdx].price;

    // Don't prune if the median is very low (avoid cutting $3 listings when median is $0.50)
    // Use at least $2 as the absolute threshold above median
    const cutoff = Math.max(medianPrice * PRICE_MULTIPLIER, medianPrice + 2);

    // Find the first index that exceeds the cutoff
    let keepCount = slotListings.length;
    for (let i = medianIdx + 1; i < slotListings.length; i++) {
      if (slotListings[i].price > cutoff) {
        keepCount = i;
        break;
      }
    }

    // Never go below MIN_KEEP
    keepCount = Math.max(keepCount, MIN_KEEP);

    if (keepCount < slotListings.length) {
      let pruned = slotListings.slice(0, keepCount);

      // Preserve the cheapest Direct listing even if above the cutoff,
      // so the solver can use Direct for shipping consolidation.
      const hasDirectInKept = pruned.some((l) => l.directListing);
      if (!hasDirectInKept) {
        const cheapestDirect = slotListings.find((l) => l.directListing);
        if (cheapestDirect) {
          pruned.push(cheapestDirect);
        }
      }

      listingsBySlot.set(slotId, pruned);
    }

    totalAfter += Math.min(keepCount, slotListings.length);
  }

  if (totalBefore > totalAfter) {
    console.log(
      `[TCGmizer ILP] Price pruning: ${totalBefore} → ${totalAfter} listings (removed ${totalBefore - totalAfter} expensive outliers)`,
    );
  }
}

/**
 * Pre-filter listings to a candidate pool of high-coverage sellers.
 *
 * When maxSellers is small, topK pruning (keeping cheapest per-slot) scatters
 * listings across many low-coverage sellers, making it impossible to cover all
 * slots with few sellers. This pre-filter selects sellers that cover the most
 * slots (a coverage-aware approach), keeping the model small and feasible.
 *
 * The candidate pool includes (all counting against the pool budget):
 *  - The synthetic Direct seller (__tcgplayer_direct__) if present
 *  - Greedy set-cover sellers for full slot coverage
 *  - The cheapest listing's seller per slot (for price floor)
 *  - Additional sellers ranked by coverage to fill remaining budget
 *
 * @param {Array} listings - All available listings
 * @param {Array} cardSlots - Card slots to cover
 * @param {number} maxSellers - Maximum number of sellers allowed
 * @returns {Array} Filtered listings from the candidate seller pool
 */
function prefilterForMinVendors(listings, cardSlots, maxSellers) {
  // Target: keep a tight pool of candidate sellers for the ILP.
  // The maxSellers constraint makes branch-and-bound exponentially harder,
  // so we need far fewer sellers than the unconstrained case.
  // Use 3× maxSellers as the candidate pool, with floor of 30.
  const CANDIDATE_POOL = Math.max(30, maxSellers * 3);

  const slotIds = new Set(cardSlots.map((s) => s.slotId));

  // Step 1: Count slot coverage for each seller, considering only relevant slots
  const sellerSlots = new Map(); // sellerId → Set<slotId>
  const sellerCheapest = new Map(); // sellerId → Map<slotId, cheapest price>
  for (const l of listings) {
    if (!slotIds.has(l.slotId)) continue;

    if (!sellerSlots.has(l.sellerId)) {
      sellerSlots.set(l.sellerId, new Set());
      sellerCheapest.set(l.sellerId, new Map());
    }
    sellerSlots.get(l.sellerId).add(l.slotId);

    const cheapMap = sellerCheapest.get(l.sellerId);
    const curr = cheapMap.get(l.slotId);
    if (curr === undefined || l.price < curr) {
      cheapMap.set(l.slotId, l.price);
    }
  }

  // Step 2: Greedy set cover to find a small set of sellers that covers all slots,
  // preferring high-coverage sellers.
  const candidateSellers = new Set();

  // Always include Direct seller — it's the whole point of this fix
  if (sellerSlots.has('__tcgplayer_direct__')) {
    candidateSellers.add('__tcgplayer_direct__');
  }

  // Greedy set cover: repeatedly pick the seller covering the most uncovered slots
  const uncoveredSlots = new Set(slotIds);
  const availableSellers = new Map(sellerSlots); // copy
  while (uncoveredSlots.size > 0 && availableSellers.size > 0) {
    let bestSeller = null;
    let bestNewCoverage = 0;
    for (const [sellerId, slots] of availableSellers) {
      let newCoverage = 0;
      for (const s of slots) {
        if (uncoveredSlots.has(s)) newCoverage++;
      }
      if (newCoverage > bestNewCoverage) {
        bestNewCoverage = newCoverage;
        bestSeller = sellerId;
      }
    }
    if (!bestSeller || bestNewCoverage === 0) break;

    candidateSellers.add(bestSeller);
    for (const s of availableSellers.get(bestSeller)) {
      uncoveredSlots.delete(s);
    }
    availableSellers.delete(bestSeller);
  }

  // Step 3: Ensure cheapest listing per slot is included (for price floor).
  // These count against the CANDIDATE_POOL budget so they don't blow past it.
  const cheapestPerSlot = new Map(); // slotId → listing
  for (const l of listings) {
    if (!slotIds.has(l.slotId)) continue;
    const curr = cheapestPerSlot.get(l.slotId);
    if (!curr || l.price < curr.price) {
      cheapestPerSlot.set(l.slotId, l);
    }
  }
  for (const [, l] of cheapestPerSlot) {
    candidateSellers.add(l.sellerId);
  }

  // Step 4: Add more sellers up to CANDIDATE_POOL, ranked by coverage
  if (candidateSellers.size < CANDIDATE_POOL) {
    const ranked = [...sellerSlots.entries()]
      .filter(([sid]) => !candidateSellers.has(sid))
      .map(([sellerId, slots]) => ({ sellerId, coverage: slots.size }))
      .sort((a, b) => b.coverage - a.coverage);

    const remaining = CANDIDATE_POOL - candidateSellers.size;
    for (let i = 0; i < Math.min(ranked.length, remaining); i++) {
      candidateSellers.add(ranked[i].sellerId);
    }
  }

  // Step 5: Filter listings to only those from candidate sellers
  const filtered = listings.filter((l) => candidateSellers.has(l.sellerId));

  console.log(
    `[TCGmizer ILP] Min-vendors pre-filter: ${listings.length} → ${filtered.length} listings, ${candidateSellers.size} candidate sellers (from ${sellerSlots.size} total)`,
  );
  return filtered;
}
