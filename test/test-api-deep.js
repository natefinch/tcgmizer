// Test: fetch product page HTML and look for embedded data (e.g. __NEXT_DATA__, inline JSON)
// Also try various other API patterns

async function main() {
  const productId = 656697;

  // Try fetching with browser-like headers
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  };

  // 1. Try the product page for __NEXT_DATA__
  console.log('=== Fetching product page HTML ===');
  const pageRes = await fetch(`https://www.tcgplayer.com/product/${productId}?Language=English`, { headers });
  const html = await pageRes.text();
  
  // Look for __NEXT_DATA__
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (nextDataMatch) {
    console.log('Found __NEXT_DATA__!');
    const data = JSON.parse(nextDataMatch[1]);
    console.log('Keys:', Object.keys(data));
    console.log('Props keys:', data.props ? Object.keys(data.props) : 'N/A');
    if (data.props?.pageProps) {
      console.log('pageProps keys:', Object.keys(data.props.pageProps));
      console.log('pageProps preview:', JSON.stringify(data.props.pageProps, null, 2).slice(0, 3000));
    }
  } else {
    console.log('No __NEXT_DATA__ found');
  }

  // Look for any inline JSON with listing data
  const jsonMatches = html.match(/window\.__[A-Z_]+__\s*=\s*({[^;]+})/g);
  if (jsonMatches) {
    console.log(`\nFound ${jsonMatches.length} window.__XXX__ assignments`);
    for (const m of jsonMatches) {
      console.log(m.slice(0, 200));
    }
  }

  // Look for script tags with src patterns that hint at API endpoints
  const scriptSrcs = [...html.matchAll(/src="([^"]*(?:api|search|listing|product)[^"]*)"/gi)];
  if (scriptSrcs.length > 0) {
    console.log('\nScript sources with API-like names:');
    for (const m of scriptSrcs) {
      console.log('  ', m[1]);
    }
  }

  // 2. Try search-api with correct productLineName format
  console.log('\n=== Try mp-search-api with string productId ===');
  const res2 = await fetch('https://mp-search-api.tcgplayer.com/v1/search/request?q=&isList=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...headers },
    body: JSON.stringify({
      algorithm: "sales_synonym_v2",
      from: 0,
      size: 3,
      filters: {
        term: { productLineName: ["magic"], productId: [String(productId)] },
        range: {},
        exclude: { channelExclusion: 0 }
      },
      listingSearch: {
        filters: {
          term: { sellerStatus: "Live", channelExclusion: 0 },
          range: { quantity: { gte: 1 } },
          exclude: { channelExclusion: 0 }
        },
        context: { cart: {} }
      },
      context: { cart: {}, shippingCountry: "US" },
      settings: { useFuzzySearch: false, didYouMean: {} },
      sort: { field: "price+shipping", order: "asc" }
    })
  });
  console.log(`Status: ${res2.status}`);
  const text2 = await res2.text();
  if (res2.ok) console.log('Response:', text2.slice(0, 2000));
  else console.log('Error:', text2.slice(0, 500));

  // 3. Try mp-search-api with Accept header variations
  console.log('\n=== Try mp-search-api with different Accept ===');
  const res3 = await fetch('https://mp-search-api.tcgplayer.com/v1/search/request?q=&isList=false', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'Origin': 'https://www.tcgplayer.com',
      'Referer': 'https://www.tcgplayer.com/',
      ...headers 
    },
    body: JSON.stringify({
      algorithm: "sales_synonym_v2",
      from: 0,
      size: 3,
      filters: {
        term: { productLineName: ["magic"], productId: [productId] },
        range: {},
        exclude: { channelExclusion: 0 }
      },
      listingSearch: {
        filters: {
          term: { sellerStatus: "Live", channelExclusion: 0 },
          range: { quantity: { gte: 1 } },
          exclude: { channelExclusion: 0 }
        },
        context: { cart: {} }
      },
      context: { cart: {}, shippingCountry: "US" },
      settings: { useFuzzySearch: false, didYouMean: {} },
      sort: { field: "price+shipping", order: "asc" }
    })
  });
  console.log(`Status: ${res3.status}`);
  const text3 = await res3.text();
  if (res3.ok) console.log('Response:', text3.slice(0, 2000));
  else console.log('Error:', text3.slice(0, 500));

  // 4. Try just fetching listings page as JSON via content negotiation
  console.log('\n=== Try product listings page with JSON accept ===');
  const res4 = await fetch(`https://www.tcgplayer.com/product/${productId}?Language=English`, {
    headers: { ...headers, 'Accept': 'application/json' }
  });
  console.log(`Status: ${res4.status}, Content-Type: ${res4.headers.get('content-type')}`);
  const text4 = await res4.text();
  if (res4.headers.get('content-type')?.includes('json')) {
    console.log('JSON Response:', text4.slice(0, 2000));
  } else {
    console.log('Got HTML, not JSON');
  }

  // 5. Try the newer API pattern — check for /api/v1 or /api/v2 paths on tcgplayer.com
  for (const path of [
    `/api/product/${productId}/listings`,
    `/api/v1/product/${productId}/listings`,
    `/api/v2/product/${productId}/listings`,
    `/api/marketplace/product/${productId}/listings`,
    `/api/catalog/product/${productId}`,
  ]) {
    const res = await fetch(`https://www.tcgplayer.com${path}`, { headers: { ...headers, Accept: 'application/json' } });
    console.log(`\nGET ${path} → ${res.status} (${res.headers.get('content-type')})`);
    if (res.ok && res.headers.get('content-type')?.includes('json')) {
      const t = await res.text();
      console.log('Response:', t.slice(0, 1000));
    }
  }
}

main();
