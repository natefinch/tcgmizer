// Find the real cart API endpoints in TCGPlayer's JS bundles

async function main() {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };

  const res = await fetch('https://www.tcgplayer.com/js/useWpnSellerBadge-BRX8o0io.js', { headers });
  const js = await res.text();
  console.log(`Bundle size: ${(js.length / 1024).toFixed(0)}KB`);

  // Search for cart-related API calls
  const terms = [
    'addToCart',
    'removeFromCart',
    'clearCart',
    'updateCart',
    'cartItem',
    '/cart/',
    'cart/add',
    'cart/remove',
    'cart/update',
    'cart/clear',
    'addItem',
    'removeItem',
    'v1/cart',
    'v2/cart',
    'StoreCart',
    'cartKey',
    'cartId',
    'addToMassEntry',
    'massEntry',
  ];

  for (const term of terms) {
    const indices = [];
    let idx = js.indexOf(term);
    while (idx >= 0 && indices.length < 3) {
      indices.push(idx);
      idx = js.indexOf(term, idx + 1);
    }

    if (indices.length > 0) {
      console.log(`\n=== "${term}" — ${indices.length}+ occurrences ===`);
      for (const i of indices) {
        const ctx = js.slice(Math.max(0, i - 150), i + 300).replace(/\n/g, ' ');
        console.log(`  [${i}]: ...${ctx.slice(0, 450)}...`);
      }
    }
  }
}

main();
