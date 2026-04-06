// Search for where Re is defined and what HTTP library it uses

async function main() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };

  const jsRes = await fetch('https://www.tcgplayer.com/js/index-CODooW01.js', { headers });
  const js = await jsRes.text();

  // Find where Re is first assigned (look for const/let/var Re = or Re={)
  console.log('=== Search for "Re" assignment ===');
  // Look for ",Re=" or "const Re=" etc.
  const reAssignPat = /(?:const|let|var|,)\s*Re\s*=/g;
  for (const m of js.matchAll(reAssignPat)) {
    const ctx = js.slice(m.index, m.index + 600);
    console.log(`\nAt ${m.index}: ${ctx.replace(/\n/g, ' ').slice(0, 600)}`);
  }

  // Also try a broader search: just "Re={"
  console.log('\n\n=== Search "Re={" pattern ===');
  let idx = 0;
  let count = 0;
  while (count < 20) {
    const pat = 'Re={';
    const i = js.indexOf(pat, idx);
    if (i === -1) break;
    // Check that this is actually the Re service (check for method names nearby)
    const ctx = js.slice(i, i + 600);
    if (
      ctx.includes('getProduct') ||
      ctx.includes('getSales') ||
      ctx.includes('getLatest') ||
      ctx.includes('post') ||
      ctx.includes('.get(')
    ) {
      console.log(`\nAt ${i}: ${ctx.replace(/\n/g, ' ').slice(0, 600)}`);
    }
    idx = i + 1;
    count++;
  }

  // Try ProductSearch chunk
  console.log('\n\n=== ProductSearch-9GxJzVNS.js ===');
  const psRes = await fetch('https://www.tcgplayer.com/js/ProductSearch-9GxJzVNS.js', { headers });
  if (psRes.ok) {
    const psJs = await psRes.text();
    console.log(`Size: ${(psJs.length / 1024).toFixed(0)}KB`);

    // Check for API patterns
    for (const term of [
      'getProductListings',
      'search/request',
      'post(',
      'SEARCH_API',
      'searchApi',
      'mpapi',
      'v1/search',
    ]) {
      const i = psJs.indexOf(term);
      if (i >= 0) {
        const ctx = psJs.slice(Math.max(0, i - 150), i + 400);
        console.log(`\nFound "${term}": ${ctx.replace(/\n/g, ' ').slice(0, 600)}`);
      }
    }
  }

  // Search for "search/request" URL pattern in POST call - it might be in a separate utility
  console.log('\n\n=== Look for search request POST URL construction ===');
  // The URL pattern likely includes "v1/search/request"
  const urlPatterns = [/["'`][^"'`]*search\/request[^"'`]*["'`]/g, /v1\/search/g];

  for (const p of urlPatterns) {
    for (const m of js.matchAll(p)) {
      const ctx = js.slice(Math.max(0, m.index - 200), m.index + 200);
      console.log(`\n${m[0]} at ${m.index}: ${ctx.replace(/\n/g, ' ').slice(0, 500)}`);
    }
  }

  // Look for FreeShipProgress chunk (might have shipping-related API info)
  console.log('\n\n=== FreeShipProgress-DworyMQk.js ===');
  const fsRes = await fetch('https://www.tcgplayer.com/js/FreeShipProgress-DworyMQk.js', { headers });
  if (fsRes.ok) {
    const fsJs = await fsRes.text();
    console.log(`Size: ${(fsJs.length / 1024).toFixed(0)}KB`);
    if (fsJs.includes('shipping') || fsJs.includes('freeShip')) {
      console.log('Contains shipping references');
      // Print first 1000 chars
      console.log(fsJs.slice(0, 1000));
    }
  }
}

main();
