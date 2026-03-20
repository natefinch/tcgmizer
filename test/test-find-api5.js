// Find the Re object definition and the actual HTTP call for getProductListings

async function main() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };

  const jsRes = await fetch('https://www.tcgplayer.com/js/index-CODooW01.js', { headers });
  const js = await jsRes.text();

  // Search for where Re is defined as an object with getProductListings
  // It might be: const Re = { getProductListings: function... }
  // Or: Re = { getProductListings(... }
  
  // Find the pattern "getProductListings" followed by function-like syntax (definition, not call)
  console.log('=== Find getProductListings function definition ===');
  const defPatterns = [
    /getProductListings\s*[:(]\s*(?:function)?\s*\(/g,
    /getProductListings\s*=\s*(?:function|\()/g,
  ];
  
  for (const p of defPatterns) {
    for (const m of js.matchAll(p)) {
      const ctx = js.slice(Math.max(0, m.index - 50), m.index + 600);
      console.log(`\nDef at ${m.index}:`);
      console.log(ctx.replace(/\n/g, ' ').slice(0, 700));
    }
  }

  // Search for "Re" or "Re=" where Re looks like a service object definition
  // Actually, let's find all methods of Re and search near them for the HTTP layer
  console.log('\n\n=== Search near Re methods for HTTP calls ===');
  
  // The Re methods are listed. Let's find getProductDetails definition since it might be near getProductListings
  const methodDefs = [
    'getProductDetails',
    'getLatestSales',
    'getProductListings', 
    'getProductsBySkus',
    'getProductPricePoints',
  ];
  
  for (const method of methodDefs) {
    // Look for definition pattern: method(args){...} or method: function(args){...}
    const pat = new RegExp(`${method}\\s*[(:=]`, 'g');
    for (const m of js.matchAll(pat)) {
      const prevChar = js[m.index - 1];
      // Skip call sites (preceded by .)
      if (prevChar === '.') continue;
      
      const ctx = js.slice(Math.max(0, m.index - 30), m.index + 500);
      console.log(`\nDef of ${method} at ${m.index}:`);
      console.log(ctx.replace(/\n/g, ' ').slice(0, 600));
    }
  }

  // Look for the actual SearchAPI/search-api URL construction in a POST call
  // The url might be built like: `${e.VITE_SEARCH_API}v1/search/request?q=...`
  console.log('\n\n=== Search for VITE_SEARCH_API concatenation ===');
  let si = 0;
  while (true) {
    const i = js.indexOf('VITE_SEARCH_API', si);
    if (i === -1) break;
    const ctx = js.slice(i, i + 300);
    console.log(`\n  ${ctx.replace(/\n/g, ' ').slice(0, 300)}`);
    si = i + 1;
  }

  // Search for v1/product in POST bodies
  console.log('\n\n=== v1/product or v2/product patterns ===');
  for (const pat of ['v1/product', 'v2/product']) {
    let idx = 0;
    let count = 0;
    while (count < 5) {
      const i = js.indexOf(pat, idx);
      if (i === -1) break;
      const ctx = js.slice(Math.max(0, i - 100), i + 200);
      console.log(`\n${pat} at ${i}:`);
      console.log(ctx.replace(/\n/g, ' ').slice(0, 400));
      idx = i + 1;
      count++;
    }
  }

  // Try loading the index-CuorlExp.js chunk (found earlier)
  console.log('\n\n=== index-CuorlExp.js chunk ===');
  const chunk2Res = await fetch('https://www.tcgplayer.com/js/index-CuorlExp.js', { headers });
  if (chunk2Res.ok) {
    const chunk2 = await chunk2Res.text();
    console.log(`Chunk size: ${(chunk2.length / 1024).toFixed(0)}KB`);
    
    // Check for API definitions
    for (const pat of ['getProductListings', 'search/request', 'SEARCH_API', 'searchApi']) {
      const i = chunk2.indexOf(pat);
      if (i >= 0) {
        const ctx = chunk2.slice(Math.max(0, i - 200), i + 400);
        console.log(`\nFound "${pat}" in chunk:`);
        console.log(ctx.replace(/\n/g, ' ').slice(0, 600));
      }
    }
  }
}

main();
