// Get actual listing data with pagination

async function main() {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    Origin: 'https://www.tcgplayer.com',
    Referer: 'https://www.tcgplayer.com/',
  };

  const productId = 534753;
  const url = `https://mp-search-api.tcgplayer.com/v1/product/${productId}/listings`;

  const body = {
    filters: {
      term: {
        sellerStatus: 'Live',
        channelId: 0,
      },
      range: {
        quantity: { gte: 1 },
      },
    },
    context: {
      shippingCountry: 'US',
      cart: {},
    },
    sort: {
      field: 'price',
      order: 'asc',
    },
    from: 0,
    size: 3,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const json = await res.json();
  const r0 = json.results[0];
  console.log('totalResults:', r0.totalResults);
  console.log('inner results length:', r0.results.length);

  for (let i = 0; i < r0.results.length; i++) {
    const listing = r0.results[i];
    console.log(`\n=== Listing ${i} ===`);
    console.log(JSON.stringify(listing, null, 2));
  }

  // Show aggregations
  console.log('\n=== Aggregations ===');
  console.log(JSON.stringify(r0.aggregations, null, 2).slice(0, 1000));
}

main();
