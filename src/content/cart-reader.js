/**
 * Content script: reads cart items from TCGPlayer's cart page.
 * Extracts product IDs, card names, conditions, quantities, and current prices.
 *
 * Uses a product-link-centric approach: find all product links in the cart,
 * then walk up to the containing list item to extract associated data.
 * This is robust against wrapper divs and class name changes.
 */

/**
 * Read the current cart from the TCGPlayer cart page DOM.
 * @returns {{ cartItems: Array<CartItem>, currentCartTotal: number }}
 */
export function readCart() {
  const cartItems = parseCartFromDOM();
  const currentCartTotal = parseCartTotal();

  console.log(`[TCGmizer] Cart reader found ${cartItems.length} items, total: $${currentCartTotal}`);
  return { cartItems, currentCartTotal };
}

/**
 * Parse cart items from the DOM using a product-link-centric approach.
 * Instead of relying on specific container selectors that may break when
 * wrapper divs exist, we find all product links and group them by their
 * containing list item.
 */
function parseCartFromDOM() {
  const items = [];

  // Find all product links on the page
  const allProductLinks = document.querySelectorAll('a[href*="/product/"]');
  console.log(`[TCGmizer] Found ${allProductLinks.length} product links on page`);

  if (allProductLinks.length === 0) {
    return items;
  }

  // Group product links by their closest list item ancestor
  // Each cart item has 2 product links (image + name) sharing the same <li>
  const seenListItems = new Set();

  for (const link of allProductLinks) {
    // Walk up to find the nearest list item container
    const li = link.closest('li, [role="listitem"]');
    if (!li || seenListItems.has(li)) continue;

    // Only process items inside a cart article (skip "saved for later", recommendations, etc.)
    const article = li.closest('article');
    if (!article) continue;

    // Make sure this article is inside the main content area
    const main = article.closest('main');
    if (!main) continue;

    seenListItems.add(li);

    try {
      const item = parseCartItemFromContainer(li, article);
      if (item) {
        items.push(item);
        console.log(`[TCGmizer] Parsed: ${item.cardName} (${item.productId}) qty=${item.quantity} $${item.price}`);
      }
    } catch (e) {
      console.warn('[TCGmizer] Failed to parse cart item:', e);
    }
  }

  return items;
}

/**
 * Parse a single cart item from its container element (usually an <li>).
 */
function parseCartItemFromContainer(container, article) {
  // Find product links within this container
  const productLinks = container.querySelectorAll('a[href*="/product/"]');
  if (productLinks.length === 0) return null;

  // Extract product ID (or custom listing key) from the first link
  const linkInfo = extractProductInfoFromLink(productLinks[0]);
  if (!linkInfo) return null;

  const { productId, customListingKey } = linkInfo;

  // Card name: prefer the link that contains text (not just an image)
  let cardName = 'Unknown Card';
  for (const link of productLinks) {
    // Skip links that only contain an image
    const img = link.querySelector('img');
    const hasTextContent = link.textContent?.trim() && link.textContent.trim() !== img?.alt?.trim();
    if (hasTextContent || link.querySelector('p')) {
      const p = link.querySelector('p');
      cardName = p?.textContent?.trim() || link.textContent?.trim() || cardName;
      break;
    }
  }

  // Get ALL paragraphs in this container (at any depth)
  const allParagraphs = container.querySelectorAll('p');

  let setName = '';
  let condition = '';
  let price = 0;

  for (const p of allParagraphs) {
    const text = p.textContent?.trim() || '';
    if (!text) continue;

    // Skip the card name paragraph (inside a product link)
    if (p.closest('a[href*="/product/"]')) continue;

    if (text.startsWith('$') || text.match(/^\$[\d,.]+$/)) {
      price = parsePrice(text);
    } else if (isCondition(text)) {
      condition = text;
    } else if (text.includes(',') && !text.includes('cart')) {
      // Set info: "Lorwyn Eclipsed, Magic: The Gathering, R, 349"
      setName = text;
    }
  }

  // Quantity: look for an aria-labeled quantity list, or a dropdown/input
  let quantity = 1;

  // Strategy 1: aria-label containing "cart quantity"
  const qtyList = container.querySelector('[aria-label*="cart quantity"], [aria-label*="quantity"]');
  if (qtyList) {
    const qtyItem = qtyList.querySelector('li, [role="listitem"]');
    if (qtyItem) {
      quantity = parseInt(qtyItem.textContent?.trim(), 10) || 1;
    }
  }

  // Strategy 2: look for a quantity input or select
  if (quantity === 1) {
    const qtyInput = container.querySelector('input[type="number"], select');
    if (qtyInput) {
      quantity = parseInt(qtyInput.value, 10) || 1;
    }
  }

  // Extract seller info from the article
  const sellerInfo = parseSellerFromArticle(article);

  return {
    productId,
    cardName,
    quantity,
    price,
    condition,
    setName,
    skuId: null,
    sellerName: sellerInfo.sellerName || '',
    sellerKey: sellerInfo.sellerKey || '',
    isDirect: sellerInfo.isDirect || false,
    customListingKey: customListingKey || null,
  };
}

/**
 * Extract seller info from a cart article element.
 */
function parseSellerFromArticle(article) {
  // Look for a seller link (not a product link)
  const links = article.querySelectorAll('a[href*="seller="], a[href*="direct=true"]');
  for (const link of links) {
    const href = link.getAttribute('href') || '';
    const sellerMatch = href.match(/[?&]seller=([^&]+)/);
    const isDirect = href.includes('direct=true');
    const sellerKey = sellerMatch ? sellerMatch[1] : '';

    let sellerName = '';
    // Get readable text from the link, skipping tooltip content
    const textNodes = [];
    for (const child of link.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        textNodes.push(child.textContent.trim());
      }
    }
    sellerName = textNodes[0] || link.textContent?.trim()?.split('\n')?.[0]?.trim() || '';

    return { sellerName, sellerKey, isDirect };
  }

  return { sellerName: '', sellerKey: '', isDirect: false };
}

// --- Utility functions ---

/**
 * Check if a string looks like a card condition.
 */
function isCondition(text) {
  const conditionTerms = [
    'near mint',
    'lightly played',
    'moderately played',
    'heavily played',
    'damaged',
    'nm',
    'lp',
    'mp',
    'hp',
  ];
  const lower = text.toLowerCase();
  return conditionTerms.some((term) => lower.startsWith(term));
}

/**
 * Extract product info from a product link.
 * Standard links: /product/{productId}/... → returns { productId, customListingKey: null }
 * Custom listing links: /product/listing/{key}/... → returns { productId: null, customListingKey }
 */
function extractProductInfoFromLink(link) {
  if (!link) return null;
  const href = link.getAttribute('href') || '';

  // Standard product link: /product/222039/magic--kazuul-s-fury
  const standardMatch = href.match(/\/product\/(\d+)/);
  if (standardMatch) {
    return { productId: parseInt(standardMatch[1], 10), customListingKey: null };
  }

  // Custom listing link: /product/listing/ELL_jwNn3T01/magic-zendikar-rising-kazuul-s-fury
  const customMatch = href.match(/\/product\/listing\/([^/]+)/);
  if (customMatch) {
    return { productId: null, customListingKey: customMatch[1] };
  }

  return null;
}

function parsePrice(text) {
  if (!text) return 0;
  const match = text.match(/\$?([\d,]+\.?\d*)/);
  if (!match) return 0;
  return parseFloat(match[1].replace(/,/g, '')) || 0;
}

function parseCartTotal() {
  // Look for "Cart Subtotal" in the cart summary section
  // The cart summary has paragraphs like "Cart Subtotal $121.51"
  const allParagraphs = document.querySelectorAll('p');
  for (const p of allParagraphs) {
    const text = p.textContent?.trim() || '';
    if (text.includes('Cart Subtotal')) {
      const price = parsePrice(text);
      if (price > 0) return price;
    }
  }

  // Fallback: look for the heading "Cart Summary" and then find the subtotal nearby
  const headings = document.querySelectorAll('h3');
  for (const h of headings) {
    if (h.textContent?.trim() === 'Cart Summary') {
      // Look at siblings after this heading for the subtotal
      let sibling = h.nextElementSibling;
      while (sibling) {
        const text = sibling.textContent?.trim() || '';
        if (text.includes('Cart Subtotal')) {
          const price = parsePrice(text);
          if (price > 0) return price;
        }
        sibling = sibling.nextElementSibling;
      }
    }
  }

  return 0;
}
