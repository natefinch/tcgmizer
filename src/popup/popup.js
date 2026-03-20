// Popup script — toggles the optimizer panel on the cart page
document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status-text');
  const toggleBtn = document.getElementById('toggle-btn');

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const isCartPage = tab && tab.url && tab.url.includes('tcgplayer.com/cart');

    if (isCartPage) {
      statusEl.textContent = 'On cart page';
      toggleBtn.disabled = false;

      toggleBtn.addEventListener('click', () => {
        chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' }, () => {
          window.close();
        });
      });
    } else {
      statusEl.textContent = 'Navigate to TCGPlayer cart';
      statusEl.classList.add('inactive');
      toggleBtn.disabled = true;
    }
  });
});
