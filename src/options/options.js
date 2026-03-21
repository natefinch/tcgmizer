// TCGmizer Options page — Vendor ban list management

const STORAGE_KEY = 'bannedSellers';
const SELLER_SEARCH_URL = 'https://mpapi.tcgplayer.com/v2/ShopBySeller/GetSellerSearchResults';

let bannedSellers = []; // { sellerKey, sellerName }

document.addEventListener('DOMContentLoaded', async () => {
  await loadBanList();
  renderBanList();

  const searchInput = document.getElementById('seller-search');
  const searchBtn = document.getElementById('search-btn');

  searchBtn.addEventListener('click', () => doSearch());
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
});

async function loadBanList() {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  bannedSellers = data[STORAGE_KEY] || [];
}

async function saveBanList() {
  await chrome.storage.sync.set({ [STORAGE_KEY]: bannedSellers });
}

function renderBanList() {
  const listEl = document.getElementById('ban-list');
  const emptyEl = document.getElementById('ban-list-empty');
  const countEl = document.getElementById('ban-count');

  // Clear existing items (but keep the empty message element)
  listEl.querySelectorAll('.ban-list-item').forEach(el => el.remove());

  countEl.textContent = bannedSellers.length > 0 ? `(${bannedSellers.length})` : '';

  if (bannedSellers.length === 0) {
    emptyEl.style.display = '';
    return;
  }

  emptyEl.style.display = 'none';

  for (const seller of bannedSellers) {
    const item = document.createElement('div');
    item.className = 'ban-list-item';
    item.innerHTML = `
      <span class="ban-list-name">${escapeHtml(seller.sellerName)}</span>
      <button class="options-btn options-btn-danger" data-key="${escapeHtml(seller.sellerKey)}">Remove</button>
    `;
    item.querySelector('button').addEventListener('click', () => removeSeller(seller.sellerKey));
    listEl.appendChild(item);
  }
}

async function removeSeller(sellerKey) {
  bannedSellers = bannedSellers.filter(s => s.sellerKey !== sellerKey);
  await saveBanList();
  renderBanList();
}

async function addSeller(sellerKey, sellerName) {
  if (bannedSellers.some(s => s.sellerKey === sellerKey)) return;
  bannedSellers.push({ sellerKey, sellerName });
  await saveBanList();
  renderBanList();
  // Update search results to reflect the "already banned" state
  renderSearchResults(lastSearchResults);
}

let lastSearchResults = [];

async function doSearch() {
  const input = document.getElementById('seller-search');
  const query = input.value.trim();
  if (!query) return;

  const resultsEl = document.getElementById('search-results');
  const emptyEl = document.getElementById('search-empty');
  const errorEl = document.getElementById('search-error');
  const loadingEl = document.getElementById('search-loading');

  resultsEl.style.display = 'none';
  emptyEl.style.display = 'none';
  errorEl.style.display = 'none';
  loadingEl.style.display = '';

  try {
    const resp = await fetch(SELLER_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellerName: query,
        isDirect: false,
        isGoldStar: false,
        isCertified: false,
        categoryId: 0,
        page: 1,
      }),
    });

    if (!resp.ok) {
      throw new Error(`API returned ${resp.status}`);
    }

    const data = await resp.json();
    loadingEl.style.display = 'none';

    // The API nests results: data.results[0].searchResults[]
    const sellers = (data.results && data.results[0] && data.results[0].searchResults) || [];

    if (sellers.length === 0) {
      emptyEl.style.display = '';
      lastSearchResults = [];
      return;
    }

    lastSearchResults = sellers;
    renderSearchResults(sellers);

  } catch (err) {
    loadingEl.style.display = 'none';
    errorEl.textContent = `Search failed: ${err.message}`;
    errorEl.style.display = '';
  }
}

function renderSearchResults(sellers) {
  const resultsEl = document.getElementById('search-results');
  const emptyEl = document.getElementById('search-empty');

  resultsEl.innerHTML = '';

  if (!sellers || sellers.length === 0) {
    resultsEl.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  resultsEl.style.display = '';

  for (const seller of sellers) {
    // Normalize seller key — the API may return sellerKey, sellerName, or other fields
    const sellerKey = seller.sellerKey || String(seller.sellerId || '');
    const sellerName = seller.displayName || seller.sellerName || 'Unknown';
    const isBanned = bannedSellers.some(s => s.sellerKey === sellerKey);

    const item = document.createElement('div');
    item.className = 'search-result-item';

    if (isBanned) {
      item.innerHTML = `
        <div>
          <div class="search-result-name">${escapeHtml(sellerName)}</div>
        </div>
        <span class="search-result-already">Already banned</span>
      `;
    } else {
      item.innerHTML = `
        <div>
          <div class="search-result-name">${escapeHtml(sellerName)}</div>
        </div>
        <button class="options-btn options-btn-sm options-btn-primary">Ban</button>
      `;
      item.querySelector('button').addEventListener('click', () => addSeller(sellerKey, sellerName));
    }

    resultsEl.appendChild(item);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
