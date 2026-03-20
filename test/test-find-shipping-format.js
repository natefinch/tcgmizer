// Find how sellerShippingInfo is called in the JS

async function main() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };

  const res = await fetch('https://www.tcgplayer.com/js/useWpnSellerBadge-BRX8o0io.js', { headers });
  const js = await res.text();

  // Find all references to "sellerShippingInfo"
  const matches = [...js.matchAll(/sellerShippingInfo/g)];
  console.log(`Found ${matches.length} occurrences of "sellerShippingInfo"`);
  
  for (const m of matches) {
    const ctx = js.slice(Math.max(0, m.index - 300), m.index + 500);
    console.log(`\n=== At offset ${m.index} ===`);
    console.log(ctx.replace(/\n/g, ' '));
    console.log('---');
  }

  // Also search for "SellerToShip" or "shippinginfo" (the API path)
  for (const term of ['shippinginfo', 'sellerShipping', 'freeShipMin', 'freeShippingMinimum', 'shippingMinimum']) {
    const idx = js.indexOf(term);
    if (idx >= 0) {
      console.log(`\n"${term}" at ${idx}: ${js.slice(Math.max(0, idx - 200), idx + 400).replace(/\n/g, ' ')}`);
    }
  }

  // Look for "sellerKey" near "shipping" 
  const re = /sellerKey[^}]{0,200}shipping/gi;
  const results = [...js.matchAll(re)];
  console.log(`\n\n=== sellerKey near shipping: ${results.length} matches ===`);
  for (const r of results.slice(0, 3)) {
    console.log(`\nAt ${r.index}: ${r[0].slice(0, 200)}`);
  }
}

main();
