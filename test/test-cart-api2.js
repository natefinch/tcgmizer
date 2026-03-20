// Search the TCGPlayer JS bundle for cart API data format details

async function main() {
  const res = await fetch('https://www.tcgplayer.com/js/useWpnSellerBadge-BRX8o0io.js');
  const js = await res.text();
  console.log(`Bundle size: ${(js.length / 1024).toFixed(0)}KB`);

  const patterns = [
    { label: 'bulkAdd call site', re: /bulkAdd\w{0,10}\([^)]{0,50},[^)]{0,500}\)/g },
    { label: 'Ge.addItem call context', re: /Ge\.addItem\([^)]+\)/g },
    { label: 'sku field in obj', re: /\bsku\s*[:]\s*\w+/g },
    { label: 'massEntry', re: /massEntry.{0,200}/g },
    { label: 'skuId', re: /skuId.{0,100}/g },
    { label: 'productConditionId', re: /productConditionId.{0,150}/g },
    { label: 'addItem handler body', re: /addItem\(t,n\)\{.{0,400}/g },
    { label: 'bulkAddItems handler body', re: /bulkAddItems\(t,n\)\{.{0,400}/g },
  ];

  for (const p of patterns) {
    const matches = [...js.matchAll(p.re)].slice(0, 8);
    console.log(`\n=== ${p.label} (${matches.length} matches) ===`);
    for (const m of matches) {
      console.log(`  [${m.index}]: ${m[0].substring(0, 300)}`);
    }
  }

  // Also get context around addItem invocations
  console.log('\n=== wider context around Ge.addItem calls ===');
  const addItemCalls = [...js.matchAll(/Ge\.addItem/g)];
  for (const m of addItemCalls.slice(0, 5)) {
    const start = Math.max(0, m.index - 300);
    const end = Math.min(js.length, m.index + 200);
    console.log(`  [${m.index}]: ...${js.substring(start, end)}...`);
  }

  // And around bulkAddItems invocations
  console.log('\n=== wider context around bulkAddItems calls ===');
  const bulkCalls = [...js.matchAll(/bulkAddItems/g)];
  for (const m of bulkCalls.slice(0, 5)) {
    const start = Math.max(0, m.index - 100);
    const end = Math.min(js.length, m.index + 300);
    console.log(`  [${m.index}]: ...${js.substring(start, end)}...`);
  }
}
main();
