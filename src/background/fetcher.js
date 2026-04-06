import {
  DEFAULT_FETCH_DELAY_MS,
  DEFAULT_MAX_LISTINGS_PER_CARD,
  DEFAULT_FETCH_CONCURRENCY,
  LISTINGS_PER_PAGE,
  MAX_ALTERNATIVE_PRINTINGS,
  SEARCH_RESULTS_PER_PAGE,
} from '../shared/constants.js';
import { pruneExpiredEntries, getCachedSellers, cacheSellers } from './seller-cache.js';
import { pruneExpiredEntries as prunePrintingsCache, getCachedPrintings, cachePrintings } from './printings-cache.js';

const SEARCH_API_BASE = 'https://mp-search-api.tcgplayer.com';
const ROOT_API_BASE = 'https://mpapi.tcgplayer.com';

// Cached product line data from TCGPlayer API
let productLinesCache = null;

/**
 * Fetches the list of product lines from TCGPlayer's API and caches it.
 * Returns a Map of lowercased productLineName → productLineUrlName.
 *
 * @returns {Promise<Map<string, string>>} Map of lowercase name → URL slug
 */
export async function fetchProductLines() {
  if (productLinesCache) return productLinesCache;

  try {
    const response = await fetch(`${SEARCH_API_BASE}/v1/search/productLines`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.warn(`[TCGmizer] Failed to fetch product lines: ${response.status}`);
      return new Map();
    }

    const data = await response.json();
    const map = new Map();
    for (const line of data) {
      if (line.productLineName && line.productLineUrlName) {
        map.set(line.productLineName.toLowerCase(), line.productLineUrlName);
      }
    }

    productLinesCache = map;
    console.log(`[TCGmizer] Loaded ${map.size} product lines`);
    return map;
  } catch (err) {
    console.warn('[TCGmizer] Error fetching product lines:', err);
    return new Map();
  }
}

/**
 * Look up the product line URL slug for a given product line name.
 * Fetches and caches the product lines from the API on first call.
 *
 * @param {string} productLineName - Full product line name (e.g. "Magic: The Gathering")
 * @returns {Promise<string|null>} URL slug (e.g. "magic") or null if not found
 */
export async function lookupProductLineSlug(productLineName) {
  if (!productLineName) return null;
  const map = await fetchProductLines();
  return map.get(productLineName.toLowerCase()) || null;
}

/**
 * Fetches listings for a list of card product IDs from TCGPlayer's internal APIs.
 * Uses concurrent requests with a sliding-window concurrency limit for speed.
 * Deduplicates requests for the same productId.
 *
 * @param {Array<{productId: number, slotId: string, cardName: string}>} cards
 * @param {Object} [options]
 * @param {number} [options.delayMs] - Delay between launching requests (default: 100ms)
 * @param {number} [options.concurrency] - Max concurrent requests (default: 5)
 * @param {number} [options.maxListingsPerCard] - Max listings to fetch per card (default: 50)
 * @param {function} [options.onProgress] - Progress callback: ({ current, total, cardName })
 * @param {function} [options.onShippingProgress] - Shipping progress callback: ({ current, total })
 * @returns {Promise<{ listings: Array<Listing>, sellers: Object<string, SellerInfo> }>}
 */
export async function fetchAllListings(cards, options = {}) {
  const delayMs = options.delayMs ?? DEFAULT_FETCH_DELAY_MS;
  const concurrency = options.concurrency || DEFAULT_FETCH_CONCURRENCY;
  const maxListings = options.maxListingsPerCard || DEFAULT_MAX_LISTINGS_PER_CARD;
  const onProgress = options.onProgress || (() => {});
  const onShippingProgress = options.onShippingProgress || (() => {});
  const shouldCancel = options.shouldCancel || (() => false);

  const allListings = [];
  const sellersMap = {}; // sellerKey → SellerInfo

  // Deduplicate: group cards by productId so we only fetch each product once
  const productGroups = new Map(); // productId → { cardName, slotIds[] }
  for (const card of cards) {
    if (!productGroups.has(card.productId)) {
      productGroups.set(card.productId, {
        productId: card.productId,
        cardName: card.cardName,
        slotIds: [],
      });
    }
    productGroups.get(card.productId).slotIds.push(card.slotId);
  }

  const uniqueProducts = Array.from(productGroups.values());
  let completedCount = 0;

  /**
   * Fetch listings for one product and collect results.
   */
  async function fetchOne(product) {
    try {
      const cardListings = await fetchListingsForProduct(product.productId, product.slotIds[0], maxListings);
      return { product, cardListings, error: null };
    } catch (err) {
      return { product, cardListings: [], error: err };
    }
  }

  /**
   * Process the result of a single product fetch.
   */
  function processResult({ product, cardListings, error }) {
    completedCount++;
    onProgress({ current: completedCount, total: uniqueProducts.length, cardName: product.cardName });

    if (error) {
      console.warn(
        `[TCGmizer] Failed to fetch listings for ${product.cardName} (product ${product.productId}):`,
        error,
      );
      return;
    }

    for (const listing of cardListings) {
      allListings.push(listing);

      // Track seller info (keyed by sellerKey)
      if (!sellersMap[listing.sellerId]) {
        sellersMap[listing.sellerId] = {
          sellerName: listing.sellerName,
          sellerKey: listing.sellerKey,
          sellerNumericId: listing.sellerNumericId,
          shippingCost: listing.shippingCost,
          freeShippingThreshold: null, // populated later from shipping API
        };
      }
      // Use max shipping cost for the seller
      const sellerInfo = sellersMap[listing.sellerId];
      if (listing.shippingCost > sellerInfo.shippingCost) {
        sellerInfo.shippingCost = listing.shippingCost;
      }
    }
  }

  // Sliding-window concurrent fetcher
  if (uniqueProducts.length > 0) {
    const queue = [...uniqueProducts];
    const inflight = new Set();

    while (queue.length > 0 || inflight.size > 0) {
      // Check for cancellation
      if (shouldCancel()) {
        console.log('[TCGmizer] Listing fetch cancelled');
        return { listings: allListings, sellers: sellersMap };
      }

      // Launch requests up to the concurrency limit
      while (queue.length > 0 && inflight.size < concurrency) {
        const product = queue.shift();
        const promise = (async () => {
          // Small stagger delay to avoid burst of simultaneous requests
          if (inflight.size > 0) await sleep(delayMs);
          return fetchOne(product);
        })();
        // Tag the promise so we can remove it from inflight when done
        const tracked = promise.then((result) => {
          inflight.delete(tracked);
          processResult(result);
        });
        inflight.add(tracked);
      }

      // Wait for at least one to complete before launching more
      if (inflight.size > 0) {
        await Promise.race(inflight);
      }
    }
  }

  // --- Seller cache: prune expired entries, apply cached info, fetch only uncached ---
  const sellerCache = await pruneExpiredEntries();
  const allSellerKeys = Object.keys(sellersMap);
  const { cached: cachedSellers, uncachedKeys } = getCachedSellers(allSellerKeys, sellerCache);

  // Apply cached shipping info
  const knownSellerKeys = new Set();
  for (const [key, info] of Object.entries(cachedSellers)) {
    if (sellersMap[key]) {
      sellersMap[key].shippingCost = info.shippingCost;
      sellersMap[key].freeShippingThreshold = info.freeShippingThreshold;
      knownSellerKeys.add(key);
    }
  }
  if (Object.keys(cachedSellers).length > 0) {
    console.log(`[TCGmizer] Used cached shipping info for ${Object.keys(cachedSellers).length} seller(s)`);
  }

  // Fetch shipping thresholds only for uncached sellers
  if (uncachedKeys.length > 0) {
    // Check for cancellation before starting shipping fetch
    if (shouldCancel()) {
      console.log('[TCGmizer] Shipping fetch cancelled');
      return { listings: allListings, sellers: sellersMap };
    }

    // Build a sub-map of only uncached sellers for the shipping API call
    const uncachedSellersMap = {};
    for (const key of uncachedKeys) {
      uncachedSellersMap[key] = sellersMap[key];
    }

    try {
      const respondedKeys = await fetchSellerShippingInfo(uncachedSellersMap, onShippingProgress);
      for (const key of respondedKeys) {
        knownSellerKeys.add(key);
        // Copy updated shipping info back into the main sellersMap
        if (uncachedSellersMap[key]) {
          sellersMap[key].shippingCost = uncachedSellersMap[key].shippingCost;
          sellersMap[key].freeShippingThreshold = uncachedSellersMap[key].freeShippingThreshold;
        }
      }

      // Cache all newly fetched seller info (only those that responded — not ghosts)
      const toCache = {};
      for (const key of respondedKeys) {
        toCache[key] = sellersMap[key];
      }
      if (Object.keys(toCache).length > 0) {
        await cacheSellers(toCache);
      }
    } catch (err) {
      console.warn('[TCGmizer] Failed to fetch seller shipping info:', err);
    }
  } else if (allSellerKeys.length > 0) {
    console.log('[TCGmizer] All seller shipping info served from cache');
  }

  // Filter out "ghost" sellers — present in listings search index but not
  // recognized by the shipping API (their profiles return 404 and cart
  // additions always fail with CAPI-35 ProductCategoryNotVisible).
  // Cached sellers are always considered known (they responded previously).
  if (knownSellerKeys.size > 0) {
    const ghostKeys = Object.keys(sellersMap).filter((k) => !knownSellerKeys.has(k));
    if (ghostKeys.length > 0) {
      const ghostSet = new Set(ghostKeys);
      const beforeCount = allListings.length;
      const filtered = allListings.filter((l) => !ghostSet.has(l.sellerId));
      const removed = beforeCount - filtered.length;
      console.log(
        `[TCGmizer] Excluded ${ghostKeys.length} ghost seller(s) (${removed} listings): ${ghostKeys.map((k) => sellersMap[k]?.sellerName || k).join(', ')}`,
      );
      // Remove ghost sellers from sellersMap
      for (const k of ghostKeys) {
        delete sellersMap[k];
      }
      return { listings: filtered, sellers: sellersMap };
    }
  }

  return { listings: allListings, sellers: sellersMap };
}

/**
 * Fetch listings for a single product from TCGPlayer's product listings API.
 * Endpoint: POST /v1/product/{productId}/listings
 */
async function fetchListingsForProduct(productId, slotId, maxListings) {
  const listings = [];
  let offset = 0;

  while (listings.length < maxListings) {
    const pageSize = Math.min(LISTINGS_PER_PAGE, maxListings - listings.length);

    const requestBody = {
      filters: {
        term: {
          sellerStatus: 'Live',
          channelId: 0,
        },
        range: {
          quantity: { gte: 1 },
        },
        exclude: {
          channelExclusion: 0,
        },
      },
      context: {
        shippingCountry: 'US',
        cart: {},
      },
      sort: {
        field: 'price',
        order: 'asc',
      },
      from: offset,
      size: pageSize,
    };

    try {
      const response = await fetch(`${SEARCH_API_BASE}/v1/product/${productId}/listings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        console.warn(`[TCGmizer] Listings API returned ${response.status} for product ${productId}`);
        break;
      }

      const data = await response.json();
      const innerResults = data?.results?.[0]?.results || [];
      const totalResults = data?.results?.[0]?.totalResults || 0;

      if (innerResults.length === 0) break;

      for (const entry of innerResults) {
        listings.push({
          listingId: String(entry.listingId),
          // Use sellerKey as the seller identifier (consistent across APIs)
          sellerId: entry.sellerKey,
          sellerKey: entry.sellerKey,
          sellerNumericId: parseInt(entry.sellerId, 10),
          sellerName: entry.sellerName || 'Unknown Seller',
          slotId,
          productId,
          productConditionId: entry.productConditionId,
          price: entry.price || 0,
          shippingCost: entry.shippingPrice ?? 0,
          condition: entry.condition || 'Near Mint',
          language: entry.language || 'English',
          printing: entry.printing || '',
          quantity: entry.quantity || 1,
          sellerRating: entry.sellerRating || null,
          sellerSales: entry.sellerSales || null,
          directSeller: entry.directSeller || false,
          directListing: entry.directListing || false,
          goldSeller: entry.goldSeller || false,
          verifiedSeller: entry.verifiedSeller || false,
          listingType: entry.listingType || 'standard',
          customListingKey: entry.customData?.linkId || null,
        });
      }

      // If we got fewer than requested or reached totalResults, we're done
      if (innerResults.length < pageSize || listings.length >= totalResults) break;
      offset += pageSize;
    } catch (err) {
      console.warn(`[TCGmizer] Error fetching listings page for product ${productId}:`, err);
      break;
    }
  }

  return listings;
}

/**
 * Fetch shipping info for all sellers to determine free-shipping thresholds.
 * Endpoint: POST /v2/seller/shippinginfo?countryCode=US
 * Body: [{sellerId, largestShippingCategoryId}]
 */
async function fetchSellerShippingInfo(sellersMap, onShippingProgress = () => {}) {
  const sellerEntries = Object.values(sellersMap).filter((s) => s.sellerNumericId);
  const respondedSellerKeys = new Set();

  if (sellerEntries.length === 0) return respondedSellerKeys;

  // Build the request body: [{sellerId, largestShippingCategoryId: 1}]
  // Category 1 = singles (cards), which is what TCG cart optimization focuses on
  const body = sellerEntries.map((s) => ({
    sellerId: s.sellerNumericId,
    largestShippingCategoryId: 1,
  }));

  // Batch in groups of 50 to avoid too-large requests
  const BATCH_SIZE = 50;
  const totalBatches = Math.ceil(body.length / BATCH_SIZE);
  let batchIndex = 0;
  for (let i = 0; i < body.length; i += BATCH_SIZE) {
    batchIndex++;
    onShippingProgress({ current: batchIndex, total: totalBatches });
    const batch = body.slice(i, i + BATCH_SIZE);

    try {
      const response = await fetch(`${ROOT_API_BASE}/v2/seller/shippinginfo?countryCode=US`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        console.warn(`[TCGmizer] Shipping info API returned ${response.status}`);
        continue;
      }

      const data = await response.json();
      const results = data?.results?.[0] || data?.results || [];

      for (const sellerShipping of Array.isArray(results) ? results : []) {
        const key = sellerShipping.sellerKey;
        if (key) respondedSellerKeys.add(key);
        if (key && sellersMap[key]) {
          const opts = sellerShipping.sellerShippingOptions || [];
          if (opts.length > 0) {
            const opt = opts[0]; // Primary shipping option
            sellersMap[key].shippingCost = opt.shippingPriceUnderThreshold ?? sellersMap[key].shippingCost;
            // Free shipping threshold: if over-threshold price < under-threshold price
            if (opt.shippingPriceOverThreshold < opt.shippingPriceUnderThreshold) {
              sellersMap[key].freeShippingThreshold = opt.thresholdPrice;
            } else {
              // No free shipping benefit (same price over/under threshold)
              sellersMap[key].freeShippingThreshold = null;
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[TCGmizer] Error fetching shipping info batch:`, err);
    }

    // Small delay between batches
    if (i + BATCH_SIZE < body.length) {
      await sleep(100);
    }
  }

  return respondedSellerKeys;
}

/**
 * Search for all printings (products) of a card by exact name.
 * Uses the TCGPlayer product search API.
 * Returns an array of { productId, productName, setName }.
 */
export async function searchProductsByName(cardName, productLineName = null) {
  try {
    // Strip parenthesized suffixes (e.g. "(Borderless)", "(Extended Art)") so we
    // find all printings of the base card.  Keep the base name for matching too.
    const baseName = cardName.replace(/\s*\([^)]*\)/g, '').trim() || cardName.trim();
    const termFilters = {};
    if (productLineName) {
      termFilters.productLineName = [productLineName];
    }

    const response = await fetch(
      `${SEARCH_API_BASE}/v1/search/request?q=${encodeURIComponent(baseName)}&isList=false`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          algorithm: 'revenue_dismax',
          from: 0,
          size: SEARCH_RESULTS_PER_PAGE,
          filters: {
            term: termFilters,
            range: {},
            match: {},
          },
          listingSearch: {
            context: { cart: {} },
            filters: {
              term: { sellerStatus: 'Live', channelId: 0 },
              range: { quantity: { gte: 1 } },
              exclude: { channelExclusion: 0 },
            },
          },
          context: {
            cart: {},
            shippingCountry: 'US',
          },
          settings: {
            useFuzzySearch: true,
            didYouMean: {},
          },
          sort: {},
        }),
      },
    );

    if (!response.ok) {
      console.warn(`[TCGmizer] Product search returned ${response.status} for "${cardName}"`);
      return [];
    }

    const data = await response.json();
    const results = data?.results?.[0]?.results || [];

    // Match exact base card name or base name with treatment suffix like " (Extended Art)"
    const lowerBase = baseName.toLowerCase();
    return results
      .filter((p) => {
        const pName = (p.productName || '').toLowerCase().trim();
        const pBase = pName.replace(/\s*\([^)]*\)/g, '').trim();
        if (pBase !== lowerBase && !pName.startsWith(lowerBase + ' (')) return false;
        // Filter out products with no totalListings or 0 listings
        if (p.totalListings != null && p.totalListings === 0) return false;
        return true;
      })
      .map((p) => ({
        productId: p.productId,
        productName: p.productName,
        setName: p.groupName || p.setName || '',
        marketPrice: p.marketPrice || p.lowestPrice || 0,
        productLineId: p.productLineId || null,
        productLineName: p.productLineName || '',
      }));
  } catch (err) {
    console.warn(`[TCGmizer] Error searching products for "${cardName}":`, err);
    return [];
  }
}

/**
 * Search for alternative printings of multiple cards concurrently.
 * Uses a sliding-window concurrency limit matching the listings fetcher.
 *
 * @param {string[]} cardNames - Unique card names to search
 * @param {Set<number>} seenProducts - Product IDs already known (from cart)
 * @param {Object} [options]
 * @param {number} [options.concurrency] - Max concurrent requests (default: DEFAULT_FETCH_CONCURRENCY)
 * @param {number} [options.delayMs] - Stagger delay between requests (default: DEFAULT_FETCH_DELAY_MS)
 * @param {function} [options.onProgress] - Progress callback: ({ current, total })
 * @param {string} [options.productLineName] - Product line slug for filtering (e.g. "magic")
 * @returns {Promise<{ productCards: Array<{productId, cardName}>, allowedProductLines: Set, cardNameToProductIds: Map, productIdToSetName: Map }>}
 */
export async function searchAllCardPrintings(cardNames, seenProducts, options = {}) {
  const concurrency = options.concurrency || DEFAULT_FETCH_CONCURRENCY;
  const delayMs = options.delayMs ?? DEFAULT_FETCH_DELAY_MS;
  const onProgress = options.onProgress || (() => {});
  const productLineName = options.productLineName || null;
  const shouldCancel = options.shouldCancel || (() => false);
  // --- Printings cache: prune expired entries, serve cached, fetch only uncached ---
  const printingsCache = await prunePrintingsCache();
  const { cached: cachedPrintingsMap, uncachedNames } = getCachedPrintings(cardNames, printingsCache);

  // Pre-populate searchResults with cached data
  const searchResults = new Map(); // cardName → printings[]
  for (const [name, printings] of cachedPrintingsMap) {
    searchResults.set(name, printings);
  }
  if (cachedPrintingsMap.size > 0) {
    console.log(`[TCGmizer] Used cached printings for ${cachedPrintingsMap.size} card(s)`);
  }

  // Report cached items as already-completed progress
  let completedCount = cachedPrintingsMap.size;
  if (completedCount > 0) {
    onProgress({ current: completedCount, total: cardNames.length });
  }

  // Only fetch uncached card names from the API
  async function searchOne(name) {
    try {
      const printings = await searchProductsByName(name, productLineName);
      return { name, printings, error: null };
    } catch (err) {
      return { name, printings: [], error: err };
    }
  }

  const newlyFetched = new Map(); // track new results to cache

  // Sliding-window concurrent searcher (only for uncached names)
  const queue = [...uncachedNames];
  const inflight = new Set();

  while (queue.length > 0 || inflight.size > 0) {
    // Check for cancellation
    if (shouldCancel()) {
      console.log('[TCGmizer] Printings search cancelled');
      break;
    }

    while (queue.length > 0 && inflight.size < concurrency) {
      const name = queue.shift();
      const promise = (async () => {
        if (inflight.size > 0) await sleep(delayMs);
        return searchOne(name);
      })();
      const tracked = promise.then((result) => {
        inflight.delete(tracked);
        completedCount++;
        onProgress({ current: completedCount, total: cardNames.length });
        if (result.error) {
          console.warn(`[TCGmizer] Failed to search printings for "${result.name}":`, result.error);
        }
        searchResults.set(result.name, result.printings);
        newlyFetched.set(result.name, result.printings);
      });
      inflight.add(tracked);
    }
    if (inflight.size > 0) {
      await Promise.race(inflight);
    }
  }

  // Cache newly fetched printings results
  if (newlyFetched.size > 0) {
    await cachePrintings(newlyFetched);
  } else if (cardNames.length > 0) {
    console.log('[TCGmizer] All printings served from cache');
  }

  // Process results sequentially (same logic as before) to build product lists
  const allowedProductLines = new Set();
  const productCards = [];
  const cardNameToProductIds = new Map();
  const productIdToSetName = new Map();
  const productIdToProductName = new Map();
  const localSeen = new Set(seenProducts);

  for (const name of cardNames) {
    if (!cardNameToProductIds.has(name)) {
      cardNameToProductIds.set(name, new Set());
    }

    const printings = searchResults.get(name) || [];

    // Record all product names for solve-time filtering
    for (const p of printings) {
      if (p.productId && p.productName) {
        productIdToProductName.set(p.productId, p.productName);
      }
    }

    // Detect product lines from results that match already-known products
    for (const p of printings) {
      if (localSeen.has(p.productId) && p.productLineId) {
        allowedProductLines.add(p.productLineId);
      }
    }

    // Limit to MAX_ALTERNATIVE_PRINTINGS new products per card
    let added = 0;
    for (const p of printings) {
      // Only include alt printings from the same game/product line as cart items
      if (allowedProductLines.size > 0 && p.productLineId && !allowedProductLines.has(p.productLineId)) {
        continue;
      }

      if (!localSeen.has(p.productId)) {
        localSeen.add(p.productId);
        cardNameToProductIds.get(name).add(p.productId);
        productCards.push({ productId: p.productId, cardName: name });
        if (p.setName) productIdToSetName.set(p.productId, p.setName);
        added++;
        if (added >= MAX_ALTERNATIVE_PRINTINGS) break;
      } else {
        // Already have this product, but still record the set name
        cardNameToProductIds.get(name).add(p.productId);
        if (p.setName && !productIdToSetName.has(p.productId)) {
          productIdToSetName.set(p.productId, p.setName);
        }
      }
    }
  }

  return { productCards, allowedProductLines, cardNameToProductIds, productIdToSetName, productIdToProductName };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
