/**
 * End-to-end test using real TCGPlayer dump data.
 * Validates that the optimizer correctly uses TCGPlayer Direct and can
 * find solutions with reduced vendor counts.
 *
 * Run with: node test/test-dump-direct.js
 */

import { buildLP } from '../src/shared/ilp-builder.js';
import { parseSolution } from '../src/shared/solution-parser.js';
import { remapDirectListings } from '../src/shared/direct-remapper.js';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);

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

// Load dump data
const dump = JSON.parse(readFileSync('test/tcgmizer-dump-1774225952953.json', 'utf-8'));
const { cardSlots, allListings, sellers, currentCartTotal } = dump;

// ============================================================
// Test 1: Direct remapping captures all Direct listings
// ============================================================
console.log('Test 1: Direct remapping captures all Direct listings');
{
  const remapped = remapDirectListings(allListings, sellers);
  const directCount = allListings.filter(l => l.directListing).length;
  const remappedCount = remapped.listings.filter(l => l.sellerId === '__tcgplayer_direct__').length;

  test('All Direct listings are remapped', () => {
    assert(remappedCount === directCount, `Expected ${directCount} remapped, got ${remappedCount}`);
  });

  test('Synthetic Direct seller exists with correct shipping', () => {
    const direct = remapped.sellers['__tcgplayer_direct__'];
    assert(direct, 'Synthetic Direct seller missing');
    assert(direct.shippingCost === 3.99, `Expected $3.99 shipping, got ${direct.shippingCost}`);
    assert(direct.freeShippingThreshold === 50.00, `Expected $50 threshold, got ${direct.freeShippingThreshold}`);
  });

  test('Non-Direct listings unchanged', () => {
    const nonDirectBefore = allListings.filter(l => !l.directListing).length;
    const nonDirectAfter = remapped.listings.filter(l => l.sellerId !== '__tcgplayer_direct__').length;
    assert(nonDirectAfter === nonDirectBefore, `Non-direct count changed: ${nonDirectBefore} → ${nonDirectAfter}`);
  });
}

// ============================================================
// Test 2: ILP includes Direct listings after pruning
// ============================================================
console.log('\nTest 2: ILP preserves Direct listings through pruning');
{
  const remapped = remapDirectListings(allListings, sellers);
  const { lp, variableMap } = buildLP({
    cardSlots,
    sellers: remapped.sellers,
    listings: remapped.listings,
    options: { topK: 20 },
  });

  const directXVars = Object.entries(variableMap.x).filter(([k, v]) => v.listing.sellerId === '__tcgplayer_direct__');
  const directSlotsInModel = new Set(directXVars.map(([k, v]) => v.slotId));

  // Direct provides listings for 34 slots. After top-K pruning, the cheapest
  // Direct listing per slot should be preserved even if outside top-K.
  test('Direct listings survive top-K pruning', () => {
    assert(directXVars.length > 10, `Expected >10 Direct x-vars, got ${directXVars.length}`);
    console.log(`    Direct x-vars: ${directXVars.length} across ${directSlotsInModel.size} slots`);
  });

  test('Direct seller has a y-variable in the model', () => {
    const directYVar = Object.entries(variableMap.y).find(([k, v]) => v.sellerId === '__tcgplayer_direct__');
    assert(directYVar, 'No y-variable for Direct seller');
  });
}

// ============================================================
// Test 3: Baseline solve (no maxSellers) produces valid result
// ============================================================
console.log('\nTest 3: Baseline solve (no maxSellers)');
{
  const highsLoader = require('highs');
  const highs = await highsLoader();

  const remapped = remapDirectListings(allListings, sellers);
  const { lp, variableMap } = buildLP({
    cardSlots,
    sellers: remapped.sellers,
    listings: remapped.listings,
    options: { topK: 20 },
  });

  const solution = highs.solve(lp);
  const result = parseSolution(solution, variableMap, cardSlots, remapped.sellers, currentCartTotal);

  test('Solver finds optimal solution', () => {
    assert(result.success, `Expected success, got ${result.status}`);
  });

  test('All items assigned', () => {
    assert(result.itemCount === cardSlots.length, `Expected ${cardSlots.length} items, got ${result.itemCount}`);
  });

  test('Total cost is less than current cart', () => {
    assert(result.totalCost < currentCartTotal, `$${result.totalCost} >= $${currentCartTotal}`);
    console.log(`    Baseline: $${result.totalCost} (${result.sellerCount} sellers), savings: $${result.savings.toFixed(2)}`);
  });
}

// ============================================================
// Test 4: Pre-filter enables min-vendors solutions with Direct
// ============================================================
console.log('\nTest 4: Pre-filter enables min-vendors solutions with Direct');
{
  const remapped = remapDirectListings(allListings, sellers);

  // Try different topK values to find one that works with maxSellers=20
  let foundSolution = false;
  for (const topK of [15, 10, 8, 5]) {
    try {
      const { lp, variableMap } = buildLP({
        cardSlots,
        sellers: remapped.sellers,
        listings: remapped.listings,
        options: { topK, maxSellers: 20 },
      });

      const highs2 = await (require('highs'))();
      const solution = highs2.solve(lp);
      if (solution.Status === 'Optimal') {
        const result = parseSolution(solution, variableMap, cardSlots, remapped.sellers, currentCartTotal);
        const directSeller = result.sellers.find(s => s.isDirect);

        test(`Solution found at topK=${topK} with ≤20 vendors`, () => {
          assert(result.sellerCount <= 20, `Expected ≤20, got ${result.sellerCount}`);
        });

        test('Direct is used in min-vendors solution', () => {
          assert(directSeller, 'Direct not used');
          assert(directSeller.items.length > 0, 'Direct has no items');
          console.log(`    Direct: ${directSeller.items.length} items, $${directSeller.subtotal.toFixed(2)}`);
          console.log(`    Total: $${result.totalCost} from ${result.sellerCount} sellers`);
        });

        foundSolution = true;
        break;
      }
    } catch (e) {
      // WASM crash — try smaller topK
      continue;
    }
  }

  if (!foundSolution) {
    test('At least one topK value produces feasible min-vendors solution', () => {
      assert(false, 'No topK value produced a feasible solution with maxSellers=20');
    });
  }
}

// ============================================================
// Summary
// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
