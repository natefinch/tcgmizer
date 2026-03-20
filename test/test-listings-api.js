// Test the CORRECT API endpoint: v1/product/{productId}/listings
// Found by reverse-engineering TCGPlayer's useWpnSellerBadge chunk

async function main() {
  // Use a known product ID - let's try a common MTG card
  // We'll test with a few product IDs
  const testProductIds = [534753, 528578, 1]; // random IDs, gift card

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    'Origin': 'https://www.tcgplayer.com',
    'Referer': 'https://www.tcgplayer.com/',
  };

  // Minimal listing search body
  const bodies = [
    // Minimal
    {},
    // With filters
    {
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
    },
    // Just sort
    {
      sort: { field: 'price', order: 'asc' },
    },
  ];

  for (const productId of testProductIds) {
    for (let bi = 0; bi < bodies.length; bi++) {
      const url = `https://mp-search-api.tcgplayer.com/v1/product/${productId}/listings`;
      console.log(`\n=== Product ${productId}, body variant ${bi} ===`);
      console.log(`URL: ${url}`);
      
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(bodies[bi]),
        });
        
        console.log(`Status: ${res.status}`);
        const text = await res.text();
        
        if (res.ok) {
          try {
            const json = JSON.parse(text);
            console.log(`SUCCESS! Keys: ${Object.keys(json).join(', ')}`);
            if (json.results) {
              console.log(`Results count: ${json.results.length}`);
              if (json.results[0]) {
                console.log(`First result keys: ${Object.keys(json.results[0]).join(', ')}`);
                const r = json.results[0];
                console.log(`  price: ${r.price}, quantity: ${r.quantity}, sellerName: ${r.sellerName}`);
                console.log(`  shippingPrice: ${r.shippingPrice}`);
                if (r.sellerKey) console.log(`  sellerKey: ${r.sellerKey}`);
              }
            }
            if (json.totalResults !== undefined) console.log(`Total results: ${json.totalResults}`);
          } catch {
            console.log(`Response (first 500): ${text.slice(0, 500)}`);
          }
        } else {
          console.log(`Error response (first 300): ${text.slice(0, 300)}`);
        }
      } catch (err) {
        console.log(`Fetch error: ${err.message}`);
      }
    }
  }
}

main();
