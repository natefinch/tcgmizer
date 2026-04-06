/**
 * Alternate printings cache — persists card-name-to-printings search results
 * across sessions using chrome.storage.local so we don't re-fetch them on
 * every optimization run.
 *
 * Each entry stores:
 *   { printings: [...], timestamp }
 *
 * where each printing is:
 *   { productId, productName, setName, marketPrice, productLineId, productLineName }
 *
 * Entries older than CACHE_MAX_AGE_MS (1 week) are pruned before each fetch cycle.
 */

const CACHE_STORAGE_KEY = 'tcgmizer_printings_cache';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

/**
 * Load the full printings cache from chrome.storage.local.
 * @returns {Promise<Object<string, Object>>} cardName → cached entry
 */
async function loadCache() {
  try {
    const result = await chrome.storage.local.get(CACHE_STORAGE_KEY);
    return result[CACHE_STORAGE_KEY] || {};
  } catch (err) {
    console.warn('[TCGmizer] Failed to load printings cache:', err);
    return {};
  }
}

/**
 * Save the full printings cache to chrome.storage.local.
 * @param {Object<string, Object>} cache - cardName → cached entry
 */
async function saveCache(cache) {
  try {
    await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: cache });
  } catch (err) {
    console.warn('[TCGmizer] Failed to save printings cache:', err);
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
    console.log(`[TCGmizer] Pruned ${pruned} expired printings cache entries`);
  }

  return cache;
}

/**
 * Look up cached printings for a set of card names.
 *
 * @param {string[]} cardNames - Card names to look up
 * @param {Object<string, Object>} cache - Pre-loaded cache (from pruneExpiredEntries)
 * @returns {{ cached: Map<string, Array>, uncachedNames: string[] }}
 */
export function getCachedPrintings(cardNames, cache) {
  const cached = new Map();
  const uncachedNames = [];

  for (const name of cardNames) {
    const key = name.toLowerCase().trim();
    if (cache[key]) {
      cached.set(name, cache[key].printings);
    } else {
      uncachedNames.push(name);
    }
  }

  return { cached, uncachedNames };
}

/**
 * Store printings search results in the cache with the current timestamp.
 *
 * @param {Map<string, Array>} results - cardName → printings array
 */
export async function cachePrintings(results) {
  const cache = await loadCache();
  const now = Date.now();

  for (const [name, printings] of results) {
    const key = name.toLowerCase().trim();
    cache[key] = {
      printings,
      timestamp: now,
    };
  }

  await saveCache(cache);
  console.log(`[TCGmizer] Cached printings for ${results.size} card(s)`);
}

/**
 * Clear the entire printings cache.
 */
export async function clearPrintingsCache() {
  try {
    await chrome.storage.local.remove(CACHE_STORAGE_KEY);
    console.log('[TCGmizer] Printings cache cleared');
  } catch (err) {
    console.warn('[TCGmizer] Failed to clear printings cache:', err);
  }
}
