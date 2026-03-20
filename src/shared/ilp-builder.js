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
 * @returns {{ lp: string, variableMap: Object }} LP string and mapping from variable names to listing/seller info
 */
export function buildLP({ cardSlots, sellers, listings, options = {} }) {
  const topK = options.topK || DEFAULT_TOP_K_LISTINGS;
  const maxSellers = options.maxSellers || null;

  // Group listings by slotId and prune to top-K cheapest (by price, since shipping is per-seller)
  const listingsBySlot = new Map();
  for (const listing of listings) {
    if (!listingsBySlot.has(listing.slotId)) {
      listingsBySlot.set(listing.slotId, []);
    }
    listingsBySlot.get(listing.slotId).push(listing);
  }

  // Sort each slot's listings by price and keep top K
  for (const [slotId, slotListings] of listingsBySlot) {
    slotListings.sort((a, b) => a.price - b.price);
    if (slotListings.length > topK) {
      listingsBySlot.set(slotId, slotListings.slice(0, topK));
    }
  }

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
      const invKey = `${listing.sellerId}:${listing.productConditionId}`;
      if (!xVarsByInventory.has(invKey)) {
        xVarsByInventory.set(invKey, { vars: [], quantity: listing.quantity || 1 });
      }
      xVarsByInventory.get(invKey).vars.push(varName);
    }

    xVarsBySlot.set(slot.slotId, slotVars);
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

  // Constraint 1: Coverage — each slot assigned exactly one listing
  for (const slot of cardSlots) {
    const vars = xVarsBySlot.get(slot.slotId);
    pushExpressionLines(lines, `cover_${slot.slotId}`, vars.join(' + '), '= 1');
  }

  // Constraint 2: Seller linking — x_{s,l} <= y_{seller}
  for (const sellerId of activeSellers) {
    const si = sellerIndex.get(sellerId);
    const yVar = `y_v${si}`;
    const sellerXVars = xVarsBySeller.get(sellerId);
    if (!sellerXVars) continue;

    for (const { varName } of sellerXVars) {
      lines.push(` link_${varName}: ${varName} - ${yVar} <= 0`);
    }
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
    pushExpressionLines(lines, `thresh_v${si}`, `${terms} - ${formatCoeff(seller.freeShippingThreshold)} ${zVar}`, '>= 0');
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

  lines.push('');
  lines.push('Binary');
  const allBinaryVars = [
    ...Object.keys(variableMap.x),
    ...yVars,
    ...zVars,
  ];
  // Write binary variables in groups to avoid very long lines
  // (some LP readers have internal line-length limits)
  for (let i = 0; i < allBinaryVars.length; i += 10) {
    lines.push(` ${allBinaryVars.slice(i, i + 10).join(' ')}`);
  }

  lines.push('');
  lines.push('End');

  const lpString = lines.join('\n');

  console.log(`[TCGmizer ILP] Built LP: ${cardSlots.length} slots, ${activeSellers.size} sellers, ${Object.keys(variableMap.x).length} x-vars, ${yVars.length} y-vars, ${zVars.length} z-vars, ${objTerms.length} obj terms, ${lpString.length} chars`);
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
