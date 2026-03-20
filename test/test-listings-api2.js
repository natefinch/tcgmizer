// Examine the full listing response structure

async function main() {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Origin': 'https://www.tcgplayer.com',
    'Referer': 'https://www.tcgplayer.com/',
  };

  // Try a popular MTG card product ID
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
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const json = await res.json();
  console.log('Top-level keys:', Object.keys(json));
  console.log('errors:', JSON.stringify(json.errors));
  console.log('results array length:', json.results?.length);

  if (json.results?.[0]) {
    const r0 = json.results[0];
    console.log('\nresults[0] keys:', Object.keys(r0));
    console.log('totalResults:', r0.totalResults);
    console.log('resultId:', r0.resultId);
    console.log('aggregations keys:', r0.aggregations ? Object.keys(r0.aggregations) : 'none');
    console.log('inner results length:', r0.results?.length);

    if (r0.results?.[0]) {
      const listing = r0.results[0];
      console.log('\n=== First listing ===');
      console.log('Keys:', Object.keys(listing));
      console.log(JSON.stringify(listing, null, 2).slice(0, 2000));
    }
    
    if (r0.results?.length > 1) {
      console.log('\n=== Second listing ===');
      console.log(JSON.stringify(r0.results[1], null, 2).slice(0, 1000));
    }
  }

  // Also check with a page size parameter
  console.log('\n\n=== With from/size pagination ===');
  const body2 = {
    ...body,
    from: 0,
    size: 5,
  };

  const res2 = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body2),
  });

  const json2 = await res2.json();
  const r0_2 = json2.results?.[0];
  console.log('totalResults:', r0_2?.totalResults);
  console.log('inner results length:', r0_2?.results?.length);
}

main();
