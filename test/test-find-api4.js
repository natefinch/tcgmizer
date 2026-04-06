// Find Re.getProductListings and ListingSearchDefaultFilters definitions
// Also find the ProductCustomListing chunk for more API details

async function main() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };

  const jsRes = await fetch('https://www.tcgplayer.com/js/index-CODooW01.js', { headers });
  const js = await jsRes.text();

  // Find the definition of Re (the API service object)
  // Look for where Re is defined/assigned
  console.log('=== Looking for Re definition / getProductListings function body ===');

  // The Re methods are: getLatestSales, getMoreSalesHistory, getProductLineFilters,
  // getProductListings, getProductsBySkus, getProductDetails, getProductLegalitiesAndRulings
  // Let's find where getProductListings is defined as a method

  // Search for the function that does the actual POST to search API
  const searchApiPostIdx = js.indexOf('getProductListings(');
  if (searchApiPostIdx >= 0) {
    // Find ALL definition-like occurrences
    let si = 0;
    let c = 0;
    while (c < 15) {
      const i = js.indexOf('getProductListings', si);
      if (i === -1) break;
      const prevChar = js[i - 1];
      const ctx = js.slice(Math.max(0, i - 80), i + 400);
      // Check if this looks like a definition (preceded by . or , or :)
      if (prevChar === '.' || prevChar === ',' || prevChar === ':' || prevChar === '{') {
        console.log(`\nAt ${i} (prev='${prevChar}'):`);
        console.log(ctx.replace(/\n/g, ' ').slice(0, 500));
      }
      si = i + 1;
      c++;
    }
  }

  // Find ListingSearchDefaultFilters definition
  console.log('\n\n=== ListingSearchDefaultFilters definition ===');
  // Search for where this function is defined
  const patterns = ['ListingSearchDefaultFilters', 'SearchDefaultFilters'];

  for (const pat of patterns) {
    let si = 0;
    let c = 0;
    while (c < 10) {
      const i = js.indexOf(pat, si);
      if (i === -1) break;
      const prevChars = js.slice(Math.max(0, i - 20), i);
      // Look for function definition pattern
      if (prevChars.match(/(?:function\s|=\s*(?:\(|function)|:\s*(?:\(|function))/)) {
        console.log(`\nDefinition of ${pat} at ${i}:`);
        const ctx = js.slice(Math.max(0, i - 50), i + 500);
        console.log(ctx.replace(/\n/g, ' '));
      }
      si = i + 1;
      c++;
    }
  }

  // Now let's also download the ProductCustomListing chunk
  console.log('\n\n=== ProductCustomListing chunk ===');
  const chunkRes = await fetch('https://www.tcgplayer.com/js/ProductCustomListing-C8kBALHA.js', { headers });
  if (chunkRes.ok) {
    const chunkJs = await chunkRes.text();
    console.log(`Chunk size: ${(chunkJs.length / 1024).toFixed(0)}KB`);

    // Search for API patterns in this chunk
    const apiPatterns = [
      /(?:post|get)\s*\([^)]*search[^)]*\)/gi,
      /search-api|searchApi|SEARCH_API/gi,
      /getProductListings/g,
      /mpapi|mpgateway/gi,
      /v1\/search|v2\/search/g,
    ];

    for (const p of apiPatterns) {
      const matches = [...chunkJs.matchAll(p)];
      if (matches.length > 0) {
        console.log(`\nPattern ${p.source}: ${matches.length} matches`);
        for (const m of matches.slice(0, 5)) {
          const ctx = chunkJs.slice(Math.max(0, m.index - 100), m.index + 300);
          console.log(`  ${ctx.replace(/\n/g, ' ').slice(0, 400)}`);
        }
      }
    }
  }

  // Search for how search API POST is constructed
  console.log('\n\n=== POST to search API pattern ===');
  // The search API is at VITE_SEARCH_API = "https://mp-search-api.tcgplayer.com/"
  // Look for post calls with this
  const postSearchPat = /\.post\s*\([^)]*(?:SEARCH_API|search-api|searchApi)[^)]*\)/gi;
  for (const m of js.matchAll(postSearchPat)) {
    const ctx = js.slice(Math.max(0, m.index - 100), m.index + 400);
    console.log(`  ${ctx.replace(/\n/g, ' ').slice(0, 500)}`);
  }

  // Also search for the actual POST call pattern
  console.log('\n=== any .post with v1 or product ===');
  const postV1Pat = /\.post\s*\(\s*[`"'][^`"']*v1\/search[^`"']*[`"']/gi;
  for (const m of js.matchAll(postV1Pat)) {
    const ctx = js.slice(Math.max(0, m.index - 100), m.index + 400);
    console.log(`  ${ctx.replace(/\n/g, ' ').slice(0, 500)}`);
  }

  // Try "search/request"
  console.log('\n=== search/request in post calls ===');
  let sri = 0;
  while (true) {
    const i = js.indexOf('search/request', sri);
    if (i === -1) break;
    const ctx = js.slice(Math.max(0, i - 300), i + 200);
    console.log(`\nAt ${i}:`);
    console.log(ctx.replace(/\n/g, ' ').slice(0, 600));
    sri = i + 1;
  }
}

main();
