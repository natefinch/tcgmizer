/**
 * Service worker (background script) for TCGmizer.
 * Orchestrates: cart reading → listing fetching → ILP solving → result delivery.
 * Loads HiGHS WASM solver directly (no offscreen document needed).
 */

import {
  MSG,
  STAGE,
  DEFAULT_SOLVER_TIMEOUT_S,
  DEFAULT_TOP_K_LISTINGS,
  MAX_ALTERNATIVE_PRINTINGS,
  DEFAULT_CARD_EXCLUSIONS,
} from '../shared/constants.js';
import { buildLP } from '../shared/ilp-builder.js';
import { parseSolution } from '../shared/solution-parser.js';
import { remapDirectListings } from '../shared/direct-remapper.js';
import { applyCardExclusions, annotateExclusionWarnings } from '../shared/exclusion-filter.js';
import { fetchAllListings, searchProductsByName, searchAllCardPrintings, lookupProductLineSlug } from './fetcher.js';
import { clearSellerCache } from './seller-cache.js';
import { clearPrintingsCache } from './printings-cache.js';

// Per-tab cancellation tracking
const cancelledTabs = new Set();

// --- HiGHS Solver ---
// importScripts MUST use static string paths in MV3 service workers.
// Path is relative to the service worker file location (dist/background.js),
// so we use just the filename since highs.js is in the same directory.
try {
  importScripts('highs.js');
  console.log('[TCGmizer SW] HiGHS JS loaded via importScripts');
} catch (e) {
  console.error('[TCGmizer SW] Failed to load HiGHS JS:', e);
}

// Increase session storage quota (default 10MB may not be enough for large carts)
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

let highs = null;
let highsLoading = null;

async function getHighs() {
  if (highs) return highs;
  if (highsLoading) return highsLoading;

  highsLoading = (async () => {
    console.log('[TCGmizer SW] Initializing HiGHS WASM solver...');
    const wasmUrl = chrome.runtime.getURL('dist/highs.wasm');

    const factory = globalThis.Module;
    if (!factory) {
      throw new Error('HiGHS module factory not found. importScripts may have failed.');
    }

    // Initialize HiGHS with locateFile pointing to our bundled WASM
    const instance = await factory({
      locateFile: (file) => {
        if (file.endsWith('.wasm')) return wasmUrl;
        return file;
      },
    });

    console.log('[TCGmizer SW] HiGHS WASM solver initialized successfully');
    highs = instance;
    return highs;
  })();

  return highsLoading;
}

/**
 * Solve an LP string using the HiGHS solver.
 */
async function solveILP(lpString, timeLimit) {
  const solver = await getHighs();
  console.log(`[TCGmizer SW] Solving ILP (${lpString.length} chars, timeout ${timeLimit}s)...`);

  // Basic sanity checks on the LP string
  if (!lpString.includes('Minimize') && !lpString.includes('Maximize')) {
    throw new Error('LP string missing objective direction (Minimize/Maximize)');
  }
  if (!lpString.includes('Subject To')) {
    throw new Error('LP string missing Subject To section');
  }
  if (!lpString.includes('End')) {
    throw new Error('LP string missing End marker');
  }
  if (lpString.includes('NaN')) {
    const nanIdx = lpString.indexOf('NaN');
    throw new Error(
      `LP string contains NaN at position ${nanIdx}: ...${lpString.substring(Math.max(0, nanIdx - 30), nanIdx + 30)}...`,
    );
  }

  const startTime = performance.now();

  const solution = solver.solve(lpString, {
    time_limit: timeLimit,
    presolve: 'on',
  });

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(
    `[TCGmizer SW] Solved in ${elapsed}s — Status: ${solution.Status}, Objective: ${solution.ObjectiveValue}`,
  );
  return solution;
}

/**
 * Send a message to a specific tab's content script.
 */
function sendToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch((err) => {
    console.warn('[TCGmizer] Failed to send message to tab:', err);
  });
}

/**
 * Send progress update to the requesting tab.
 */
function sendProgress(tabId, stage, detail = {}) {
  sendToTab(tabId, {
    type: MSG.OPTIMIZATION_PROGRESS,
    stage,
    ...detail,
  });
}

/**
 * Main fetch flow — reads cart, fetches listings, sends available options back.
 * Caches the fetched data per tab so the user can re-solve with different config.
 */
async function runFetchPhase(tabId, cartData) {
  cancelledTabs.delete(tabId);
  try {
    const { cartItems, currentCartTotal } = cartData;

    if (!cartItems || cartItems.length === 0) {
      sendToTab(tabId, { type: MSG.OPTIMIZATION_ERROR, error: 'No items found in cart.' });
      return;
    }

    console.log(`[TCGmizer SW] Starting fetch for ${cartItems.length} items, current total: $${currentCartTotal}`);

    // --- Step 0: Resolve product IDs for custom listing items ---
    // Custom listings in the cart have a customListingKey but no productId.
    // First try to resolve from other cart items with the same card name,
    // then fall back to searching by name.
    const customItems = cartItems.filter((i) => !i.productId && i.customListingKey);
    if (customItems.length > 0) {
      console.log(`[TCGmizer SW] Resolving ${customItems.length} custom listing item(s) by card name`);
      sendProgress(tabId, STAGE.FETCHING_LISTINGS, { message: `Resolving ${customItems.length} custom listing(s)...` });

      // Build a map of card names to product IDs from standard cart items
      const knownProductIds = new Map();
      for (const item of cartItems) {
        if (item.productId && item.cardName) {
          knownProductIds.set(item.cardName, item.productId);
        }
      }

      for (const item of customItems) {
        // Try to resolve from other cart items with the same card name first
        const knownId = knownProductIds.get(item.cardName);
        if (knownId) {
          item.productId = knownId;
          console.log(
            `[TCGmizer SW] Resolved custom listing "${item.cardName}" → productId ${item.productId} (from cart)`,
          );
          continue;
        }

        // Fall back to searching by name
        const printings = await searchProductsByName(item.cardName);
        if (printings.length > 0) {
          // Pick the first matching product (search returns most relevant first)
          item.productId = printings[0].productId;
          if (!item.setName && printings[0].setName) {
            item.setName = printings[0].setName;
          }
          console.log(
            `[TCGmizer SW] Resolved custom listing "${item.cardName}" → productId ${item.productId} (${printings[0].setName || 'unknown set'})`,
          );
        } else {
          console.warn(`[TCGmizer SW] Could not resolve custom listing "${item.cardName}" — no search results`);
        }
      }

      // Filter out any items that still don't have a product ID
      const unresolved = cartItems.filter((i) => !i.productId);
      if (unresolved.length > 0) {
        console.warn(
          `[TCGmizer SW] ${unresolved.length} item(s) could not be resolved:`,
          unresolved.map((i) => i.cardName).join(', '),
        );
      }
    }

    // Filter to only items with a valid productId
    const resolvedItems = cartItems.filter((i) => i.productId);
    if (resolvedItems.length === 0) {
      sendToTab(tabId, { type: MSG.OPTIMIZATION_ERROR, error: 'Could not resolve any cart items to products.' });
      return;
    }

    // --- Step 1: Build card slots (expand quantities) ---
    sendProgress(tabId, STAGE.FETCHING_LISTINGS, { message: 'Preparing card list...' });

    const cardSlots = [];
    const productCards = [];
    const seenProducts = new Set();
    const productSlotCount = new Map(); // productId → next slot index

    for (const item of resolvedItems) {
      const qty = item.quantity || 1;
      const startIdx = productSlotCount.get(item.productId) || 0;
      for (let q = 0; q < qty; q++) {
        const slotId = `${item.productId}_${startIdx + q}`;
        cardSlots.push({
          slotId,
          cardName: item.cardName,
          productId: item.productId,
          originalSkuId: item.skuId,
          setName: item.setName || '',
        });
      }
      productSlotCount.set(item.productId, startIdx + qty);

      if (!seenProducts.has(item.productId)) {
        seenProducts.add(item.productId);
        productCards.push({
          productId: item.productId,
          cardName: item.cardName,
        });
      }
    }

    // --- Step 2: Search for all printings of each unique card name ---
    const uniqueCardNames = [...new Set(resolvedItems.map((i) => i.cardName))];
    const cardNameToProductIds = new Map(); // cardName → Set<productId>
    const productIdToSetName = new Map();

    // Detect product line from cart items' setName (e.g. "Set Name, Magic: The Gathering, R, 349")
    let detectedProductLineSlug = null;
    for (const item of resolvedItems) {
      if (item.setName && item.setName.includes(',')) {
        const parts = item.setName.split(',').map((s) => s.trim());
        // Product line name is typically the second field
        if (parts.length >= 2) {
          const slug = await lookupProductLineSlug(parts[1]);
          if (slug) {
            detectedProductLineSlug = slug;
            console.log(`[TCGmizer SW] Detected product line: "${parts[1]}" → "${slug}"`);
            break;
          }
        }
      }
    }

    // Seed with original cart products
    for (const item of resolvedItems) {
      if (!cardNameToProductIds.has(item.cardName)) {
        cardNameToProductIds.set(item.cardName, new Set());
      }
      cardNameToProductIds.get(item.cardName).add(item.productId);
      if (item.setName) productIdToSetName.set(item.productId, item.setName);
    }

    sendProgress(tabId, STAGE.FETCHING_LISTINGS, {
      message: 'Searching for alternative printings...',
      current: 0,
      total: uniqueCardNames.length,
    });

    const printingsResult = await searchAllCardPrintings(uniqueCardNames, seenProducts, {
      productLineName: detectedProductLineSlug,
      onProgress: ({ current, total }) => {
        sendProgress(tabId, STAGE.FETCHING_LISTINGS, {
          message: 'Searching for alternative printings...',
          current,
          total,
        });
      },
      shouldCancel: () => cancelledTabs.has(tabId),
    });

    if (cancelledTabs.has(tabId)) {
      console.log(`[TCGmizer SW] Fetch phase cancelled for tab ${tabId}`);
      return;
    }

    // Merge printings results into our maps
    const productIdToProductName = new Map();
    for (const [name, productIds] of printingsResult.cardNameToProductIds) {
      if (!cardNameToProductIds.has(name)) {
        cardNameToProductIds.set(name, productIds);
      } else {
        for (const id of productIds) cardNameToProductIds.get(name).add(id);
      }
    }
    for (const [id, setName] of printingsResult.productIdToSetName) {
      if (!productIdToSetName.has(id)) productIdToSetName.set(id, setName);
    }
    for (const [id, prodName] of printingsResult.productIdToProductName) {
      productIdToProductName.set(id, prodName);
    }
    for (const pc of printingsResult.productCards) {
      seenProducts.add(pc.productId);
      productCards.push(pc);
    }

    console.log(
      `[TCGmizer SW] Found ${productCards.length} total products (${productCards.length - uniqueCardNames.length} alternative printings)`,
    );

    // --- Step 3: Fetch listings ---
    sendProgress(tabId, STAGE.FETCHING_LISTINGS, {
      message: 'Fetching listings...',
      current: 0,
      total: productCards.length,
    });

    const fetchCards = productCards.map((pc) => ({
      productId: pc.productId,
      slotId: `__product_${pc.productId}`,
      cardName: pc.cardName,
    }));

    const { listings: rawListings, sellers } = await fetchAllListings(fetchCards, {
      onProgress: ({ current, total }) => {
        sendProgress(tabId, STAGE.FETCHING_LISTINGS, {
          message: 'Fetching listings...',
          current,
          total,
        });
      },
      onShippingProgress: ({ current, total }) => {
        sendProgress(tabId, STAGE.FETCHING_LISTINGS, {
          message: 'Fetching shipping info...',
          current,
          total,
        });
      },
      shouldCancel: () => cancelledTabs.has(tabId),
    });

    if (cancelledTabs.has(tabId)) {
      console.log(`[TCGmizer SW] Fetch phase cancelled for tab ${tabId}`);
      return;
    }

    // Pre-index rawListings by productId for O(1) lookup instead of O(n) scan per slot
    const listingsByProduct = new Map();
    for (const listing of rawListings) {
      let arr = listingsByProduct.get(listing.productId);
      if (!arr) {
        arr = [];
        listingsByProduct.set(listing.productId, arr);
      }
      arr.push(listing);
    }

    // Remap listings: for each slot, include listings from ALL printings of the same card
    const allListings = [];
    for (const slot of cardSlots) {
      const allowedProducts = cardNameToProductIds.get(slot.cardName) || new Set([slot.productId]);
      for (const pid of allowedProducts) {
        const productListings = listingsByProduct.get(pid);
        if (!productListings) continue;
        for (const pl of productListings) {
          allListings.push({
            ...pl,
            slotId: slot.slotId,
            // Keep original listing ID for inventory constraints (same physical listing)
            originalListingId: pl.listingId,
            listingId: `${pl.listingId}_${slot.slotId}`,
            setName: productIdToSetName.get(pl.productId) || '',
          });
        }
      }
    }

    if (allListings.length === 0) {
      sendToTab(tabId, {
        type: MSG.OPTIMIZATION_ERROR,
        error: 'No listings found for any items. The TCGPlayer search API may have changed.',
      });
      return;
    }

    console.log(
      `[TCGmizer SW] Fetched ${rawListings.length} raw listings from ${Object.keys(sellers).length} sellers, expanded to ${allListings.length} slot-listings`,
    );

    // Cache for re-solving with different config (persists across SW restarts)
    // Convert Map to Object for JSON serialization in chrome.storage
    const productNames = Object.fromEntries(productIdToProductName);
    await saveTabCache(tabId, { cardSlots, allListings, sellers, currentCartTotal, productNames });

    // Discover available options from the listings
    const availableLanguages = new Set();
    const availableConditions = new Set();
    const productIdToSetNames = new Map();

    for (const listing of rawListings) {
      if (listing.language) availableLanguages.add(listing.language);
      if (listing.condition) availableConditions.add(listing.condition);
    }

    // Map productId → set names from cart items
    for (const item of resolvedItems) {
      if (item.setName) {
        productIdToSetNames.set(item.productId, item.setName);
      }
    }

    // Send available options to content script for config UI
    sendToTab(tabId, {
      type: MSG.LISTINGS_READY,
      options: {
        languages: [...availableLanguages].sort(),
        conditions: [...availableConditions].sort(conditionSort),
        cardCount: cardSlots.length,
        listingCount: allListings.length,
        sellerCount: Object.keys(sellers).length,
      },
    });
  } catch (err) {
    console.error('[TCGmizer SW] Fetch phase error:', err);
    sendToTab(tabId, {
      type: MSG.OPTIMIZATION_ERROR,
      error: `Unexpected error: ${err.message}`,
    });
  }
}

/**
 * Sort conditions in a sensible order (best to worst).
 */
function conditionSort(a, b) {
  const order = ['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'];
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
}

/**
 * When the optimizer picks a different printing, update the item's cardName
 * to match the chosen product instead of keeping the original cart item name.
 */
function fixChangedPrintingNames(result, productNames) {
  if (!result?.success || !productNames) return;
  for (const seller of result.sellers) {
    for (const item of seller.items) {
      if (item.printingChanged && productNames[item.productId]) {
        item.cardName = productNames[item.productId];
      }
    }
  }
}

/**
 * Solve phase — filters cached listings by user config and runs ILP solver.
 * If config.minimizeVendors is true, runs multiple solves to find the vendor/price tradeoff.
 */
async function runSolvePhase(tabId, config) {
  cancelledTabs.delete(tabId);
  try {
    const cached = await loadTabCache(tabId);
    if (!cached) {
      sendToTab(tabId, {
        type: MSG.OPTIMIZATION_ERROR,
        error: 'No cached listings found. Please run the fetch phase first.',
      });
      return;
    }

    const { cardSlots, allListings, sellers, currentCartTotal, productNames } = cached;

    console.log(
      `[TCGmizer SW] Solve phase starting: ${cardSlots.length} slots, ${allListings.length} cached listings, ${Object.keys(sellers).length} sellers, config:`,
      JSON.stringify(config),
    );

    sendProgress(tabId, STAGE.BUILDING_ILP, { message: 'Filtering listings...' });

    // Apply filters
    let filteredListings = allListings;

    // Card exclusion filter: use cardExclusionsEnabled from config (passed directly
    // from the UI checkbox) and read patterns from storage.
    // Skip exclusion when exactPrintings is on (contradictory: user wants exact versions).
    let exclusionWarningProductIds = new Set();
    if (productNames && !config.exactPrintings) {
      const cardExclusionsEnabled = config.cardExclusionsEnabled ?? true;
      const patternsData = await chrome.storage.sync.get('cardExclusions');
      const rawPatterns = patternsData.cardExclusions ?? DEFAULT_CARD_EXCLUSIONS;
      if (cardExclusionsEnabled && rawPatterns.length > 0) {
        const patterns = rawPatterns.map((p) => p.toLowerCase().trim()).filter((p) => p.length > 0);
        const before = filteredListings.length;
        const exclusionResult = applyCardExclusions({
          listings: filteredListings,
          cardSlots,
          productNames,
          patterns,
        });
        filteredListings = exclusionResult.listings;
        exclusionWarningProductIds = exclusionResult.exclusionWarningProductIds;
        if (before !== filteredListings.length || exclusionWarningProductIds.size > 0) {
          console.log(
            `[TCGmizer SW] Card exclusion filter: ${before} → ${filteredListings.length} listings` +
              (exclusionWarningProductIds.size > 0
                ? ` (${exclusionWarningProductIds.size} product(s) kept with warning — no non-excluded alternative)`
                : ''),
          );
        }
      }
    }

    if (config.languages && config.languages.length > 0) {
      const langSet = new Set(config.languages);
      const before = filteredListings.length;
      filteredListings = filteredListings.filter((l) => langSet.has(l.language));
      console.log(
        `[TCGmizer SW] Language filter: ${before} → ${filteredListings.length} listings (languages: ${[...langSet].join(', ')})`,
      );
    }

    if (config.conditions && config.conditions.length > 0) {
      const condSet = new Set(config.conditions);
      const before = filteredListings.length;
      filteredListings = filteredListings.filter((l) => condSet.has(l.condition));
      console.log(
        `[TCGmizer SW] Condition filter: ${before} → ${filteredListings.length} listings (conditions: ${[...condSet].join(', ')})`,
      );
    }

    // Exact printings filter: only keep listings whose productId matches the cart's original productId
    if (config.exactPrintings) {
      const slotOriginalProduct = new Map();
      for (const slot of cardSlots) {
        slotOriginalProduct.set(slot.slotId, slot.productId);
      }
      filteredListings = filteredListings.filter((l) => l.productId === slotOriginalProduct.get(l.slotId));
    }

    // Check coverage
    const listingsBySlot = new Map();
    for (const l of filteredListings) {
      if (!listingsBySlot.has(l.slotId)) listingsBySlot.set(l.slotId, []);
      listingsBySlot.get(l.slotId).push(l);
    }
    const uncoveredSlots = cardSlots.filter(
      (s) => !listingsBySlot.has(s.slotId) || listingsBySlot.get(s.slotId).length === 0,
    );

    if (uncoveredSlots.length > 0) {
      const names = [...new Set(uncoveredSlots.map((s) => s.cardName))].slice(0, 5).join(', ');
      sendToTab(tabId, {
        type: MSG.OPTIMIZATION_ERROR,
        error: `No listings match your filters for: ${names}${uncoveredSlots.length > 5 ? ` (+${uncoveredSlots.length - 5} more)` : ''}. Try relaxing your language or condition filters.`,
      });
      return;
    }

    // Log filter results
    const slotCoverage = new Map();
    for (const l of filteredListings) {
      slotCoverage.set(l.slotId, (slotCoverage.get(l.slotId) || 0) + 1);
    }
    const coveredSlots = cardSlots.filter((s) => slotCoverage.has(s.slotId));
    console.log(
      `[TCGmizer SW] After filtering: ${filteredListings.length} listings (from ${allListings.length}), covering ${coveredSlots.length}/${cardSlots.length} slots`,
    );

    // Log seller count and any sellers with NaN shipping
    const sellerKeys = Object.keys(sellers);
    const badSellers = sellerKeys.filter(
      (k) => Number.isNaN(sellers[k].shippingCost) || Number.isNaN(sellers[k].freeShippingThreshold),
    );
    if (badSellers.length > 0) {
      console.warn(
        `[TCGmizer SW] ${badSellers.length} sellers have NaN shipping data:`,
        badSellers.map(
          (k) =>
            `${sellers[k].sellerName} (shipping=${sellers[k].shippingCost}, threshold=${sellers[k].freeShippingThreshold})`,
        ),
      );
    }

    // Remap Direct listings to a synthetic seller so the ILP models them
    // as a single seller with shared $3.99 shipping / $50 free threshold.
    const directRemapped = remapDirectListings(filteredListings, sellers);
    const solveListings = directRemapped.listings;
    const solveSellers = directRemapped.sellers;

    // Build fallback listings map so the cart modifier can retry failed items
    const fallbackMap = buildFallbackMap(cardSlots, filteredListings, sellers);
    console.log(`[TCGmizer SW] Built fallback map: ${Object.keys(fallbackMap).length} cards with fallbacks`);

    if (config.minimizeVendors) {
      // Multi-solve mode: find optimal, then try fewer vendors
      await runMultiSolve(
        tabId,
        cardSlots,
        solveSellers,
        solveListings,
        currentCartTotal,
        config,
        fallbackMap,
        exclusionWarningProductIds,
        productNames,
      );
    } else {
      // Single solve — optimize for price first, then minimize vendors at that price
      const result = await solveSingle(
        tabId,
        cardSlots,
        solveSellers,
        solveListings,
        currentCartTotal,
        config.maxSellers || null,
      );
      if (result && result.success) {
        // Try to reduce vendor count without increasing price
        const optimalCost = result.totalCost;
        let bestResult = result;

        for (let n = result.sellerCount - 1; n >= 1; n--) {
          sendProgress(tabId, STAGE.SOLVING, {
            message: `Checking if ${n} vendor${n !== 1 ? 's' : ''} can match price...`,
          });

          const fewer = await solveSingle(tabId, cardSlots, solveSellers, solveListings, currentCartTotal, n, true);
          if (cancelledTabs.has(tabId)) {
            console.log(`[TCGmizer SW] Solve phase cancelled for tab ${tabId}`);
            return;
          }
          if (!fewer || !fewer.success) break; // Infeasible — can't use fewer vendors
          if (fewer.totalCost > optimalCost + 0.005) break; // More expensive (with floating-point tolerance)

          // Same or lower cost with fewer vendors — use this instead
          bestResult = fewer;
          console.log(`[TCGmizer SW] Reduced to ${fewer.sellerCount} vendors at same price $${fewer.totalCost}`);
        }

        bestResult.fallbackListings = fallbackMap;
        annotateExclusionWarnings(bestResult, exclusionWarningProductIds);
        fixChangedPrintingNames(bestResult, productNames);
        sendToTab(tabId, { type: MSG.OPTIMIZATION_RESULT, result: bestResult });
      } else {
        // solveSingle returns null on infeasible or error; if silent=false it already sent an error,
        // but infeasible doesn't send one, so handle that case here.
        sendToTab(tabId, {
          type: MSG.OPTIMIZATION_ERROR,
          error: `No feasible solution found. ${config.maxSellers ? 'Try increasing the max vendors limit or relaxing filters.' : 'Try relaxing your filters.'}`,
        });
      }
    }
  } catch (err) {
    console.error('[TCGmizer SW] Solve phase error:', err);
    sendToTab(tabId, {
      type: MSG.OPTIMIZATION_ERROR,
      error: `Unexpected error: ${err.message}`,
    });
  }
}

/**
 * Pick an initial topK based on cart size and whether maxSellers is set.
 *
 * The maxSellers constraint makes the ILP exponentially harder (branch-and-bound
 * over seller subsets), so vendor-constrained solves should use the SAME or LOWER
 * topK as the baseline. The pre-filter (prefilterForMinVendors) ensures coverage
 * with a tight seller pool — higher topK just inflates the model without benefit.
 *
 * The retry mechanism (solveSingle) will shrink topK on WASM crashes, so these
 * values are aggressive starting points.
 */
function adaptiveTopK(numSlots, maxSellers) {
  // Base topK — used for both unconstrained and vendor-constrained solves
  let topK;
  if (numSlots <= 30)
    topK = DEFAULT_TOP_K_LISTINGS; // 40
  else if (numSlots <= 60) topK = 30;
  else if (numSlots <= 100) topK = 20;
  else topK = 15;

  // When maxSellers is set, the ILP is harder — use same or lower topK
  if (maxSellers != null) {
    topK = Math.min(topK, 25);
  }

  return topK;
}

/**
 * Run a single ILP solve with optional maxSellers constraint.
 * Uses adaptive topK scaling and retries with reduced topK on WASM crashes.
 * Returns the parsed result, or null if infeasible/error.
 */
async function solveSingle(tabId, cardSlots, sellers, filteredListings, currentCartTotal, maxSellers, silent = false) {
  // When maxSellers is set, the ILP is much harder (tight constraint makes
  // branch-and-bound exponentially harder). Allow more retries and shrink faster.
  const MAX_RETRIES = maxSellers ? 4 : 2;
  const RETRY_SHRINK = maxSellers ? 0.5 : 0.6;

  let topK = adaptiveTopK(cardSlots.length, maxSellers);
  console.log(
    `[TCGmizer SW] solveSingle: ${cardSlots.length} slots → initial topK=${topK}, maxSellers=${maxSellers}, maxRetries=${MAX_RETRIES}`,
  );

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await solveSingleAttempt(
      tabId,
      cardSlots,
      sellers,
      filteredListings,
      currentCartTotal,
      maxSellers,
      topK,
      silent || attempt > 0, // silence retries to avoid double error messages
    );

    // 'WASM_ERROR' signals a crash that can be retried with a smaller model
    if (result === 'WASM_ERROR') {
      const nextTopK = Math.max(5, Math.floor(topK * RETRY_SHRINK));
      if (nextTopK >= topK) {
        // Can't shrink further
        console.error(`[TCGmizer SW] WASM crash at topK=${topK}, cannot reduce further`);
        break;
      }
      console.warn(
        `[TCGmizer SW] WASM crash with topK=${topK}, retrying with topK=${nextTopK} (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      if (!silent) {
        sendProgress(tabId, STAGE.SOLVING, {
          message: `Solver crashed, retrying with reduced model (attempt ${attempt + 2})...`,
        });
      }
      topK = nextTopK;
      continue;
    }

    return result; // success, infeasible (null), or error (null)
  }

  // All retries exhausted
  if (!silent) {
    sendToTab(tabId, {
      type: MSG.OPTIMIZATION_ERROR,
      error:
        'Solver crashed repeatedly. Try reducing the number of items in your cart or enabling "Exact printings only".',
    });
  }
  return null;
}

/**
 * Single attempt at solving with a given topK.
 * Returns parsed result, null (infeasible), or the string 'WASM_ERROR' if HiGHS crashed.
 */
async function solveSingleAttempt(
  tabId,
  cardSlots,
  sellers,
  filteredListings,
  currentCartTotal,
  maxSellers,
  topK,
  silent,
) {
  if (!silent) {
    sendProgress(tabId, STAGE.BUILDING_ILP, {
      message: maxSellers ? `Building model (max ${maxSellers} vendors)...` : 'Building optimization model...',
    });
  }

  console.log(
    `[TCGmizer SW] solveSingleAttempt: ${cardSlots.length} slots, ${filteredListings.length} listings, ${Object.keys(sellers).length} sellers, maxSellers=${maxSellers}, topK=${topK}`,
  );

  // Validate inputs
  const listingsBySlot = new Map();
  for (const l of filteredListings) {
    if (!listingsBySlot.has(l.slotId)) listingsBySlot.set(l.slotId, 0);
    listingsBySlot.set(l.slotId, listingsBySlot.get(l.slotId) + 1);
  }
  const emptySlots = cardSlots.filter((s) => !listingsBySlot.has(s.slotId));
  if (emptySlots.length > 0) {
    console.error(
      `[TCGmizer SW] ${emptySlots.length} slots have no listings:`,
      emptySlots.map((s) => `${s.cardName} (${s.slotId})`).join(', '),
    );
  }

  let lpResult;
  try {
    lpResult = buildLP({
      cardSlots,
      sellers,
      listings: filteredListings,
      options: { maxSellers, topK },
    });
  } catch (err) {
    console.error('[TCGmizer SW] buildLP error:', err);
    if (!silent) {
      sendToTab(tabId, {
        type: MSG.OPTIMIZATION_ERROR,
        error: `Failed to build optimization model: ${err.message}`,
      });
    }
    return null;
  }

  const { lp, variableMap } = lpResult;

  if (!silent) {
    sendProgress(tabId, STAGE.SOLVING, {
      message: maxSellers ? `Solving (max ${maxSellers} vendors)...` : 'Solving optimization model...',
    });
  }

  let solution;
  try {
    solution = await solveILP(lp, DEFAULT_SOLVER_TIMEOUT_S);
  } catch (solveErr) {
    console.error('[TCGmizer SW] Solver error:', solveErr);
    console.error(`[TCGmizer SW] LP string that failed (first 1000 chars):\n${lp.substring(0, 1000)}`);
    console.error(`[TCGmizer SW] LP string tail (last 300 chars):\n${lp.substring(lp.length - 300)}`);

    // Detect WASM crash (memory/abort) — reset the corrupted HiGHS instance
    const msg = String(solveErr?.message || solveErr);
    if (
      msg.includes('RuntimeError') ||
      msg.includes('Aborted') ||
      msg.includes('signature mismatch') ||
      msg.includes('out of memory')
    ) {
      // Reset HiGHS instance — it's likely corrupted after a WASM crash
      highs = null;
      highsLoading = null;
      // Signal caller to retry with a smaller model
      return 'WASM_ERROR';
    }

    if (!silent) {
      sendToTab(tabId, {
        type: MSG.OPTIMIZATION_ERROR,
        error: `Solver failed: ${solveErr.message || String(solveErr)}`,
      });
    }
    return null;
  }

  if (solution.Status === 'Infeasible') {
    return null; // Infeasible — caller handles this
  }

  const result = parseSolution(solution, variableMap, cardSlots, sellers, currentCartTotal);
  return result;
}

/**
 * Multi-solve: find the cheapest price for every feasible vendor count.
 */
async function runMultiSolve(
  tabId,
  cardSlots,
  sellers,
  filteredListings,
  currentCartTotal,
  config,
  fallbackMap,
  exclusionWarningProductIds,
  productNames,
) {
  const results = [];

  // First: solve with no vendor limit (or user's max if set) to get baseline
  const maxCap = config.maxSellers || null;
  sendProgress(tabId, STAGE.SOLVING, { message: 'Finding optimal price (no vendor limit)...' });

  const baseline = await solveSingle(tabId, cardSlots, sellers, filteredListings, currentCartTotal, maxCap, true);
  if (cancelledTabs.has(tabId)) {
    console.log(`[TCGmizer SW] Multi-solve cancelled for tab ${tabId}`);
    return;
  }
  if (!baseline || !baseline.success) {
    sendToTab(tabId, {
      type: MSG.OPTIMIZATION_ERROR,
      error: 'No feasible solution found. Try relaxing your filters.',
    });
    return;
  }

  results.push(baseline);
  let currentVendors = baseline.sellerCount;

  console.log(`[TCGmizer SW] Baseline: ${currentVendors} vendors, $${baseline.totalCost}`);

  // Now try with fewer vendors until infeasible
  for (let n = currentVendors - 1; n >= 1; n--) {
    sendProgress(tabId, STAGE.SOLVING, {
      message: `Trying ${n} vendor${n !== 1 ? 's' : ''}...`,
      current: currentVendors - n,
      total: currentVendors - 1,
    });

    const result = await solveSingle(tabId, cardSlots, sellers, filteredListings, currentCartTotal, n, true);
    if (cancelledTabs.has(tabId)) {
      console.log(`[TCGmizer SW] Multi-solve cancelled for tab ${tabId}`);
      return;
    }
    if (!result || !result.success) {
      console.log(`[TCGmizer SW] Infeasible at ${n} vendors, stopping`);
      break;
    }

    // Only add if it actually uses fewer vendors (solver might use fewer than max)
    const isDuplicate = results.some((r) => r.sellerCount === result.sellerCount);
    if (!isDuplicate) {
      results.push(result);
      console.log(`[TCGmizer SW] ${n} vendors max → ${result.sellerCount} vendors, $${result.totalCost}`);
    }
  }

  // Sort by vendor count ascending
  results.sort((a, b) => a.sellerCount - b.sellerCount);

  // Filter out dominated results: if a result with fewer vendors has the
  // same or lower displayed price, remove the higher-vendor option.
  // Compare on rounded-to-cents values to avoid floating-point edge cases.
  const beforeCount = results.length;
  for (let i = results.length - 1; i >= 1; i--) {
    const r = results[i];
    const rCents = Math.round(r.totalCost * 100);
    const dominated = results.some(
      (other) => other.sellerCount < r.sellerCount && Math.round(other.totalCost * 100) <= rCents,
    );
    if (dominated) {
      results.splice(i, 1);
    }
  }
  if (results.length < beforeCount) {
    console.log(`[TCGmizer SW] Removed ${beforeCount - results.length} dominated result(s) (same price, more vendors)`);
  }

  // Attach fallback listings, exclusion warnings, and fix printing names on each result
  for (const r of results) {
    r.fallbackListings = fallbackMap;
    annotateExclusionWarnings(r, exclusionWarningProductIds);
    fixChangedPrintingNames(r, productNames);
  }

  console.log(`[TCGmizer SW] Multi-solve complete: ${results.length} options`);

  sendToTab(tabId, {
    type: MSG.OPTIMIZATION_MULTI_RESULT,
    results,
  });
}

/**
 * Build a map of fallback listings for each card name.
 * Used by the cart modifier to retry with alternative listings when CAPI-4 (sold out) occurs.
 *
 * @param {Array} cardSlots - Card slots from the optimization
 * @param {Array} filteredListings - All filtered listings (post language/condition/etc filters)
 * @param {Object} sellers - Seller info map
 * @returns {Object} cardName → [{sku, sellerKey, price, isDirect, setName, sellerName, productId}] sorted by price
 */
function buildFallbackMap(cardSlots, filteredListings, sellers) {
  // Get the set of unique card names
  const cardNames = new Set(cardSlots.map((s) => s.cardName));

  // Group all listings by card name (via slot → cardName mapping)
  const slotToCard = new Map();
  for (const slot of cardSlots) {
    slotToCard.set(slot.slotId, slot.cardName);
  }

  // Deduplicate listings by sku+sellerKey (same physical listing appears in multiple slots)
  const byCard = {}; // cardName → Map<"sku:sellerKey" → listing>
  for (const name of cardNames) {
    byCard[name] = new Map();
  }

  for (const listing of filteredListings) {
    const cardName = slotToCard.get(listing.slotId);
    if (!cardName || !byCard[cardName]) continue;

    const dedupeKey = `${listing.productConditionId}:${listing.sellerKey}`;
    if (byCard[cardName].has(dedupeKey)) continue;

    const seller = sellers[listing.sellerId];
    byCard[cardName].set(dedupeKey, {
      sku: listing.productConditionId,
      sellerKey: listing.sellerKey || listing.sellerId,
      sellerName: seller?.sellerName || listing.sellerName || 'Unknown',
      price: listing.price,
      isDirect: listing.directListing || false,
      setName: listing.setName || '',
      productId: listing.productId,
      customListingKey: listing.customListingKey || null,
    });
  }

  // Convert to sorted arrays
  const result = {};
  for (const [cardName, listingMap] of Object.entries(byCard)) {
    const sorted = [...listingMap.values()].sort((a, b) => a.price - b.price);
    if (sorted.length > 0) {
      result[cardName] = sorted;
    }
  }

  return result;
}

// --- Per-tab cache using in-memory + chrome.storage.session fallback ---
// In-memory cache is always used. Session storage is best-effort for surviving
// service worker restarts, but has a 10MB quota that large carts can exceed.

const inMemoryCache = new Map();

async function saveTabCache(tabId, data) {
  // Always save to in-memory cache (no size limit)
  inMemoryCache.set(tabId, data);

  // Try session storage as a fallback (survives SW restarts)
  try {
    await chrome.storage.session.set({ [`tcgmizer_cache_${tabId}`]: data });
    console.log(`[TCGmizer SW] Cached ${data.allListings.length} listings for tab ${tabId} (memory + session storage)`);
  } catch (err) {
    // Session storage quota exceeded — in-memory cache is still valid
    console.warn(
      `[TCGmizer SW] Session storage quota exceeded (${data.allListings.length} listings). Using in-memory cache only.`,
    );
  }
}

async function loadTabCache(tabId) {
  // Try in-memory cache first (fastest, no size limit)
  const memCached = inMemoryCache.get(tabId);
  if (memCached) return memCached;

  // Fall back to session storage (survives SW restarts)
  try {
    const key = `tcgmizer_cache_${tabId}`;
    const result = await chrome.storage.session.get(key);
    const data = result[key] || null;
    if (data) {
      // Populate in-memory cache for faster subsequent access
      inMemoryCache.set(tabId, data);
    }
    return data;
  } catch (err) {
    console.error('[TCGmizer SW] Failed to load cache:', err);
    return null;
  }
}

// --- SPA navigation detection ---
// TCGPlayer is an SPA, so navigating to /cart doesn't always trigger a full page
// load (e.g. after bulk-adding cards). Listen for URL changes and inject the
// content script when needed.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  const isCart = changeInfo.url.includes('tcgplayer.com/cart');
  if (!isCart) return;

  // Check if the content script is already loaded before injecting
  chrome.tabs.sendMessage(tabId, { type: 'PING' }).catch(async () => {
    // Content script not loaded — inject it
    console.log(`[TCGmizer SW] SPA navigation to cart detected in tab ${tabId}, injecting content script`);
    try {
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['src/content/results-ui.css'],
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['dist/content.js'],
      });
    } catch (err) {
      console.error(`[TCGmizer SW] Failed to inject content script into tab ${tabId}:`, err);
    }
  });
});

// --- Message listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.type) {
    case MSG.CANCEL_OPTIMIZATION:
      if (tabId) {
        cancelledTabs.add(tabId);
        console.log(`[TCGmizer SW] Cancellation requested for tab ${tabId}`);
      }
      sendResponse({ ok: true });
      return false;

    case MSG.START_OPTIMIZATION:
      if (!tabId) {
        sendResponse({ error: 'No tab ID' });
        return false;
      }
      runFetchPhase(tabId, message.cartData);
      sendResponse({ started: true });
      return false;

    case MSG.SOLVE_WITH_CONFIG:
      if (!tabId) {
        sendResponse({ error: 'No tab ID' });
        return false;
      }
      runSolvePhase(tabId, message.config || {});
      sendResponse({ started: true });
      return false;

    case MSG.APPLY_CART:
      if (tabId) {
        sendResponse({ ok: true });
      }
      return false;

    case MSG.CLEAR_SELLER_CACHE:
      clearSellerCache()
        .then(() => {
          sendResponse({ ok: true });
        })
        .catch((err) => {
          sendResponse({ error: err.message });
        });
      return true; // keep message channel open for async sendResponse

    case MSG.CLEAR_PRINTINGS_CACHE:
      clearPrintingsCache()
        .then(() => {
          sendResponse({ ok: true });
        })
        .catch((err) => {
          sendResponse({ error: err.message });
        });
      return true; // keep message channel open for async sendResponse

    case MSG.DUMP_DATA:
      if (!tabId) {
        sendResponse({ error: 'No tab ID' });
        return false;
      }
      loadTabCache(tabId)
        .then((cached) => {
          if (!cached) {
            sendResponse({ error: 'No cached data. Run "Optimize Cart" first.' });
            return;
          }
          sendResponse({
            data: {
              cardSlots: cached.cardSlots,
              allListings: cached.allListings,
              sellers: cached.sellers,
              currentCartTotal: cached.currentCartTotal,
            },
          });
        })
        .catch((err) => {
          sendResponse({ error: err.message });
        });
      return true; // keep message channel open for async sendResponse

    default:
      return false;
  }
});

console.log('[TCGmizer] Service worker loaded.');
