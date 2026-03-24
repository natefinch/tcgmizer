import { TCGPLAYER_DIRECT_SHIPPING_COST, TCGPLAYER_DIRECT_FREE_SHIPPING_THRESHOLD } from './constants.js';

/**
 * Remap Direct listings so the ILP treats all TCGPlayer Direct inventory as
 * a single seller. This is critical because Direct listings from many different
 * sellers actually ship together from TCGPlayer's warehouse for one $3.99 charge
 * (free over $50). Without remapping, the ILP thinks each seller is separate
 * and penalizes Direct with N× shipping costs and N seller slots.
 *
 * ALL Direct listings are remapped, including those from "mixed" sellers that
 * also have non-Direct inventory. On TCGPlayer, Direct items always ship from
 * TCGPlayer's warehouse regardless of the seller's other inventory. A mixed
 * seller's non-Direct listings stay under the real seller.
 *
 * @param {Array} listings - Filtered listings
 * @param {Object} sellers - Original sellers map
 * @returns {{ listings: Array, sellers: Object }} Remapped listings and augmented sellers map
 */
export function remapDirectListings(listings, sellers) {
  const DIRECT_SELLER_ID = '__tcgplayer_direct__';

  let remappedCount = 0;
  const remapped = listings.map(l => {
    // Remap ALL Direct listings to the synthetic Direct seller
    if (!l.directListing) return l;
    remappedCount++;
    return {
      ...l,
      // Remap to synthetic Direct seller for the ILP
      sellerId: DIRECT_SELLER_ID,
      // Preserve original seller info for cart operations
      originalSellerId: l.sellerId,
      originalSellerKey: l.sellerKey || l.sellerId,
      originalSellerNumericId: l.sellerNumericId,
      originalSellerName: l.sellerName,
    };
  });

  if (remappedCount === 0) {
    return { listings, sellers };
  }

  // Add synthetic Direct seller to the sellers map
  const augmentedSellers = {
    ...sellers,
    [DIRECT_SELLER_ID]: {
      sellerName: 'TCGplayer Direct',
      sellerKey: DIRECT_SELLER_ID,
      sellerNumericId: null,
      shippingCost: TCGPLAYER_DIRECT_SHIPPING_COST,
      freeShippingThreshold: TCGPLAYER_DIRECT_FREE_SHIPPING_THRESHOLD,
    },
  };

  console.log(`[TCGmizer] Remapped ${remappedCount} Direct listings to synthetic seller`);

  return { listings: remapped, sellers: augmentedSellers };
}
