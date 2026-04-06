// Quick test: fetch listings from TCGPlayer search API for product 656697 (Blood Crypt Borderless)
const SEARCH_API_BASE = 'https://mp-search-api.tcgplayer.com/v1/search/request';

const requestBody = {
  algorithm: 'revenue_exp_fields_experiment',
  from: 0,
  size: 3,
  filters: {
    term: {
      productLineName: ['magic'],
      productId: [656697],
    },
    range: {},
    exclude: {
      channelExclusion: 0,
    },
  },
  listingSearch: {
    filters: {
      term: {
        sellerStatus: 'Live',
        channelExclusion: 0,
      },
      range: {
        quantity: { gte: 1 },
      },
      exclude: {
        channelExclusion: 0,
        listingType: ['Listing-Offer'],
      },
    },
    context: {
      cart: {},
    },
  },
  context: {
    cart: {},
    shippingCountry: 'US',
  },
  settings: {
    useFuzzySearch: false,
    didYouMean: {},
  },
  sort: {
    field: 'price+shipping',
    order: 'asc',
  },
};

async function main() {
  console.log('Fetching from:', SEARCH_API_BASE);
  try {
    const response = await fetch(SEARCH_API_BASE + '?q=&isList=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Status:', response.status, response.statusText);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));

    const text = await response.text();
    console.log('Response length:', text.length);

    try {
      const data = JSON.parse(text);
      console.log('\n=== RESPONSE STRUCTURE ===');
      console.log(JSON.stringify(data, null, 2).slice(0, 5000));

      // Explore the structure
      if (data.results) {
        console.log('\n=== results array length:', data.results.length);
        if (data.results[0]) {
          console.log('results[0] keys:', Object.keys(data.results[0]));
          const r0 = data.results[0];
          if (r0.results) {
            console.log('results[0].results length:', r0.results.length);
            if (r0.results[0]) {
              console.log('results[0].results[0] keys:', Object.keys(r0.results[0]));
              console.log('First result:', JSON.stringify(r0.results[0], null, 2).slice(0, 3000));
            }
          }
          if (r0.aggregations) {
            console.log('results[0].aggregations keys:', Object.keys(r0.aggregations));
          }
        }
      }
    } catch (e) {
      console.log('Response (first 2000 chars):', text.slice(0, 2000));
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
