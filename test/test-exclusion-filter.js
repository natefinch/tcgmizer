/**
 * Unit tests for the card exclusion filter.
 * Tests that excluded cart originals are replaced by alternatives when possible,
 * and kept with warnings when no alternative exists.
 *
 * Run with: node test/test-exclusion-filter.js
 */

import { applyCardExclusions, annotateExclusionWarnings } from '../src/shared/exclusion-filter.js';
import { readFileSync } from 'fs';

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
// Test 1: Excluded original replaced when non-excluded alternative exists
// ============================================================
console.log('\nTest 1: Excluded original replaced when alternative exists');
{
  const cardSlots = [{ slotId: '100_0', cardName: 'Silent Clearing', productId: 100 }];
  const listings = [
    { listingId: 'l1', slotId: '100_0', productId: 100, price: 5.0 },
    { listingId: 'l2', slotId: '100_0', productId: 200, price: 6.0 },
    { listingId: 'l3', slotId: '100_0', productId: 300, price: 7.0 },
  ];
  const productNames = {
    100: 'Silent Clearing (Art Series)',
    200: 'Silent Clearing',
    300: 'Silent Clearing (Extended Art)',
  };
  const patterns = ['(art series)'];

  const result = applyCardExclusions({ listings, cardSlots, productNames, patterns });

  test('Excluded product removed from listings', () => {
    const pids = new Set(result.listings.map((l) => l.productId));
    assert(!pids.has(100), 'Product 100 (Art Series) should be excluded');
    assert(pids.has(200), 'Product 200 should remain');
    assert(pids.has(300), 'Product 300 should remain');
  });

  test('No warnings when alternative exists', () => {
    assert(result.exclusionWarningProductIds.size === 0, 'Should have no warnings');
  });

  test('Listing count reduced', () => {
    assert(result.listings.length === 2, `Expected 2 listings, got ${result.listings.length}`);
  });
}

// ============================================================
// Test 2: Excluded original kept with warning when no alternative exists
// ============================================================
console.log('\nTest 2: Excluded original kept with warning (no alternative)');
{
  const cardSlots = [{ slotId: '100_0', cardName: 'Silent Clearing', productId: 100 }];
  const listings = [
    { listingId: 'l1', slotId: '100_0', productId: 100, price: 5.0 },
    { listingId: 'l2', slotId: '100_0', productId: 100, price: 5.5 },
  ];
  const productNames = {
    100: 'Silent Clearing (Art Series)',
  };
  const patterns = ['(art series)'];

  const result = applyCardExclusions({ listings, cardSlots, productNames, patterns });

  test('Original listings restored', () => {
    assert(result.listings.length === 2, `Expected 2 listings, got ${result.listings.length}`);
    assert(
      result.listings.every((l) => l.productId === 100),
      'All listings should be product 100',
    );
  });

  test('Warning recorded for product', () => {
    assert(result.exclusionWarningProductIds.has(100), 'Should warn for product 100');
    assert(result.exclusionWarningProductIds.size === 1, 'Should have exactly 1 warning');
  });
}

// ============================================================
// Test 3: Multiple exclusion patterns
// ============================================================
console.log('\nTest 3: Multiple exclusion patterns');
{
  const cardSlots = [
    { slotId: '100_0', cardName: 'Card A', productId: 100 },
    { slotId: '200_0', cardName: 'Card B', productId: 200 },
  ];
  const listings = [
    { listingId: 'l1', slotId: '100_0', productId: 100, price: 1.0 },
    { listingId: 'l2', slotId: '100_0', productId: 101, price: 1.5 },
    { listingId: 'l3', slotId: '200_0', productId: 200, price: 2.0 },
    { listingId: 'l4', slotId: '200_0', productId: 201, price: 2.5 },
  ];
  const productNames = {
    100: 'Card A (Art Series)',
    101: 'Card A',
    200: 'Card B (Display Commander)',
    201: 'Card B',
  };
  const patterns = ['(art series)', '(display commander)'];

  const result = applyCardExclusions({ listings, cardSlots, productNames, patterns });

  test('Both excluded originals removed', () => {
    const pids = new Set(result.listings.map((l) => l.productId));
    assert(!pids.has(100), 'Art Series should be excluded');
    assert(!pids.has(200), 'Display Commander should be excluded');
    assert(pids.has(101), 'Card A alternative should remain');
    assert(pids.has(201), 'Card B alternative should remain');
  });

  test('No warnings (both have alternatives)', () => {
    assert(result.exclusionWarningProductIds.size === 0, 'No warnings expected');
  });
}

// ============================================================
// Test 4: Empty/disabled patterns — no-op
// ============================================================
console.log('\nTest 4: Empty patterns — no-op');
{
  const cardSlots = [{ slotId: '100_0', cardName: 'Card', productId: 100 }];
  const listings = [{ listingId: 'l1', slotId: '100_0', productId: 100, price: 1.0 }];
  const productNames = { 100: 'Card (Art Series)' };

  test('Empty patterns returns listings unchanged', () => {
    const r = applyCardExclusions({ listings, cardSlots, productNames, patterns: [] });
    assert(r.listings === listings, 'Should return same array reference');
    assert(r.exclusionWarningProductIds.size === 0, 'No warnings');
  });

  test('Null patterns returns listings unchanged', () => {
    const r = applyCardExclusions({ listings, cardSlots, productNames, patterns: null });
    assert(r.listings === listings, 'Should return same array reference');
  });

  test('Null productNames returns listings unchanged', () => {
    const r = applyCardExclusions({ listings, cardSlots, productNames: null, patterns: ['(art series)'] });
    assert(r.listings === listings, 'Should return same array reference');
  });
}

// ============================================================
// Test 5: Slot-scoped restoration — no cross-slot leakage
// ============================================================
console.log('\nTest 5: Slot-scoped restoration (no cross-slot leakage)');
{
  // Two slots for the same card name but different original products:
  // Slot A: original is excluded (Art Series), has no alternative → restore
  // Slot B: original is NOT excluded, has listings → no restore needed
  const cardSlots = [
    { slotId: '100_0', cardName: 'Silent Clearing', productId: 100 },
    { slotId: '200_0', cardName: 'Silent Clearing', productId: 200 },
  ];
  const listings = [
    // Slot A: only has the excluded product's listings
    { listingId: 'l1', slotId: '100_0', productId: 100, price: 5.0 },
    { listingId: 'l2', slotId: '100_0', productId: 100, price: 5.5 },
    // Slot B: has the non-excluded product
    { listingId: 'l3', slotId: '200_0', productId: 200, price: 6.0 },
    { listingId: 'l4', slotId: '200_0', productId: 200, price: 6.5 },
  ];
  const productNames = {
    100: 'Silent Clearing (Art Series)',
    200: 'Silent Clearing',
  };
  const patterns = ['(art series)'];

  const result = applyCardExclusions({ listings, cardSlots, productNames, patterns });

  test('Slot A has restored listings for excluded product', () => {
    const slotA = result.listings.filter((l) => l.slotId === '100_0');
    assert(slotA.length === 2, `Slot A should have 2 restored listings, got ${slotA.length}`);
    assert(
      slotA.every((l) => l.productId === 100),
      'Restored listings should be product 100',
    );
  });

  test('Slot B listings unchanged', () => {
    const slotB = result.listings.filter((l) => l.slotId === '200_0');
    assert(slotB.length === 2, `Slot B should have 2 listings, got ${slotB.length}`);
    assert(
      slotB.every((l) => l.productId === 200),
      'Slot B should only have product 200',
    );
  });

  test('Warning only for product 100', () => {
    assert(result.exclusionWarningProductIds.has(100), 'Should warn for product 100');
    assert(!result.exclusionWarningProductIds.has(200), 'Should not warn for product 200');
  });
}

// ============================================================
// Test 6: Duplicate slots (quantity > 1) — both slots covered
// ============================================================
console.log('\nTest 6: Multiple slots for same excluded product with alternatives');
{
  const cardSlots = [
    { slotId: '100_0', cardName: 'Card A', productId: 100 },
    { slotId: '100_1', cardName: 'Card A', productId: 100 },
  ];
  const listings = [
    // Both slots have the excluded original AND an alternative
    { listingId: 'l1', slotId: '100_0', productId: 100, price: 1.0 },
    { listingId: 'l2', slotId: '100_0', productId: 101, price: 1.5 },
    { listingId: 'l3', slotId: '100_1', productId: 100, price: 1.0 },
    { listingId: 'l4', slotId: '100_1', productId: 101, price: 1.5 },
  ];
  const productNames = {
    100: 'Card A (Art Series)',
    101: 'Card A',
  };
  const patterns = ['(art series)'];

  const result = applyCardExclusions({ listings, cardSlots, productNames, patterns });

  test('Both slots have listings (from alternative)', () => {
    const slot0 = result.listings.filter((l) => l.slotId === '100_0');
    const slot1 = result.listings.filter((l) => l.slotId === '100_1');
    assert(slot0.length === 1, `Slot 0 should have 1 listing, got ${slot0.length}`);
    assert(slot1.length === 1, `Slot 1 should have 1 listing, got ${slot1.length}`);
  });

  test('Only alternative product remains', () => {
    assert(
      result.listings.every((l) => l.productId === 101),
      'All listings should be product 101',
    );
  });

  test('No warnings', () => {
    assert(result.exclusionWarningProductIds.size === 0, 'No warnings expected');
  });
}

// ============================================================
// Test 7: Non-original excluded products still filtered
// ============================================================
console.log('\nTest 7: Non-original excluded products also filtered');
{
  const cardSlots = [{ slotId: '100_0', cardName: 'Card A', productId: 100 }];
  const listings = [
    { listingId: 'l1', slotId: '100_0', productId: 100, price: 1.0 },
    { listingId: 'l2', slotId: '100_0', productId: 101, price: 1.5 },
    { listingId: 'l3', slotId: '100_0', productId: 102, price: 2.0 },
  ];
  const productNames = {
    100: 'Card A',
    101: 'Card A (Art Series)',
    102: 'Card A (Display Commander)',
  };
  const patterns = ['(art series)', '(display commander)'];

  const result = applyCardExclusions({ listings, cardSlots, productNames, patterns });

  test('Non-original excluded products removed', () => {
    const pids = new Set(result.listings.map((l) => l.productId));
    assert(pids.has(100), 'Original non-excluded product should remain');
    assert(!pids.has(101), 'Art Series alternative should be excluded');
    assert(!pids.has(102), 'Display Commander alternative should be excluded');
  });

  test('No warnings (original is not excluded)', () => {
    assert(result.exclusionWarningProductIds.size === 0, 'No warnings expected');
  });
}

// ============================================================
// Test 8: annotateExclusionWarnings
// ============================================================
console.log('\nTest 8: annotateExclusionWarnings');
{
  const result = {
    success: true,
    sellers: [
      {
        items: [
          { productId: 100, cardName: 'Card A' },
          { productId: 200, cardName: 'Card B' },
          { productId: 300, cardName: 'Card C' },
        ],
      },
    ],
  };

  test('Tags items matching warning product IDs', () => {
    annotateExclusionWarnings(result, new Set([100, 300]));
    assert(result.sellers[0].items[0].exclusionWarning === true, 'Item 100 should be warned');
    assert(result.sellers[0].items[1].exclusionWarning === undefined, 'Item 200 should not be warned');
    assert(result.sellers[0].items[2].exclusionWarning === true, 'Item 300 should be warned');
  });

  test('No-op with empty set', () => {
    const r2 = { success: true, sellers: [{ items: [{ productId: 1 }] }] };
    annotateExclusionWarnings(r2, new Set());
    assert(r2.sellers[0].items[0].exclusionWarning === undefined, 'Should not add warning');
  });

  test('No-op with unsuccessful result', () => {
    const r3 = { success: false, sellers: [] };
    annotateExclusionWarnings(r3, new Set([1]));
    // Should not throw
  });
}

// ============================================================
// Test 9: Real dump data — Silent Clearing (Art Series) excluded
// ============================================================
console.log('\nTest 9: Real dump data — Silent Clearing (Art Series)');
{
  const dump = JSON.parse(readFileSync('tcgmizer-dump-1775504013250.json', 'utf-8'));

  // The dump lacks productNames, so synthesize from card names and set names.
  // We know from the dump: slot 191855_0 has listings for pids 191855, 190796, 555919
  const productNames = {};

  // Map product IDs to names from what we know about the data
  // Cart item: "Silent Clearing (Art Series)" at pid 191855
  for (const slot of dump.cardSlots) {
    productNames[slot.productId] = slot.cardName;
  }
  // Add set-based names for alternative products found in listings
  const seenProducts = new Set();
  for (const listing of dump.allListings) {
    if (!seenProducts.has(listing.productId) && !productNames[listing.productId]) {
      // Use setName to create a reasonable product name
      const slot = dump.cardSlots.find((s) => s.slotId === listing.slotId);
      if (slot && listing.productId !== slot.productId) {
        const baseName = slot.cardName.replace(/\s*\([^)]*\)\s*$/, '');
        const setName = listing.setName || 'Unknown Set';
        productNames[listing.productId] = `${baseName} [${setName}]`;
      }
    }
    seenProducts.add(listing.productId);
  }

  const patterns = ['(art series)'];

  const result = applyCardExclusions({
    listings: dump.allListings,
    cardSlots: dump.cardSlots,
    productNames,
    patterns,
  });

  test('Silent Clearing (Art Series) listings removed', () => {
    const scSlotListings = result.listings.filter((l) => l.slotId === '191855_0');
    const pids = new Set(scSlotListings.map((l) => l.productId));
    assert(!pids.has(191855), 'Art Series product 191855 should be excluded');
    assert(scSlotListings.length > 0, 'Should still have alternative listings');
  });

  test('Alternative products remain for Silent Clearing slot', () => {
    const scSlotListings = result.listings.filter((l) => l.slotId === '191855_0');
    const pids = new Set(scSlotListings.map((l) => l.productId));
    assert(pids.has(190796) || pids.has(555919), 'Should have at least one non-excluded alternative');
  });

  test('Other slots unaffected', () => {
    // Annie Flash slot should be unchanged (not excluded)
    const annieListings = result.listings.filter((l) => l.slotId === '544198_0');
    const originalAnnie = dump.allListings.filter((l) => l.slotId === '544198_0');
    assert(
      annieListings.length === originalAnnie.length,
      `Annie Flash listings should be unchanged: ${annieListings.length} vs ${originalAnnie.length}`,
    );
  });

  test('No warnings (alternatives exist)', () => {
    assert(result.exclusionWarningProductIds.size === 0, 'No warnings expected');
  });
}

// ============================================================
// Summary
// ============================================================
console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
