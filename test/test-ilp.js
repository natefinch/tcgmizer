/**
 * End-to-end test: builds an ILP from test data, solves it with HiGHS, and verifies the result.
 * Run with: node test/test-ilp.js
 */

import { buildLP } from '../src/shared/ilp-builder.js';
import { parseSolution } from '../src/shared/solution-parser.js';
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

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function assertClose(a, b, msg, tolerance = 0.01) {
  if (Math.abs(a - b) > tolerance) throw new Error(`${msg}: expected ${b}, got ${a}`);
}

// ============================================================
// Test 1: Basic 3-card, 3-seller scenario
// ============================================================
console.log('Test 1: Basic 3-card, 3-seller scenario');
{
  const cardSlots = [
    { slotId: 'c1', cardName: 'Lightning Bolt', productId: 1001 },
    { slotId: 'c2', cardName: 'Counterspell', productId: 1002 },
    { slotId: 'c3', cardName: 'Dark Ritual', productId: 1003 },
  ];

  const sellers = {
    s1: { sellerName: 'Store Alpha', shippingCost: 1.0, freeShippingThreshold: 5.0 },
    s2: { sellerName: 'Store Beta', shippingCost: 2.0, freeShippingThreshold: null },
    s3: { sellerName: 'Store Gamma', shippingCost: 0.5, freeShippingThreshold: 3.0 },
  };

  // All cards available from all sellers at different prices
  const listings = [
    // Lightning Bolt
    {
      listingId: 'l1',
      sellerId: 's1',
      slotId: 'c1',
      price: 1.5,
      skuId: 'sku1',
      condition: 'NM',
      setName: 'M10',
      language: 'EN',
      productConditionId: 'pc1',
    },
    {
      listingId: 'l2',
      sellerId: 's2',
      slotId: 'c1',
      price: 1.0,
      skuId: 'sku2',
      condition: 'NM',
      setName: 'M10',
      language: 'EN',
      productConditionId: 'pc2',
    },
    {
      listingId: 'l3',
      sellerId: 's3',
      slotId: 'c1',
      price: 1.25,
      skuId: 'sku3',
      condition: 'NM',
      setName: 'M10',
      language: 'EN',
      productConditionId: 'pc3',
    },
    // Counterspell
    {
      listingId: 'l4',
      sellerId: 's1',
      slotId: 'c2',
      price: 2.0,
      skuId: 'sku4',
      condition: 'NM',
      setName: 'ICE',
      language: 'EN',
      productConditionId: 'pc4',
    },
    {
      listingId: 'l5',
      sellerId: 's2',
      slotId: 'c2',
      price: 2.5,
      skuId: 'sku5',
      condition: 'NM',
      setName: 'ICE',
      language: 'EN',
      productConditionId: 'pc5',
    },
    {
      listingId: 'l6',
      sellerId: 's3',
      slotId: 'c2',
      price: 2.25,
      skuId: 'sku6',
      condition: 'NM',
      setName: 'ICE',
      language: 'EN',
      productConditionId: 'pc6',
    },
    // Dark Ritual
    {
      listingId: 'l7',
      sellerId: 's1',
      slotId: 'c3',
      price: 0.75,
      skuId: 'sku7',
      condition: 'NM',
      setName: 'ICE',
      language: 'EN',
      productConditionId: 'pc7',
    },
    {
      listingId: 'l8',
      sellerId: 's2',
      slotId: 'c3',
      price: 0.5,
      skuId: 'sku8',
      condition: 'NM',
      setName: 'ICE',
      language: 'EN',
      productConditionId: 'pc8',
    },
    {
      listingId: 'l9',
      sellerId: 's3',
      slotId: 'c3',
      price: 0.6,
      skuId: 'sku9',
      condition: 'NM',
      setName: 'ICE',
      language: 'EN',
      productConditionId: 'pc9',
    },
  ];

  const { lp, variableMap } = buildLP({ cardSlots, sellers, listings });

  test('LP string is non-empty', () => {
    assert(lp.length > 0, 'LP string should be non-empty');
  });

  test('LP contains Minimize objective', () => {
    assert(lp.includes('Minimize'), 'Should have Minimize keyword');
  });

  test('LP contains coverage constraints for all cards', () => {
    assert(lp.includes('cover_c1:'), 'Missing coverage for c1');
    assert(lp.includes('cover_c2:'), 'Missing coverage for c2');
    assert(lp.includes('cover_c3:'), 'Missing coverage for c3');
  });

  test('LP contains binary variable section', () => {
    assert(lp.includes('Binary'), 'Missing Binary section');
  });

  // Solve it
  const solution = highs.solve(lp);

  test('Solver returns Optimal status', () => {
    assert(solution.Status === 'Optimal', `Expected Optimal, got ${solution.Status}`);
  });

  const result = parseSolution(solution, variableMap, cardSlots, sellers, 10.0);

  test('Result is successful', () => {
    assert(result.success === true, 'Result should be successful');
  });

  test('All 3 items assigned', () => {
    assert(result.itemCount === 3, `Expected 3 items, got ${result.itemCount}`);
  });

  test('Total cost is reasonable', () => {
    // The cheapest possible item cost is 1.00 + 2.00 + 0.50 = 3.50 (all from different sellers)
    // But that means 3 sellers × shipping = expensive
    // Optimal should consolidate to minimize total including shipping
    assert(result.totalCost > 0, 'Total cost should be positive');
    assert(result.totalCost < 10.0, 'Total cost should be less than naive $10');
    console.log(`    Optimal total: $${result.totalCost} (${result.sellerCount} sellers)`);
    for (const s of result.sellers) {
      console.log(
        `      ${s.sellerName}: $${s.subtotal} items + $${s.shippingCost} ship = $${s.sellerTotal} (${s.items.length} items, free=${s.freeShipping})`,
      );
    }
  });
}

// ============================================================
// Test 2: Shipping threshold exploitation
// ============================================================
console.log('\nTest 2: Shipping threshold exploitation');
{
  // Setup: 2 cards. Seller A has both cards cheap but $5 shipping (free at $10).
  // Seller B has one card slightly cheaper but $3 shipping (no free threshold).
  // Optimal: buy both from A ($4+$5 = $9 items + $5 ship = $14 vs $4 items + $8 ship = $12)
  // Actually let's make it clearer...

  const cardSlots = [
    { slotId: 'c1', cardName: 'Card A', productId: 2001 },
    { slotId: 'c2', cardName: 'Card B', productId: 2002 },
  ];

  const sellers = {
    s1: { sellerName: 'BigStore', shippingCost: 4.99, freeShippingThreshold: 5.0 },
    s2: { sellerName: 'SmallStore', shippingCost: 1.29, freeShippingThreshold: null },
  };

  const listings = [
    // Card A: BigStore $3.00, SmallStore $2.50
    {
      listingId: 'l1',
      sellerId: 's1',
      slotId: 'c1',
      price: 3.0,
      skuId: 'sku1',
      condition: 'NM',
      setName: 'SET',
      language: 'EN',
      productConditionId: 'pc1',
    },
    {
      listingId: 'l2',
      sellerId: 's2',
      slotId: 'c1',
      price: 2.5,
      skuId: 'sku2',
      condition: 'NM',
      setName: 'SET',
      language: 'EN',
      productConditionId: 'pc2',
    },
    // Card B: BigStore $2.50, SmallStore $2.25
    {
      listingId: 'l3',
      sellerId: 's1',
      slotId: 'c2',
      price: 2.5,
      skuId: 'sku3',
      condition: 'NM',
      setName: 'SET',
      language: 'EN',
      productConditionId: 'pc3',
    },
    {
      listingId: 'l4',
      sellerId: 's2',
      slotId: 'c2',
      price: 2.25,
      skuId: 'sku4',
      condition: 'NM',
      setName: 'SET',
      language: 'EN',
      productConditionId: 'pc4',
    },
  ];

  // Naive cheapest per card: Card A from SmallStore ($2.50), Card B from SmallStore ($2.25)
  //   Total: $4.75 items + $1.29 shipping = $6.04
  //   But both at SmallStore only.
  //
  // All at BigStore: $3.00 + $2.50 = $5.50 items, subtotal $5.50 >= $5.00 threshold → FREE shipping
  //   Total: $5.50
  //
  // So optimal should be: both at BigStore = $5.50

  const { lp, variableMap } = buildLP({ cardSlots, sellers, listings });
  const solution = highs.solve(lp);
  const result = parseSolution(solution, variableMap, cardSlots, sellers, 8.0);

  test('Solver exploits free shipping threshold', () => {
    // Both from BigStore = $5.50 (free shipping)
    // Both from SmallStore = $4.75 + $1.29 = $6.04
    // Split: more expensive
    assertClose(result.totalCost, 5.5, 'Should buy both from BigStore for free shipping');
    console.log(`    Optimal: $${result.totalCost} from ${result.sellerCount} seller(s)`);
    for (const s of result.sellers) {
      console.log(`      ${s.sellerName}: $${s.subtotal} + $${s.shippingCost} ship (free=${s.freeShipping})`);
    }
  });

  test('BigStore gets free shipping', () => {
    const bigStore = result.sellers.find((s) => s.sellerName === 'BigStore');
    assert(bigStore, 'BigStore should be used');
    assert(bigStore.freeShipping === true, 'BigStore should have free shipping');
  });
}

// ============================================================
// Test 3: Larger scale (20 cards, 10 sellers)
// ============================================================
console.log('\nTest 3: Scale test (20 cards, 10 sellers)');
{
  const NUM_CARDS = 20;
  const NUM_SELLERS = 10;

  // Generate random data
  const cardSlots = [];
  for (let i = 0; i < NUM_CARDS; i++) {
    cardSlots.push({ slotId: `c${i}`, cardName: `Card ${i}`, productId: 4000 + i });
  }

  const sellers = {};
  for (let j = 0; j < NUM_SELLERS; j++) {
    sellers[`s${j}`] = {
      sellerName: `Seller ${j}`,
      shippingCost: 0.78 + Math.random() * 4,
      freeShippingThreshold: Math.random() > 0.5 ? 5 + Math.random() * 10 : null,
    };
  }

  const listings = [];
  for (let i = 0; i < NUM_CARDS; i++) {
    // Each card available from 3-8 random sellers
    const numSellers = 3 + Math.floor(Math.random() * 6);
    const sellerIndices = Array.from({ length: NUM_SELLERS }, (_, k) => k)
      .sort(() => Math.random() - 0.5)
      .slice(0, numSellers);

    for (const j of sellerIndices) {
      listings.push({
        listingId: `l_${i}_${j}`,
        sellerId: `s${j}`,
        slotId: `c${i}`,
        price: 0.25 + Math.random() * 10,
        skuId: `sku_${i}_${j}`,
        condition: 'NM',
        setName: 'SET',
        language: 'EN',
        productConditionId: `pc_${i}_${j}`,
      });
    }
  }

  const startTime = performance.now();
  const { lp, variableMap } = buildLP({ cardSlots, sellers, listings });
  const solution = highs.solve(lp);
  const elapsed = performance.now() - startTime;

  const result = parseSolution(solution, variableMap, cardSlots, sellers, 999);

  test('Solves 20-card problem successfully', () => {
    assert(solution.Status === 'Optimal', `Status: ${solution.Status}`);
    assert(result.itemCount === NUM_CARDS, `Expected ${NUM_CARDS} items`);
    console.log(
      `    Solved in ${elapsed.toFixed(0)}ms: $${result.totalCost.toFixed(2)} from ${result.sellerCount} sellers`,
    );
  });

  test('Solves in under 1 second', () => {
    assert(elapsed < 1000, `Took ${elapsed.toFixed(0)}ms`);
  });
}

// ============================================================
// Test 4: Large scale (100 cards, many sellers)
// ============================================================
console.log('\nTest 4: Large scale test (100 cards, 50 sellers, ~25 listings each)');
{
  const NUM_CARDS = 100;
  const NUM_SELLERS = 50;

  const cardSlots = [];
  for (let i = 0; i < NUM_CARDS; i++) {
    cardSlots.push({ slotId: `c${i}`, cardName: `Card ${i}`, productId: 5000 + i });
  }

  const sellers = {};
  for (let j = 0; j < NUM_SELLERS; j++) {
    sellers[`s${j}`] = {
      sellerName: `Seller ${j}`,
      shippingCost: 0.78 + Math.random() * 5,
      freeShippingThreshold: Math.random() > 0.4 ? 5 + Math.random() * 20 : null,
    };
  }

  const listings = [];
  for (let i = 0; i < NUM_CARDS; i++) {
    const numSellers = 10 + Math.floor(Math.random() * 16); // 10-25 sellers per card
    const sellerIndices = Array.from({ length: NUM_SELLERS }, (_, k) => k)
      .sort(() => Math.random() - 0.5)
      .slice(0, numSellers);

    for (const j of sellerIndices) {
      listings.push({
        listingId: `l_${i}_${j}`,
        sellerId: `s${j}`,
        slotId: `c${i}`,
        price: 0.1 + Math.random() * 15,
        skuId: `sku_${i}_${j}`,
        condition: 'NM',
        setName: 'SET',
        language: 'EN',
        productConditionId: `pc_${i}_${j}`,
      });
    }
  }

  const startTime = performance.now();
  const { lp, variableMap } = buildLP({ cardSlots, sellers, listings });
  const buildTime = performance.now() - startTime;

  const solveStart = performance.now();
  const solution = highs.solve(lp);
  const solveTime = performance.now() - solveStart;

  const result = parseSolution(solution, variableMap, cardSlots, sellers, 9999);

  test('Solves 100-card problem successfully', () => {
    assert(solution.Status === 'Optimal', `Status: ${solution.Status}`);
    assert(result.itemCount === NUM_CARDS, `Expected ${NUM_CARDS} items, got ${result.itemCount}`);
    console.log(`    Build: ${buildTime.toFixed(0)}ms, Solve: ${solveTime.toFixed(0)}ms`);
    console.log(
      `    LP: ${lp.length} chars, ${Object.keys(variableMap.x).length} x-vars, ${Object.keys(variableMap.y).length} y-vars, ${Object.keys(variableMap.z).length} z-vars`,
    );
    console.log(
      `    Result: $${result.totalCost.toFixed(2)} from ${result.sellerCount} sellers, items: $${result.totalItemCost.toFixed(2)}, shipping: $${result.totalShipping.toFixed(2)}`,
    );
  });

  test('Solves in under 5 seconds', () => {
    assert(solveTime < 5000, `Solve took ${solveTime.toFixed(0)}ms`);
  });
}

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
