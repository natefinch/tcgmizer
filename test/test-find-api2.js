// Deep-search the TCGPlayer main JS bundle for listing/product API call patterns

async function main() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };

  const jsRes = await fetch('https://www.tcgplayer.com/js/index-CODooW01.js', { headers });
  const js = await jsRes.text();
  console.log(`JS bundle size: ${(js.length / 1024).toFixed(0)}KB`);

  // Search for mpapi.tcgplayer.com endpoint patterns
  const patterns = [
    // Find mpapi paths
    /mpapi\.tcgplayer\.com\/[^"'\s,)}\]]+/g,
    // Find anything with "listing" nearby
    /["'][^"']*listing[^"']*["']/gi,
    // Find search request construction
    /search\/request[^"'\s]*/g,
    // Find v1/ or v2/ endpoint paths
    /["']\/v\d\/[^"']+["']/g,
    // Find fetch/axios calls with URLs
    /(?:get|post|put|delete|fetch|axios)\s*\(\s*["'`][^"'`]*(?:listing|product|search)[^"'`]*["'`]/gi,
  ];

  for (const pat of patterns) {
    const matches = [...js.matchAll(pat)];
    if (matches.length > 0) {
      console.log(`\nPattern: ${pat.source} (${matches.length} matches)`);
      const unique = [...new Set(matches.map(m => m[0]))];
      for (const m of unique.slice(0, 20)) {
        console.log(`  ${m.slice(0, 200)}`);
        
        // Show context
        const idx = js.indexOf(m);
        if (idx >= 0) {
          const ctx = js.slice(Math.max(0, idx - 150), idx + m.length + 150);
          console.log(`    CTX: ...${ctx.replace(/\n/g, ' ').slice(0, 400)}...`);
        }
      }
    }
  }

  // Specifically search for how listings are fetched for a product page
  console.log('\n=== Search for "listings" in context ===');
  const listingRefs = [];
  let searchFrom = 0;
  while (true) {
    const idx = js.indexOf('listings', searchFrom);
    if (idx === -1 || listingRefs.length > 30) break;
    const ctx = js.slice(Math.max(0, idx - 120), idx + 200);
    // Only show contexts that look API-related
    if (ctx.match(/(?:url|api|fetch|get|post|endpoint|path|route)/i)) {
      listingRefs.push(ctx.replace(/\n/g, ' '));
    }
    searchFrom = idx + 1;
  }
  
  console.log(`Found ${listingRefs.length} API-related "listings" contexts:`);
  for (const ctx of listingRefs) {
    console.log(`  ...${ctx.slice(0, 350)}...`);
    console.log();
  }
}

main();
