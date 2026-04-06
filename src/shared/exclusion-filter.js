/**
 * Card exclusion filter — applies version exclusion patterns to listings,
 * including cart originals. When an excluded original has no non-excluded
 * alternative, its listings are restored (slot-scoped) and a warning is recorded.
 */

/**
 * @param {Object} params
 * @param {Array} params.listings - All listings (pre-exclusion)
 * @param {Array<{slotId: string, productId: number, cardName: string}>} params.cardSlots
 * @param {Object<string, string>} params.productNames - productId → product name
 * @param {Array<string>} params.patterns - Lowercased, trimmed exclusion patterns
 * @returns {{ listings: Array, exclusionWarningProductIds: Set<number> }}
 */
export function applyCardExclusions({ listings, cardSlots, productNames, patterns }) {
  if (!patterns || patterns.length === 0 || !productNames) {
    return { listings, exclusionWarningProductIds: new Set() };
  }

  // Build set of ALL products matching exclusion patterns (including originals)
  const excludedProducts = new Set();
  for (const [pid, pName] of Object.entries(productNames)) {
    const id = typeof pid === 'string' ? parseInt(pid, 10) : pid;
    const lower = pName.toLowerCase();
    if (patterns.some((pat) => lower.includes(pat))) {
      excludedProducts.add(id);
    }
  }

  if (excludedProducts.size === 0) {
    return { listings, exclusionWarningProductIds: new Set() };
  }

  // Identify which original cart products are excluded
  const originalProductIds = new Set(cardSlots.map((s) => s.productId));
  const excludedOriginals = new Set([...originalProductIds].filter((id) => excludedProducts.has(id)));

  // Filter out all excluded product listings
  const filtered = listings.filter((l) => !excludedProducts.has(l.productId));

  // Check slot coverage — restore excluded originals only for slots with zero listings
  const exclusionWarningProductIds = new Set();

  if (excludedOriginals.size > 0) {
    const coveredSlots = new Set(filtered.map((l) => l.slotId));

    // Find slots that lost all coverage because their original product was excluded
    const slotsNeedingRestore = new Map(); // slotId → originalProductId
    for (const slot of cardSlots) {
      if (!coveredSlots.has(slot.slotId) && excludedOriginals.has(slot.productId)) {
        slotsNeedingRestore.set(slot.slotId, slot.productId);
      }
    }

    if (slotsNeedingRestore.size > 0) {
      // Restore ONLY the original product's listings for these specific slots
      for (const listing of listings) {
        const restoreProductId = slotsNeedingRestore.get(listing.slotId);
        if (restoreProductId !== undefined && listing.productId === restoreProductId) {
          filtered.push(listing);
        }
      }

      for (const productId of slotsNeedingRestore.values()) {
        exclusionWarningProductIds.add(productId);
      }
    }
  }

  return { listings: filtered, exclusionWarningProductIds };
}

/**
 * Annotate parsed result items with exclusion warnings.
 * Mutates result in place.
 *
 * @param {Object} result - Parsed solution result from parseSolution()
 * @param {Set<number>} exclusionWarningProductIds - Product IDs that couldn't be excluded
 */
export function annotateExclusionWarnings(result, exclusionWarningProductIds) {
  if (!result || !result.success || !exclusionWarningProductIds || exclusionWarningProductIds.size === 0) {
    return;
  }
  for (const seller of result.sellers) {
    for (const item of seller.items) {
      if (exclusionWarningProductIds.has(item.productId)) {
        item.exclusionWarning = true;
      }
    }
  }
}
