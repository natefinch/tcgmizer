/**
 * Unit tests for seller-cache.js.
 * Mocks chrome.storage.local since we're outside the extension context.
 * Run with: node test/test-seller-cache.js
 */

// --- Mock chrome.storage.local ---
const mockStore = {};

globalThis.chrome = {
  storage: {
    local: {
      async get(key) {
        return { [key]: mockStore[key] ?? undefined };
      },
      async set(obj) {
        for (const [k, v] of Object.entries(obj)) {
          mockStore[k] = JSON.parse(JSON.stringify(v)); // deep clone to simulate storage
        }
      },
      async remove(key) {
        delete mockStore[key];
      },
    },
  },
};

function clearMockStore() {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
}

// --- Import module under test (after mock is in place) ---
const { pruneExpiredEntries, getCachedSellers, cacheSellers, clearSellerCache } =
  await import('../src/background/seller-cache.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected ${expected}, got ${actual}`);
}

// ============================================================
// Test 1: getCachedSellers — pure function, no storage needed
// ============================================================
console.log('Test 1: getCachedSellers splits keys into cached/uncached');
{
  const cache = {
    s1: { sellerName: 'Alpha', shippingCost: 1.00, timestamp: Date.now() },
    s3: { sellerName: 'Gamma', shippingCost: 0.50, timestamp: Date.now() },
  };

  const result = getCachedSellers(['s1', 's2', 's3', 's4'], cache);

  test('Returns cached entries that exist in cache', () => {
    assert(result.cached.s1 !== undefined, 's1 should be cached');
    assert(result.cached.s3 !== undefined, 's3 should be cached');
    assertEqual(Object.keys(result.cached).length, 2, 'Should have 2 cached entries');
  });

  test('Returns uncached keys for entries not in cache', () => {
    assert(result.uncachedKeys.includes('s2'), 's2 should be uncached');
    assert(result.uncachedKeys.includes('s4'), 's4 should be uncached');
    assertEqual(result.uncachedKeys.length, 2, 'Should have 2 uncached keys');
  });

  test('Cached entries contain original data', () => {
    assertEqual(result.cached.s1.sellerName, 'Alpha', 'Cached s1 name');
    assertEqual(result.cached.s1.shippingCost, 1.00, 'Cached s1 shipping');
  });
}

// ============================================================
// Test 2: getCachedSellers — empty cache
// ============================================================
console.log('\nTest 2: getCachedSellers with empty cache');
{
  const result = getCachedSellers(['s1', 's2'], {});

  test('All keys are uncached when cache is empty', () => {
    assertEqual(Object.keys(result.cached).length, 0, 'No cached entries');
    assertEqual(result.uncachedKeys.length, 2, 'All keys uncached');
  });
}

// ============================================================
// Test 3: getCachedSellers — empty keys
// ============================================================
console.log('\nTest 3: getCachedSellers with no keys to look up');
{
  const cache = { s1: { sellerName: 'Alpha', timestamp: Date.now() } };
  const result = getCachedSellers([], cache);

  test('No cached or uncached when no keys requested', () => {
    assertEqual(Object.keys(result.cached).length, 0, 'No cached entries');
    assertEqual(result.uncachedKeys.length, 0, 'No uncached keys');
  });
}

// ============================================================
// Test 4: cacheSellers — stores entries with timestamp
// ============================================================
console.log('\nTest 4: cacheSellers stores entries with timestamp');
clearMockStore();
{
  const before = Date.now();

  await testAsync('Stores seller entries in chrome.storage.local', async () => {
    await cacheSellers({
      s1: { sellerName: 'Alpha', sellerKey: 's1', sellerNumericId: 101, shippingCost: 1.00, freeShippingThreshold: 5.00 },
      s2: { sellerName: 'Beta', sellerKey: 's2', sellerNumericId: 102, shippingCost: 2.00, freeShippingThreshold: null },
    });

    const stored = mockStore['tcgmizer_seller_cache'];
    assert(stored !== undefined, 'Cache should exist in storage');
    assert(stored.s1 !== undefined, 's1 should be stored');
    assert(stored.s2 !== undefined, 's2 should be stored');
  });

  await testAsync('Stored entries have correct data', async () => {
    const stored = mockStore['tcgmizer_seller_cache'];
    assertEqual(stored.s1.sellerName, 'Alpha', 's1 name');
    assertEqual(stored.s1.sellerKey, 's1', 's1 key');
    assertEqual(stored.s1.sellerNumericId, 101, 's1 numeric id');
    assertEqual(stored.s1.shippingCost, 1.00, 's1 shipping cost');
    assertEqual(stored.s1.freeShippingThreshold, 5.00, 's1 free shipping threshold');
    assertEqual(stored.s2.freeShippingThreshold, null, 's2 free shipping threshold should be null');
  });

  await testAsync('Stored entries have valid timestamps', async () => {
    const stored = mockStore['tcgmizer_seller_cache'];
    const after = Date.now();
    assert(stored.s1.timestamp >= before && stored.s1.timestamp <= after,
      `s1 timestamp ${stored.s1.timestamp} should be between ${before} and ${after}`);
    assert(stored.s2.timestamp >= before && stored.s2.timestamp <= after,
      `s2 timestamp should be current`);
  });
}

// ============================================================
// Test 5: cacheSellers — merges with existing cache
// ============================================================
console.log('\nTest 5: cacheSellers merges with existing entries');
clearMockStore();
{
  await testAsync('New entries are added alongside existing ones', async () => {
    // Store initial entry
    await cacheSellers({
      s1: { sellerName: 'Alpha', sellerKey: 's1', sellerNumericId: 101, shippingCost: 1.00, freeShippingThreshold: 5.00 },
    });

    // Store second entry
    await cacheSellers({
      s2: { sellerName: 'Beta', sellerKey: 's2', sellerNumericId: 102, shippingCost: 2.00, freeShippingThreshold: null },
    });

    const stored = mockStore['tcgmizer_seller_cache'];
    assert(stored.s1 !== undefined, 's1 should still be in cache');
    assert(stored.s2 !== undefined, 's2 should be added');
    assertEqual(stored.s1.sellerName, 'Alpha', 's1 name preserved');
    assertEqual(stored.s2.sellerName, 'Beta', 's2 name correct');
  });

  await testAsync('Updating existing entry overwrites it', async () => {
    await cacheSellers({
      s1: { sellerName: 'Alpha Updated', sellerKey: 's1', sellerNumericId: 101, shippingCost: 0.50, freeShippingThreshold: 10.00 },
    });

    const stored = mockStore['tcgmizer_seller_cache'];
    assertEqual(stored.s1.sellerName, 'Alpha Updated', 's1 name updated');
    assertEqual(stored.s1.shippingCost, 0.50, 's1 shipping cost updated');
    assertEqual(stored.s1.freeShippingThreshold, 10.00, 's1 threshold updated');
    assert(stored.s2 !== undefined, 's2 should still be present');
  });
}

// ============================================================
// Test 6: pruneExpiredEntries — removes old entries, keeps fresh ones
// ============================================================
console.log('\nTest 6: pruneExpiredEntries removes expired entries');
clearMockStore();
{
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const now = Date.now();

  // Directly seed the mock store with entries at different ages
  mockStore['tcgmizer_seller_cache'] = {
    fresh: { sellerName: 'Fresh', shippingCost: 1.00, timestamp: now - 1000 },                // 1 second ago
    borderline: { sellerName: 'Borderline', shippingCost: 1.50, timestamp: now - SIX_HOURS + 60000 }, // just under 6h
    expired: { sellerName: 'Expired', shippingCost: 2.00, timestamp: now - SIX_HOURS - 1 },   // just over 6h
    veryOld: { sellerName: 'Very Old', shippingCost: 3.00, timestamp: now - SIX_HOURS * 3 },  // 18h ago
    noTimestamp: { sellerName: 'No Timestamp', shippingCost: 0.50 },                            // no timestamp at all
  };

  await testAsync('Prune returns only fresh entries', async () => {
    const result = await pruneExpiredEntries();
    assert(result.fresh !== undefined, 'Fresh entry should survive');
    assert(result.borderline !== undefined, 'Borderline entry should survive');
    assert(result.expired === undefined, 'Expired entry should be pruned');
    assert(result.veryOld === undefined, 'Very old entry should be pruned');
    assert(result.noTimestamp === undefined, 'Entry without timestamp should be pruned');
    assertEqual(Object.keys(result).length, 2, 'Should have exactly 2 surviving entries');
  });

  await testAsync('Pruned cache is persisted to storage', async () => {
    const stored = mockStore['tcgmizer_seller_cache'];
    assert(stored.fresh !== undefined, 'Fresh should be in storage');
    assert(stored.borderline !== undefined, 'Borderline should be in storage');
    assert(stored.expired === undefined, 'Expired should not be in storage');
    assert(stored.veryOld === undefined, 'Very old should not be in storage');
    assert(stored.noTimestamp === undefined, 'No-timestamp should not be in storage');
  });
}

// ============================================================
// Test 7: pruneExpiredEntries — nothing to prune
// ============================================================
console.log('\nTest 7: pruneExpiredEntries with all-fresh cache');
clearMockStore();
{
  const now = Date.now();
  mockStore['tcgmizer_seller_cache'] = {
    s1: { sellerName: 'A', shippingCost: 1.00, timestamp: now },
    s2: { sellerName: 'B', shippingCost: 2.00, timestamp: now - 1000 },
  };

  await testAsync('All entries survive when none are expired', async () => {
    const result = await pruneExpiredEntries();
    assertEqual(Object.keys(result).length, 2, 'Both entries should survive');
    assert(result.s1 !== undefined, 's1 present');
    assert(result.s2 !== undefined, 's2 present');
  });
}

// ============================================================
// Test 8: pruneExpiredEntries — empty cache
// ============================================================
console.log('\nTest 8: pruneExpiredEntries with empty cache');
clearMockStore();
{
  await testAsync('Returns empty object for empty cache', async () => {
    const result = await pruneExpiredEntries();
    assertEqual(Object.keys(result).length, 0, 'Should be empty');
  });
}

// ============================================================
// Test 9: clearSellerCache — removes all cached data
// ============================================================
console.log('\nTest 9: clearSellerCache removes all data');
clearMockStore();
{
  await testAsync('Clears the seller cache from storage', async () => {
    // Seed some data
    await cacheSellers({
      s1: { sellerName: 'A', sellerKey: 's1', sellerNumericId: 1, shippingCost: 1.00, freeShippingThreshold: null },
      s2: { sellerName: 'B', sellerKey: 's2', sellerNumericId: 2, shippingCost: 2.00, freeShippingThreshold: 5.00 },
    });
    assert(mockStore['tcgmizer_seller_cache'] !== undefined, 'Cache should exist before clear');

    await clearSellerCache();
    assert(mockStore['tcgmizer_seller_cache'] === undefined, 'Cache should be removed after clear');
  });

  await testAsync('pruneExpiredEntries returns empty after clear', async () => {
    const result = await pruneExpiredEntries();
    assertEqual(Object.keys(result).length, 0, 'Cache should be empty after clear');
  });
}

// ============================================================
// Test 10: Full round-trip — cache, prune, lookup
// ============================================================
console.log('\nTest 10: Full round-trip workflow');
clearMockStore();
{
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  await testAsync('Cache sellers, age some, prune, then lookup', async () => {
    // 1. Cache three sellers
    await cacheSellers({
      s1: { sellerName: 'Alpha', sellerKey: 's1', sellerNumericId: 101, shippingCost: 1.00, freeShippingThreshold: 5.00 },
      s2: { sellerName: 'Beta', sellerKey: 's2', sellerNumericId: 102, shippingCost: 2.00, freeShippingThreshold: null },
      s3: { sellerName: 'Gamma', sellerKey: 's3', sellerNumericId: 103, shippingCost: 0.50, freeShippingThreshold: 3.00 },
    });

    // 2. Manually age s2 to make it expired
    mockStore['tcgmizer_seller_cache'].s2.timestamp = Date.now() - SIX_HOURS - 1000;

    // 3. Prune expired
    const cache = await pruneExpiredEntries();
    assertEqual(Object.keys(cache).length, 2, 'Should have 2 entries after prune');
    assert(cache.s1 !== undefined, 's1 should survive');
    assert(cache.s3 !== undefined, 's3 should survive');
    assert(cache.s2 === undefined, 's2 should be pruned');

    // 4. Look up sellers needed for optimization
    const { cached, uncachedKeys } = getCachedSellers(['s1', 's2', 's3', 's4'], cache);
    assertEqual(Object.keys(cached).length, 2, '2 sellers in cache (s1, s3)');
    assert(cached.s1 !== undefined, 's1 cached');
    assert(cached.s3 !== undefined, 's3 cached');
    assertEqual(uncachedKeys.length, 2, '2 sellers not in cache (s2, s4)');
    assert(uncachedKeys.includes('s2'), 's2 needs fetching (was pruned)');
    assert(uncachedKeys.includes('s4'), 's4 needs fetching (never cached)');

    // 5. Verify cached data has correct shipping info
    assertEqual(cached.s1.shippingCost, 1.00, 's1 shipping cost from cache');
    assertEqual(cached.s1.freeShippingThreshold, 5.00, 's1 threshold from cache');
    assertEqual(cached.s3.shippingCost, 0.50, 's3 shipping cost from cache');
    assertEqual(cached.s3.freeShippingThreshold, 3.00, 's3 threshold from cache');
  });
}

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
