/**
 * Content script entry point.
 * Runs on TCGPlayer cart pages. Injects UI and coordinates with background service worker.
 *
 * Flow:
 *  1. User clicks "Optimize Cart" → reads cart → sends to SW for listing fetch
 *  2. SW fetches listings → sends LISTINGS_READY with available options
 *  3. Content shows config UI (language, condition, max vendors)
 *  4. User clicks "Run Optimizer" → sends SOLVE_WITH_CONFIG to SW
 *  5. SW filters, builds ILP, solves → sends OPTIMIZATION_RESULT
 *  6. User can go back to config and re-solve without re-fetching
 */

import { MSG, STAGE } from '../shared/constants.js';
import { readCart } from './cart-reader.js';
import { applyOptimizedCart, saveCartState } from './cart-modifier.js';
import { injectUI, onStartClick, showPanel, showProgress, showConfig, showResults, showMultiResults, showError } from './results-ui.js';

// Guard against duplicate injection (can happen if content script is injected both
// declaratively via manifest and programmatically for SPA navigations)
if (window.__tcgmizerContentLoaded) {
  console.log('[TCGmizer] Content script already loaded, skipping duplicate injection.');
} else {
  window.__tcgmizerContentLoaded = true;
  __tcgmizerInit();
}

function __tcgmizerInit() {

// Initialize UI (hidden until toggled via popup)
injectUI();

// Inject "Optimize with TCGmizer" button next to TCGPlayer's own optimize button
injectCartButton();

// Handle "Optimize Cart" button click
onStartClick(() => {
  startFetchPhase();
});

/**
 * Inject an "Optimize with TCGmizer" button next to TCGPlayer's optimize button.
 * Uses a MutationObserver since the cart page is an SPA and the button may not exist yet.
 */
function injectCartButton() {
  const BUTTON_ID = 'tcgmizer-cart-btn';

  function tryInject() {
    if (document.getElementById(BUTTON_ID)) return true;

    const optimizeBlock = document.querySelector('.optimize-btn-block');
    if (!optimizeBlock) return false;

    const wrapper = document.createElement('div');
    const blockStyles = getComputedStyle(optimizeBlock);
    wrapper.style.cssText = `
      padding: ${blockStyles.padding};
      margin-top: 12px;
      background: ${blockStyles.background};
      border: ${blockStyles.border};
      border-radius: ${blockStyles.borderRadius};
      box-shadow: ${blockStyles.boxShadow};
    `;

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.textContent = '⚡ Optimize with TCGmizer';
    btn.style.cssText = `
      display: block;
      width: 100%;
      padding: 10px 16px;
      font-size: 16px;
      font-weight: 600;
      color: #fff;
      background: #2e9e5e;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s;
    `;
    btn.addEventListener('mouseenter', () => { btn.style.background = '#258a50'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#2e9e5e'; });
    btn.addEventListener('click', () => {
      showPanel();
      startFetchPhase();
    });

    wrapper.appendChild(btn);
    optimizeBlock.insertAdjacentElement('afterend', wrapper);
    return true;
  }

  // Try immediately, then observe for SPA-rendered content
  if (!tryInject()) {
    const observer = new MutationObserver(() => {
      if (tryInject()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

function startFetchPhase() {
  showProgress('Reading cart...', null, null);

  // Read cart items from the page
  let cartData;
  try {
    cartData = readCart();
  } catch (err) {
    showError(`Error reading cart: ${err.message}`);
    console.error('[TCGmizer] Cart read error:', err);
    return;
  }

  if (!cartData.cartItems || cartData.cartItems.length === 0) {
    const main = document.querySelector('main');
    const articles = main ? main.querySelectorAll('article').length : 0;
    const productLinks = document.querySelectorAll('a[href*="/product/"]').length;
    const listItems = document.querySelectorAll('li').length;
    showError(
      `Could not read cart items. ` +
      `Debug: main=${!!main}, articles=${articles}, productLinks=${productLinks}, li=${listItems}. ` +
      `Make sure you have items in your cart.`
    );
    return;
  }

  // Save current cart for undo
  saveCartState(cartData.cartItems);

  console.log(`[TCGmizer] Read ${cartData.cartItems.length} items from cart, total: $${cartData.currentCartTotal}`);

  // Send to background for listing fetch
  chrome.runtime.sendMessage({
    type: MSG.START_OPTIMIZATION,
    cartData,
  }, (response) => {
    if (chrome.runtime.lastError) {
      showError(`Failed to start: ${chrome.runtime.lastError.message}`);
      return;
    }
    if (response?.error) {
      showError(response.error);
    }
  });
}

function handleSolveWithConfig(config) {
  showProgress('Optimizing...', null, null);

  chrome.runtime.sendMessage({
    type: MSG.SOLVE_WITH_CONFIG,
    config,
  }, (response) => {
    if (chrome.runtime.lastError) {
      showError(`Failed to start solver: ${chrome.runtime.lastError.message}`);
      return;
    }
    if (response?.error) {
      showError(response.error);
    }
  });
}

// Listen for messages from the background service worker and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'PING':
      sendResponse({ ok: true });
      return false;

    case MSG.TOGGLE_PANEL: {
      const panel = document.getElementById('tcgmizer-panel');
      if (panel) {
        if (panel.style.display === 'none' || panel.style.display === '') {
          panel.style.display = 'flex';
          // Auto-start fetching when panel is shown
          startFetchPhase();
        } else {
          panel.style.display = 'none';
        }
      }
      sendResponse({ ok: true });
      break;
    }

    case MSG.OPTIMIZATION_PROGRESS:
      showProgress(
        message.message || `${message.stage}...`,
        message.current,
        message.total
      );
      break;

    case MSG.LISTINGS_READY:
      showConfig(message.options, handleSolveWithConfig);
      break;

    case MSG.OPTIMIZATION_RESULT:
      showResults(message.result, handleApply);
      break;

    case MSG.OPTIMIZATION_MULTI_RESULT:
      showMultiResults(message.results, handleApply);
      break;

    case MSG.OPTIMIZATION_ERROR:
      showError(message.error || 'An unknown error occurred.');
      break;
  }

  return false;
});

async function handleApply(result) {
  showProgress('Applying optimized cart...', null, null);

  const applyResult = await applyOptimizedCart(result);

  if (!applyResult.success) {
    showError(`Failed to apply cart: ${applyResult.error}`);
    return;
  }

  if (applyResult.partial) {
    const added = applyResult.totalCount - applyResult.failCount;
    const fbCount = applyResult.fallbackCount || 0;
    let msg = '';

    if (fbCount > 0) {
      msg += `${fbCount} item(s) were sold out and replaced with the next-cheapest listing:\n`;
      for (const fb of (applyResult.fallbackItems || [])) {
        msg += `  \u2022 ${fb.cardName}: $${fb.originalPrice} \u2192 $${fb.fallbackPrice} (${fb.fallbackSellerName})\n`;
      }
      msg += `\nYou may want to re-optimize your cart to find a better overall price.\n\n`;
    }

    if (applyResult.failCount > 0) {
      msg += `${applyResult.failCount} item(s) could not be added:\n`;
      for (const fi of applyResult.failedItems) {
        const set = fi.setName ? ` (${fi.setName})` : '';
        msg += `  \u2022 ${fi.cardName}${set}: ${fi.reason}\n`;
      }
      msg += `\nYou may need to add the missing items manually.\n`;
    }

    msg += `\nAdded ${added} of ${applyResult.totalCount} items. The page will reload.`;
    alert(msg);
  }

  window.location.reload();
}

console.log('[TCGmizer] Content script loaded on cart page.');

} // end __tcgmizerInit
