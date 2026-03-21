/**
 * Content script: Results UI overlay for the TCGPlayer cart page.
 * Shows optimization progress, results, and apply/undo controls.
 */

import { STAGE } from '../shared/constants.js';

const PANEL_ID = 'tcgmizer-panel';

/**
 * Create and inject the TCGmizer UI panel into the page.
 */
export function injectUI() {
  if (document.getElementById(PANEL_ID)) return;

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div class="tcgmizer-header">
      <span class="tcgmizer-logo">⚡ TCGmizer</span>
      <button class="tcgmizer-close" title="Close">&times;</button>
    </div>
    <div class="tcgmizer-body">
      <div class="tcgmizer-idle">
        <p>Optimize your cart using integer linear programming to find the mathematically cheapest combination of sellers.</p>
        <button class="tcgmizer-btn tcgmizer-btn-primary tcgmizer-start">Optimize Cart</button>
      </div>
      <div class="tcgmizer-progress" style="display:none">
        <div class="tcgmizer-spinner"></div>
        <p class="tcgmizer-progress-text">Starting...</p>
        <div class="tcgmizer-progress-bar-container">
          <div class="tcgmizer-progress-bar"></div>
        </div>
      </div>
      <div class="tcgmizer-config" style="display:none"></div>
      <div class="tcgmizer-results" style="display:none"></div>
      <div class="tcgmizer-error" style="display:none">
        <p class="tcgmizer-error-text"></p>
        <button class="tcgmizer-btn tcgmizer-retry">Try Again</button>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  // --- Drag to move ---
  const header = panel.querySelector('.tcgmizer-header');
  let dragging = false, dragX = 0, dragY = 0;

  header.addEventListener('mousedown', (e) => {
    // Don't drag if clicking the close button
    if (e.target.closest('.tcgmizer-close')) return;
    dragging = true;
    dragX = e.clientX - panel.offsetLeft;
    dragY = e.clientY - panel.offsetTop;
    header.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panel.style.left = (e.clientX - dragX) + 'px';
    panel.style.top = (e.clientY - dragY) + 'px';
    panel.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      header.style.cursor = '';
    }
  });

  // Event listeners
  panel.querySelector('.tcgmizer-close').addEventListener('click', () => {
    panel.style.display = 'none';
  });

  panel.querySelector('.tcgmizer-start').addEventListener('click', () => {
    if (typeof panel._onStart === 'function') panel._onStart();
  });

  panel.querySelector('.tcgmizer-retry').addEventListener('click', () => {
    // If config has been shown (listings already fetched), go back to config
    // instead of re-fetching everything
    if (panel._hasConfig) {
      hide(panel, '.tcgmizer-error');
      show(panel, '.tcgmizer-config');
    } else if (typeof panel._onStart === 'function') {
      panel._onStart();
    }
  });

}

/**
 * Set the callback for when the user clicks "Optimize Cart".
 */
export function onStartClick(callback) {
  const panel = document.getElementById(PANEL_ID);
  if (panel) panel._onStart = callback;
}

/**
 * Show the panel.
 */
export function showPanel() {
  const panel = document.getElementById(PANEL_ID);
  if (panel) panel.style.display = 'flex';
}

/**
 * Show progress state.
 */
export function showProgress(message, current, total) {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;

  hide(panel, '.tcgmizer-idle');
  hide(panel, '.tcgmizer-config');
  hide(panel, '.tcgmizer-results');
  hide(panel, '.tcgmizer-error');
  show(panel, '.tcgmizer-progress');

  panel.querySelector('.tcgmizer-progress-text').textContent = message || 'Working...';

  const bar = panel.querySelector('.tcgmizer-progress-bar');
  if (current != null && total != null && total > 0) {
    bar.style.width = `${Math.round((current / total) * 100)}%`;
    bar.classList.remove('tcgmizer-progress-bar-indeterminate');
  } else {
    bar.style.width = '100%';
    bar.classList.add('tcgmizer-progress-bar-indeterminate');
  }
}

/**
 * Show the configuration UI after listings are fetched.
 * @param {Object} options - Available options from the fetched listings
 * @param {Function} onSolve - Callback with config object when user clicks "Run Optimizer"
 */
export function showConfig(options, onSolve) {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;

  // Track that config has been shown (listings are cached)
  panel._hasConfig = true;

  hide(panel, '.tcgmizer-idle');
  hide(panel, '.tcgmizer-progress');
  hide(panel, '.tcgmizer-results');
  hide(panel, '.tcgmizer-error');
  show(panel, '.tcgmizer-config');

  const configDiv = panel.querySelector('.tcgmizer-config');

  // Build language checkboxes
  const langCheckboxes = options.languages.map(lang => {
    const checked = lang === 'English' ? 'checked' : '';
    return `<label class="tcgmizer-checkbox-label">
      <input type="checkbox" value="${escapeHtml(lang)}" ${checked} /> ${escapeHtml(lang)}
    </label>`;
  }).join('');

  // Build condition checkboxes (all checked by default, except Damaged)
  const condCheckboxes = options.conditions.map(cond => {
    const checked = cond === 'Damaged' ? '' : 'checked';
    return `<label class="tcgmizer-checkbox-label">
      <input type="checkbox" value="${escapeHtml(cond)}" ${checked} /> ${escapeHtml(cond)}
    </label>`;
  }).join('');

  configDiv.innerHTML = `
    <div class="tcgmizer-config-summary">
      Found ${options.listingCount.toLocaleString()} listings from ${options.sellerCount.toLocaleString()} sellers for ${options.cardCount} card${options.cardCount !== 1 ? 's' : ''}.
    </div>

    <div class="tcgmizer-config-section">
      <div class="tcgmizer-config-label">Language</div>
      <div class="tcgmizer-config-options tcgmizer-lang-options">
        ${langCheckboxes}
      </div>
      <div class="tcgmizer-select-actions">
        <a href="#" class="tcgmizer-select-all" data-target="lang">Select all</a> ·
        <a href="#" class="tcgmizer-select-none" data-target="lang">Select none</a>
      </div>
    </div>

    <div class="tcgmizer-config-section">
      <label class="tcgmizer-checkbox-label">
        <input type="checkbox" class="tcgmizer-exact-printings" /> Exact printings only
      </label>
      <span class="tcgmizer-config-hint">When unchecked, finds the cheapest printing of each card across all sets</span>
    </div>

    <div class="tcgmizer-config-section">
      <div class="tcgmizer-config-label">Condition</div>
      <div class="tcgmizer-config-options tcgmizer-cond-options">
        ${condCheckboxes}
      </div>
      <div class="tcgmizer-select-actions">
        <a href="#" class="tcgmizer-select-all" data-target="cond">Select all</a> ·
        <a href="#" class="tcgmizer-select-none" data-target="cond">Select none</a>
      </div>
    </div>

    <div class="tcgmizer-config-section">
      <label class="tcgmizer-checkbox-label tcgmizer-minimize-vendors-label">
        <input type="checkbox" class="tcgmizer-minimize-vendors" /> Minimize Number of Vendors
      </label>
      <div class="tcgmizer-max-cuts-row" style="margin-top:6px;margin-left:22px;display:flex;align-items:center;gap:6px;">
        <label class="tcgmizer-config-hint" style="margin:0;white-space:nowrap;">Try cutting up to</label>
        <select class="tcgmizer-max-cuts" disabled style="width:48px;padding:2px 4px;border-radius:4px;border:1px solid #ccc;font-size:13px;">
          <option value="0">0</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
        </select>
        <span class="tcgmizer-config-hint" style="margin:0;">cards to reduce vendors</span>
      </div>
    </div>

    <div class="tcgmizer-config-section tcgmizer-ban-section">
      <label class="tcgmizer-checkbox-label">
        <input type="checkbox" class="tcgmizer-exclude-banned" checked disabled /> Exclude banned vendors <span class="tcgmizer-ban-count-label">(loading...)</span>
      </label>
      <a href="#" class="tcgmizer-manage-ban-link" style="font-size:12px;color:#2e9e5e;margin-left:4px;text-decoration:none;cursor:pointer;">Manage</a>
    </div>

    <div class="tcgmizer-config-actions">
      <button class="tcgmizer-btn tcgmizer-btn-primary tcgmizer-run-solver">Run Optimizer</button>
      <button class="tcgmizer-btn tcgmizer-refetch">Re-fetch Listings</button>
    </div>
  `;

  // Restore saved optimizer settings (if any)
  chrome.storage.local.get('optimizerSettings', (data) => {
    const saved = data.optimizerSettings;
    if (!saved) return;

    // Restore language checkboxes
    if (saved.languages && saved.languages.length > 0) {
      configDiv.querySelectorAll('.tcgmizer-lang-options input[type="checkbox"]').forEach(cb => {
        cb.checked = saved.languages.includes(cb.value);
      });
    }

    // Restore condition checkboxes
    if (saved.conditions && saved.conditions.length > 0) {
      configDiv.querySelectorAll('.tcgmizer-cond-options input[type="checkbox"]').forEach(cb => {
        cb.checked = saved.conditions.includes(cb.value);
      });
    }

    // Restore toggles
    if (saved.minimizeVendors != null) {
      configDiv.querySelector('.tcgmizer-minimize-vendors').checked = saved.minimizeVendors;
      configDiv.querySelector('.tcgmizer-max-cuts').disabled = !saved.minimizeVendors;
    }
    if (saved.maxCuts != null) {
      configDiv.querySelector('.tcgmizer-max-cuts').value = String(saved.maxCuts);
    }
    if (saved.exactPrintings != null) {
      configDiv.querySelector('.tcgmizer-exact-printings').checked = saved.exactPrintings;
    }
  });

  // Load banned sellers and update the checkbox
  function updateBanUI(banned) {
    const checkbox = configDiv.querySelector('.tcgmizer-exclude-banned');
    const label = configDiv.querySelector('.tcgmizer-ban-count-label');
    if (!checkbox || !label) return;
    if (banned.length === 0) {
      checkbox.checked = false;
      checkbox.disabled = true;
      label.textContent = '(none banned)';
    } else {
      checkbox.disabled = false;
      checkbox.checked = true;
      label.textContent = `(${banned.length} banned)`;
    }
    checkbox._bannedKeys = banned.map(s => s.sellerKey);
  }

  chrome.storage.sync.get('bannedSellers', (data) => {
    updateBanUI(data.bannedSellers || []);
  });

  // Live-update when ban list changes (e.g. user edits it in the options page)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.bannedSellers) {
      updateBanUI(changes.bannedSellers.newValue || []);
    }
  });

  // Manage ban list link
  configDiv.querySelector('.tcgmizer-manage-ban-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE' });
  });

  // Select all / none links
  configDiv.querySelectorAll('.tcgmizer-select-all').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = a.dataset.target;
      configDiv.querySelectorAll(`.tcgmizer-${target}-options input[type="checkbox"]`).forEach(cb => cb.checked = true);
    });
  });
  configDiv.querySelectorAll('.tcgmizer-select-none').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = a.dataset.target;
      configDiv.querySelectorAll(`.tcgmizer-${target}-options input[type="checkbox"]`).forEach(cb => cb.checked = false);
    });
  });

  // Enable/disable max cuts picker based on minimize vendors checkbox
  configDiv.querySelector('.tcgmizer-minimize-vendors').addEventListener('change', (e) => {
    configDiv.querySelector('.tcgmizer-max-cuts').disabled = !e.target.checked;
  });

  // Run Optimizer button
  configDiv.querySelector('.tcgmizer-run-solver').addEventListener('click', () => {
    const selectedLangs = [...configDiv.querySelectorAll('.tcgmizer-lang-options input:checked')].map(cb => cb.value);
    const selectedConds = [...configDiv.querySelectorAll('.tcgmizer-cond-options input:checked')].map(cb => cb.value);
    const minimizeVendors = configDiv.querySelector('.tcgmizer-minimize-vendors').checked;
    const maxCuts = parseInt(configDiv.querySelector('.tcgmizer-max-cuts').value, 10) || 0;
    const exactPrintings = configDiv.querySelector('.tcgmizer-exact-printings').checked;

    const excludeBannedCheckbox = configDiv.querySelector('.tcgmizer-exclude-banned');
    const bannedSellerKeys = (excludeBannedCheckbox.checked && excludeBannedCheckbox._bannedKeys) ? excludeBannedCheckbox._bannedKeys : [];

    if (selectedLangs.length === 0) {
      alert('Please select at least one language.');
      return;
    }
    if (selectedConds.length === 0) {
      alert('Please select at least one condition.');
      return;
    }

    // Save selections for next time
    chrome.storage.local.set({
      optimizerSettings: {
        languages: selectedLangs,
        conditions: selectedConds,
        minimizeVendors,
        maxCuts,
        exactPrintings,
      },
    });

    const config = {
      languages: selectedLangs.length === options.languages.length ? [] : selectedLangs,
      conditions: selectedConds.length === options.conditions.length ? [] : selectedConds,
      minimizeVendors,
      maxCuts: minimizeVendors ? maxCuts : 0,
      exactPrintings,
      bannedSellerKeys,
    };

    if (typeof onSolve === 'function') onSolve(config);
  });

  // Re-fetch button
  configDiv.querySelector('.tcgmizer-refetch').addEventListener('click', () => {
    if (typeof panel._onStart === 'function') panel._onStart();
  });
}

/**
 * Show optimization results.
 */
export function showResults(result, onApply) {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;

  hide(panel, '.tcgmizer-idle');
  hide(panel, '.tcgmizer-progress');
  hide(panel, '.tcgmizer-config');
  hide(panel, '.tcgmizer-error');
  show(panel, '.tcgmizer-results');

  const resultsDiv = panel.querySelector('.tcgmizer-results');

  if (!result.success) {
    resultsDiv.innerHTML = `
      <div class="tcgmizer-result-error">
        <p>Optimization failed: ${escapeHtml(result.error)}</p>
      </div>
    `;
    return;
  }

  const savingsClass = result.savings > 0 ? 'tcgmizer-savings-positive' : 'tcgmizer-savings-neutral';
  const savingsText = result.savings > 0
    ? `Save $${result.savings.toFixed(2)}!`
    : result.savings === 0
      ? 'Same price (but possibly fewer packages)'
      : `$${Math.abs(result.savings).toFixed(2)} more (current cart is already optimal)`;

  let sellersHtml = '';
  for (const seller of result.sellers) {
    sellersHtml += renderSellerBlock(seller, true);
  }

  resultsDiv.innerHTML = `
    <div class="tcgmizer-summary">
      <div class="tcgmizer-summary-row">
        <span>Current cart:</span>
        <span>$${result.currentCartTotal.toFixed(2)}</span>
      </div>
      <div class="tcgmizer-summary-row">
        <span>Optimized total:</span>
        <span class="tcgmizer-optimized-total">$${result.totalCost.toFixed(2)}</span>
      </div>
      <div class="tcgmizer-summary-row tcgmizer-summary-detail">
        <span>Items: $${result.totalItemCost.toFixed(2)} · Shipping: $${result.totalShipping.toFixed(2)}</span>
      </div>
      <div class="tcgmizer-summary-row ${savingsClass}">
        <span>${savingsText}</span>
      </div>
      <div class="tcgmizer-summary-row">
        <span>${result.itemCount} items from ${result.sellerCount} seller${result.sellerCount !== 1 ? 's' : ''}</span>
      </div>
    </div>
    <div class="tcgmizer-actions">
      <button class="tcgmizer-btn tcgmizer-btn-primary tcgmizer-apply">Apply to Cart</button>
      <button class="tcgmizer-btn tcgmizer-back-to-config">Change Settings</button>
    </div>
    <div class="tcgmizer-sellers-list">${sellersHtml}</div>
  `;

  // Apply button
  resultsDiv.querySelector('.tcgmizer-apply').addEventListener('click', () => {
    if (confirm('This will replace your current TCGPlayer cart with the optimized selections. This cannot be undone! Continue?')) {
      if (typeof onApply === 'function') onApply(result);
    }
  });

  // Back to config button — re-show the config panel (which is still in DOM)
  resultsDiv.querySelector('.tcgmizer-back-to-config').addEventListener('click', () => {
    hide(panel, '.tcgmizer-results');
    show(panel, '.tcgmizer-config');
  });
}

/**
 * Show multiple optimization results for vendor minimization comparison.
 */
export function showMultiResults(results, onApply) {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;

  hide(panel, '.tcgmizer-idle');
  hide(panel, '.tcgmizer-progress');
  hide(panel, '.tcgmizer-config');
  hide(panel, '.tcgmizer-error');
  show(panel, '.tcgmizer-results');

  const resultsDiv = panel.querySelector('.tcgmizer-results');

  if (!results || results.length === 0) {
    resultsDiv.innerHTML = `
      <div class="tcgmizer-result-error">
        <p>No feasible solutions found.</p>
      </div>
    `;
    return;
  }

  const cheapest = results[results.length - 1]; // most vendors = cheapest

  let rowsHtml = '';
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const extraCost = r.totalCost - cheapest.totalCost;
    const extraText = extraCost > 0.005 ? `+$${extraCost.toFixed(2)}` : 'Cheapest';
    const extraClass = extraCost > 0.005 ? '' : 'tcgmizer-cheapest-tag';

    // Show cut cards indicator if any
    const cutInfo = r.cutCards && r.cutCards.length > 0
      ? `<div class="tcgmizer-cut-info" title="${escapeHtml(r.cutCards.join(' · '))}">✂️ Cut ${r.cutCards.length} card${r.cutCards.length !== 1 ? 's' : ''}: ${escapeHtml(r.cutCards.join(' · '))}</div>`
      : '';

    // Build the expandable detail (seller breakdown)
    let detailHtml = '';
    for (const seller of r.sellers) {
      detailHtml += renderSellerBlock(seller, false);
    }

    rowsHtml += `
      <div class="tcgmizer-compare-row" data-index="${i}">
        <div class="tcgmizer-compare-row-summary">
          <span class="tcgmizer-compare-vendors">${r.sellerCount} vendor${r.sellerCount !== 1 ? 's' : ''}</span>
          <span class="tcgmizer-compare-price">$${r.totalCost.toFixed(2)}</span>
          <span class="tcgmizer-compare-extra ${extraClass}">${extraText}</span>
          <button class="tcgmizer-btn tcgmizer-btn-primary tcgmizer-compare-apply">Apply</button>
          <span class="tcgmizer-compare-toggle">▶</span>
        </div>
        ${cutInfo}
        <div class="tcgmizer-compare-detail" style="display:none">
          <div class="tcgmizer-summary-row tcgmizer-summary-detail" style="margin-bottom:8px">
            Items: $${r.totalItemCost.toFixed(2)} · Shipping: $${r.totalShipping.toFixed(2)}
          </div>
          <div class="tcgmizer-sellers-list">${detailHtml}</div>
        </div>
      </div>
    `;
  }

  const currentTotal = results[0].currentCartTotal;
  const bestSavings = currentTotal - cheapest.totalCost;
  const savingsText = bestSavings > 0
    ? `Best savings: $${bestSavings.toFixed(2)}`
    : 'Current cart is already near optimal';

  resultsDiv.innerHTML = `
    <div class="tcgmizer-summary">
      <div class="tcgmizer-summary-row">
        <span>Current cart:</span>
        <span>$${currentTotal.toFixed(2)}</span>
      </div>
      <div class="tcgmizer-summary-row tcgmizer-savings-positive">
        <span>${savingsText}</span>
      </div>
      <div class="tcgmizer-summary-row">
        <span>Found ${results.length} option${results.length !== 1 ? 's' : ''} — click a row to see details</span>
      </div>
    </div>
    <div class="tcgmizer-compare-table">${rowsHtml}</div>
    <div class="tcgmizer-actions" style="margin-top:12px">
      <button class="tcgmizer-btn tcgmizer-back-to-config">Change Settings</button>
    </div>
  `;

  // Toggle expand/collapse on row click
  resultsDiv.querySelectorAll('.tcgmizer-compare-row').forEach(row => {
    const summary = row.querySelector('.tcgmizer-compare-row-summary');
    const detail = row.querySelector('.tcgmizer-compare-detail');
    const toggle = row.querySelector('.tcgmizer-compare-toggle');

    summary.addEventListener('click', (e) => {
      // Don't toggle when clicking Apply button
      if (e.target.closest('.tcgmizer-compare-apply')) return;

      const isOpen = detail.style.display !== 'none';
      detail.style.display = isOpen ? 'none' : 'block';
      toggle.textContent = isOpen ? '▶' : '▼';
      row.classList.toggle('tcgmizer-compare-row-expanded', !isOpen);
    });
  });

  // Apply buttons
  resultsDiv.querySelectorAll('.tcgmizer-compare-apply').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.closest('.tcgmizer-compare-row').dataset.index, 10);
      const result = results[idx];
      if (confirm(`Apply cart with ${result.sellerCount} vendor${result.sellerCount !== 1 ? 's' : ''} ($${result.totalCost.toFixed(2)})? This will replace your current TCGPlayer cart. This cannot be undone!`)) {
        if (typeof onApply === 'function') onApply(result);
      }
    });
  });

  // Back to config
  resultsDiv.querySelector('.tcgmizer-back-to-config').addEventListener('click', () => {
    hide(panel, '.tcgmizer-results');
    show(panel, '.tcgmizer-config');
  });
}

/**
 * Show error state.
 */
export function showError(errorMessage) {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;

  hide(panel, '.tcgmizer-idle');
  hide(panel, '.tcgmizer-progress');
  hide(panel, '.tcgmizer-config');
  hide(panel, '.tcgmizer-results');
  show(panel, '.tcgmizer-error');

  panel.querySelector('.tcgmizer-error-text').textContent = errorMessage;
}

// --- Helpers ---

function show(parent, selector) {
  const el = parent.querySelector(selector);
  if (el) el.style.display = 'block';
}

function hide(parent, selector) {
  const el = parent.querySelector(selector);
  if (el) el.style.display = 'none';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const CONDITION_ABBREVS = {
  'Near Mint': 'NM',
  'Lightly Played': 'LP',
  'Moderately Played': 'MP',
  'Heavily Played': 'HP',
  'Damaged': 'DMG',
  'Mint': 'M',
  'Near Mint Foil': 'NM-F',
  'Lightly Played Foil': 'LP-F',
  'Moderately Played Foil': 'MP-F',
  'Heavily Played Foil': 'HP-F',
  'Damaged Foil': 'DMG-F',
};

function abbreviateCondition(condition) {
  if (!condition) return '';
  return CONDITION_ABBREVS[condition] || condition;
}

/**
 * Strip the game name (e.g. ", Magic: The Gathering") and trailing rarity/number
 * from a set name string like "Lorwyn Eclipsed, Magic: The Gathering, R, 349".
 * Returns just the set name portion.
 */
/**
 * Render a seller block (used in both single-result and multi-result views).
 * Handles TCGPlayer Direct styling when seller.isDirect is true.
 */
function renderSellerBlock(seller, showChanged) {
  const grouped = groupItems(seller.items);
  const itemsHtml = renderGroupedItems(grouped, showChanged);

  const shippingLabel = seller.freeShipping
    ? '<span class="tcgmizer-free-shipping">FREE shipping</span>'
    : `Shipping: $${seller.shippingCost.toFixed(2)}`;

  const directClass = seller.isDirect ? ' tcgmizer-seller-direct' : '';
  const sellerNameHtml = seller.isDirect
    ? `<img src="https://mp-assets.tcgplayer.com/img/direct-icon-new.svg" alt="Direct" style="height:14px;vertical-align:middle;margin-right:4px" />${escapeHtml(seller.sellerName)}`
    : escapeHtml(seller.sellerName);

  return `
    <div class="tcgmizer-seller${directClass}">
      <div class="tcgmizer-seller-header">
        <span class="tcgmizer-seller-name">${sellerNameHtml}</span>
        <span class="tcgmizer-seller-total">$${seller.sellerTotal.toFixed(2)}</span>
      </div>
      <div class="tcgmizer-seller-meta">
        ${seller.items.length} item${seller.items.length !== 1 ? 's' : ''} · 
        Subtotal: $${seller.subtotal.toFixed(2)} · ${shippingLabel}
      </div>
      <div class="tcgmizer-seller-items">${itemsHtml}</div>
    </div>
  `;
}

/**
 * Group identical items (same productId, condition, language, price) into
 * { item, qty } entries so we can show "×2" instead of duplicate rows.
 */
function groupItems(items) {
  const groups = [];
  const keyMap = new Map(); // key → index in groups
  for (const item of items) {
    const key = `${item.productId}|${item.condition}|${item.language}|${item.price}|${item.productConditionId}`;
    if (keyMap.has(key)) {
      groups[keyMap.get(key)].qty += 1;
    } else {
      keyMap.set(key, groups.length);
      groups.push({ item, qty: 1 });
    }
  }
  return groups;
}

/**
 * Render grouped items to HTML.
 * @param {Array<{item, qty}>} groups
 * @param {boolean} showChanged - whether to show the printing-changed indicator
 */
function renderGroupedItems(groups, showChanged) {
  return groups.map(({ item, qty }) => {
    const changed = showChanged && item.printingChanged
      ? ` <span class="tcgmizer-changed" title="Different printing (originally ${escapeHtml(cleanSetName(item.originalSetName) || 'unknown set')})">🔀</span>`
      : '';
    const qtyBadge = qty > 1 ? `<span class="tcgmizer-item-qty">${qty}×</span> ` : '';
    const details = [abbreviateCondition(item.condition), cleanSetName(item.setName), item.language].filter(Boolean).join(' · ');
    const imgUrl = `https://tcgplayer-cdn.tcgplayer.com/product/${item.productId}_200w.jpg`;
    const priceText = qty > 1 ? `$${item.price.toFixed(2)} ea` : `$${item.price.toFixed(2)}`;
    return `
      <div class="tcgmizer-item">
        <img class="tcgmizer-item-img" src="${imgUrl}" alt="${escapeHtml(item.cardName)}" loading="lazy" />
        <div class="tcgmizer-item-info">
          <span class="tcgmizer-item-name">${qtyBadge}${escapeHtml(item.cardName)}${changed}</span>
          <span class="tcgmizer-item-details">${escapeHtml(details)}</span>
        </div>
        <span class="tcgmizer-item-price">${priceText}</span>
      </div>
    `;
  }).join('');
}

function cleanSetName(setName) {
  if (!setName) return '';
  // Cart-reader set strings look like "SetName, Game Name, Rarity, CollectorNum"
  // API set strings are usually just the set name already
  const parts = setName.split(',').map(s => s.trim());
  if (parts.length <= 1) return setName;
  // Filter out known game names and short rarity/number tokens
  const dominated = ['Magic: The Gathering', 'Pokemon', 'Yu-Gi-Oh', 'Yu-Gi-Oh!', 'Flesh and Blood', 'Lorcana', 'One Piece Card Game', 'Dragon Ball Super Card Game', 'Digimon Card Game', 'MetaZoo', 'Final Fantasy', 'Cardfight!! Vanguard', 'Weiss Schwarz', 'Star Wars: Unlimited'];
  const domSet = new Set(dominated.map(d => d.toLowerCase()));
  const filtered = parts.filter(p => {
    if (domSet.has(p.toLowerCase())) return false;
    // Drop pure rarity codes (single letters) and collector numbers
    if (/^[A-Z]$/.test(p) || /^\d+$/.test(p)) return false;
    return true;
  });
  return filtered.join(', ') || parts[0];
}
