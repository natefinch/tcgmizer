/**
 * Seller info cache — persists seller shipping data across sessions using
 * chrome.storage.local so we don't re-fetch it every optimization run.
 *
 * Each entry stores:
 *   { sellerName, sellerKey, sellerNumericId, shippingCost, freeShippingThreshold, timestamp }
 *
 * Entries older than CACHE_MAX_AGE_MS are pruned before each fetch cycle.
 */

const CACHE_STORAGE_KEY = 'tcgmizer_seller_cache';
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Load the full seller cache from chrome.storage.local.
 * @returns {Promise<Object<string, Object>>} sellerKey → cached entry
 */
async function loadCache() {
  try {
    const result = await chrome.storage.local.get(CACHE_STORAGE_KEY);
    return result[CACHE_STORAGE_KEY] || {};
  } catch (err) {
    console.warn('[TCGmizer] Failed to load seller cache:', err);
    return {};
  }
}

/**
 * Save the full seller cache to chrome.storage.local.
 * @param {Object<string, Object>} cache - sellerKey → cached entry
 */
async function saveCache(cache) {
  try {
    await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: cache });
  } catch (err) {
    console.warn('[TCGmizer] Failed to save seller cache:', err);
  }
}

/**
 * Remove all cache entries older than CACHE_MAX_AGE_MS and persist.
 * @returns {Promise<Object<string, Object>>} The pruned cache
 */
export async function pruneExpiredEntries() {
  const cache = await loadCache();
  const now = Date.now();
  let pruned = 0;

  for (const key of Object.keys(cache)) {
    if (!cache[key].timestamp || now - cache[key].timestamp > CACHE_MAX_AGE_MS) {
      delete cache[key];
      pruned++;
    }
  }

  if (pruned > 0) {
    await saveCache(cache);
    console.log(`[TCGmizer] Pruned ${pruned} expired seller cache entries`);
  }

  return cache;
}

/**
 * Look up cached seller info for a set of seller keys.
 * Only returns entries that are still within the max age window.
 *
 * @param {string[]} sellerKeys - Seller keys to look up
 * @param {Object<string, Object>} cache - Pre-loaded cache (from pruneExpiredEntries)
 * @returns {{ cached: Object<string, Object>, uncachedKeys: string[] }}
 */
export function getCachedSellers(sellerKeys, cache) {
  const cached = {};
  const uncachedKeys = [];

  for (const key of sellerKeys) {
    if (cache[key]) {
      cached[key] = cache[key];
    } else {
      uncachedKeys.push(key);
    }
  }

  return { cached, uncachedKeys };
}

/**
 * Store seller info entries in the cache with the current timestamp.
 *
 * @param {Object<string, Object>} sellerEntries - sellerKey → { sellerName, sellerKey, sellerNumericId, shippingCost, freeShippingThreshold }
 */
export async function cacheSellers(sellerEntries) {
  const cache = await loadCache();
  const now = Date.now();

  for (const [key, info] of Object.entries(sellerEntries)) {
    cache[key] = {
      sellerName: info.sellerName,
      sellerKey: info.sellerKey,
      sellerNumericId: info.sellerNumericId,
      shippingCost: info.shippingCost,
      freeShippingThreshold: info.freeShippingThreshold,
      timestamp: now,
    };
  }

  await saveCache(cache);
  console.log(`[TCGmizer] Cached ${Object.keys(sellerEntries).length} seller entries`);
}

/**
 * Clear the entire seller cache.
 */
export async function clearSellerCache() {
  try {
    await chrome.storage.local.remove(CACHE_STORAGE_KEY);
    console.log('[TCGmizer] Seller cache cleared');
  } catch (err) {
    console.warn('[TCGmizer] Failed to clear seller cache:', err);
  }
}
