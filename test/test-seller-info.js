// Find seller shipping thresholds - look at the seller info API

async function main() {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    Origin: 'https://www.tcgplayer.com',
    Referer: 'https://www.tcgplayer.com/',
  };

  // First: does the listing context reveal shipping thresholds?
  // Let's fetch more listings and check all unique sellers
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
    size: 50,
  };

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json();
  const listings = json.results[0].results;

  // Check unique sellers and their shipping prices
  const sellers = new Map();
  for (const l of listings) {
    if (!sellers.has(l.sellerKey)) {
      sellers.set(l.sellerKey, {
        name: l.sellerName,
        shippingPrice: l.shippingPrice,
        sellerShippingPrice: l.sellerShippingPrice,
        sellerKey: l.sellerKey,
        sellerId: l.sellerId,
      });
    }
  }

  console.log(`Found ${sellers.size} unique sellers from ${listings.length} listings`);

  // Try getting seller info via mpapi
  const sellerKeys = [...sellers.keys()].slice(0, 3);

  // Try mpapi seller endpoint
  for (const sk of sellerKeys) {
    const seller = sellers.get(sk);
    console.log(`\n=== Seller: ${seller.name} (${sk}) ===`);

    // Try seller info endpoint
    const sellerUrl = `https://mpapi.tcgplayer.com/v2/seller/${sk}`;
    console.log(`GET ${sellerUrl}`);
    try {
      const sRes = await fetch(sellerUrl, { headers: { ...headers, 'Content-Type': undefined } });
      console.log(`Status: ${sRes.status}`);
      if (sRes.ok) {
        const sJson = await sRes.json();
        console.log(JSON.stringify(sJson, null, 2).slice(0, 1500));
      } else {
        const text = await sRes.text();
        console.log(text.slice(0, 200));
      }
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }

  // Try mpgateway seller info
  console.log('\n\n=== Try mpgateway ===');
  for (const sk of sellerKeys.slice(0, 1)) {
    const seller = sellers.get(sk);
    const gUrl = `https://mpgateway.tcgplayer.com/v1/seller/${sk}`;
    console.log(`GET ${gUrl}`);
    try {
      const gRes = await fetch(gUrl, { headers: { ...headers, 'Content-Type': undefined } });
      console.log(`Status: ${gRes.status}`);
      if (gRes.ok) {
        const text = await gRes.text();
        console.log(text.slice(0, 500));
      }
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }

  // Also search the JS bundle for "freeShipping" or "shippingThreshold"
  console.log('\n\n=== Search JS for shipping threshold patterns ===');
  const bundleRes = await fetch('https://www.tcgplayer.com/js/useWpnSellerBadge-BRX8o0io.js', { headers });
  const bundle = await bundleRes.text();

  const terms = [
    'freeShipping',
    'shippingThreshold',
    'freeShippingMinimum',
    'FREE_SHIPPING',
    'freeShipMin',
    'shippingFree',
  ];
  for (const term of terms) {
    const idx = bundle.indexOf(term);
    if (idx >= 0) {
      console.log(`\n"${term}" at ${idx}: ${bundle.slice(Math.max(0, idx - 100), idx + 300).replace(/\n/g, ' ')}`);
    }
  }

  // Also check: maybe seller info is in the search/listing context
  // Try the listing API with a different context
  console.log('\n\n=== Check if sellerInfo in listing response ===');
  const body2 = {
    ...body,
    from: 0,
    size: 1,
    // Maybe there's a way to get seller details
    aggregations: ['sellerInfo'],
  };
  const res2 = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body2) });
  const json2 = await res2.json();
  console.log('Aggregation keys:', Object.keys(json2.results?.[0]?.aggregations || {}));
}

main();
