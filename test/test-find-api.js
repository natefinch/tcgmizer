// Fetch the product page HTML and extract JS source URLs, then search those for API endpoints

async function main() {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  };

  // Fetch product page
  const res = await fetch('https://www.tcgplayer.com/product/656697?Language=English', { headers });
  const html = await res.text();

  // Extract all JS source URLs
  const scriptSrcs = [...html.matchAll(/src="([^"]+\.js[^"]*)"/g)].map((m) => m[1]);
  console.log(`Found ${scriptSrcs.length} script sources`);

  // Download and search each JS file for API patterns
  for (const src of scriptSrcs) {
    const url = src.startsWith('http') ? src : `https://www.tcgplayer.com${src}`;
    console.log(`\nChecking: ${url.slice(0, 100)}`);

    try {
      const jsRes = await fetch(url, { headers });
      const js = await jsRes.text();

      // Search for API-related patterns
      const patterns = [
        /mp-search-api[^"'\s]*/g,
        /mpapi[^"'\s]*/g,
        /\/v\d\/(?:search|listing|product)[^"'\s]*/g,
        /(?:search|listing|product)\/request[^"'\s]*/g,
        /api\.tcgplayer[^"'\s]*/g,
        /fetch\([^)]*(?:listing|search|product)[^)]*\)/g,
        /["'](?:https?:)?\/\/[^"']*tcgplayer[^"']*(?:listing|search|api)[^"']*["']/g,
      ];

      const found = new Set();
      for (const pat of patterns) {
        const matches = js.matchAll(pat);
        for (const m of matches) {
          found.add(m[0].slice(0, 200));
        }
      }

      if (found.size > 0) {
        console.log(`  API references found (${found.size}):`);
        for (const f of found) {
          console.log(`    ${f}`);
        }

        // Also look for surrounding context
        for (const f of found) {
          const idx = js.indexOf(f);
          if (idx >= 0) {
            const context = js.slice(Math.max(0, idx - 100), idx + f.length + 200);
            console.log(`\n  Context for "${f.slice(0, 50)}":`);
            console.log(`    ...${context.replace(/\n/g, ' ').slice(0, 400)}...`);
          }
        }
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }
  }
}

main();
