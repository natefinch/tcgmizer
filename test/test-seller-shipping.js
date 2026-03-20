// Test seller shipping info API

async function main() {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Origin': 'https://www.tcgplayer.com',
    'Referer': 'https://www.tcgplayer.com/',
  };

  // First get some seller keys from listings
  const productId = 534753;
  const listUrl = `https://mp-search-api.tcgplayer.com/v1/product/${productId}/listings`;
  const listBody = {
    filters: { term: { sellerStatus: 'Live', channelId: 0 }, range: { quantity: { gte: 1 } } },
    context: { shippingCountry: 'US', cart: {} },
    sort: { field: 'price', order: 'asc' },
    from: 0, size: 10,
  };

  const listRes = await fetch(listUrl, { method: 'POST', headers, body: JSON.stringify(listBody) });
  const listJson = await listRes.json();
  const listings = listJson.results[0].results;
  
  const sellerKeys = [...new Set(listings.map(l => l.sellerKey))];
  console.log(`Seller keys: ${sellerKeys.join(', ')}`);

  // Try shipping info API
  const shipUrl = `https://mpapi.tcgplayer.com/v2/seller/shippinginfo?countryCode=US`;
  console.log(`\nPOST ${shipUrl}`);
  console.log(`Body: ${JSON.stringify(sellerKeys)}`);
  
  const shipRes = await fetch(shipUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(sellerKeys),
  });
  
  console.log(`Status: ${shipRes.status}`);
  const shipText = await shipRes.text();
  
  if (shipRes.ok) {
    try {
      const shipJson = JSON.parse(shipText);
      console.log(`Response type: ${typeof shipJson}, isArray: ${Array.isArray(shipJson)}`);
      if (Array.isArray(shipJson)) {
        for (let i = 0; i < Math.min(3, shipJson.length); i++) {
          console.log(`\n--- Seller ${i} ---`);
          console.log(JSON.stringify(shipJson[i], null, 2));
        }
      } else {
        console.log(JSON.stringify(shipJson, null, 2).slice(0, 3000));
      }
    } catch {
      console.log(`Raw response: ${shipText.slice(0, 2000)}`);
    }
  } else {
    console.log(`Error: ${shipText.slice(0, 500)}`);
  }

  // Also try seller info API  
  console.log('\n\n=== Seller Info ===');
  const infoUrl = `https://mpapi.tcgplayer.com/v2/seller/info?liveSellersOnly=true`;
  const infoRes = await fetch(infoUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(sellerKeys.slice(0, 3)),
  });
  
  console.log(`Status: ${infoRes.status}`);
  if (infoRes.ok) {
    const infoJson = await infoRes.json();
    if (Array.isArray(infoJson)) {
      for (let i = 0; i < Math.min(2, infoJson.length); i++) {
        console.log(`\n--- Seller ${i} ---`);
        console.log(JSON.stringify(infoJson[i], null, 2).slice(0, 1000));
      }
    } else {
      console.log(JSON.stringify(infoJson, null, 2).slice(0, 2000));
    }
  } else {
    const text = await infoRes.text();
    console.log(`Error: ${text.slice(0, 500)}`);
  }
}

main();
