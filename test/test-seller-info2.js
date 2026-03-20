// Get sellerInfo aggregation data

async function main() {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Origin': 'https://www.tcgplayer.com',
    'Referer': 'https://www.tcgplayer.com/',
  };

  const productId = 534753;
  const url = `https://mp-search-api.tcgplayer.com/v1/product/${productId}/listings`;

  const body = {
    filters: {
      term: { sellerStatus: 'Live', channelId: 0 },
      range: { quantity: { gte: 1 } },
    },
    context: { shippingCountry: 'US', cart: {} },
    sort: { field: 'price', order: 'asc' },
    from: 0,
    size: 5,
    aggregations: ['sellerInfo'],
  };

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json();
  const r0 = json.results[0];
  
  console.log('Aggregation keys:', Object.keys(r0.aggregations));
  console.log('\n=== sellerInfo ===');
  const si = r0.aggregations.sellerInfo;
  console.log('Type:', typeof si, Array.isArray(si) ? `(array of ${si.length})` : '');
  
  if (Array.isArray(si)) {
    // Show first few
    for (let i = 0; i < Math.min(3, si.length); i++) {
      console.log(`\n--- sellerInfo[${i}] ---`);
      console.log(JSON.stringify(si[i], null, 2));
    }
  } else {
    console.log(JSON.stringify(si, null, 2).slice(0, 3000));
  }

  // Also search for freeShipping patterns in the product search chunk and main bundle
  console.log('\n\n=== Search for shipping threshold in product page ===');
  // Try a product page and look for seller shipping details
  const pageRes = await fetch(`https://www.tcgplayer.com/product/${productId}`, { headers });
  const pageHtml = await pageRes.text();
  
  // Look for __NEXT_DATA__ or other embedded data
  const nextDataMatch = pageHtml.match(/__NEXT_DATA__.*?<\/script>/s);
  if (nextDataMatch) {
    const nd = nextDataMatch[0];
    // Search for shipping threshold
    for (const term of ['freeShip', 'threshold', 'shippingMin', 'freeShippingMinimum']) {
      const idx = nd.indexOf(term);
      if (idx >= 0) {
        console.log(`Found "${term}" in __NEXT_DATA__: ${nd.slice(Math.max(0, idx-50), idx+200)}`);
      }
    }
  }

  // Try visiting a seller store page for shipping info
  const sellerKey = r0.results[0].sellerKey;
  const sellerName = r0.results[0].sellerName;
  console.log(`\n=== Seller page for ${sellerName} ===`);
  
  // API for seller shipping - look at the JS
  const bundleRes = await fetch('https://www.tcgplayer.com/js/useWpnSellerBadge-BRX8o0io.js', { headers });
  const bundle = await bundleRes.text();
  
  // Search for "sellerInfo" in the bundle for the API definition
  const siIdx = bundle.indexOf('getSellerInfo');
  if (siIdx >= 0) {
    console.log(`\ngetSellerInfo at ${siIdx}: ${bundle.slice(Math.max(0, siIdx-200), siIdx+500).replace(/\n/g, ' ')}`);
  }
  
  // Also search for "sellerFeedback" or similar
  for (const term of ['getSellerFeedback', 'sellerFeedback', 'getSellerShipping', 'sellerShipping', 'shippingPolicy', 'getSeller(', 'sellerDetails', 'getShippingRates']) {
    const idx = bundle.indexOf(term);
    if (idx >= 0) {
      console.log(`\n"${term}" at ${idx}: ${bundle.slice(Math.max(0, idx-100), idx+400).replace(/\n/g, ' ')}`);
    }
  }
}

main();
