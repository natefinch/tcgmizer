/**
 * Unit tests for printings-cache.js.
 * Mocks chrome.storage.local since we're outside the extension context.
 * Run with: node test/test-printings-cache.js
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
const { pruneExpiredEntries, getCachedPrintings, cachePrintings, clearPrintingsCache } =
  await import('../src/background/printings-cache.js');

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

const SAMPLE_PRINTINGS = [
  {
    productId: 230149,
    productName: 'Snow-Covered Swamp',
    setName: 'Kaldheim',
    marketPrice: 0.64,
    productLineId: 1,
    productLineName: 'Magic: The Gathering',
  },
  {
    productId: 100200,
    productName: 'Snow-Covered Swamp',
    setName: 'Modern Horizons',
    marketPrice: 0.5,
    productLineId: 1,
    productLineName: 'Magic: The Gathering',
  },
];

const SAMPLE_PRINTINGS_2 = [
  {
    productId: 50001,
    productName: 'Lightning Bolt',
    setName: 'M10',
    marketPrice: 1.5,
    productLineId: 1,
    productLineName: 'Magic: The Gathering',
  },
];

// ============================================================
// Test 1: getCachedPrintings — splits into cached/uncached
// ============================================================
console.log('Test 1: getCachedPrintings splits names into cached/uncached');
{
  const cache = {
    'snow-covered swamp': { printings: SAMPLE_PRINTINGS, timestamp: Date.now() },
    'lightning bolt': { printings: SAMPLE_PRINTINGS_2, timestamp: Date.now() },
  };

  const result = getCachedPrintings(['Snow-Covered Swamp', 'Counterspell', 'Lightning Bolt', 'Dark Ritual'], cache);

  test('Returns cached entries that exist in cache', () => {
    assert(result.cached.has('Snow-Covered Swamp'), 'Snow-Covered Swamp should be cached');
    assert(result.cached.has('Lightning Bolt'), 'Lightning Bolt should be cached');
    assertEqual(result.cached.size, 2, 'Should have 2 cached entries');
  });

  test('Returns uncached names for entries not in cache', () => {
    assert(result.uncachedNames.includes('Counterspell'), 'Counterspell should be uncached');
    assert(result.uncachedNames.includes('Dark Ritual'), 'Dark Ritual should be uncached');
    assertEqual(result.uncachedNames.length, 2, 'Should have 2 uncached names');
  });

  test('Cached entries contain correct printings data', () => {
    const swampPrintings = result.cached.get('Snow-Covered Swamp');
    assertEqual(swampPrintings.length, 2, 'Snow-Covered Swamp should have 2 printings');
    assertEqual(swampPrintings[0].productId, 230149, 'First printing productId');
    assertEqual(swampPrintings[0].setName, 'Kaldheim', 'First printing setName');
  });
}

// ============================================================
// Test 2: getCachedPrintings — case-insensitive lookup
// ============================================================
console.log('\nTest 2: getCachedPrintings with case-insensitive lookup');
{
  const cache = {
    'snow-covered swamp': { printings: SAMPLE_PRINTINGS, timestamp: Date.now() },
  };

  test('Matches regardless of case', () => {
    const r1 = getCachedPrintings(['Snow-Covered Swamp'], cache);
    assertEqual(r1.cached.size, 1, 'Capitalized name should match');

    const r2 = getCachedPrintings(['snow-covered swamp'], cache);
    assertEqual(r2.cached.size, 1, 'Lowercase name should match');

    const r3 = getCachedPrintings(['SNOW-COVERED SWAMP'], cache);
    assertEqual(r3.cached.size, 1, 'Uppercase name should match');
  });
}

// ============================================================
// Test 3: getCachedPrintings — empty cache
// ============================================================
console.log('\nTest 3: getCachedPrintings with empty cache');
{
  const result = getCachedPrintings(['Card A', 'Card B'], {});

  test('All names are uncached when cache is empty', () => {
    assertEqual(result.cached.size, 0, 'No cached entries');
    assertEqual(result.uncachedNames.length, 2, 'All names uncached');
  });
}

// ============================================================
// Test 4: getCachedPrintings — empty names
// ============================================================
console.log('\nTest 4: getCachedPrintings with no names to look up');
{
  const cache = { 'card a': { printings: [], timestamp: Date.now() } };
  const result = getCachedPrintings([], cache);

  test('No cached or uncached when no names requested', () => {
    assertEqual(result.cached.size, 0, 'No cached entries');
    assertEqual(result.uncachedNames.length, 0, 'No uncached names');
  });
}

// ============================================================
// Test 5: cachePrintings — stores results with timestamp
// ============================================================
console.log('\nTest 5: cachePrintings stores entries with timestamp');
clearMockStore();
{
  const before = Date.now();

  await testAsync('Stores printings entries in chrome.storage.local', async () => {
    const results = new Map();
    results.set('Snow-Covered Swamp', SAMPLE_PRINTINGS);
    results.set('Lightning Bolt', SAMPLE_PRINTINGS_2);
    await cachePrintings(results);

    const stored = mockStore['tcgmizer_printings_cache'];
    assert(stored !== undefined, 'Cache should exist in storage');
    assert(stored['snow-covered swamp'] !== undefined, 'Snow-Covered Swamp should be stored');
    assert(stored['lightning bolt'] !== undefined, 'Lightning Bolt should be stored');
  });

  await testAsync('Stored entries have correct printings data', async () => {
    const stored = mockStore['tcgmizer_printings_cache'];
    assertEqual(stored['snow-covered swamp'].printings.length, 2, 'Swamp printings count');
    assertEqual(stored['snow-covered swamp'].printings[0].productId, 230149, 'Swamp first productId');
    assertEqual(stored['lightning bolt'].printings.length, 1, 'Bolt printings count');
  });

  await testAsync('Stored entries have valid timestamps', async () => {
    const stored = mockStore['tcgmizer_printings_cache'];
    const after = Date.now();
    assert(
      stored['snow-covered swamp'].timestamp >= before && stored['snow-covered swamp'].timestamp <= after,
      'Swamp timestamp should be current',
    );
    assert(
      stored['lightning bolt'].timestamp >= before && stored['lightning bolt'].timestamp <= after,
      'Bolt timestamp should be current',
    );
  });
}

// ============================================================
// Test 6: cachePrintings — merges with existing cache
// ============================================================
console.log('\nTest 6: cachePrintings merges with existing entries');
clearMockStore();
{
  await testAsync('New entries are added alongside existing ones', async () => {
    const batch1 = new Map();
    batch1.set('Snow-Covered Swamp', SAMPLE_PRINTINGS);
    await cachePrintings(batch1);

    const batch2 = new Map();
    batch2.set('Lightning Bolt', SAMPLE_PRINTINGS_2);
    await cachePrintings(batch2);

    const stored = mockStore['tcgmizer_printings_cache'];
    assert(stored['snow-covered swamp'] !== undefined, 'Swamp should still be in cache');
    assert(stored['lightning bolt'] !== undefined, 'Bolt should be added');
  });
}

// ============================================================
// Test 7: pruneExpiredEntries — 1 week TTL
// ============================================================
console.log('\nTest 7: pruneExpiredEntries removes entries older than 1 week');
clearMockStore();
{
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  mockStore['tcgmizer_printings_cache'] = {
    'fresh card': { printings: [{ productId: 1 }], timestamp: now - 1000 }, // 1 second ago
    borderline: { printings: [{ productId: 2 }], timestamp: now - ONE_WEEK + 60000 }, // just under 1 week
    'expired card': { printings: [{ productId: 3 }], timestamp: now - ONE_WEEK - 1 }, // just over 1 week
    'very old card': { printings: [{ productId: 4 }], timestamp: now - ONE_WEEK * 4 }, // 4 weeks ago
    'no timestamp': { printings: [{ productId: 5 }] }, // no timestamp
  };

  await testAsync('Prune returns only fresh entries', async () => {
    const result = await pruneExpiredEntries();
    assert(result['fresh card'] !== undefined, 'Fresh entry should survive');
    assert(result['borderline'] !== undefined, 'Borderline entry should survive');
    assert(result['expired card'] === undefined, 'Expired entry should be pruned');
    assert(result['very old card'] === undefined, 'Very old entry should be pruned');
    assert(result['no timestamp'] === undefined, 'Entry without timestamp should be pruned');
    assertEqual(Object.keys(result).length, 2, 'Should have exactly 2 surviving entries');
  });

  await testAsync('Pruned cache is persisted to storage', async () => {
    const stored = mockStore['tcgmizer_printings_cache'];
    assert(stored['fresh card'] !== undefined, 'Fresh should be in storage');
    assert(stored['borderline'] !== undefined, 'Borderline should be in storage');
    assert(stored['expired card'] === undefined, 'Expired should not be in storage');
  });
}

// ============================================================
// Test 8: pruneExpiredEntries — nothing to prune
// ============================================================
console.log('\nTest 8: pruneExpiredEntries with all-fresh cache');
clearMockStore();
{
  const now = Date.now();
  mockStore['tcgmizer_printings_cache'] = {
    'card a': { printings: [{ productId: 1 }], timestamp: now },
    'card b': { printings: [{ productId: 2 }], timestamp: now - 1000 },
  };

  await testAsync('All entries survive when none are expired', async () => {
    const result = await pruneExpiredEntries();
    assertEqual(Object.keys(result).length, 2, 'Both entries should survive');
  });
}

// ============================================================
// Test 9: pruneExpiredEntries — empty cache
// ============================================================
console.log('\nTest 9: pruneExpiredEntries with empty cache');
clearMockStore();
{
  await testAsync('Returns empty object for empty cache', async () => {
    const result = await pruneExpiredEntries();
    assertEqual(Object.keys(result).length, 0, 'Should be empty');
  });
}

// ============================================================
// Test 10: clearPrintingsCache — removes all cached data
// ============================================================
console.log('\nTest 10: clearPrintingsCache removes all data');
clearMockStore();
{
  await testAsync('Clears the printings cache from storage', async () => {
    const results = new Map();
    results.set('Snow-Covered Swamp', SAMPLE_PRINTINGS);
    results.set('Lightning Bolt', SAMPLE_PRINTINGS_2);
    await cachePrintings(results);
    assert(mockStore['tcgmizer_printings_cache'] !== undefined, 'Cache should exist before clear');

    await clearPrintingsCache();
    assert(mockStore['tcgmizer_printings_cache'] === undefined, 'Cache should be removed after clear');
  });

  await testAsync('pruneExpiredEntries returns empty after clear', async () => {
    const result = await pruneExpiredEntries();
    assertEqual(Object.keys(result).length, 0, 'Cache should be empty after clear');
  });
}

// ============================================================
// Test 11: Full round-trip — cache, age, prune, lookup
// ============================================================
console.log('\nTest 11: Full round-trip workflow');
clearMockStore();
{
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

  await testAsync('Cache printings, age some, prune, then lookup', async () => {
    // 1. Cache three card names
    const results = new Map();
    results.set('Snow-Covered Swamp', SAMPLE_PRINTINGS);
    results.set('Lightning Bolt', SAMPLE_PRINTINGS_2);
    results.set('Counterspell', [
      {
        productId: 9999,
        productName: 'Counterspell',
        setName: 'ICE',
        marketPrice: 2.0,
        productLineId: 1,
        productLineName: 'Magic',
      },
    ]);
    await cachePrintings(results);

    // 2. Manually age Lightning Bolt to make it expired
    mockStore['tcgmizer_printings_cache']['lightning bolt'].timestamp = Date.now() - ONE_WEEK - 1000;

    // 3. Prune expired
    const cache = await pruneExpiredEntries();
    assertEqual(Object.keys(cache).length, 2, 'Should have 2 entries after prune');
    assert(cache['snow-covered swamp'] !== undefined, 'Swamp should survive');
    assert(cache['counterspell'] !== undefined, 'Counterspell should survive');
    assert(cache['lightning bolt'] === undefined, 'Bolt should be pruned');

    // 4. Look up card names needed for optimization
    const { cached, uncachedNames } = getCachedPrintings(
      ['Snow-Covered Swamp', 'Lightning Bolt', 'Counterspell', 'Dark Ritual'],
      cache,
    );
    assertEqual(cached.size, 2, '2 cards in cache (Swamp, Counterspell)');
    assert(cached.has('Snow-Covered Swamp'), 'Swamp cached');
    assert(cached.has('Counterspell'), 'Counterspell cached');
    assertEqual(uncachedNames.length, 2, '2 cards not in cache (Bolt, Dark Ritual)');
    assert(uncachedNames.includes('Lightning Bolt'), 'Bolt needs fetching (was pruned)');
    assert(uncachedNames.includes('Dark Ritual'), 'Dark Ritual needs fetching (never cached)');

    // 5. Verify cached printings data
    const swamp = cached.get('Snow-Covered Swamp');
    assertEqual(swamp.length, 2, 'Swamp should have 2 printings');
    assertEqual(swamp[0].productId, 230149, 'First Swamp printing productId');
    assertEqual(swamp[0].setName, 'Kaldheim', 'First Swamp printing set');
  });
}

// ============================================================
// Test 12: Cards with empty printings results are cached
// ============================================================
console.log('\nTest 12: Empty printings arrays are cached');
clearMockStore();
{
  await testAsync('Card with no printings is still cached', async () => {
    const results = new Map();
    results.set('Nonexistent Card', []);
    await cachePrintings(results);

    const cache = await pruneExpiredEntries();
    const { cached, uncachedNames } = getCachedPrintings(['Nonexistent Card'], cache);
    assertEqual(cached.size, 1, 'Should be cached');
    assertEqual(cached.get('Nonexistent Card').length, 0, 'Printings should be empty array');
    assertEqual(uncachedNames.length, 0, 'No uncached names');
  });
}

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
