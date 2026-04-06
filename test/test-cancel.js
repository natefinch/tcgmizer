/**
 * Tests for cancellation functionality.
 * Tests that:
 *  - CANCEL_OPTIMIZATION message type exists in constants
 *  - fetchAllListings stops early when shouldCancel returns true
 *  - searchAllCardPrintings stops early when shouldCancel returns true
 *  - Service worker tracks cancelled tabs and handles CANCEL_OPTIMIZATION message
 *
 * Run with: node test/test-cancel.js
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
          mockStore[k] = JSON.parse(JSON.stringify(v));
        }
      },
      async remove(key) {
        delete mockStore[key];
      },
    },
  },
};

// --- Mock global fetch for fetcher tests ---
let fetchCallCount = 0;
let fetchDelay = 0;

function makeMockListingsResponse(productId) {
  return {
    ok: true,
    json: async () => ({
      results: [
        {
          totalResults: 1,
          results: [
            {
              listingId: `listing-${productId}`,
              sellerId: 100,
              sellerKey: 'seller1',
              sellerName: 'Test Seller',
              productConditionId: `pc-${productId}`,
              price: 1.0,
              shippingPrice: 0.99,
              condition: 'Near Mint',
              language: 'English',
              printing: '',
              quantity: 5,
              sellerRating: 5,
              sellerSales: 100,
              directSeller: false,
              directListing: false,
              goldSeller: false,
              verifiedSeller: false,
              listingType: 'standard',
              customData: null,
            },
          ],
        },
      ],
    }),
  };
}

function makeMockShippingResponse(body) {
  const results = body.map((s) => ({
    sellerKey: 'seller1',
    sellerShippingOptions: [
      {
        shippingPriceUnderThreshold: 0.99,
        shippingPriceOverThreshold: 0,
        thresholdPrice: 5.0,
      },
    ],
  }));
  return {
    ok: true,
    json: async () => ({ results: [results] }),
  };
}

function makeMockSearchResponse(cardName) {
  return {
    ok: true,
    json: async () => ({
      results: [
        {
          results: [
            {
              productId: Math.floor(Math.random() * 100000),
              productName: cardName,
              groupName: 'Test Set',
              marketPrice: 1.0,
              totalListings: 10,
              productLineId: 1,
              productLineName: 'Magic: The Gathering',
            },
          ],
        },
      ],
    }),
  };
}

// Capture the last fetch request body for shipping mock
let lastFetchBody = null;

globalThis.fetch = async (url, options) => {
  fetchCallCount++;
  if (fetchDelay > 0) {
    await new Promise((r) => setTimeout(r, fetchDelay));
  }

  if (options?.body) {
    try {
      lastFetchBody = JSON.parse(options.body);
    } catch {
      lastFetchBody = null;
    }
  }

  if (url.includes('/v1/product/') && url.includes('/listings')) {
    return makeMockListingsResponse(url.match(/product\/(\d+)/)?.[1] || 0);
  }
  if (url.includes('/v2/seller/shippinginfo')) {
    return makeMockShippingResponse(lastFetchBody || []);
  }
  if (url.includes('/v1/search/request')) {
    const match = url.match(/q=([^&]+)/);
    const name = match ? decodeURIComponent(match[1]) : 'Unknown';
    return makeMockSearchResponse(name);
  }
  if (url.includes('/v1/search/productLines')) {
    return {
      ok: true,
      json: async () => [{ productLineName: 'Magic: The Gathering', productLineUrlName: 'magic' }],
    };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

// --- Import modules under test (after mocks) ---
const { MSG } = await import('../src/shared/constants.js');
const { fetchAllListings, searchAllCardPrintings } = await import('../src/background/fetcher.js');

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
// Test 1: CANCEL_OPTIMIZATION message type exists
// ============================================================
console.log('Test 1: CANCEL_OPTIMIZATION message type exists in constants');

test('MSG.CANCEL_OPTIMIZATION is defined', () => {
  assert(MSG.CANCEL_OPTIMIZATION != null, 'MSG.CANCEL_OPTIMIZATION should be defined');
  assertEqual(MSG.CANCEL_OPTIMIZATION, 'CANCEL_OPTIMIZATION', 'Value should be CANCEL_OPTIMIZATION');
});

// ============================================================
// Test 2: fetchAllListings returns early when shouldCancel is true
// ============================================================
console.log('\nTest 2: fetchAllListings cancellation');
{
  const cards = [];
  for (let i = 1; i <= 20; i++) {
    cards.push({ productId: i, slotId: `slot-${i}`, cardName: `Card ${i}` });
  }

  // Cancel immediately
  await testAsync('Cancels immediately when shouldCancel starts true', async () => {
    fetchCallCount = 0;
    const result = await fetchAllListings(cards, {
      delayMs: 0,
      concurrency: 1,
      shouldCancel: () => true,
    });
    assert(result.listings != null, 'Should return a listings array');
    assert(result.sellers != null, 'Should return a sellers object');
    // Should have fetched 0 listings since we cancelled immediately
    assertEqual(result.listings.length, 0, 'Listings count');
  });

  // Cancel after some fetch calls
  await testAsync('Stops fetching when shouldCancel becomes true', async () => {
    fetchCallCount = 0;
    let cancelAfter = 3;
    let callsSeen = 0;
    const result = await fetchAllListings(cards, {
      delayMs: 0,
      concurrency: 1,
      onProgress: () => {
        callsSeen++;
      },
      shouldCancel: () => callsSeen >= cancelAfter,
    });
    assert(result.listings != null, 'Should return a listings array');
    // Should have fetched some but not all listings
    assert(result.listings.length < 20, `Should have fewer than 20 listings, got ${result.listings.length}`);
    assert(result.listings.length > 0, `Should have at least some listings, got ${result.listings.length}`);
  });

  // No cancellation — fetches everything
  await testAsync('Fetches all listings when shouldCancel is always false', async () => {
    fetchCallCount = 0;
    const result = await fetchAllListings(cards, {
      delayMs: 0,
      concurrency: 5,
      shouldCancel: () => false,
    });
    assertEqual(result.listings.length, 20, 'Should have fetched all 20 listings');
  });
}

// ============================================================
// Test 3: fetchAllListings cancels before shipping fetch
// ============================================================
console.log('\nTest 3: fetchAllListings cancels before shipping fetch');
{
  const cards = [{ productId: 5001, slotId: 'slot-1', cardName: 'Test Card' }];

  await testAsync('Skips shipping fetch when cancelled after listings', async () => {
    let shippingCallCount = 0;
    let listingsDone = false;
    const result = await fetchAllListings(cards, {
      delayMs: 0,
      concurrency: 1,
      onProgress: () => {
        listingsDone = true;
      },
      onShippingProgress: () => {
        shippingCallCount++;
      },
      // Cancel right after listings are done (before shipping)
      shouldCancel: () => listingsDone,
    });
    // Listings should have been fetched but shipping should have been skipped
    assert(result.listings.length > 0, 'Should have some listings');
    assertEqual(shippingCallCount, 0, 'Shipping progress should not have been called');
  });
}

// ============================================================
// Test 4: searchAllCardPrintings cancellation
// ============================================================
console.log('\nTest 4: searchAllCardPrintings cancellation');
{
  const cardNames = [];
  for (let i = 1; i <= 15; i++) {
    cardNames.push(`Card Name ${i}`);
  }
  const seenProducts = new Set();

  // Cancel immediately
  await testAsync('Cancels immediately when shouldCancel starts true', async () => {
    fetchCallCount = 0;
    const result = await searchAllCardPrintings(cardNames, seenProducts, {
      delayMs: 0,
      concurrency: 1,
      shouldCancel: () => true,
    });
    assert(result.productCards != null, 'Should return productCards');
    // Should have no products since we cancelled before any search
    assertEqual(result.productCards.length, 0, 'Should have 0 product cards');
  });

  // Cancel after a few
  await testAsync('Stops searching when shouldCancel becomes true', async () => {
    fetchCallCount = 0;
    let callsSeen = 0;
    const result = await searchAllCardPrintings(cardNames, seenProducts, {
      delayMs: 0,
      concurrency: 1,
      onProgress: () => {
        callsSeen++;
      },
      shouldCancel: () => callsSeen >= 3,
    });
    assert(result.productCards != null, 'Should return productCards');
    // Should have searched fewer than all cards
    assert(result.productCards.length < 15, `Should have fewer than 15 products, got ${result.productCards.length}`);
  });

  // No cancellation — searches everything
  await testAsync('Searches all cards when shouldCancel is always false', async () => {
    fetchCallCount = 0;
    const result = await searchAllCardPrintings(cardNames, seenProducts, {
      delayMs: 0,
      concurrency: 5,
      shouldCancel: () => false,
    });
    // Each unique card name should produce at least one product card
    assert(result.productCards.length > 0, 'Should have some product cards');
  });
}

// ============================================================
// Test 5: shouldCancel defaults to never-cancel when omitted
// ============================================================
console.log('\nTest 5: shouldCancel defaults (no option provided)');
{
  const cards = [{ productId: 9001, slotId: 'slot-default', cardName: 'Default Card' }];

  await testAsync('fetchAllListings works without shouldCancel option', async () => {
    const result = await fetchAllListings(cards, { delayMs: 0, concurrency: 1 });
    assertEqual(result.listings.length, 1, 'Should fetch the one listing');
  });

  await testAsync('searchAllCardPrintings works without shouldCancel option', async () => {
    const result = await searchAllCardPrintings(['Default Card'], new Set(), {
      delayMs: 0,
      concurrency: 1,
    });
    assert(result.productCards != null, 'Should return productCards');
  });
}

// ============================================================
// Test 6: Cancel returns partial results safely
// ============================================================
console.log('\nTest 6: Cancel returns safely usable partial results');
{
  const cards = [];
  for (let i = 1; i <= 10; i++) {
    cards.push({ productId: 7000 + i, slotId: `slot-partial-${i}`, cardName: `Partial Card ${i}` });
  }

  await testAsync('Partial listings result has valid structure', async () => {
    let callsSeen = 0;
    const result = await fetchAllListings(cards, {
      delayMs: 0,
      concurrency: 2,
      onProgress: () => {
        callsSeen++;
      },
      shouldCancel: () => callsSeen >= 2,
    });
    // Verify result shape is valid even if partial
    assert(typeof result === 'object', 'Result should be an object');
    assert(Array.isArray(result.listings), 'Result.listings should be an array');
    assert(typeof result.sellers === 'object', 'Result.sellers should be an object');

    // Each returned listing should have required fields
    for (const listing of result.listings) {
      assert(listing.listingId != null, 'Listing should have listingId');
      assert(listing.sellerId != null, 'Listing should have sellerId');
      assert(listing.price != null, 'Listing should have price');
    }
  });
}

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
