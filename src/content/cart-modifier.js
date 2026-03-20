/**
 * Content script: modifies the TCGPlayer cart to apply the optimized purchase plan.
 *
 * Uses TCGPlayer's gateway API at mpgateway.tcgplayer.com:
 *   - Clear:  DELETE /v1/cart/{cartKey}/items/all
 *   - Add:    POST   /v1/cart/{cartKey}/item/add
 *   - Bulk:   POST   /v1/cart/{cartKey}/items/bulkadd
 */

const GATEWAY_API = 'https://mpgateway.tcgplayer.com';

/**
 * Apply the optimized cart to TCGPlayer.
 * Clears the current cart and adds the optimized items one by one.
 *
 * @param {OptimizationResult} result - The optimization result from the solver
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function applyOptimizedCart(result) {
  try {
    const cartKey = getCartKeyFromCookie();
    if (!cartKey) {
      return { success: false, error: 'Could not find cart key. Please refresh the page and try again.' };
    }

    // Collect all items to add with their cart-API fields
    const rawItems = [];
    for (const seller of result.sellers) {
      for (const item of seller.items) {
        if (!item.productConditionId) {
          console.warn('[TCGmizer] Item missing productConditionId:', item);
          continue;
        }
        rawItems.push({
          sku: item.productConditionId,
          sellerId: seller.sellerNumericId,
          sellerKey: seller.sellerKey || seller.sellerId,
          price: item.price,
          quantity: 1,
          cardName: item.cardName,
          setName: item.setName || '',
          isDirect: item.directSeller || false,
          customListingKey: item.customListingKey || null,
        });
      }
    }

    if (rawItems.length === 0) {
      return { success: false, error: 'No items in optimized cart.' };
    }

    // Aggregate items with the same sku+seller into a single add with combined quantity.
    // Without this, adding the same sku+seller twice as separate requests can fail.
    // Custom listings get their own key since each customListingKey is unique.
    const aggregated = new Map();
    for (const item of rawItems) {
      const key = item.customListingKey
        ? `custom:${item.customListingKey}`
        : `${item.sku}:${item.sellerId}:${item.isDirect}`;
      if (aggregated.has(key)) {
        const existing = aggregated.get(key);
        existing.quantity += item.quantity;
        existing.cardName += `, ${item.cardName}`; // track all card names for logging
      } else {
        aggregated.set(key, { ...item });
      }
    }
    const itemsToAdd = [...aggregated.values()];

    console.log(`[TCGmizer] Applying cart: clearing then adding ${rawItems.length} items (${itemsToAdd.length} unique sku+seller combos) via ${GATEWAY_API}`);

    // Step 1: Clear current cart
    const clearResult = await clearCart(cartKey);
    if (!clearResult.success) {
      return { success: false, error: `Failed to clear cart: ${clearResult.error}` };
    }

    // Build a set of already-used sku+seller combos so fallback doesn't retry them
    const usedSkuSeller = new Set(itemsToAdd.map(it => `${it.sku}:${it.sellerKey}`));

    // Get fallback listings from the result (built by service worker)
    const fallbackListings = result.fallbackListings || {};

    // Step 2: Add optimized items one at a time, with CAPI-4 fallback retry
    let failCount = 0;
    let fallbackCount = 0;
    const failedItems = []; // { cardName, setName, reason }
    const fallbackItems = []; // items that were replaced with a fallback
    for (let i = 0; i < itemsToAdd.length; i++) {
      const item = itemsToAdd[i];

      const addResult = await addItemToCart(cartKey, item);
      if (addResult.success) {
        // Minimal delay between items (50ms)
        if (i < itemsToAdd.length - 1) await sleep(50);
        continue;
      }

      console.warn(`[TCGmizer] Failed to add item ${i + 1}/${itemsToAdd.length}: ${addResult.error}`);
      console.warn(`[TCGmizer]   Item details: card="${item.cardName}", set="${item.setName}", sku=${item.sku}, sellerKey=${item.sellerKey}, sellerId=${item.sellerId}, price=${item.price}, qty=${item.quantity}, isDirect=${item.isDirect}`);
      console.warn(`[TCGmizer]   Error code: ${addResult.errorCode || 'none'}`);

      // CAPI-4: item sold out — try fallback listings for this card
      if (addResult.errorCode === 'CAPI-4') {
        // Extract the first cardName (before any aggregation commas)
        const primaryCardName = item.cardName.split(', ')[0];
        const fallbacks = fallbackListings[primaryCardName] || [];
        console.log(`[TCGmizer]   Attempting CAPI-4 fallback for "${primaryCardName}" — ${fallbacks.length} alternatives available`);

        let fallbackSucceeded = false;
        for (const fb of fallbacks) {
          const fbKey = `${fb.sku}:${fb.sellerKey}`;
          if (usedSkuSeller.has(fbKey)) continue; // skip already-used or already-tried

          console.log(`[TCGmizer]   Trying fallback: sku=${fb.sku}, seller=${fb.sellerKey} (${fb.sellerName}), price=$${fb.price}, set="${fb.setName}"`);

          const fbItem = {
            sku: fb.sku,
            sellerKey: fb.sellerKey,
            price: fb.price,
            quantity: item.quantity,
            cardName: item.cardName,
            setName: fb.setName || item.setName,
            isDirect: fb.isDirect || false,
            customListingKey: fb.customListingKey || null,
          };

          const fbResult = await addItemToCart(cartKey, fbItem);
          if (fbResult.success) {
            usedSkuSeller.add(fbKey);
            fallbackCount++;
            fallbackItems.push({
              cardName: primaryCardName,
              originalSku: item.sku,
              originalSellerKey: item.sellerKey,
              originalPrice: item.price,
              fallbackSku: fb.sku,
              fallbackSellerKey: fb.sellerKey,
              fallbackPrice: fb.price,
              fallbackSetName: fb.setName,
              fallbackSellerName: fb.sellerName,
            });
            console.log(`[TCGmizer]   ✓ Fallback succeeded for "${primaryCardName}" — new price: $${fb.price} from ${fb.sellerName}`);
            fallbackSucceeded = true;
            break;
          }

          // Mark this as tried so we don't retry
          usedSkuSeller.add(fbKey);
          console.warn(`[TCGmizer]   Fallback also failed (${fbResult.errorCode || 'unknown'}): sku=${fb.sku}, seller=${fb.sellerKey}`);
          await sleep(50);
        }

        if (fallbackSucceeded) {
          if (i < itemsToAdd.length - 1) await sleep(50);
          continue;
        }
        console.warn(`[TCGmizer]   All fallbacks exhausted for "${primaryCardName}"`);
      }

      // If we get here, the item failed and no fallback worked
      failCount++;
      failedItems.push({
        cardName: item.cardName,
        setName: item.setName,
        sku: item.sku,
        sellerKey: item.sellerKey,
        price: item.price,
        errorCode: addResult.errorCode,
        reason: friendlyError(addResult.errorCode) || addResult.error,
      });

      // Minimal delay between items (50ms)
      if (i < itemsToAdd.length - 1) await sleep(50);
    }

    if (failCount === itemsToAdd.length) {
      return { success: false, error: `Failed to add all items. ${failedItems[0]?.reason || 'Unknown error'}` };
    }

    if (fallbackCount > 0) {
      console.log(`[TCGmizer] ${fallbackCount} item(s) were replaced with fallback listings:`);
      for (const fb of fallbackItems) {
        console.log(`[TCGmizer]   - ${fb.cardName}: $${fb.originalPrice} → $${fb.fallbackPrice} (${fb.fallbackSellerName}, ${fb.fallbackSetName})`);
      }
    }

    if (failCount > 0) {
      console.warn(`[TCGmizer] ${failCount}/${itemsToAdd.length} items failed to add:`);
      for (const fi of failedItems) {
        console.warn(`[TCGmizer]   - ${fi.cardName} (${fi.setName}): ${fi.errorCode || 'unknown'} — ${fi.reason}`);
      }
      return { success: true, partial: true, failCount, totalCount: itemsToAdd.length, failedItems, fallbackCount, fallbackItems };
    }

    if (fallbackCount > 0) {
      return { success: true, partial: true, failCount: 0, totalCount: itemsToAdd.length, failedItems: [], fallbackCount, fallbackItems };
    }

    return { success: true, partial: false, failCount: 0, totalCount: itemsToAdd.length, failedItems: [], fallbackCount: 0, fallbackItems: [] };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Save the current cart state for undo functionality.
 */
export function saveCartState(cartItems) {
  try {
    sessionStorage.setItem('tcgmizer_undo_cart', JSON.stringify({
      timestamp: Date.now(),
      items: cartItems,
    }));
  } catch (e) {
    console.warn('[TCGmizer] Failed to save cart state for undo:', e);
  }
}

/**
 * Get saved cart state for undo.
 */
export function getSavedCartState() {
  try {
    const saved = sessionStorage.getItem('tcgmizer_undo_cart');
    if (!saved) return null;
    return JSON.parse(saved);
  } catch (e) {
    return null;
  }
}

// --- Internal functions ---

/**
 * Parse the StoreCart_PRODUCTION cookie to extract the cart key.
 * Cookie format: CK={cartKey}&Ignore=false
 */
function getCartKeyFromCookie() {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith('StoreCart_PRODUCTION=')) {
      const value = trimmed.substring('StoreCart_PRODUCTION='.length);
      // Parse the CK= parameter from the cookie value
      const params = new URLSearchParams(value);
      const ck = params.get('CK');
      if (ck) return ck;
      // Fallback: the entire value might be the key
      return value;
    }
  }
  return null;
}

/**
 * Clear all items from the cart.
 * DELETE /v1/cart/{cartKey}/items/all
 */
async function clearCart(cartKey) {
  try {
    const response = await fetch(`${GATEWAY_API}/v1/cart/${cartKey}/items/all`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { success: false, error: `HTTP ${response.status}: ${text.substring(0, 200)}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Add a single item to the cart.
 *
 * Normal listings:  POST /v1/cart/{cartKey}/item/add
 *   Body: {sku, sellerKey, channelId, requestedQuantity, price, isDirect, countryCode}
 *
 * Custom listings (user-uploaded image):  POST /v1/cart/{cartKey}/listo/add
 *   Body: {customListingKey, priceAtAdd, quantityToBuy, channelId, countryCode}
 */
async function addItemToCart(cartKey, item) {
  const isCustom = !!item.customListingKey;

  let url, body;
  if (isCustom) {
    url = `${GATEWAY_API}/v1/cart/${cartKey}/listo/add`;
    body = {
      customListingKey: item.customListingKey,
      priceAtAdd: item.price,
      quantityToBuy: item.quantity || 1,
      channelId: 0,
      countryCode: 'US',
    };
  } else {
    url = `${GATEWAY_API}/v1/cart/${cartKey}/item/add`;
    body = {
      sku: item.sku,
      sellerKey: item.sellerKey,
      channelId: 0,
      requestedQuantity: item.quantity || 1,
      price: item.price,
      isDirect: item.isDirect || false,
      countryCode: 'US',
    };
  }

  console.log(`[TCGmizer] Adding to cart: "${item.cardName}" (${item.setName || 'no set'}) — sku=${item.sku}, seller=${item.sellerKey}, price=$${item.price}, qty=${item.quantity || 1}, isDirect=${item.isDirect || false}${isCustom ? ', customListingKey=' + item.customListingKey : ''}`);
  console.log(`[TCGmizer]   ${isCustom ? 'Custom listing' : 'Standard'} → ${url.split('/').slice(-2).join('/')}`);
  console.log(`[TCGmizer]   Request body:`, JSON.stringify(body));

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    const responseText = await response.text().catch(() => '');
    console.log(`[TCGmizer]   Response ${response.status}: ${responseText.substring(0, 500)}`);

    if (!response.ok) {
      let errorCode = null;
      try {
        const data = JSON.parse(responseText);
        errorCode = data?.errors?.[0]?.code || null;
      } catch (e) {}
      return { success: false, error: `HTTP ${response.status}: ${responseText.substring(0, 200)}`, errorCode };
    }

    // Validate response body — API can return 200 with errors inside
    try {
      const data = JSON.parse(responseText);
      if (data?.errors && data.errors.length > 0) {
        const code = data.errors[0]?.code || '';
        const msg = data.errors[0]?.message || '';
        return { success: false, error: `API error: ${msg} (${code})`, errorCode: code };
      }
    } catch (parseErr) {
      // If we can't parse JSON, treat 200 as success
    }

    return { success: true };
  } catch (err) {
    console.error(`[TCGmizer]   Network error:`, err);
    return { success: false, error: err.message, errorCode: null };
  }
}

/**
 * Map TCGPlayer error codes to user-friendly messages.
 */
function friendlyError(code) {
  switch (code) {
    case 'CAPI-4':  return 'Sold out (no longer available from this seller)';
    case 'CAPI-17': return 'Product not found (may have been delisted)';
    case 'CAPI-35': return 'Product not available for purchase';
    default:        return `Error: ${code}`;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
