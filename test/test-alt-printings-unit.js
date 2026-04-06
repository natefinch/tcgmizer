/**
 * Tests for the alternate printings feature.
 * Verifies that searchProductsByName and searchAllCardPrintings correctly
 * find alternative printings, and that the ILP solver can use them.
 *
 * Run with: node test/test-alt-printings-unit.js
 */

import { buildLP } from '../src/shared/ilp-builder.js';
import { parseSolution } from '../src/shared/solution-parser.js';
import { searchAllCardPrintings } from '../src/background/fetcher.js';
import { MAX_ALTERNATIVE_PRINTINGS, SEARCH_RESULTS_PER_PAGE } from '../src/shared/constants.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Load HiGHS
console.log('Loading HiGHS...');
const highsLoader = require('highs');
const highs = await highsLoader();
console.log('HiGHS loaded.\n');

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

async function asyncTest(name, fn) {
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

function assertClose(a, b, msg, tolerance = 0.01) {
  if (Math.abs(a - b) > tolerance) throw new Error(`${msg}: expected ${b}, got ${a}`);
}

// ============================================================
// Helper: mock globalThis.fetch for testing searchProductsByName
// ============================================================
function mockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = original;
  };
}

// Creates a mock search API response
function makeSearchResponse(products, totalResults) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      results: [
        {
          totalResults: totalResults ?? products.length,
          results: products,
        },
      ],
    }),
  };
}

function makeProduct(id, name, setName, lineId = 1, marketPrice = 5.0, totalListings = 100) {
  return {
    productId: id,
    productName: name,
    groupName: setName,
    setName: setName,
    marketPrice,
    lowestPrice: marketPrice * 0.5,
    totalListings,
    productLineId: lineId,
    productLineName: lineId === 1 ? 'Magic: The Gathering' : 'Other Game',
  };
}

// ============================================================
// Test 1: searchProductsByName returns correct results
// ============================================================
console.log('Test 1: searchProductsByName name filtering');
{
  // Dynamically import to get a fresh module
  const { searchProductsByName } = await import('../src/background/fetcher.js');

  const products = [
    makeProduct(1001, 'Dark Ritual', 'Fourth Edition'),
    makeProduct(1002, 'Dark Ritual', 'Ice Age'),
    makeProduct(1003, 'Dark Ritual (Extended Art)', 'Secret Lair'),
    makeProduct(9999, 'Dark Ritual of Necromanteion', 'Modern Horizons'), // should be filtered
    makeProduct(1004, 'Dark Ritual', 'Tempest'),
  ];

  const restore = mockFetch(async (url, opts) => {
    return makeSearchResponse(products);
  });

  try {
    const results = await searchProductsByName('Dark Ritual');

    test('Returns exact name matches', () => {
      assert(results.length === 4, `Expected 4 results, got ${results.length}`);
    });

    test('Includes base name matches', () => {
      const ids = results.map((r) => r.productId);
      assert(ids.includes(1001), 'Should include Fourth Edition');
      assert(ids.includes(1002), 'Should include Ice Age');
      assert(ids.includes(1004), 'Should include Tempest');
    });

    test('Includes treatment variant', () => {
      const ids = results.map((r) => r.productId);
      assert(ids.includes(1003), 'Should include Extended Art variant');
    });

    test('Excludes non-matching names', () => {
      const ids = results.map((r) => r.productId);
      assert(!ids.includes(9999), 'Should NOT include Dark Ritual of Necromanteion');
    });

    test('Returns correct fields', () => {
      const first = results[0];
      assert(first.productId === 1001, 'productId');
      assert(first.productName === 'Dark Ritual', 'productName');
      assert(first.setName === 'Fourth Edition', 'setName');
      assert(first.productLineId === 1, 'productLineId');
      assert(first.marketPrice === 5.0, 'marketPrice');
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 2: searchProductsByName excludes zero-listing products
// ============================================================
console.log('\nTest 2: searchProductsByName excludes zero-listing products');
{
  const { searchProductsByName } = await import('../src/background/fetcher.js');

  const products = [
    makeProduct(2001, 'Counterspell', 'Ice Age', 1, 3.0, 150),
    makeProduct(2002, 'Counterspell', 'Tempest', 1, 4.0, 0), // no listings
    makeProduct(2003, 'Counterspell', 'MM25', 1, 2.0, 80),
  ];

  const restore = mockFetch(async () => makeSearchResponse(products));
  try {
    const results = await searchProductsByName('Counterspell');

    test('Excludes products with 0 listings', () => {
      assert(results.length === 2, `Expected 2 results, got ${results.length}`);
      const ids = results.map((r) => r.productId);
      assert(!ids.includes(2002), 'Should exclude product with 0 listings');
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 3: searchProductsByName returns first page of results
// ============================================================
console.log('\nTest 3: searchProductsByName first page results');
{
  const { searchProductsByName } = await import('../src/background/fetcher.js');

  // Create more products than one page — function only fetches the first page
  const allProducts = [];
  for (let i = 0; i < 75; i++) {
    allProducts.push(makeProduct(3000 + i, 'Island', `Set ${i}`, 1, 1.0 + i * 0.1));
  }

  let requestCount = 0;
  const restore = mockFetch(async (url, opts) => {
    requestCount++;
    const body = JSON.parse(opts.body);
    const from = body.from || 0;
    const size = body.size || SEARCH_RESULTS_PER_PAGE;
    const page = allProducts.slice(from, from + size);
    return makeSearchResponse(page, allProducts.length);
  });

  try {
    const results = await searchProductsByName('Island');

    test('Returns first page of results', () => {
      assert(
        results.length === SEARCH_RESULTS_PER_PAGE,
        `Expected ${SEARCH_RESULTS_PER_PAGE} results, got ${results.length}`,
      );
    });

    test('Makes exactly one API request', () => {
      assert(requestCount === 1, `Expected 1 request, got ${requestCount}`);
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 4: searchProductsByName handles API errors gracefully
// ============================================================
console.log('\nTest 4: searchProductsByName error handling');
{
  const { searchProductsByName } = await import('../src/background/fetcher.js');

  const restore = mockFetch(async () => ({ ok: false, status: 400, text: async () => 'Bad Request' }));
  try {
    const results = await searchProductsByName('Dark Ritual');

    test('Returns empty array on API error', () => {
      assert(Array.isArray(results), 'Should return an array');
      assert(results.length === 0, `Expected 0 results, got ${results.length}`);
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 5: searchProductsByName sends correct request format
// ============================================================
console.log('\nTest 5: searchProductsByName request format');
{
  const { searchProductsByName } = await import('../src/background/fetcher.js');

  let capturedUrl = '';
  let capturedBody = null;

  const restore = mockFetch(async (url, opts) => {
    capturedUrl = url;
    capturedBody = JSON.parse(opts.body);
    return makeSearchResponse([]);
  });

  try {
    await searchProductsByName('Dark Ritual');

    test('URL contains encoded card name', () => {
      assert(capturedUrl.includes('q=Dark%20Ritual'), `URL should contain q=Dark%20Ritual, got: ${capturedUrl}`);
    });

    test('Uses revenue_dismax algorithm', () => {
      assert(
        capturedBody.algorithm === 'revenue_dismax',
        `algorithm should be "revenue_dismax", got "${capturedBody.algorithm}"`,
      );
    });

    test('Has no term filters by default', () => {
      const term = capturedBody?.filters?.term;
      assert(term, 'Should have term filters object');
      assert(Object.keys(term).length === 0, 'Should have empty term filters by default');
    });

    test('Has empty range filters', () => {
      const range = capturedBody?.filters?.range || {};
      assert(Object.keys(range).length === 0, 'Should have empty range filters');
    });

    test('Has listingSearch section', () => {
      assert(capturedBody.listingSearch, 'Should have listingSearch');
      assert(capturedBody.listingSearch.filters?.term?.sellerStatus === 'Live', 'Should filter to Live sellers');
    });

    test('Has fuzzy search enabled', () => {
      assert(capturedBody.settings?.useFuzzySearch === true, 'Should have useFuzzySearch: true');
    });

    test('Page size is within API limit', () => {
      assert(capturedBody.size <= 50, `Page size ${capturedBody.size} exceeds API limit of 50`);
    });

    // Test with productLineName parameter
    await searchProductsByName('Dark Ritual', 'magic');

    test('Includes productLineName filter when provided', () => {
      const term = capturedBody?.filters?.term;
      assert(term, 'Should have term filters');
      assert(Array.isArray(term.productLineName), 'Should have productLineName filter');
      assert(
        term.productLineName[0] === 'magic',
        `productLineName should be "magic", got "${term.productLineName[0]}"`,
      );
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 6: searchAllCardPrintings finds alternatives
// ============================================================
console.log('\nTest 6: searchAllCardPrintings finds alternatives');
{
  // Mock searchProductsByName via fetch mock
  const darkRitualProducts = [
    makeProduct(5508, 'Dark Ritual', 'Tempest'),
    makeProduct(1712, 'Dark Ritual', 'Fourth Edition', 1, 3.0),
    makeProduct(4641, 'Dark Ritual', 'Ice Age', 1, 4.0),
    makeProduct(1381, 'Dark Ritual', 'Revised Edition', 1, 2.5),
    makeProduct(2099, 'Dark Ritual', 'Fifth Edition', 1, 2.0),
    makeProduct(6495, 'Dark Ritual', 'Mercadian Masques', 1, 3.5),
    makeProduct(235245, 'Dark Ritual', 'Strixhaven Archives', 1, 10.0),
  ];

  const restore = mockFetch(async (url, opts) => {
    return makeSearchResponse(darkRitualProducts);
  });

  try {
    const seenProducts = new Set([5508]); // Cart has Tempest Dark Ritual
    const result = await searchAllCardPrintings(['Dark Ritual'], seenProducts);

    test('Finds alternative product cards', () => {
      assert(result.productCards.length > 0, 'Should find at least 1 alternative');
      assert(
        result.productCards.length <= MAX_ALTERNATIVE_PRINTINGS,
        `Should not exceed ${MAX_ALTERNATIVE_PRINTINGS} alternatives, got ${result.productCards.length}`,
      );
    });

    test('Does not include the original cart product', () => {
      const altIds = result.productCards.map((pc) => pc.productId);
      assert(!altIds.includes(5508), 'Should NOT include original Tempest product');
    });

    test('Includes cheaper alternatives', () => {
      const altIds = result.productCards.map((pc) => pc.productId);
      // Should include some of the cheap alternatives
      const hasAny = [1712, 4641, 1381, 2099, 6495].some((id) => altIds.includes(id));
      assert(hasAny, 'Should include at least one cheaper alternative');
    });

    test('cardNameToProductIds includes original and alternatives', () => {
      const productIds = result.cardNameToProductIds.get('Dark Ritual');
      assert(productIds, 'Should have entry for Dark Ritual');
      assert(productIds.has(5508), 'Should include original product');
      assert(productIds.size > 1, `Should have multiple products, got ${productIds.size}`);
    });

    test('Detects correct product line', () => {
      assert(result.allowedProductLines.has(1), 'Should detect Magic product line (id=1) from cart product');
    });

    test('productIdToSetName maps alternatives', () => {
      for (const pc of result.productCards) {
        assert(result.productIdToSetName.has(pc.productId), `Should have set name for product ${pc.productId}`);
      }
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 7: searchAllCardPrintings filters by product line
// ============================================================
console.log('\nTest 7: searchAllCardPrintings product line filtering');
{
  const products = [
    makeProduct(5508, 'Dark Ritual', 'Tempest', 1), // Magic (in cart)
    makeProduct(1712, 'Dark Ritual', 'Fourth Edition', 1), // Magic
    makeProduct(9001, 'Dark Ritual', 'YuGiOh Set', 2), // Different game
    makeProduct(9002, 'Dark Ritual', 'Pokemon Set', 3), // Different game
  ];

  const restore = mockFetch(async () => makeSearchResponse(products));

  try {
    const seenProducts = new Set([5508]);
    const result = await searchAllCardPrintings(['Dark Ritual'], seenProducts);

    test('Excludes products from other product lines', () => {
      const altIds = result.productCards.map((pc) => pc.productId);
      assert(!altIds.includes(9001), 'Should NOT include YuGiOh product');
      assert(!altIds.includes(9002), 'Should NOT include Pokemon product');
    });

    test('Includes products from same product line', () => {
      const altIds = result.productCards.map((pc) => pc.productId);
      assert(altIds.includes(1712), 'Should include Fourth Edition (same line)');
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 8: searchAllCardPrintings passes productLineName to search
// ============================================================
console.log('\nTest 8: searchAllCardPrintings passes productLineName');
{
  const products = [
    makeProduct(5508, 'Dark Ritual', 'Tempest'),
    makeProduct(1712, 'Dark Ritual', 'Fourth Edition', 1, 3.0),
  ];

  let capturedBodies = [];
  const restore = mockFetch(async (url, opts) => {
    capturedBodies.push(JSON.parse(opts.body));
    return makeSearchResponse(products);
  });

  try {
    const seenProducts = new Set([5508]);
    await searchAllCardPrintings(['Dark Ritual'], seenProducts, {
      productLineName: 'magic',
    });

    test('Passes productLineName filter in search requests', () => {
      assert(capturedBodies.length > 0, 'Should have made at least 1 request');
      const term = capturedBodies[0]?.filters?.term;
      assert(term, 'Should have term filters');
      assert(Array.isArray(term.productLineName), 'Should have productLineName filter');
      assert(term.productLineName[0] === 'magic', `Expected "magic", got "${term.productLineName[0]}"`);
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 9: searchAllCardPrintings respects MAX_ALTERNATIVE_PRINTINGS
// ============================================================
console.log('\nTest 9: searchAllCardPrintings max printings limit');
{
  const products = [makeProduct(5508, 'Dark Ritual', 'Tempest')];
  for (let i = 0; i < 20; i++) {
    products.push(makeProduct(8000 + i, 'Dark Ritual', `Set ${i}`));
  }

  const restore = mockFetch(async () => makeSearchResponse(products));

  try {
    const seenProducts = new Set([5508]);
    const result = await searchAllCardPrintings(['Dark Ritual'], seenProducts);

    test(`Caps at ${MAX_ALTERNATIVE_PRINTINGS} alternatives per card`, () => {
      assert(
        result.productCards.length === MAX_ALTERNATIVE_PRINTINGS,
        `Expected ${MAX_ALTERNATIVE_PRINTINGS}, got ${result.productCards.length}`,
      );
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 10: ILP solver picks cheaper alternative printing
// ============================================================
console.log('\nTest 10: ILP solver picks cheaper alternative printing');
{
  // Scenario: Cart has Dark Ritual from Tempest (expensive).
  // Alternative printing from Fourth Edition is much cheaper.
  // Solver should pick the cheaper alternative.

  const cardSlots = [{ slotId: 'c1', cardName: 'Dark Ritual', productId: 5508 }];

  const sellers = {
    s1: { sellerName: 'Store Alpha', shippingCost: 1.0, freeShippingThreshold: null },
    s2: { sellerName: 'Store Beta', shippingCost: 1.0, freeShippingThreshold: null },
  };

  // Tempest listing: $7.00
  // Fourth Edition listing: $1.50 (from same seller)
  const listings = [
    {
      listingId: 'tempest_l1',
      sellerId: 's1',
      slotId: 'c1',
      productId: 5508,
      productConditionId: 100,
      price: 7.0,
      skuId: 'sku_t1',
      condition: 'NM',
      setName: 'Tempest',
      language: 'EN',
    },
    {
      listingId: '4ed_l1',
      sellerId: 's1',
      slotId: 'c1',
      productId: 1712,
      productConditionId: 101,
      price: 1.5,
      skuId: 'sku_4e1',
      condition: 'NM',
      setName: 'Fourth Edition',
      language: 'EN',
    },
    {
      listingId: '4ed_l2',
      sellerId: 's2',
      slotId: 'c1',
      productId: 1712,
      productConditionId: 101,
      price: 1.75,
      skuId: 'sku_4e2',
      condition: 'NM',
      setName: 'Fourth Edition',
      language: 'EN',
    },
  ];

  const { lp, variableMap } = buildLP({ cardSlots, sellers, listings });
  const solution = highs.solve(lp);
  const result = parseSolution(solution, variableMap, cardSlots, sellers, 10.0);

  test('Solver picks cheaper alternative printing', () => {
    assert(result.success, 'Solution should be successful');
    // Cheapest: $1.50 + $1.00 shipping = $2.50
    assertClose(result.totalCost, 2.5, 'Should pick $1.50 Fourth Edition listing + $1.00 shipping');
  });

  test('Selected listing is from alternative printing', () => {
    const item = result.sellers[0].items[0];
    assert(item, 'Should have an item');
    assert(
      item.productId === 1712 || item.price === 1.5,
      `Should pick the Fourth Edition listing (got productId=${item.productId}, price=$${item.price})`,
    );
  });
}

// ============================================================
// Test 11: ILP with exactPrintings filter keeps only original
// ============================================================
console.log('\nTest 11: exactPrintings filter restricts to original product');
{
  // Same scenario as Test 9, but with exactPrintings filter applied
  // (simulates what the service worker does before building the ILP)

  const cardSlots = [{ slotId: 'c1', cardName: 'Dark Ritual', productId: 5508 }];

  const sellers = {
    s1: { sellerName: 'Store Alpha', shippingCost: 1.0, freeShippingThreshold: null },
  };

  // All listings for the slot, including alternatives
  const allListings = [
    {
      listingId: 'tempest_l1',
      sellerId: 's1',
      slotId: 'c1',
      productId: 5508,
      productConditionId: 100,
      price: 7.0,
      skuId: 'sku_t1',
      condition: 'NM',
      setName: 'Tempest',
      language: 'EN',
    },
    {
      listingId: '4ed_l1',
      sellerId: 's1',
      slotId: 'c1',
      productId: 1712,
      productConditionId: 101,
      price: 1.5,
      skuId: 'sku_4e1',
      condition: 'NM',
      setName: 'Fourth Edition',
      language: 'EN',
    },
  ];

  // Apply exactPrintings filter (same logic as service-worker.js)
  const slotOriginalProduct = new Map();
  for (const slot of cardSlots) {
    slotOriginalProduct.set(slot.slotId, slot.productId);
  }
  const filteredListings = allListings.filter((l) => l.productId === slotOriginalProduct.get(l.slotId));

  test('exactPrintings filter removes alternative listings', () => {
    assert(filteredListings.length === 1, `Expected 1 listing, got ${filteredListings.length}`);
    assert(filteredListings[0].productId === 5508, 'Should keep only Tempest listing');
  });

  const { lp, variableMap } = buildLP({ cardSlots, sellers, listings: filteredListings });
  const solution = highs.solve(lp);
  const result = parseSolution(solution, variableMap, cardSlots, sellers, 10.0);

  test('With exactPrintings, solver uses original (expensive) printing', () => {
    assert(result.success, 'Solution should be successful');
    assertClose(result.totalCost, 8.0, 'Should use $7.00 Tempest listing + $1.00 shipping');
  });
}

// ============================================================
// Test 12: Multiple cards with alternatives
// ============================================================
console.log('\nTest 12: Multiple cards with alternative printings');
{
  const cardSlots = [
    { slotId: 'c1', cardName: 'Dark Ritual', productId: 5508 },
    { slotId: 'c2', cardName: 'Lightning Bolt', productId: 9001 },
  ];

  const sellers = {
    s1: { sellerName: 'Big Store', shippingCost: 2.0, freeShippingThreshold: null },
    s2: { sellerName: 'Small Store', shippingCost: 1.5, freeShippingThreshold: null },
  };

  // Dark Ritual: expensive original, cheap alternative
  // Lightning Bolt: cheap original, no need for alternatives
  const listings = [
    // Dark Ritual — Tempest (original, expensive)
    {
      listingId: 'dr_t',
      sellerId: 's1',
      slotId: 'c1',
      productId: 5508,
      productConditionId: 200,
      price: 7.0,
      skuId: 'sku1',
      condition: 'NM',
      setName: 'Tempest',
      language: 'EN',
    },
    // Dark Ritual — 4th Edition (alternative, cheap, from same seller)
    {
      listingId: 'dr_4e',
      sellerId: 's1',
      slotId: 'c1',
      productId: 1712,
      productConditionId: 201,
      price: 1.5,
      skuId: 'sku2',
      condition: 'NM',
      setName: 'Fourth Edition',
      language: 'EN',
    },
    // Dark Ritual — alternative from different seller
    {
      listingId: 'dr_5e',
      sellerId: 's2',
      slotId: 'c1',
      productId: 2099,
      productConditionId: 202,
      price: 1.25,
      skuId: 'sku3',
      condition: 'NM',
      setName: 'Fifth Edition',
      language: 'EN',
    },
    // Lightning Bolt (original and only)
    {
      listingId: 'lb_1',
      sellerId: 's1',
      slotId: 'c2',
      productId: 9001,
      productConditionId: 300,
      price: 2.0,
      skuId: 'sku4',
      condition: 'NM',
      setName: 'M10',
      language: 'EN',
    },
    {
      listingId: 'lb_2',
      sellerId: 's2',
      slotId: 'c2',
      productId: 9001,
      productConditionId: 300,
      price: 2.25,
      skuId: 'sku5',
      condition: 'NM',
      setName: 'M10',
      language: 'EN',
    },
  ];

  const { lp, variableMap } = buildLP({ cardSlots, sellers, listings });
  const solution = highs.solve(lp);
  const result = parseSolution(solution, variableMap, cardSlots, sellers, 15.0);

  test('Solver optimizes across alternative printings and shipping', () => {
    assert(result.success, 'Solution should be successful');
    // Best: Dark Ritual 5th Ed $1.25 + Lightning Bolt $2.25 from s2 (Small Store)
    //   = $3.50 + $1.50 shipping = $5.00 (1 seller)
    // vs: Dark Ritual 4th Ed $1.50 + Lightning Bolt $2.00 from s1 (Big Store)
    //   = $3.50 + $2.00 shipping = $5.50 (1 seller)
    assertClose(result.totalCost, 5.0, 'Should consolidate at cheapest total');
    console.log(`    Optimal: $${result.totalCost}`);
  });

  test('Uses alternative printing for Dark Ritual', () => {
    // Find the Dark Ritual item in the result
    let drItem = null;
    for (const seller of result.sellers) {
      for (const item of seller.items) {
        if (item.cardName === 'Dark Ritual') {
          drItem = item;
        }
      }
    }
    assert(drItem, 'Dark Ritual should be in solution');
    assert(drItem.productId !== 5508, `Should use alternative printing (got productId ${drItem.productId})`);
  });
}

// ============================================================
// Test 13: searchAllCardPrintings handles multiple card names
// ============================================================
console.log('\nTest 13: searchAllCardPrintings with multiple cards');
{
  const searchResponses = {
    'Dark Ritual': [makeProduct(5508, 'Dark Ritual', 'Tempest'), makeProduct(1712, 'Dark Ritual', 'Fourth Edition')],
    'Lightning Bolt': [makeProduct(9001, 'Lightning Bolt', 'M10'), makeProduct(9002, 'Lightning Bolt', 'M11')],
  };

  const restore = mockFetch(async (url) => {
    // Extract card name from the URL query parameter
    const urlObj = new URL(url);
    const q = urlObj.searchParams.get('q') || '';
    const products = searchResponses[q] || [];
    return makeSearchResponse(products);
  });

  try {
    const seenProducts = new Set([5508, 9001]); // both in cart
    const result = await searchAllCardPrintings(['Dark Ritual', 'Lightning Bolt'], seenProducts);

    test('Finds alternatives for all card names', () => {
      assert(result.productCards.length === 2, `Expected 2 alternatives, got ${result.productCards.length}`);
    });

    test('Maps card names to product IDs correctly', () => {
      const drProducts = result.cardNameToProductIds.get('Dark Ritual');
      const lbProducts = result.cardNameToProductIds.get('Lightning Bolt');
      assert(drProducts && drProducts.has(5508), 'Dark Ritual should include cart product');
      assert(drProducts && drProducts.has(1712), 'Dark Ritual should include alternative');
      assert(lbProducts && lbProducts.has(9001), 'Lightning Bolt should include cart product');
      assert(lbProducts && lbProducts.has(9002), 'Lightning Bolt should include alternative');
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 14: searchAllCardPrintings handles empty search results
// ============================================================
console.log('\nTest 14: searchAllCardPrintings with empty search results');
{
  const restore = mockFetch(async () => makeSearchResponse([]));

  try {
    const seenProducts = new Set([5508]);
    const result = await searchAllCardPrintings(['Dark Ritual'], seenProducts);

    test('Returns empty productCards when search finds nothing', () => {
      assert(result.productCards.length === 0, `Expected 0 alternatives, got ${result.productCards.length}`);
    });

    test('cardNameToProductIds still has an entry (empty set)', () => {
      const drProducts = result.cardNameToProductIds.get('Dark Ritual');
      assert(drProducts, 'Should have entry for Dark Ritual');
      assert(drProducts.size === 0, `Expected 0 products, got ${drProducts.size}`);
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 15: searchAllCardPrintings handles API errors gracefully
// ============================================================
console.log('\nTest 15: searchAllCardPrintings API error handling');
{
  const restore = mockFetch(async () => ({ ok: false, status: 500, text: async () => 'Internal Server Error' }));

  try {
    const seenProducts = new Set([5508]);
    const result = await searchAllCardPrintings(['Dark Ritual'], seenProducts);

    test('Returns empty productCards on API error', () => {
      assert(result.productCards.length === 0, `Expected 0 alternatives, got ${result.productCards.length}`);
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 16: SEARCH_RESULTS_PER_PAGE constant is ≤ 50
// ============================================================
console.log('\nTest 16: Constants validation');
{
  test('SEARCH_RESULTS_PER_PAGE is within API limit', () => {
    assert(SEARCH_RESULTS_PER_PAGE <= 50, `SEARCH_RESULTS_PER_PAGE is ${SEARCH_RESULTS_PER_PAGE}, must be ≤ 50`);
  });

  test('MAX_ALTERNATIVE_PRINTINGS is defined', () => {
    assert(MAX_ALTERNATIVE_PRINTINGS > 0, 'Should be positive');
  });
}

// ============================================================
// Test 17: Live API test (verifies the fix works against real API)
// ============================================================
console.log('\nTest 17: Live API test for Dark Ritual');
{
  const { searchProductsByName } = await import('../src/background/fetcher.js');

  // Wait to avoid rate limiting from earlier tests
  await new Promise((r) => setTimeout(r, 2000));

  await asyncTest('searchProductsByName returns results for Dark Ritual', async () => {
    const results = await searchProductsByName('Dark Ritual');
    assert(results.length > 0, `Expected results, got ${results.length}`);
    console.log(`      Found ${results.length} printings`);
  });

  await new Promise((r) => setTimeout(r, 500));

  await asyncTest('Results include Tempest printing (5508)', async () => {
    const results = await searchProductsByName('Dark Ritual');
    const hasTempest = results.some((p) => p.productId === 5508);
    assert(hasTempest, 'Tempest Dark Ritual (5508) should be in results');
  });

  await new Promise((r) => setTimeout(r, 500));

  await asyncTest('Results include multiple printings from different sets', async () => {
    const results = await searchProductsByName('Dark Ritual');
    const uniqueSets = new Set(results.map((r) => r.setName));
    assert(uniqueSets.size >= 5, `Expected at least 5 different sets, got ${uniqueSets.size}`);
    console.log(`      Sets: ${[...uniqueSets].slice(0, 8).join(', ')}${uniqueSets.size > 8 ? '...' : ''}`);
  });
}

// ============================================================
// Test 18: Strixhaven Dark Ritual scenario (user-reported bug)
// ============================================================
console.log('\nTest 18: Strixhaven Dark Ritual scenario (user-reported bug)');
{
  // Reproduces the exact user-reported scenario:
  // Cart has Dark Ritual from Strixhaven Mystical Archives (product 235245, lowest ~$7)
  // The optimizer should find cheaper printings (e.g. Fourth Edition at ~$1.44)
  // Before the fix, searchProductsByName returned [] due to size:100 causing HTTP 400

  const { searchProductsByName } = await import('../src/background/fetcher.js');

  await new Promise((r) => setTimeout(r, 1000));

  await asyncTest('Finds Strixhaven Dark Ritual (235245) in search results', async () => {
    const results = await searchProductsByName('Dark Ritual');
    const strixhaven = results.find((p) => p.productId === 235245);
    assert(strixhaven, 'Strixhaven Mystical Archives Dark Ritual (235245) should be in results');
    console.log(`      Strixhaven: market=$${strixhaven.marketPrice}`);
  });

  await new Promise((r) => setTimeout(r, 500));

  await asyncTest('Finds cheaper alternatives when Strixhaven version is in cart', async () => {
    const results = await searchProductsByName('Dark Ritual');
    const strixhaven = results.find((p) => p.productId === 235245);
    const cheaperAlts = results.filter(
      (p) => p.productId !== 235245 && p.marketPrice < (strixhaven?.marketPrice || 999),
    );
    assert(cheaperAlts.length > 0, 'Should find at least one cheaper alternative');
    console.log(`      ${cheaperAlts.length} cheaper alternatives found`);
    console.log(`      Cheapest: ${cheaperAlts[0].setName} market=$${cheaperAlts[0].marketPrice}`);
  });

  // Also test with mock data simulating the end-to-end ILP flow
  const cardSlots = [{ slotId: 'c1', cardName: 'Dark Ritual', productId: 235245 }];

  const sellers = {
    s1: { sellerName: 'Store A', shippingCost: 1.0, freeShippingThreshold: null },
  };

  // Strixhaven listing at $7, Fourth Edition at $1.50
  const listings = [
    {
      listingId: 'strix_l1',
      sellerId: 's1',
      slotId: 'c1',
      productId: 235245,
      productConditionId: 400,
      price: 7.0,
      skuId: 'sku_s1',
      condition: 'NM',
      setName: 'Strixhaven Archives',
      language: 'EN',
    },
    {
      listingId: '4ed_l1',
      sellerId: 's1',
      slotId: 'c1',
      productId: 1712,
      productConditionId: 401,
      price: 1.5,
      skuId: 'sku_4e1',
      condition: 'NM',
      setName: 'Fourth Edition',
      language: 'EN',
    },
  ];

  const { lp, variableMap } = buildLP({ cardSlots, sellers, listings });
  const solution = highs.solve(lp);
  const result = parseSolution(solution, variableMap, cardSlots, sellers, 10.0);

  test('ILP picks Fourth Edition over Strixhaven ($1.50 vs $7.00)', () => {
    assert(result.success, 'Solution should be successful');
    assertClose(result.totalCost, 2.5, 'Should be $1.50 card + $1.00 shipping');
  });

  test('Savings are significant ($5.50+ vs current cart)', () => {
    assert(result.savings >= 5.0, `Expected at least $5 savings, got $${result.savings}`);
    console.log(`      Savings: $${result.savings} (from $${result.currentCartTotal} to $${result.totalCost})`);
  });
}

// ============================================================
// Test 19: searchAllCardPrintings returns all printings (exclusions applied at solve time)
// ============================================================
console.log('\nTest 19: All printings returned (exclusion filtering moved to solve time)');
{
  const products = [
    makeProduct(8001, 'Silent Clearing', 'Modern Horizons', 1, 10.0),
    makeProduct(8002, 'Silent Clearing (Borderless)', 'Modern Horizons', 1, 15.0),
    makeProduct(8003, 'Silent Clearing (Extended Art)', 'Modern Horizons', 1, 12.0),
    makeProduct(8004, 'Silent Clearing', 'Modern Horizons 2', 1, 8.0),
  ];

  const restore = mockFetch(async () => makeSearchResponse(products));

  try {
    // Cart has the base Silent Clearing; no fetch-time exclusion
    const seenProducts = new Set([8001]);
    const result = await searchAllCardPrintings(['Silent Clearing'], seenProducts);

    test('All alternate printings are included (no fetch-time filtering)', () => {
      const altIds = result.productCards.map((pc) => pc.productId);
      assert(altIds.includes(8002), 'Should include (Borderless) variant');
      assert(altIds.includes(8003), 'Should include (Extended Art) variant');
      assert(altIds.includes(8004), 'Should include MH2 printing');
    });

    test('productIdToProductName includes all for solve-time exclusion', () => {
      assert(
        result.productIdToProductName.get(8002) === 'Silent Clearing (Borderless)',
        'Should map (Borderless) for solve-time filtering',
      );
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 20: All printings returned regardless of name casing
// ============================================================
console.log('\nTest 20: All printings returned regardless of name casing');
{
  const products = [
    makeProduct(8101, 'Arid Mesa', 'Zendikar', 1, 20.0),
    makeProduct(8102, 'Arid Mesa (BORDERLESS)', 'Secret Lair', 1, 25.0),
    makeProduct(8103, 'Arid Mesa (borderless)', 'Modern Horizons 2', 1, 22.0),
    makeProduct(8104, 'Arid Mesa', 'Modern Masters', 1, 18.0),
  ];

  const restore = mockFetch(async () => makeSearchResponse(products));

  try {
    const seenProducts = new Set([8101]);
    const result = await searchAllCardPrintings(['Arid Mesa'], seenProducts);

    test('Includes all variants (exclusion deferred to solve time)', () => {
      const altIds = result.productCards.map((pc) => pc.productId);
      assert(altIds.includes(8102), 'Should include (BORDERLESS) variant');
      assert(altIds.includes(8103), 'Should include (borderless) variant');
      assert(altIds.includes(8104), 'Should include Modern Masters printing');
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 21: All printings returned with multiple would-be-excluded variants
// ============================================================
console.log('\nTest 21: All printings returned including previously excluded variants');
{
  const products = [
    makeProduct(8201, 'Scalding Tarn', 'Zendikar', 1, 25.0),
    makeProduct(8202, 'Scalding Tarn (Borderless)', 'Secret Lair', 1, 30.0),
    makeProduct(8203, 'Scalding Tarn (Display Commander)', 'MH2', 1, 35.0),
    makeProduct(8204, 'Scalding Tarn (Art Series)', 'MH2 Art', 1, 5.0),
    makeProduct(8205, 'Scalding Tarn (Extended Art)', 'MH2', 1, 28.0),
    makeProduct(8206, 'Scalding Tarn', 'Modern Masters', 1, 22.0),
  ];

  const restore = mockFetch(async () => makeSearchResponse(products));

  try {
    const seenProducts = new Set([8201]);
    const result = await searchAllCardPrintings(['Scalding Tarn'], seenProducts);

    test('All variants included for solve-time filtering', () => {
      const altIds = result.productCards.map((pc) => pc.productId);
      assert(altIds.includes(8202), 'Should include (Borderless)');
      assert(altIds.includes(8203), 'Should include (Display Commander)');
      assert(altIds.includes(8204), 'Should include (Art Series)');
      assert(altIds.includes(8205), 'Should include (Extended Art)');
      assert(altIds.includes(8206), 'Should include Modern Masters');
    });

    test('productIdToProductName maps all for solve-time exclusion', () => {
      assert(
        result.productIdToProductName.get(8203) === 'Scalding Tarn (Display Commander)',
        'Should map Display Commander',
      );
      assert(result.productIdToProductName.get(8204) === 'Scalding Tarn (Art Series)', 'Should map Art Series');
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 22: Card exclusion does not block original cart items from productCards
// ============================================================
console.log('\nTest 22: Card exclusion behavior with original cart items');
{
  // If the user has a (Borderless) version in their cart, it's already in seenProducts
  // so it won't be re-added to productCards regardless of exclusion settings.
  const products = [
    makeProduct(8301, 'Silent Clearing (Borderless)', 'MH', 1, 15.0),
    makeProduct(8302, 'Silent Clearing', 'MH', 1, 10.0),
    makeProduct(8303, 'Silent Clearing (Extended Art)', 'MH', 1, 12.0),
  ];

  const restore = mockFetch(async () => makeSearchResponse(products));

  try {
    // Cart already has the Borderless version
    const seenProducts = new Set([8301]);
    const result = await searchAllCardPrintings(['Silent Clearing (Borderless)'], seenProducts);

    test('Excluded original not re-added to productCards (already seen)', () => {
      const altIds = result.productCards.map((pc) => pc.productId);
      assert(!altIds.includes(8301), 'Original should not be in productCards');
    });

    test('Non-excluded alternatives are found', () => {
      const altIds = result.productCards.map((pc) => pc.productId);
      assert(altIds.includes(8302), 'Should include base printing');
      assert(altIds.includes(8303), 'Should include Extended Art');
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 23: Card exclusion with parenthesized names stripped for search
// ============================================================
console.log('\nTest 23: Parenthesized name stripped for search still applies exclusions');
{
  // When the cart has "Silent Clearing (Borderless)", the search strips
  // parens and queries "Silent Clearing".  The exclusion for "(Display Commander)"
  // should still exclude products with that in the name.
  const products = [
    makeProduct(8401, 'Silent Clearing', 'MH', 1, 10.0),
    makeProduct(8402, 'Silent Clearing (Borderless)', 'MH', 1, 15.0),
    makeProduct(8403, 'Silent Clearing (Display Commander)', 'MH', 1, 50.0),
    makeProduct(8404, 'Silent Clearing (Extended Art)', 'MH', 1, 12.0),
  ];

  const restore = mockFetch(async () => makeSearchResponse(products));

  try {
    const seenProducts = new Set([8402]); // Cart has the Borderless version
    const result = await searchAllCardPrintings(['Silent Clearing (Borderless)'], seenProducts);

    test('All printings returned including Display Commander (exclusion at solve time)', () => {
      const altIds = result.productCards.map((pc) => pc.productId);
      assert(altIds.includes(8401), 'Should include base printing');
      assert(altIds.includes(8403), 'Should include (Display Commander) for solve-time filtering');
      assert(altIds.includes(8404), 'Should include Extended Art');
    });
  } finally {
    restore();
  }
}

// ============================================================
// Test 24: productIdToProductName includes all products for solve-time filtering
// ============================================================
console.log('\nTest 24: productIdToProductName returned for solve-time filtering');
{
  const products = [
    makeProduct(8501, 'Dark Ritual', 'Tempest', 1, 5.0),
    makeProduct(8502, 'Dark Ritual (Display Commander)', 'CMR', 1, 50.0),
    makeProduct(8503, 'Dark Ritual (Art Series)', 'CMR Art', 1, 2.0),
    makeProduct(8504, 'Dark Ritual', 'Fourth Edition', 1, 3.0),
  ];

  const restore = mockFetch(async () => makeSearchResponse(products));

  try {
    // No exclusions at fetch time — all printings fetched
    const seenProducts = new Set([8501]);
    const result = await searchAllCardPrintings(['Dark Ritual'], seenProducts);

    test('productIdToProductName maps all found products', () => {
      assert(result.productIdToProductName, 'Should return productIdToProductName');
      assert(result.productIdToProductName.get(8501) === 'Dark Ritual', 'Should map original');
      assert(
        result.productIdToProductName.get(8502) === 'Dark Ritual (Display Commander)',
        'Should map Display Commander',
      );
      assert(result.productIdToProductName.get(8503) === 'Dark Ritual (Art Series)', 'Should map Art Series');
      assert(result.productIdToProductName.get(8504) === 'Dark Ritual', 'Should map Fourth Edition');
    });

    test('Solve-time filtering can use productIdToProductName to exclude', () => {
      // Simulate solve-time filtering: exclude products matching "(Display Commander)"
      const patterns = ['(display commander)', '(art series)'];
      const excluded = new Set();
      const originalProducts = new Set([8501]);
      for (const [pid, pName] of result.productIdToProductName) {
        if (originalProducts.has(pid)) continue;
        const lower = pName.toLowerCase();
        if (patterns.some((pat) => lower.includes(pat))) {
          excluded.add(pid);
        }
      }
      assert(excluded.has(8502), 'Should exclude Display Commander');
      assert(excluded.has(8503), 'Should exclude Art Series');
      assert(!excluded.has(8501), 'Should NOT exclude original cart product');
      assert(!excluded.has(8504), 'Should NOT exclude Fourth Edition');
    });
  } finally {
    restore();
  }
}

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
