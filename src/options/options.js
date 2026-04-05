// TCGmizer Options page — Vendor ban list & card exclusion management

const STORAGE_KEY = 'bannedSellers';
const CARD_EXCLUSIONS_KEY = 'cardExclusions';
const DEFAULT_CARD_EXCLUSIONS = ['(Display Commander)', '(Art Series)'];
const SELLER_SEARCH_URL = 'https://mpapi.tcgplayer.com/v2/ShopBySeller/GetSellerSearchResults';

let bannedSellers = []; // { sellerKey, sellerName, comment? }
let cardExclusions = []; // string[]

document.addEventListener('DOMContentLoaded', async () => {
  await loadBanList();
  renderBanList();

  await loadCardExclusions();
  renderCardExclusions();

  const searchInput = document.getElementById('seller-search');
  const searchBtn = document.getElementById('search-btn');

  searchBtn.addEventListener('click', () => doSearch());
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  const exclusionInput = document.getElementById('card-exclusion-input');
  const exclusionAddBtn = document.getElementById('card-exclusion-add-btn');

  exclusionAddBtn.addEventListener('click', () => addCardExclusion());
  exclusionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addCardExclusion();
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
      <div class="ban-list-info">
        <span class="ban-list-name">${escapeHtml(seller.sellerName)}</span>
        <input type="text" class="ban-list-comment" placeholder="Add a note..." value="${escapeHtml(seller.comment || '')}" />
      </div>
      <button class="options-btn options-btn-danger" data-key="${escapeHtml(seller.sellerKey)}">Remove</button>
    `;
    item.querySelector('button').addEventListener('click', () => removeSeller(seller.sellerKey));
    const commentInput = item.querySelector('.ban-list-comment');
    let debounceTimer;
    commentInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => updateComment(seller.sellerKey, commentInput.value), 400);
    });
    listEl.appendChild(item);
  }
}

async function removeSeller(sellerKey) {
  bannedSellers = bannedSellers.filter(s => s.sellerKey !== sellerKey);
  await saveBanList();
  renderBanList();
}

async function updateComment(sellerKey, comment) {
  const seller = bannedSellers.find(s => s.sellerKey === sellerKey);
  if (!seller) return;
  seller.comment = comment;
  await saveBanList();
}

async function addSeller(sellerKey, sellerName) {
  if (bannedSellers.some(s => s.sellerKey === sellerKey)) return;
  bannedSellers.push({ sellerKey, sellerName, comment: '' });
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

// --- Card Exclusions ---

async function loadCardExclusions() {
  const data = await chrome.storage.sync.get(CARD_EXCLUSIONS_KEY);
  cardExclusions = data[CARD_EXCLUSIONS_KEY] ?? [...DEFAULT_CARD_EXCLUSIONS];
}

async function saveCardExclusions() {
  await chrome.storage.sync.set({ [CARD_EXCLUSIONS_KEY]: cardExclusions });
}

function renderCardExclusions() {
  const listEl = document.getElementById('card-exclusion-list');
  const emptyEl = document.getElementById('card-exclusion-list-empty');
  const countEl = document.getElementById('card-exclusion-count');

  listEl.querySelectorAll('.card-exclusion-item').forEach(el => el.remove());

  countEl.textContent = cardExclusions.length > 0 ? `(${cardExclusions.length})` : '';

  if (cardExclusions.length === 0) {
    emptyEl.style.display = '';
    return;
  }

  emptyEl.style.display = 'none';

  for (let i = 0; i < cardExclusions.length; i++) {
    const pattern = cardExclusions[i];
    const item = document.createElement('div');
    item.className = 'card-exclusion-item';
    item.innerHTML = `
      <span class="ban-list-name">${escapeHtml(pattern)}</span>
      <button class="options-btn options-btn-danger" data-idx="${i}">Remove</button>
    `;
    item.querySelector('button').addEventListener('click', () => removeCardExclusion(i));
    listEl.appendChild(item);
  }
}

async function removeCardExclusion(idx) {
  cardExclusions.splice(idx, 1);
  await saveCardExclusions();
  renderCardExclusions();
}

async function addCardExclusion() {
  const input = document.getElementById('card-exclusion-input');
  const val = input.value.trim();
  if (!val) return;
  if (cardExclusions.some(p => p.toLowerCase() === val.toLowerCase())) {
    input.value = '';
    return;
  }
  cardExclusions.push(val);
  await saveCardExclusions();
  renderCardExclusions();
  input.value = '';
  input.focus();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
