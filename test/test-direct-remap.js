/**
 * Unit tests for remapDirectListings.
 * Run with: node test/test-direct-remap.js
 */

import { remapDirectListings } from '../src/shared/direct-remapper.js';

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

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// ============================================================
// Test 1: No Direct listings — returns inputs unchanged
// ============================================================
console.log('Test 1: No Direct listings');
{
  const sellers = {
    s1: { sellerName: 'Store A', shippingCost: 1.0, freeShippingThreshold: null },
    s2: { sellerName: 'Store B', shippingCost: 2.0, freeShippingThreshold: 10.0 },
  };

  const listings = [
    { listingId: 'l1', sellerId: 's1', price: 1.5, directListing: false },
    { listingId: 'l2', sellerId: 's2', price: 2.0, directListing: false },
    { listingId: 'l3', sellerId: 's1', price: 3.0 }, // no directListing field at all
  ];

  const result = remapDirectListings(listings, sellers);

  test('Returns same listings reference when no Direct listings', () => {
    assert(result.listings === listings, 'Expected same listings array reference');
  });

  test('Returns same sellers reference when no Direct listings', () => {
    assert(result.sellers === sellers, 'Expected same sellers object reference');
  });

  test('No synthetic Direct seller added', () => {
    assert(!result.sellers['__tcgplayer_direct__'], 'Should not have synthetic Direct seller');
  });
}

// ============================================================
// Test 2: Pure Direct sellers — all Direct listings remapped
// ============================================================
console.log('\nTest 2: Pure Direct sellers');
{
  const sellers = {
    s1: {
      sellerName: 'Store A',
      sellerKey: 's1',
      sellerNumericId: 101,
      shippingCost: 1.5,
      freeShippingThreshold: null,
    },
    s2: {
      sellerName: 'Store B',
      sellerKey: 's2',
      sellerNumericId: 102,
      shippingCost: 2.0,
      freeShippingThreshold: null,
    },
  };

  const listings = [
    {
      listingId: 'l1',
      sellerId: 's1',
      sellerKey: 's1',
      sellerNumericId: 101,
      sellerName: 'Store A',
      price: 1.5,
      directListing: true,
    },
    {
      listingId: 'l2',
      sellerId: 's2',
      sellerKey: 's2',
      sellerNumericId: 102,
      sellerName: 'Store B',
      price: 2.0,
      directListing: true,
    },
    {
      listingId: 'l3',
      sellerId: 's1',
      sellerKey: 's1',
      sellerNumericId: 101,
      sellerName: 'Store A',
      price: 3.0,
      directListing: true,
    },
  ];

  const result = remapDirectListings(listings, sellers);

  test('All listings remapped to synthetic Direct seller', () => {
    for (const l of result.listings) {
      assert(
        l.sellerId === '__tcgplayer_direct__',
        `Listing ${l.listingId} sellerId should be __tcgplayer_direct__, got ${l.sellerId}`,
      );
    }
  });

  test('Original seller info preserved on remapped listings', () => {
    const l1 = result.listings.find((l) => l.listingId === 'l1');
    assert(l1.originalSellerId === 's1', `Expected originalSellerId=s1, got ${l1.originalSellerId}`);
    assert(l1.originalSellerKey === 's1', `Expected originalSellerKey=s1, got ${l1.originalSellerKey}`);
    assert(
      l1.originalSellerNumericId === 101,
      `Expected originalSellerNumericId=101, got ${l1.originalSellerNumericId}`,
    );
    assert(l1.originalSellerName === 'Store A', `Expected originalSellerName=Store A, got ${l1.originalSellerName}`);

    const l2 = result.listings.find((l) => l.listingId === 'l2');
    assert(l2.originalSellerId === 's2', `Expected originalSellerId=s2, got ${l2.originalSellerId}`);
  });

  test('Synthetic Direct seller added to sellers map', () => {
    const direct = result.sellers['__tcgplayer_direct__'];
    assert(direct, 'Missing synthetic Direct seller');
    assert(direct.sellerName === 'TCGplayer Direct', `Expected sellerName=TCGplayer Direct, got ${direct.sellerName}`);
    assert(direct.shippingCost === 3.99, `Expected shippingCost=3.99, got ${direct.shippingCost}`);
    assert(
      direct.freeShippingThreshold === 50.0,
      `Expected freeShippingThreshold=50, got ${direct.freeShippingThreshold}`,
    );
  });

  test('Original sellers preserved in augmented map', () => {
    assert(result.sellers.s1, 'Original seller s1 should still exist');
    assert(result.sellers.s2, 'Original seller s2 should still exist');
    assert(result.sellers.s1.sellerName === 'Store A', 'Seller s1 data should be unchanged');
  });

  test('Other listing properties preserved', () => {
    const l1 = result.listings.find((l) => l.listingId === 'l1');
    assert(l1.price === 1.5, `Expected price=1.50, got ${l1.price}`);
    assert(l1.directListing === true, `Expected directListing=true`);
  });
}

// ============================================================
// Test 3: Mixed seller — Direct items remapped, non-Direct stays
// ============================================================
console.log('\nTest 3: Mixed seller (Direct + non-Direct)');
{
  const sellers = {
    s1: {
      sellerName: 'Mixed Store',
      sellerKey: 's1',
      sellerNumericId: 201,
      shippingCost: 1.0,
      freeShippingThreshold: 5.0,
    },
  };

  const listings = [
    {
      listingId: 'l1',
      sellerId: 's1',
      sellerKey: 's1',
      sellerNumericId: 201,
      sellerName: 'Mixed Store',
      price: 2.0,
      directListing: true,
    },
    {
      listingId: 'l2',
      sellerId: 's1',
      sellerKey: 's1',
      sellerNumericId: 201,
      sellerName: 'Mixed Store',
      price: 3.0,
      directListing: false,
    },
    {
      listingId: 'l3',
      sellerId: 's1',
      sellerKey: 's1',
      sellerNumericId: 201,
      sellerName: 'Mixed Store',
      price: 1.0,
      directListing: true,
    },
  ];

  const result = remapDirectListings(listings, sellers);

  test('Direct listings remapped to synthetic Direct seller', () => {
    const l1 = result.listings.find((l) => l.listingId === 'l1');
    const l3 = result.listings.find((l) => l.listingId === 'l3');
    assert(l1.sellerId === '__tcgplayer_direct__', `l1 should be remapped, got ${l1.sellerId}`);
    assert(l3.sellerId === '__tcgplayer_direct__', `l3 should be remapped, got ${l3.sellerId}`);
  });

  test('Non-Direct listings stay with original seller', () => {
    const l2 = result.listings.find((l) => l.listingId === 'l2');
    assert(l2.sellerId === 's1', `l2 should keep sellerId=s1, got ${l2.sellerId}`);
    assert(!l2.originalSellerId, 'l2 should not have originalSellerId');
  });

  test('Original seller info preserved on remapped listings', () => {
    const l1 = result.listings.find((l) => l.listingId === 'l1');
    assert(l1.originalSellerId === 's1', `Expected originalSellerId=s1, got ${l1.originalSellerId}`);
    assert(l1.originalSellerName === 'Mixed Store', `Expected originalSellerName=Mixed Store`);
  });

  test('Synthetic Direct seller created', () => {
    assert(result.sellers['__tcgplayer_direct__'], 'Should have synthetic Direct seller');
    assert(result.sellers['__tcgplayer_direct__'].shippingCost === 3.99, 'Direct shipping should be $3.99');
  });
}

// ============================================================
// Test 4: Mix of pure-Direct and mixed sellers
// ============================================================
console.log('\nTest 4: Pure-Direct seller + mixed seller coexisting');
{
  const sellers = {
    sA: {
      sellerName: 'Pure Direct Store',
      sellerKey: 'sA',
      sellerNumericId: 301,
      shippingCost: 1.5,
      freeShippingThreshold: null,
    },
    sB: {
      sellerName: 'Mixed Store',
      sellerKey: 'sB',
      sellerNumericId: 302,
      shippingCost: 2.0,
      freeShippingThreshold: 8.0,
    },
    sC: {
      sellerName: 'Regular Store',
      sellerKey: 'sC',
      sellerNumericId: 303,
      shippingCost: 1.0,
      freeShippingThreshold: null,
    },
  };

  const listings = [
    // sA: only Direct listings → should be remapped
    {
      listingId: 'l1',
      sellerId: 'sA',
      sellerKey: 'sA',
      sellerNumericId: 301,
      sellerName: 'Pure Direct Store',
      price: 1.0,
      directListing: true,
    },
    {
      listingId: 'l2',
      sellerId: 'sA',
      sellerKey: 'sA',
      sellerNumericId: 301,
      sellerName: 'Pure Direct Store',
      price: 2.0,
      directListing: true,
    },
    // sB: mixed → Direct items ALSO remapped (Direct always ships from TCGPlayer warehouse)
    {
      listingId: 'l3',
      sellerId: 'sB',
      sellerKey: 'sB',
      sellerNumericId: 302,
      sellerName: 'Mixed Store',
      price: 3.0,
      directListing: true,
    },
    {
      listingId: 'l4',
      sellerId: 'sB',
      sellerKey: 'sB',
      sellerNumericId: 302,
      sellerName: 'Mixed Store',
      price: 4.0,
      directListing: false,
    },
    // sC: only non-Direct → untouched
    {
      listingId: 'l5',
      sellerId: 'sC',
      sellerKey: 'sC',
      sellerNumericId: 303,
      sellerName: 'Regular Store',
      price: 5.0,
      directListing: false,
    },
  ];

  const result = remapDirectListings(listings, sellers);

  test('Pure-Direct seller listings remapped to synthetic seller', () => {
    const l1 = result.listings.find((l) => l.listingId === 'l1');
    const l2 = result.listings.find((l) => l.listingId === 'l2');
    assert(l1.sellerId === '__tcgplayer_direct__', `l1 should be remapped, got ${l1.sellerId}`);
    assert(l2.sellerId === '__tcgplayer_direct__', `l2 should be remapped, got ${l2.sellerId}`);
  });

  test('Mixed seller Direct listings ALSO remapped', () => {
    const l3 = result.listings.find((l) => l.listingId === 'l3');
    assert(l3.sellerId === '__tcgplayer_direct__', `l3 should be remapped, got ${l3.sellerId}`);
    assert(l3.originalSellerId === 'sB', `l3 originalSellerId should be sB, got ${l3.originalSellerId}`);
  });

  test('Mixed seller non-Direct listings untouched', () => {
    const l4 = result.listings.find((l) => l.listingId === 'l4');
    assert(l4.sellerId === 'sB', `l4 should keep sellerId=sB, got ${l4.sellerId}`);
  });

  test('Regular (non-Direct) seller listings untouched', () => {
    const l5 = result.listings.find((l) => l.listingId === 'l5');
    assert(l5.sellerId === 'sC', `l5 should keep sellerId=sC, got ${l5.sellerId}`);
  });

  test('Synthetic Direct seller created with correct shipping', () => {
    const direct = result.sellers['__tcgplayer_direct__'];
    assert(direct, 'Synthetic Direct seller should exist');
    assert(direct.shippingCost === 3.99, `Expected 3.99, got ${direct.shippingCost}`);
    assert(direct.freeShippingThreshold === 50.0, `Expected 50.00, got ${direct.freeShippingThreshold}`);
  });

  test('Total listing count unchanged', () => {
    assert(result.listings.length === 5, `Expected 5 listings, got ${result.listings.length}`);
  });
}

// ============================================================
// Test 5: Multiple pure-Direct sellers all merge into one
// ============================================================
console.log('\nTest 5: Multiple pure-Direct sellers merge');
{
  const sellers = {
    s1: {
      sellerName: 'Direct Seller 1',
      sellerKey: 's1',
      sellerNumericId: 401,
      shippingCost: 1.0,
      freeShippingThreshold: null,
    },
    s2: {
      sellerName: 'Direct Seller 2',
      sellerKey: 's2',
      sellerNumericId: 402,
      shippingCost: 2.0,
      freeShippingThreshold: null,
    },
    s3: {
      sellerName: 'Direct Seller 3',
      sellerKey: 's3',
      sellerNumericId: 403,
      shippingCost: 1.5,
      freeShippingThreshold: null,
    },
  };

  const listings = [
    {
      listingId: 'l1',
      sellerId: 's1',
      sellerKey: 's1',
      sellerNumericId: 401,
      sellerName: 'Direct Seller 1',
      price: 1.0,
      directListing: true,
    },
    {
      listingId: 'l2',
      sellerId: 's2',
      sellerKey: 's2',
      sellerNumericId: 402,
      sellerName: 'Direct Seller 2',
      price: 2.0,
      directListing: true,
    },
    {
      listingId: 'l3',
      sellerId: 's3',
      sellerKey: 's3',
      sellerNumericId: 403,
      sellerName: 'Direct Seller 3',
      price: 3.0,
      directListing: true,
    },
  ];

  const result = remapDirectListings(listings, sellers);

  test('All listings have the same synthetic sellerId', () => {
    const sellerIds = new Set(result.listings.map((l) => l.sellerId));
    assert(sellerIds.size === 1, `Expected 1 unique sellerId, got ${sellerIds.size}: ${[...sellerIds].join(', ')}`);
    assert(sellerIds.has('__tcgplayer_direct__'), 'All should map to __tcgplayer_direct__');
  });

  test('Each listing preserves its own original seller info', () => {
    const l1 = result.listings.find((l) => l.listingId === 'l1');
    const l2 = result.listings.find((l) => l.listingId === 'l2');
    const l3 = result.listings.find((l) => l.listingId === 'l3');
    assert(l1.originalSellerId === 's1', `l1 originalSellerId should be s1`);
    assert(l2.originalSellerId === 's2', `l2 originalSellerId should be s2`);
    assert(l3.originalSellerId === 's3', `l3 originalSellerId should be s3`);
    assert(l1.originalSellerName === 'Direct Seller 1', `l1 should preserve seller name`);
    assert(l2.originalSellerName === 'Direct Seller 2', `l2 should preserve seller name`);
    assert(l3.originalSellerName === 'Direct Seller 3', `l3 should preserve seller name`);
  });

  test('Only one synthetic seller entry in sellers map', () => {
    const directSellers = Object.keys(result.sellers).filter((k) => k === '__tcgplayer_direct__');
    assert(directSellers.length === 1, `Expected exactly 1 synthetic seller entry`);
  });
}

// ============================================================
// Test 6: Multiple mixed sellers — Direct listings remapped
// ============================================================
console.log('\nTest 6: Multiple mixed sellers');
{
  const sellers = {
    s1: { sellerName: 'Mixed A', shippingCost: 1.0, freeShippingThreshold: 5.0 },
    s2: { sellerName: 'Mixed B', shippingCost: 1.5, freeShippingThreshold: 10.0 },
  };

  const listings = [
    {
      listingId: 'l1',
      sellerId: 's1',
      sellerKey: 's1',
      sellerNumericId: 601,
      sellerName: 'Mixed A',
      price: 1.0,
      directListing: true,
    },
    { listingId: 'l2', sellerId: 's1', price: 2.0, directListing: false },
    {
      listingId: 'l3',
      sellerId: 's2',
      sellerKey: 's2',
      sellerNumericId: 602,
      sellerName: 'Mixed B',
      price: 3.0,
      directListing: true,
    },
    { listingId: 'l4', sellerId: 's2', price: 4.0, directListing: false },
  ];

  const result = remapDirectListings(listings, sellers);

  test('Direct listings from mixed sellers ARE remapped', () => {
    const l1 = result.listings.find((l) => l.listingId === 'l1');
    const l3 = result.listings.find((l) => l.listingId === 'l3');
    assert(l1.sellerId === '__tcgplayer_direct__', `l1 should be remapped, got ${l1.sellerId}`);
    assert(l3.sellerId === '__tcgplayer_direct__', `l3 should be remapped, got ${l3.sellerId}`);
  });

  test('Non-Direct listings from mixed sellers stay with original seller', () => {
    const l2 = result.listings.find((l) => l.listingId === 'l2');
    const l4 = result.listings.find((l) => l.listingId === 'l4');
    assert(l2.sellerId === 's1', `l2 should keep sellerId=s1, got ${l2.sellerId}`);
    assert(l4.sellerId === 's2', `l4 should keep sellerId=s2, got ${l4.sellerId}`);
  });

  test('Synthetic Direct seller created', () => {
    assert(result.sellers['__tcgplayer_direct__'], 'Should have synthetic Direct seller');
  });
}

// ============================================================
// Test 7: Empty listings array
// ============================================================
console.log('\nTest 7: Empty listings');
{
  const sellers = { s1: { sellerName: 'Store', shippingCost: 1.0, freeShippingThreshold: null } };
  const listings = [];

  const result = remapDirectListings(listings, sellers);

  test('Returns same references for empty listings', () => {
    assert(result.listings === listings, 'Same listings reference');
    assert(result.sellers === sellers, 'Same sellers reference');
  });
}

// ============================================================
// Test 8: sellerKey fallback — uses sellerId when sellerKey absent
// ============================================================
console.log('\nTest 8: sellerKey fallback');
{
  const sellers = {
    s1: { sellerName: 'No-Key Store', shippingCost: 1.0, freeShippingThreshold: null },
  };

  const listings = [
    {
      listingId: 'l1',
      sellerId: 's1',
      sellerNumericId: 501,
      sellerName: 'No-Key Store',
      price: 1.0,
      directListing: true,
    },
    // no sellerKey field
  ];

  const result = remapDirectListings(listings, sellers);

  test('originalSellerKey falls back to sellerId when sellerKey is absent', () => {
    const l = result.listings[0];
    assert(l.originalSellerKey === 's1', `Expected originalSellerKey=s1, got ${l.originalSellerKey}`);
  });
}

// ============================================================
// Test 9: ILP end-to-end — mixed seller Direct items go to synthetic Direct
// ============================================================
console.log('\nTest 9: ILP end-to-end — mixed seller Direct items go to Direct seller');
{
  // This test validates the full pipeline: remapDirectListings → buildLP → solve → parseSolution
  // A mixed seller's Direct items are remapped to the synthetic Direct seller.
  // The non-Direct items stay with the original seller.
  //
  // Setup:
  //   Mixed seller has $2 shipping cost, $5 free shipping threshold
  //   Card A: $3 Direct from mixed seller → remapped to Direct ($3.99 shipping, $50 threshold)
  //   Card B: $3 non-Direct from mixed seller → stays with seller
  //   Also add a cheaper non-Direct alternative for Card A from a regular store.
  //
  // The solver should pick: Card A from regular store ($2.50 + share of shipping),
  // Card B from mixed seller ($3 + $2 shipping). Direct is too expensive for just 1 item.

  // Import buildLP and parseSolution
  const { buildLP } = await import('../src/shared/ilp-builder.js');
  const { parseSolution } = await import('../src/shared/solution-parser.js');
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const highsLoader = require('highs');
  const highs = await highsLoader();

  const cardSlots = [
    { slotId: 'c1', cardName: 'Card A', productId: 9001 },
    { slotId: 'c2', cardName: 'Card B', productId: 9002 },
  ];

  const sellers = {
    mixed: {
      sellerName: 'Mixed Store',
      sellerKey: 'mixed',
      sellerNumericId: 901,
      shippingCost: 2.0,
      freeShippingThreshold: 5.0,
    },
    regular: {
      sellerName: 'Regular Store',
      sellerKey: 'regular',
      sellerNumericId: 902,
      shippingCost: 1.0,
      freeShippingThreshold: null,
    },
  };

  const listings = [
    // Card A: Direct listing from mixed seller (will be remapped to Direct)
    {
      listingId: 'l1',
      sellerId: 'mixed',
      sellerKey: 'mixed',
      sellerNumericId: 901,
      sellerName: 'Mixed Store',
      slotId: 'c1',
      price: 3.0,
      skuId: 'sku1',
      condition: 'NM',
      setName: 'SET',
      language: 'EN',
      directListing: true,
      productId: 9001,
      productConditionId: 90010,
    },
    // Card A: non-Direct listing from regular store
    {
      listingId: 'l1b',
      sellerId: 'regular',
      sellerKey: 'regular',
      sellerNumericId: 902,
      sellerName: 'Regular Store',
      slotId: 'c1',
      price: 2.5,
      skuId: 'sku1b',
      condition: 'NM',
      setName: 'SET',
      language: 'EN',
      directListing: false,
      productId: 9001,
      productConditionId: 90010,
    },
    // Card B: non-Direct listing from mixed seller
    {
      listingId: 'l2',
      sellerId: 'mixed',
      sellerKey: 'mixed',
      sellerNumericId: 901,
      sellerName: 'Mixed Store',
      slotId: 'c2',
      price: 3.0,
      skuId: 'sku2',
      condition: 'NM',
      setName: 'SET',
      language: 'EN',
      directListing: false,
      productId: 9002,
      productConditionId: 90020,
    },
  ];

  // Direct listing from mixed seller should be remapped to __tcgplayer_direct__
  const remapped = remapDirectListings(listings, sellers);

  test('Mixed seller Direct listing remapped to synthetic Direct seller', () => {
    const l1 = remapped.listings.find((l) => l.listingId === 'l1');
    assert(l1.sellerId === '__tcgplayer_direct__', `l1 should be remapped, got ${l1.sellerId}`);
    assert(l1.originalSellerId === 'mixed', `l1 originalSellerId should be mixed`);
  });

  test('Non-Direct listing stays with original seller', () => {
    const l2 = remapped.listings.find((l) => l.listingId === 'l2');
    assert(l2.sellerId === 'mixed', `l2 should keep sellerId=mixed, got ${l2.sellerId}`);
  });

  const { lp, variableMap } = buildLP({ cardSlots, sellers: remapped.sellers, listings: remapped.listings });
  const solution = highs.solve(lp);
  const result = parseSolution(solution, variableMap, cardSlots, remapped.sellers, 20.0);

  test('Solution is optimal', () => {
    assert(result.success, 'Solution should be successful');
    console.log(`    Total: $${result.totalCost}, sellers: ${result.sellerCount}`);
    for (const s of result.sellers) {
      console.log(
        `    ${s.sellerName}: $${s.subtotal.toFixed(2)} + $${s.shippingCost.toFixed(2)} = $${s.sellerTotal.toFixed(2)}${s.isDirect ? ' [DIRECT]' : ''}`,
      );
    }
  });
}

// ============================================================
// Test 10: ILP end-to-end — pure-Direct sellers merge correctly
// ============================================================
console.log('\nTest 10: ILP end-to-end — pure-Direct sellers merge into one');
{
  const { buildLP } = await import('../src/shared/ilp-builder.js');
  const { parseSolution } = await import('../src/shared/solution-parser.js');
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const highsLoader = require('highs');
  const highs = await highsLoader();

  const cardSlots = [
    { slotId: 'c1', cardName: 'Card X', productId: 8001 },
    { slotId: 'c2', cardName: 'Card Y', productId: 8002 },
  ];

  // Two sellers, each has only Direct listings
  const sellers = {
    dA: {
      sellerName: 'Direct A',
      sellerKey: 'dA',
      sellerNumericId: 801,
      shippingCost: 5.0,
      freeShippingThreshold: null,
    },
    dB: {
      sellerName: 'Direct B',
      sellerKey: 'dB',
      sellerNumericId: 802,
      shippingCost: 4.0,
      freeShippingThreshold: null,
    },
  };

  const listings = [
    {
      listingId: 'l1',
      sellerId: 'dA',
      sellerKey: 'dA',
      sellerNumericId: 801,
      sellerName: 'Direct A',
      slotId: 'c1',
      price: 2.0,
      skuId: 'sku1',
      condition: 'NM',
      setName: 'SET',
      language: 'EN',
      directListing: true,
      productId: 8001,
      productConditionId: 80010,
    },
    {
      listingId: 'l2',
      sellerId: 'dB',
      sellerKey: 'dB',
      sellerNumericId: 802,
      sellerName: 'Direct B',
      slotId: 'c2',
      price: 3.0,
      skuId: 'sku2',
      condition: 'NM',
      setName: 'SET',
      language: 'EN',
      directListing: true,
      productId: 8002,
      productConditionId: 80020,
    },
  ];

  const remapped = remapDirectListings(listings, sellers);

  const { lp, variableMap } = buildLP({ cardSlots, sellers: remapped.sellers, listings: remapped.listings });
  const solution = highs.solve(lp);
  const result = parseSolution(solution, variableMap, cardSlots, remapped.sellers, 20.0);

  test('Both items grouped under one Direct seller in result', () => {
    assert(result.success, 'Solution should be successful');
    // Both listings merged into synthetic Direct seller → 1 seller
    assert(result.sellerCount === 1, `Expected 1 seller, got ${result.sellerCount}`);
    const seller = result.sellers[0];
    assert(seller.isDirect === true, 'Seller should be marked isDirect');
    // $2 + $3 = $5 items + $3.99 shipping (under $50 threshold)
    assert(result.totalCost === 8.99, `Expected $8.99, got $${result.totalCost}`);
    console.log(`    Total: $${result.totalCost}, items: $${result.totalItemCost}, shipping: $${result.totalShipping}`);
  });

  test('Only one shipping charge for merged Direct seller', () => {
    assert(result.totalShipping === 3.99, `Expected $3.99 shipping, got $${result.totalShipping}`);
  });
}

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
