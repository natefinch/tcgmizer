import { buildLP } from '../src/shared/ilp-builder.js';

const cardSlots = [
  { slotId: 's1', cardName: 'Card A', productId: 1 },
  { slotId: 's2', cardName: 'Card B', productId: 2 },
];
const sellers = {
  sel1: { sellerName: 'S1', shippingCost: 2, freeShippingThreshold: null },
  sel2: { sellerName: 'S2', shippingCost: 3, freeShippingThreshold: null },
  sel3: { sellerName: 'S3', shippingCost: 1, freeShippingThreshold: null },
};
const listings = [
  { listingId: 'l1', sellerId: 'sel1', slotId: 's1', price: 1, productConditionId: 100, condition: 'NM', language: 'English' },
  { listingId: 'l2', sellerId: 'sel2', slotId: 's1', price: 2, productConditionId: 101, condition: 'NM', language: 'English' },
  { listingId: 'l3', sellerId: 'sel3', slotId: 's1', price: 1.5, productConditionId: 102, condition: 'NM', language: 'English' },
  { listingId: 'l4', sellerId: 'sel1', slotId: 's2', price: 3, productConditionId: 200, condition: 'NM', language: 'English' },
  { listingId: 'l5', sellerId: 'sel2', slotId: 's2', price: 1, productConditionId: 201, condition: 'NM', language: 'English' },
  { listingId: 'l6', sellerId: 'sel3', slotId: 's2', price: 2, productConditionId: 202, condition: 'NM', language: 'English' },
];

// Without maxSellers
const r1 = buildLP({ cardSlots, sellers, listings });
console.log('Without maxSellers:');
console.log(r1.lp);
console.log();

// With maxSellers = 1
const r2 = buildLP({ cardSlots, sellers, listings, options: { maxSellers: 1 } });
console.log('With maxSellers=1:');
console.log(r2.lp);
