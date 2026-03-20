/**
 * Parses a HiGHS solution object into a structured cart optimization result.
 *
 * @param {Object} solution - Raw HiGHS solution from highs.solve()
 * @param {Object} variableMap - Variable mapping from buildLP()
 * @param {Array<CardSlot>} cardSlots - Original card slots
 * @param {Object<string, SellerInfo>} sellers - Seller info keyed by sellerId
 * @param {number} currentCartTotal - The user's current cart total (for savings calc)
 * @returns {OptimizationResult}
 */
export function parseSolution(solution, variableMap, cardSlots, sellers, currentCartTotal) {
  if (solution.Status !== 'Optimal') {
    return {
      success: false,
      status: solution.Status,
      error: `Solver returned status: ${solution.Status}`,
      totalCost: null,
      sellers: [],
      savings: 0,
    };
  }

  const columns = solution.Columns;

  // Parse x variables — which listing was chosen for each slot
  const assignments = []; // { slotId, listing }
  for (const [varName, info] of Object.entries(variableMap.x)) {
    const col = columns[varName];
    if (!col) continue;
    // Round to 0/1 (solver may return 0.9999 or 1e-10)
    const val = Math.round(col.Primal);
    if (val === 1) {
      assignments.push({
        slotId: info.slotId,
        listing: info.listing,
      });
    }
  }

  // Build per-seller breakdown
  const sellerMap = new Map(); // sellerId → { items, subtotal }
  for (const assignment of assignments) {
    const { listing } = assignment;
    const slot = cardSlots.find(s => s.slotId === assignment.slotId);

    if (!sellerMap.has(listing.sellerId)) {
      sellerMap.set(listing.sellerId, {
        items: [],
        subtotal: 0,
      });
    }

    const entry = sellerMap.get(listing.sellerId);
    entry.items.push({
      cardName: slot?.cardName ?? `Card ${assignment.slotId}`,
      productId: listing.productId,
      originalProductId: slot?.productId,
      listingId: listing.listingId,
      productConditionId: listing.productConditionId,
      condition: listing.condition,
      setName: listing.setName,
      originalSetName: slot?.setName || '',
      language: listing.language,
      price: listing.price,
      printingChanged: listing.productId !== slot?.productId,
      directSeller: listing.directSeller || false,
      customListingKey: listing.customListingKey || null,
    });
    entry.subtotal += listing.price;
  }

  // Calculate shipping
  let totalItemCost = 0;
  let totalShipping = 0;
  const sellerResults = [];

  for (const [sellerId, data] of sellerMap) {
    const seller = sellers[sellerId];
    const sellerName = seller?.sellerName ?? sellerId;
    const shippingCost = seller?.shippingCost ?? 0;
    const threshold = seller?.freeShippingThreshold;

    const freeShipping = threshold != null && threshold > 0 && data.subtotal >= threshold;
    const actualShipping = freeShipping ? 0 : shippingCost;

    totalItemCost += data.subtotal;
    totalShipping += actualShipping;

    sellerResults.push({
      sellerId,
      sellerName,
      sellerNumericId: seller?.sellerNumericId ?? null,
      sellerKey: seller?.sellerKey ?? sellerId,
      items: data.items,
      subtotal: roundCents(data.subtotal),
      shippingCost: roundCents(actualShipping),
      freeShipping,
      freeShippingThreshold: threshold,
      sellerTotal: roundCents(data.subtotal + actualShipping),
    });
  }

  // Sort sellers by total descending for readability
  sellerResults.sort((a, b) => b.sellerTotal - a.sellerTotal);

  // Flag sellers below TCGPlayer's $1 minimum order
  const warnings = [];
  for (const sr of sellerResults) {
    if (sr.subtotal < 1.0) {
      warnings.push(`${sr.sellerName}: $${sr.subtotal.toFixed(2)} subtotal is below TCGPlayer's $1 minimum`);
    }
  }

  const totalCost = roundCents(totalItemCost + totalShipping);
  const savings = roundCents(currentCartTotal - totalCost);

  return {
    success: true,
    status: 'Optimal',
    totalCost,
    totalItemCost: roundCents(totalItemCost),
    totalShipping: roundCents(totalShipping),
    sellerCount: sellerResults.length,
    itemCount: assignments.length,
    sellers: sellerResults,
    savings,
    currentCartTotal: roundCents(currentCartTotal),
    warnings,
  };
}

function roundCents(n) {
  return Math.round(n * 100) / 100;
}
