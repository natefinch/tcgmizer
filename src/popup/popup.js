// Popup script — toggles the optimizer panel on the cart page
document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status-text');
  const toggleBtn = document.getElementById('toggle-btn');

  // Settings button — always available
  document.getElementById('settings-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // Clear seller cache button
  const clearCacheBtn = document.getElementById('clear-cache-btn');
  clearCacheBtn.addEventListener('click', async () => {
    clearCacheBtn.disabled = true;
    clearCacheBtn.textContent = 'Clearing...';
    try {
      await chrome.runtime.sendMessage({ type: 'CLEAR_SELLER_CACHE' });
      clearCacheBtn.textContent = 'Cache Cleared!';
      setTimeout(() => {
        clearCacheBtn.textContent = 'Clear Seller Cache';
        clearCacheBtn.disabled = false;
      }, 1500);
    } catch (err) {
      console.error('[TCGmizer Popup] Failed to clear cache:', err);
      clearCacheBtn.textContent = 'Clear Seller Cache';
      clearCacheBtn.disabled = false;
    }
  });

  // Clear printings cache button
  const clearPrintingsBtn = document.getElementById('clear-printings-cache-btn');
  clearPrintingsBtn.addEventListener('click', async () => {
    clearPrintingsBtn.disabled = true;
    clearPrintingsBtn.textContent = 'Clearing...';
    try {
      await chrome.runtime.sendMessage({ type: 'CLEAR_PRINTINGS_CACHE' });
      clearPrintingsBtn.textContent = 'Cache Cleared!';
      setTimeout(() => {
        clearPrintingsBtn.textContent = 'Clear Printings Cache';
        clearPrintingsBtn.disabled = false;
      }, 1500);
    } catch (err) {
      console.error('[TCGmizer Popup] Failed to clear printings cache:', err);
      clearPrintingsBtn.textContent = 'Clear Printings Cache';
      clearPrintingsBtn.disabled = false;
    }
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const isCartPage = tab && tab.url && tab.url.includes('tcgplayer.com/cart');

    if (isCartPage) {
      statusEl.textContent = 'On cart page';
      toggleBtn.disabled = false;

      toggleBtn.addEventListener('click', async () => {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
        } catch (err) {
          // Content script not loaded (SPA navigation) — inject it first
          console.log('[TCGmizer Popup] Content script not found, injecting...', err);
          try {
            await chrome.scripting.insertCSS({
              target: { tabId: tab.id },
              files: ['results-ui.css'],
            });
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js'],
            });
            // Give the content script a moment to initialize
            await new Promise((r) => setTimeout(r, 200));
            await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
          } catch (injectErr) {
            console.error('[TCGmizer Popup] Failed to inject content script:', injectErr);
          }
        }
        window.close();
      });
    } else {
      statusEl.textContent = 'Navigate to TCGPlayer cart';
      statusEl.classList.add('inactive');
      toggleBtn.disabled = true;
    }
  });
});
