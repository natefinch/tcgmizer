// Deep search the ProductSearch chunk for API definitions

async function main() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };

  const psRes = await fetch('https://www.tcgplayer.com/js/ProductSearch-9GxJzVNS.js', { headers });
  const ps = await psRes.text();
  console.log(`ProductSearch chunk: ${(ps.length / 1024).toFixed(0)}KB`);

  // Search for key terms
  const terms = [
    'getProductListings',
    'search/request',
    'SEARCH_API',
    'searchApi',
    'mpapi',
    'mp-search-api',
    'post(',
    'v1/search',
    'productId',
    'sellerStatus',
    'shippingCountry',
    'listingSearch',
    'getProductDetails',
    'getLatestSales',
    'getMoreSalesHistory',
    'getProductLineFilters',
    'getDynamicBuylistMarketPrice',
    'getDynamicMarketPrice',
    'getProductPricePoints',
    'getMarketPriceVolatility',
    'getProductsBySkus',
    'getProductLegalitiesAndRulings',
  ];

  for (const term of terms) {
    const i = ps.indexOf(term);
    if (i >= 0) {
      const ctx = ps.slice(Math.max(0, i - 200), i + 500);
      console.log(`\n=== "${term}" found at ${i} ===`);
      console.log(ctx.replace(/\n/g, ' ').slice(0, 700));
    }
  }

  // The API service might be in a different chunk. Let me look at what chunks are imported.
  console.log('\n\n=== Import patterns ===');
  const imports = [...ps.matchAll(/import\{[^}]+\}from"([^"]+)"/g)];
  for (const m of imports) {
    console.log(`  ${m[1]}`);
  }

  // Look for the useWpnSellerBadge chunk which seems to be a shared utility
  console.log('\n\n=== Check useWpnSellerBadge chunk ===');
  const utilRes = await fetch('https://www.tcgplayer.com/js/useWpnSellerBadge-BRX8o0io.js', { headers });
  if (utilRes.ok) {
    const utilJs = await utilRes.text();
    console.log(`Size: ${(utilJs.length / 1024).toFixed(0)}KB`);

    for (const term of ['getProductListings', 'search/request', 'SEARCH_API', 'post(', 'mpapi', 'mp-search-api']) {
      const i = utilJs.indexOf(term);
      if (i >= 0) {
        const ctx = utilJs.slice(Math.max(0, i - 200), i + 500);
        console.log(`\n"${term}" at ${i}: ${ctx.replace(/\n/g, ' ').slice(0, 700)}`);
      }
    }
  }

  // Try marketplace__ chunk
  console.log('\n\n=== Check marketplace chunk ===');
  const mkRes = await fetch('https://www.tcgplayer.com/js/marketplace__loadShare__vue__loadShare__-DN7alQEX.js', {
    headers,
  });
  if (mkRes.ok) {
    const mkJs = await mkRes.text();
    console.log(`Size: ${(mkJs.length / 1024).toFixed(0)}KB`);

    for (const term of ['getProductListings', 'search/request', 'SEARCH_API', 'mpapi', 'mp-search-api', 'post(']) {
      const i = mkJs.indexOf(term);
      if (i >= 0) {
        const ctx = mkJs.slice(Math.max(0, i - 200), i + 500);
        console.log(`\n"${term}" at ${i}: ${ctx.replace(/\n/g, ' ').slice(0, 700)}`);
      }
    }
  }
}

main();
