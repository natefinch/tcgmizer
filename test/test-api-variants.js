// Test various TCGPlayer API endpoints to find the working listing API

async function tryEndpoint(name, url, body, method = 'POST') {
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    
    const res = await fetch(url, opts);
    const text = await res.text();
    console.log(`\n=== ${name} ===`);
    console.log(`Status: ${res.status}`);
    console.log(`Content-Type: ${res.headers.get('content-type')}`);
    if (res.ok) {
      try {
        const data = JSON.parse(text);
        console.log('Keys:', Object.keys(data));
        console.log('Preview:', JSON.stringify(data, null, 2).slice(0, 2000));
      } catch {
        console.log('Response:', text.slice(0, 1000));
      }
    } else {
      console.log('Error:', text.slice(0, 500));
    }
  } catch (err) {
    console.log(`\n=== ${name} === ERROR:`, err.message);
  }
}

async function main() {
  const productId = 656697;

  // Try 1: mp-search-api with simplified body
  await tryEndpoint('mp-search-api simplified', 
    'https://mp-search-api.tcgplayer.com/v1/search/request?q=&isList=false',
    {
      from: 0,
      size: 3,
      filters: {
        term: { productId: [productId] },
        range: {},
        exclude: {}
      },
      listingSearch: {
        filters: {
          term: {},
          range: { quantity: { gte: 1 } },
          exclude: {}
        }
      },
      context: { shippingCountry: "US" },
      sort: { field: "price+shipping", order: "asc" }
    }
  );

  // Try 2: mp-search-api v2
  await tryEndpoint('mp-search-api v2',
    'https://mp-search-api.tcgplayer.com/v2/search/request?q=&isList=false',
    {
      from: 0,
      size: 3,
      filters: {
        term: { productId: [productId] },
        range: {},
        exclude: {}
      },
      listingSearch: {
        filters: {
          term: {},
          range: { quantity: { gte: 1 } },
          exclude: {}
        }
      },
      context: { shippingCountry: "US" },
      sort: { field: "price+shipping", order: "asc" }
    }
  );

  // Try 3: mpapi.tcgplayer.com (older endpoint)
  await tryEndpoint('mpapi product listings',
    `https://mpapi.tcgplayer.com/v2/product/${productId}/listings`,
    null, 'GET'
  );

  // Try 4: mp-search-api with productLineName and no productId filter
  await tryEndpoint('mp-search-api with product name search',
    'https://mp-search-api.tcgplayer.com/v1/search/request?q=Blood+Crypt+Borderless&isList=false',
    {
      from: 0,
      size: 3,
      filters: {
        term: { productLineName: ["magic"] },
        range: {},
        exclude: {}
      },
      listingSearch: {
        filters: {
          term: {},
          range: { quantity: { gte: 1 } },
          exclude: {}
        }
      },
      context: { shippingCountry: "US" },
      sort: { field: "price+shipping", order: "asc" }
    }
  );

  // Try 5: mp-search-api with algorithm field 
  await tryEndpoint('mp-search-api with default algorithm',
    'https://mp-search-api.tcgplayer.com/v1/search/request?q=&isList=false',
    {
      algorithm: "sales_search_by_keyword_v2",
      from: 0,
      size: 3,
      filters: {
        term: { 
          productLineName: ["magic"],
          productId: [productId]
        },
        range: {},
        exclude: { channelExclusion: 0 }
      },
      listingSearch: {
        filters: {
          term: { sellerStatus: "Live", channelExclusion: 0 },
          range: { quantity: { gte: 1 } },
          exclude: { channelExclusion: 0 }
        },
        context: { cart: {} }
      },
      context: { cart: {}, shippingCountry: "US" },
      settings: { useFuzzySearch: false, didYouMean: {} },
      sort: { field: "price+shipping", order: "asc" }
    }
  );

  // Try 6: tcgplayer.com/api/marketplace endpoint
  await tryEndpoint('marketplace product listings',
    `https://www.tcgplayer.com/api/marketplace/products/${productId}/listings?listed=true&limit=3`,
    null, 'GET'
  );

  // Try 7: infinite.tcgplayer.com
  await tryEndpoint('infinite api',
    `https://infinite.tcgplayer.com/api/v1/products/${productId}/listings?limit=3`,
    null, 'GET'
  );

  // Try 8: mp-search-api with empty algorithm
  await tryEndpoint('mp-search-api no algorithm',
    'https://mp-search-api.tcgplayer.com/v1/search/request?q=&isList=false&productId=656697',
    {
      from: 0,
      size: 3,
      filters: {
        term: { productLineName: ["magic"], productId: [productId] }
      },
      listingSearch: {
        filters: {
          term: { sellerStatus: "Live" },
          range: { quantity: { gte: 1 } }
        }
      },
      context: { shippingCountry: "US" },
      sort: { field: "price+shipping", order: "asc" }
    }
  );

  // Try 9: Check if there's an API via the product page URL pattern
  await tryEndpoint('product page JSON',
    `https://www.tcgplayer.com/product/${productId}?Language=English`,
    null, 'GET'
  );
}

main();
