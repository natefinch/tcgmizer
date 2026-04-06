// Search for getProductListings definition and VITE_GATEWAY_API in the JS bundle

async function main() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };

  const jsRes = await fetch('https://www.tcgplayer.com/js/index-CODooW01.js', { headers });
  const js = await jsRes.text();

  // Search for getProductListings definition
  console.log('=== getProductListings definition ===');
  const idx1 = js.indexOf('getProductListings');
  if (idx1 >= 0) {
    // Find all occurrences
    let searchIdx = 0;
    let count = 0;
    while (true) {
      const i = js.indexOf('getProductListings', searchIdx);
      if (i === -1 || count > 10) break;
      const ctx = js.slice(Math.max(0, i - 200), i + 300);
      console.log(`\nOccurrence ${++count} at position ${i}:`);
      console.log(ctx.replace(/\n/g, ' '));
      searchIdx = i + 1;
    }
  }

  // Search for VITE_GATEWAY_API value
  console.log('\n\n=== VITE_GATEWAY_API ===');
  const gwIdx = js.indexOf('VITE_GATEWAY_API');
  if (gwIdx >= 0) {
    let searchIdx = 0;
    let count = 0;
    while (true) {
      const i = js.indexOf('VITE_GATEWAY_API', searchIdx);
      if (i === -1 || count > 10) break;
      const ctx = js.slice(Math.max(0, i - 100), i + 200);
      console.log(`\nOccurrence ${++count}:`);
      console.log(ctx.replace(/\n/g, ' '));
      searchIdx = i + 1;
    }
  }

  // Search for the Re object definition (API service)
  console.log('\n\n=== "Re" API service methods ===');
  // Search for patterns like "Re.get", "Re.post" etc. near "search" or "listing"
  const rePatterns = /Re\.(get|post)[A-Za-z]+/g;
  const reMethods = new Set();
  for (const m of js.matchAll(rePatterns)) {
    reMethods.add(m[0]);
  }
  console.log('Re methods:', [...reMethods].join(', '));

  // Now search for the search-api POST request construction
  console.log('\n\n=== Search API POST construction ===');
  const searchPostPattern = /search\/request|searchRequest|searchApi/gi;
  for (const m of js.matchAll(searchPostPattern)) {
    const ctx = js.slice(Math.max(0, m.index - 200), m.index + 300);
    console.log(`\n  ${ctx.replace(/\n/g, ' ').slice(0, 500)}`);
  }

  // Search for how the search API URL is built
  console.log('\n\n=== VITE_SEARCH_API ===');
  let si = 0;
  let sc = 0;
  while (true) {
    const i = js.indexOf('VITE_SEARCH_API', si);
    if (i === -1 || sc > 10) break;
    const ctx = js.slice(Math.max(0, i - 200), i + 300);
    console.log(`\nOccurrence ${++sc}:`);
    console.log(ctx.replace(/\n/g, ' '));
    si = i + 1;
  }

  // Look for ListingSearchDefaultFilters
  console.log('\n\n=== ListingSearchDefaultFilters ===');
  const lsIdx = js.indexOf('ListingSearchDefaultFilters');
  if (lsIdx >= 0) {
    const ctx = js.slice(Math.max(0, lsIdx - 100), lsIdx + 500);
    console.log(ctx.replace(/\n/g, ' '));
  }

  // Look for SearchDefaultFilters
  console.log('\n\n=== SearchDefaultFilters ===');
  const sdIdx = js.indexOf('SearchDefaultFilters');
  if (sdIdx >= 0) {
    const ctx = js.slice(Math.max(0, sdIdx - 50), sdIdx + 500);
    console.log(ctx.replace(/\n/g, ' '));
  }
}

main();
