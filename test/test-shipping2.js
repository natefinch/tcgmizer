// Test shipping info API with correct body format: [{sellerId, largestShippingCategoryId}]

async function main() {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Origin': 'https://www.tcgplayer.com',
    'Referer': 'https://www.tcgplayer.com/',
  };

  // Seller IDs from listing data
  const sellerIds = [214769, 66786, 673102];
  
  // Try with various largestShippingCategoryId values
  for (const catId of [0, 1, 2, null]) {
    const body = sellerIds.map(id => ({ sellerId: id, largestShippingCategoryId: catId }));
    const url = `https://mpapi.tcgplayer.com/v2/seller/shippinginfo?countryCode=US`;
    
    console.log(`\n=== largestShippingCategoryId: ${catId} ===`);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    
    console.log(`Status: ${res.status}`);
    if (res.ok) {
      const json = await res.json();
      console.log(`Response keys: ${Object.keys(json)}`);
      if (json.results) {
        console.log(`results length: ${json.results.length}`);
        if (json.results[0]) {
          // Show first result in detail
          const r = Array.isArray(json.results[0]) ? json.results[0] : json.results;
          for (const seller of (Array.isArray(r) ? r : [r]).slice(0, 2)) {
            console.log(`\n--- Seller ${seller.sellerId || 'unknown'} ---`);
            console.log(JSON.stringify(seller, null, 2).slice(0, 1000));
          }
        }
      }
    } else {
      const text = await res.text();
      console.log(`Error: ${text.slice(0, 300)}`);
    }
    
    break; // just try first one if it works
  }
}

main();
