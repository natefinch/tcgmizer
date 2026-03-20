// Try various largestShippingCategoryId values

async function main() {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Origin': 'https://www.tcgplayer.com',
    'Referer': 'https://www.tcgplayer.com/',
  };

  const sellerId = 214769; // Chadderbox Hobby
  const url = `https://mpapi.tcgplayer.com/v2/seller/shippinginfo?countryCode=US`;

  for (const catId of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const body = [{ sellerId, largestShippingCategoryId: catId }];
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    
    const json = await res.json();
    const seller = json.results?.[0]?.[0] || json.results?.[0];
    const optCount = seller?.sellerShippingOptions?.length || 0;
    
    if (optCount > 0) {
      console.log(`\ncatId=${catId}: ${optCount} shipping options!`);
      console.log(JSON.stringify(seller.sellerShippingOptions, null, 2));
    } else {
      process.stdout.write(`catId=${catId}: no options | `);
    }
  }
  console.log();
}

main();
