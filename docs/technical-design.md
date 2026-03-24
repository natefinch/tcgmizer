# TCGmizer — Technical Design & Implementation Document

A detailed walkthrough of every component in the TCGmizer Chrome extension: architecture, data flow, algorithms, and implementation specifics.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Extension Manifest & Permissions](#extension-manifest--permissions)
3. [Build System](#build-system)
4. [Component Deep Dives](#component-deep-dives)
   - 4.1 [Background Service Worker](#41-background-service-worker)
   - 4.2 [Fetcher (API Client)](#42-fetcher-api-client)
   - 4.3 [Content Script Entry Point](#43-content-script-entry-point)
   - 4.4 [Cart Reader](#44-cart-reader)
   - 4.5 [Cart Modifier](#45-cart-modifier)
   - 4.6 [Results UI](#46-results-ui)
   - 4.7 [ILP Builder](#47-ilp-builder)
   - 4.8 [Solution Parser](#48-solution-parser)
   - 4.9 [Constants](#49-constants)
   - 4.10 [Popup](#410-popup)
   - 4.11 [Options Page (Settings)](#411-options-page-settings)
   - 4.12 [Seller Cache](#412-seller-cache)
   - 4.13 [Offscreen Document (Legacy)](#413-offscreen-document-legacy)
5. [End-to-End Data Flow](#end-to-end-data-flow)
6. [Message Protocol](#message-protocol)
7. [Caching Strategy](#caching-strategy)
8. [Error Handling & Fallback Logic](#error-handling--fallback-logic)
9. [Performance Considerations](#performance-considerations)
10. [Key Design Decisions](#key-design-decisions)

---

## Architecture Overview

TCGmizer is a Manifest V3 Chrome extension. It follows Chrome's standard extension architecture with four execution contexts:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Browser                           │
│                                                                 │
│  ┌──────────────────┐     Messages      ┌────────────────────┐  │
│  │  Service Worker   │◄────────────────►│   Content Script    │  │
│  │  (background)     │                  │  (cart page DOM)    │  │
│  │                   │                  │                     │  │
│  │  • Orchestration  │                  │  • Cart reading     │  │
│  │  • API fetching   │                  │  • Cart modifying   │  │
│  │  • ILP solving    │                  │  • UI overlay       │  │
│  │  • Caching        │                  │                     │  │
│  └──────────────────┘                  └────────────────────┘  │
│         ▲                                        ▲              │
│         │ Messages                               │ DOM inject   │
│  ┌──────┴───────────┐                  ┌────────┴───────────┐  │
│  │     Popup         │                  │  Options Page       │  │
│  │  • Toggle panel   │                  │  • Vendor ban list  │  │
│  └──────────────────┘                  └────────────────────┘  │
│                                                                 │
│  External APIs (TCGPlayer):                                     │
│    mp-search-api.tcgplayer.com   (listings, product search)     │
│    mpapi.tcgplayer.com           (shipping info, seller search) │
│    mpgateway.tcgplayer.com       (cart operations)              │
└─────────────────────────────────────────────────────────────────┘
```

**Key architectural principles:**

- **No external servers.** All processing happens in the browser. The only network requests go to TCGPlayer's own APIs.
- **Two-phase operation.** The optimization is split into a **fetch phase** (read cart, fetch listings) and a **solve phase** (filter, build ILP, solve). This lets users re-solve with different settings without re-fetching.
- **HiGHS WASM solver.** The integer linear programming solver runs as WebAssembly inside the service worker—no offscreen document or external service needed.
- **SPA awareness.** TCGPlayer is a single-page application, so the extension handles programmatic content script injection when navigating to `/cart` without a full page load.

---

## Extension Manifest & Permissions

**File:** `manifest.json`

### Permissions

| Permission | Purpose |
|---|---|
| `activeTab` | Access the current tab when the user interacts with the popup |
| `scripting` | Programmatically inject content scripts for SPA navigation |
| `storage` | Persist vendor ban list via `chrome.storage.sync`; per-tab cache via `chrome.storage.session`; seller info cache via `chrome.storage.local` |

### Host Permissions

| Pattern | Purpose |
|---|---|
| `https://www.tcgplayer.com/*` | Content script injection on cart pages |
| `https://mp-search-api.tcgplayer.com/*` | Listings and product search APIs |
| `https://mpapi.tcgplayer.com/*` | Shipping info and seller search APIs |
| `https://mpgateway.tcgplayer.com/*` | Cart manipulation APIs |
| `https://tcgplayer.com/*` | Non-www variant |

### Content Security Policy

```json
"script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
```

`wasm-unsafe-eval` is required because the HiGHS WASM solver uses `WebAssembly.compile()` / `WebAssembly.instantiate()`, which are blocked by Manifest V3's default CSP.

### Content Script Declaration

Declaratively injected on `https://www.tcgplayer.com/cart*` and `https://tcgplayer.com/cart*` at `document_idle`. The CSS file (`results-ui.css`) is injected alongside the bundled JS (`dist/content.js`).

### Web-Accessible Resources

`dist/highs.wasm` is declared web-accessible so the Emscripten WASM loader can fetch it by URL from within the service worker.

---

## Build System

**File:** `build.js`

Uses **esbuild** to bundle the extension's JavaScript. The build produces two bundles and copies the HiGHS runtime:

### Entry Points

| Entry | Output | Format | Purpose |
|---|---|---|---|
| `src/background/service-worker.js` | `dist/background.js` | IIFE | Service worker (must be IIFE for `importScripts()` support) |
| `src/content/content.js` | `dist/content.js` | IIFE | Content script (must be IIFE per Chrome's content script requirements) |

Both bundles use ES2022 target, include source maps, and are minified in production (non-watch) builds.

### HiGHS File Copying

After bundling, the build copies `highs.wasm` and `highs.js` from `node_modules/highs/build/` into `dist/`. It includes a fallback that uses `find` to locate these files if the expected path doesn't exist.

> **Note:** The `dist/highs.js` and `dist/highs.wasm` files checked into the repo are **custom-built** with an 8MB Emscripten stack. They are NOT the files from the `highs` npm package (which ships with a 64KB stack that crashes on large carts). The `build.js` copy step is a fallback for fresh installs; the custom-built files should be committed and take priority. See the [WASM Solver Build](#wasm-solver-build) section below and `scripts/rebuild-highs-wasm.sh` for details.

### WASM Solver Build

The HiGHS WASM solver is compiled from the [`lovasoa/highs-js`](https://github.com/lovasoa/highs-js) wrapper around [ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS) using Emscripten.

**Why a custom build?** The published `highs` npm package (v1.8.0) was compiled with Emscripten's default 64KB stack. Large ILP models (100+ card carts with alternative printings) cause a stack overflow, manifesting as WASM `Aborted()` or `RuntimeError: function signature mismatch` errors. An upstream fix ([PR #43](https://github.com/lovasoa/highs-js/pull/43)) increased the stack to 4MB, but this was merged *after* the v1.8.0 release and has never been published as a new npm version.

We build with an **8MB stack** (`STACK_SIZE=8388608`) using `scripts/rebuild-highs-wasm.sh`, which:
1. Clones `lovasoa/highs-js` (main branch, with the stack fix)
2. Patches `build.sh` to set a larger `STACK_SIZE`
3. Builds inside the `emscripten/emsdk:3.1.51` Docker container
4. Copies the output `highs.js` and `highs.wasm` into `dist/`

Key Emscripten flags (from upstream `build.sh`):
- `-O3` — full optimization
- `-s ALLOW_MEMORY_GROWTH=1` — heap can grow dynamically (no fixed memory ceiling)
- `-s STACK_SIZE=8388608` — 8MB stack (our override; upstream uses 4MB)
- `-s MODULARIZE=1` — exports a factory function
- `-flto` — link-time optimization
- `--closure 1` — Closure Compiler minification

Prerequisites: Docker (no local emcc or cmake needed).

### Watch Mode

`npm run watch` passes `--watch` to the build script, which disables minification for faster iterative builds.

---

## Component Deep Dives

### 4.1 Background Service Worker

**File:** `src/background/service-worker.js` (833 lines)

The service worker is the central orchestrator. It coordinates the entire optimization pipeline: receiving cart data from the content script, fetching listings via TCGPlayer APIs, running the ILP solver, and returning results.

#### HiGHS Loading

HiGHS is loaded in two steps:

1. **Synchronous:** `importScripts('highs.js')` at the top level loads the Emscripten JS loader. This must be a static string literal per MV3 requirements. It sets `globalThis.Module` to a factory function.
2. **Async/lazy:** `getHighs()` initializes the WASM module on first use. It calls the factory with a `locateFile` callback that maps `*.wasm` filenames to `chrome.runtime.getURL('dist/highs.wasm')`. The resulting solver instance is cached in the `highs` variable, and concurrent callers share the same `highsLoading` promise.

**WASM crash recovery:** If HiGHS WASM aborts (stack overflow, memory error), the cached `highs` and `highsLoading` references are set to `null`, forcing a full re-initialization on the next solve attempt. This is necessary because the Emscripten module is left in a corrupted state after a WASM trap.

#### SPA Navigation Detection

TCGPlayer is a single-page app. When a user navigates from another page (e.g., bulk-add) to `/cart`, Chrome doesn't re-inject declarative content scripts. The service worker listens to `chrome.tabs.onUpdated` for URL changes matching `/cart`, pings the tab to check if the content script is already loaded, and injects it programmatically if not. It also injects the CSS file in this case.

#### Tab Data Caching

An in-memory `Map` (`tabCacheMap`) stores fetched listing data per tab ID. This survives within a single service worker session with no size limits. A backup copy is written to `chrome.storage.session` to survive service worker restarts (subject to quota limits—large carts may exceed the quota, in which case only the in-memory cache is used). Tab cleanup happens via `chrome.tabs.onRemoved`.

Session storage access level is set to `TRUSTED_AND_UNTRUSTED_CONTEXTS` to increase the available quota.

#### Fetch Phase (`runFetchPhase`)

This is the first phase of optimization, triggered by `MSG.START_OPTIMIZATION`:

1. **Resolve custom listings.** Cart items with a `customListingKey` but no `productId` (seller-uploaded photo listings) are resolved either from other cart items with the same card name, or by searching the product API by name.

2. **Build card slots.** Each cart item × quantity produces a unique slot (e.g., 3 copies of card X produces `X_0`, `X_1`, `X_2`). This is fundamental to the ILP formulation—each slot must be assigned exactly one listing.

3. **Search alternative printings.** For each unique card name, queries the TCGPlayer product search API for all printings across all sets. Limits to `MAX_ALTERNATIVE_PRINTINGS` (5) new products per card. Filters to the same product line (e.g., Magic: The Gathering) to avoid cross-game matches.

4. **Fetch listings.** Calls `fetchAllListings()` for all products (original + alternatives). Uses concurrent requests with deduplication.

5. **Remap listings to slots.** Each slot receives listings from all printings of its card name. Listings are pre-indexed into a `Map<productId, listing[]>` for O(1) lookup per slot (instead of filtering the full listing array per slot). Listings are duplicated across slots with unique `listingId`s (e.g., `listing123_slot456`) but retain the original `originalListingId` for inventory constraints.

6. **Cache results.** Stores `{ cardSlots, allListings, sellers, currentCartTotal }` in the per-tab cache.

7. **Send options to content script.** The `MSG.LISTINGS_READY` message includes available languages, conditions, card count, listing count, and seller count so the config UI can render filter options.

#### Solve Phase (`runSolvePhase`)

Triggered by `MSG.SOLVE_WITH_CONFIG` after the user configures filters:

1. **Load cached data** from the tab cache.

2. **Apply filters.** Sequentially filters listings by language, condition, exact printings (only original productIds), and banned sellers.

3. **Check coverage.** Ensures every slot has at least one listing after filtering. If not, reports which cards are uncovered.

4. **Build fallback map.** Creates a per-card-name sorted list of alternative listings for the cart modifier to use when items are sold out (CAPI-4 errors).

5. **Solve.** Two modes:
   - **Single solve:** Calls `solveSingle()` then iteratively tries fewer vendors at the same price to minimize package count without increasing cost.
   - **Minimize vendors mode:** Calls `runMultiSolve()` which solves at every vendor count from unlimited down to 1 (or until infeasible), then presents all Pareto-optimal options.

6. **Send results** via `MSG.OPTIMIZATION_RESULT` (single) or `MSG.OPTIMIZATION_MULTI_RESULT` (multi).

#### `solveSingle()` and Adaptive Retry

`solveSingle()` wraps `solveSingleAttempt()` with two layers of resilience for large carts:

**Adaptive topK scaling:** Before solving, the top-K listings per slot (default 25) is reduced based on cart size to keep the ILP model within WASM memory limits:
- \>75 slots: topK capped at 15
- \>50 slots: topK capped at 20
- ≤50 slots: topK stays at 25

**Retry loop on WASM errors:** If HiGHS WASM crashes (detected by checking for `RuntimeError`, `Aborted`, `signature mismatch`, or `out of memory` in the error message), the function:
1. Resets the HiGHS instance (`highs = null; highsLoading = null`) to clear corrupted state
2. Returns the sentinel string `'WASM_ERROR'` to the retry loop
3. The loop reduces topK by 40% (`topK * 0.6`) and retries
4. Minimum topK is 8; below that, the solve is abandoned with an error message

`solveSingleAttempt()` builds the LP via `buildLP()`, solves it via `solveILP()`, and parses the solution via `parseSolution()`. Includes input validation (checking for empty slots) and error logging (including LP string excerpts on failure).

The `solveILP()` function validates the LP string for required sections (`Minimize`, `Subject To`, `End`) and the absence of `NaN` values before passing it to HiGHS.

#### `runMultiSolve()`

Finds the cheapest price at each feasible vendor count:

1. Solves with no vendor limit to get the baseline (cheapest possible price).
2. Iteratively constrains `maxSellers` from `baseline.sellerCount - 1` down to 1.
3. Stops when infeasible.
4. Removes dominated results (a result with more vendors at the same or higher price as one with fewer vendors).
5. Sorts by vendor count ascending.
6. Attaches fallback listings to each result.

#### `buildFallbackMap()`

Creates a `{ cardName → [{sku, sellerKey, price, isDirect, setName, sellerName}] }` map from all filtered listings, deduplicated by `productConditionId:sellerKey` and sorted by price ascending. Used by the cart modifier for CAPI-4 (sold out) retry logic.

#### Message Listener

Handles three message types from the content script:

| Message | Action |
|---|---|
| `MSG.START_OPTIMIZATION` | Runs `runFetchPhase()` |
| `MSG.SOLVE_WITH_CONFIG` | Runs `runSolvePhase()` |
| `MSG.APPLY_CART` | Acknowledges (actual cart modification happens in the content script) |

---

### 4.2 Fetcher (API Client)

**File:** `src/background/fetcher.js`

The fetcher handles all communication with TCGPlayer's internal APIs. It runs in the service worker context, which has the required host permissions for cross-origin requests.

#### `fetchAllListings(cards, options)`

Main entry point. Fetches listings for a list of products.

**Concurrency model:** Uses a sliding-window concurrency approach—maintains up to `concurrency` (default 5) in-flight requests, launching new ones as previous ones complete. A stagger delay (`delayMs`, default 100ms) is added between launches to avoid burst traffic.

**Deduplication:** Groups input cards by `productId`. If multiple cart slots reference the same product, only one API request is made.

**Per-product fetching:** Delegates to `fetchListingsForProduct()` which pages through the listings API (50 per page) sorted by price ascending, up to `maxListingsPerCard` (default 50) listings.

**Seller info collection:** As listings are processed, seller information (name, key, numeric ID, shipping cost) is accumulated in a `sellersMap`. The maximum shipping cost across all listings is used for each seller.

**Seller info caching:** Before fetching shipping info, prunes expired entries (older than 6 hours) from the persistent seller cache (`chrome.storage.local`). Sellers with valid cached data have their shipping cost and free-shipping threshold applied directly from the cache, skipping the API call entirely. Only uncached sellers are passed to `fetchSellerShippingInfo()`. After fetching, newly retrieved seller info is stored in the cache with the current timestamp for future optimization runs.

**Shipping info:** For uncached sellers, calls `fetchSellerShippingInfo()` to get free-shipping thresholds.

**Progress reporting:** Accepts an optional `onShippingProgress(current, total)` callback so the UI can display shipping fetch progress separately from listing progress.

**Ghost seller filtering:** The shipping API is used to detect "ghost sellers"—sellers whose listings appear in the search index but whose storefronts are inactive. If a seller's numeric ID doesn't appear in the shipping API response (and is not in the seller cache), their listings are removed. (These sellers cause CAPI-35 errors when attempting to add to cart.) Cached sellers are always considered known since they responded to the shipping API in a previous session.

#### `fetchListingsForProduct(productId, slotId, maxListings)`

Fetches listings for a single product via `POST /v1/product/{productId}/listings`.

The request body includes:
- `sellerStatus: 'Live'` — only active sellers
- `channelId: 0` — main TCGPlayer marketplace
- `quantity.gte: 1` — in-stock only
- `channelExclusion: 0` — excludes deactivated seller channels (critical for avoiding ghost sellers)
- `shippingCountry: 'US'`
- Sort by price ascending

For each listing result, extracts: listing ID, seller info, price, shipping, condition, language, printing, quantity, seller badges (gold, verified, direct), listing type (standard/custom), and custom listing key.

#### `fetchSellerShippingInfo(sellersMap)`

Fetches shipping thresholds via `POST /v2/seller/shippinginfo?countryCode=US`.

Batches sellers in groups of 50. The request body is an array of `{ sellerId (numeric), largestShippingCategoryId: 1 }` (category 1 = singles/cards).

The response provides `sellerShippingOptions` with:
- `shippingPriceUnderThreshold` — shipping cost when below the threshold
- `shippingPriceOverThreshold` — shipping cost when at/above the threshold
- `thresholdPrice` — the spending threshold amount

A seller gets a `freeShippingThreshold` only if `overThreshold < underThreshold` (i.e., spending more actually reduces shipping).

Returns the set of seller keys that responded, which is used for ghost seller detection.

#### `searchProductsByName(cardName)`

Searches for all printings of a card by name via `POST /v1/search/request?q={cardName}`.

Filters to product type "Cards" with `marketPrice >= 0.01` (ensuring the product has actual listings). Performs exact name matching—the product name must either match exactly or start with the search term followed by ` (` (to match treatment variants like "Card Name (Extended Art)").

Returns `{ productId, productName, setName, marketPrice, productLineId, productLineName }` for each match.

#### `searchAllCardPrintings(cardNames, seenProducts, options)`

Concurrently searches for alternative printings of multiple cards using the same sliding-window concurrency as listing fetching.

**Product line filtering:** On the first pass, identifies which product lines (game systems) the cart items belong to. Alternative printings are only included if they share the same product line—preventing, for example, a Magic card named "Lightning Bolt" from matching a Pokémon card.

**Limits:** At most `MAX_ALTERNATIVE_PRINTINGS` (5) new products per card name.

---

### 4.3 Content Script Entry Point

**File:** `src/content/content.js`

The content script runs on TCGPlayer cart pages. It coordinates between the DOM (reading/modifying the cart), the UI overlay, and the background service worker.

#### Duplicate Injection Guard

Sets `window.__tcgmizerContentLoaded` to prevent re-initialization if the script is injected both declaratively (via manifest) and programmatically (via SPA navigation detection). If already loaded, the script exits silently.

#### Initialization (`__tcgmizerInit`)

1. Calls `injectUI()` to create the overlay panel (hidden by default).
2. Calls `injectCartButton()` to add an "Optimize with TCGmizer" button next to TCGPlayer's own optimize button.
3. Registers the `onStartClick` callback for the optimize button.

#### Cart Button Injection

Finds TCGPlayer's `.optimize-btn-block` element and inserts a styled button after it. Since the cart page is an SPA, uses a `MutationObserver` to wait for the element to appear if it doesn't exist on initial load. Copies the styling (padding, background, border, shadow) from the existing optimize block container for visual consistency.

#### `startFetchPhase()`

1. Shows the progress UI.
2. Calls `readCart()` to parse cart items from the DOM.
3. Saves the current cart state for potential undo via `saveCartState()`.
4. Sends `MSG.START_OPTIMIZATION` to the service worker with `{ cartItems, currentCartTotal }`.

#### `handleSolveWithConfig(config)`

Sends `MSG.SOLVE_WITH_CONFIG` to the service worker with the user-selected filter configuration.

#### Message Listener

Handles messages from both the service worker and the popup:

| Message | Action |
|---|---|
| `PING` | Responds `{ ok: true }` (used by SPA detection) |
| `MSG.TOGGLE_PANEL` | Shows/hides the panel; auto-starts fetching when shown |
| `MSG.OPTIMIZATION_PROGRESS` | Updates progress bar and status text |
| `MSG.LISTINGS_READY` | Shows the config UI with filter options |
| `MSG.OPTIMIZATION_RESULT` | Shows single-result view |
| `MSG.OPTIMIZATION_MULTI_RESULT` | Shows multi-result comparison view |
| `MSG.OPTIMIZATION_ERROR` | Shows error message with retry button |

#### `handleApply(result)`

Applies the optimized cart by calling `applyOptimizedCart()`, then handles partial success (fallback items, failed items) with a detailed alert message before reloading the page.

---

### 4.4 Cart Reader

**File:** `src/content/cart-reader.js`

Parses the user's current TCGPlayer cart from the page DOM. Uses a product-link-centric approach that is resilient to DOM structure changes.

#### `readCart()`

Top-level function returning `{ cartItems, currentCartTotal }`.

#### `parseCartFromDOM()`

**Strategy:** Rather than relying on specific CSS classes or container selectors (which change frequently in TCGPlayer's SPA), it finds all `<a>` elements with `href` containing `/product/` and works outward:

1. **Find product links:** `document.querySelectorAll('a[href*="/product/"]')`
2. **Group by containing list item:** For each link, walks up to the nearest `<li>` or `[role="listitem"]`. Deduplicates by `<li>` (each cart item typically has two product links: image and name).
3. **Scope to cart:** Only processes items inside `<article>` elements within `<main>`, excluding "saved for later," recommendations, etc.
4. **Parse each item:** Delegates to `parseCartItemFromContainer()`.

#### `parseCartItemFromContainer(container, article)`

Extracts data from a single cart item's DOM element:

- **Product ID:** Extracted from the product link href. Standard links match `/product/{id}/...`. Custom listing links match `/product/listing/{key}/...`.
- **Card name:** Taken from the product link that contains text (not just an image), preferring `<p>` elements within the link.
- **Price, condition, set name:** Scanned from all `<p>` elements within the container. Prices start with `$`; conditions match known terms (Near Mint, Lightly Played, etc.); set names contain commas.
- **Quantity:** First tries an `aria-label` containing "cart quantity", then falls back to `<input type="number">` or `<select>` elements.
- **Seller info:** Extracted from `<a>` elements with `href` containing `seller=` or `direct=true` in the parent `<article>`.

#### `parseCartTotal()`

Finds the cart subtotal by searching for `<p>` elements containing "Cart Subtotal" and extracting the dollar amount, or by finding a `<h3>` with text "Cart Summary" and scanning its siblings.

---

### 4.5 Cart Modifier

**File:** `src/content/cart-modifier.js`

Applies the optimized cart to TCGPlayer by clearing the current cart and adding the new items via TCGPlayer's gateway API.

#### `applyOptimizedCart(result)`

The main function. Orchestrates a three-step process:

1. **Get cart key.** Parses the `StoreCart_PRODUCTION` cookie. The cookie format is `CK={cartKey}&Ignore=false`; the `CK` parameter is the cart identifier.

2. **Aggregate items.** Converts the solver's per-seller-per-item output into API-ready items with `{ sku (productConditionId), sellerId, sellerKey, price, quantity, cardName, setName, isDirect, customListingKey }`. Items with the same `sku + seller + isDirect` are aggregated into a single add request with combined quantity (preventing duplicate-add failures). Custom listings are keyed separately since each `customListingKey` is unique.

3. **Clear cart.** `DELETE /v1/cart/{cartKey}/items/all` — removes all items from the current cart.

4. **Add items sequentially.** Items are added one at a time with 50ms delays between requests. This sequential approach is required because the TCGPlayer cart API does not reliably handle concurrent add requests.

#### CAPI-4 Fallback (Sold-Out Retry)

When adding an item fails with error code `CAPI-4` (item sold out since the listing was fetched), the modifier:

1. Looks up the card name in the `fallbackListings` map (built by the service worker).
2. Tries each fallback listing in price-ascending order, skipping any already used or already attempted.
3. If a fallback succeeds, records it for reporting to the user (original price → fallback price).
4. If all fallbacks are exhausted, records the item as failed.

#### Cart API Endpoints

| Operation | Method | URL | Body |
|---|---|---|---|
| Clear cart | `DELETE` | `/v1/cart/{cartKey}/items/all` | — |
| Add standard item | `POST` | `/v1/cart/{cartKey}/item/add` | `{ sku, sellerKey, channelId: 0, requestedQuantity, price, isDirect, countryCode: 'US' }` |
| Add custom listing | `POST` | `/v1/cart/{cartKey}/listo/add` | `{ customListingKey, priceAtAdd, quantityToBuy, channelId: 0, countryCode: 'US' }` |

Custom listings (seller-uploaded photos) use a different endpoint and payload format than standard listings.

#### Error Handling

The cart modifier handles API errors including:
- `CAPI-4`: Sold out → tries fallback listings
- `CAPI-17`: Product not found (delisted)
- `CAPI-35`: Product not available for purchase (ghost seller or channel issue)
- 200 responses with error payloads (the API can return HTTP 200 with `errors[]` in the body)

#### Undo Support

`saveCartState()` saves the current cart items to `sessionStorage` under `tcgmizer_undo_cart` with a timestamp, enabling future undo functionality.

---

### 4.6 Results UI

**File:** `src/content/results-ui.js` (648 lines), `src/content/results-ui.css` (477 lines)

A self-contained UI overlay injected into the TCGPlayer cart page DOM.

#### Panel Structure

The panel is a fixed-position `div` with ID `tcgmizer-panel`:

```
┌──────────────────────────────┐
│ ⚡ TCGmizer            [×]   │  ← Header (draggable)
├──────────────────────────────┤
│                              │
│  [Idle / Progress / Config   │  ← Body (scrollable)
│   / Results / Error]         │
│                              │
└──────────────────────────────┘
```

Positioned at top-right (`top: 10px; right: 10px`), 520px wide, max 85vh height, with `z-index: 999999`. The panel is resizable via CSS `resize: both`.

#### Drag to Move

The header element supports mouse drag to reposition the panel. Mousedown on the header (excluding the close button) initiates dragging; mousemove updates the panel's position; mouseup ends the drag.

#### UI States

The panel has five mutually exclusive states:

| State | Element | When Shown |
|---|---|---|
| **Idle** | `.tcgmizer-idle` | Initial state — shows description and "Optimize Cart" button |
| **Progress** | `.tcgmizer-progress` | During fetch/solve — spinner, status text, progress bar |
| **Config** | `.tcgmizer-config` | After listings are fetched — filter options and "Run Optimizer" button |
| **Results** | `.tcgmizer-results` | After solving — cost breakdown by seller |
| **Error** | `.tcgmizer-error` | On failure — error text and "Try Again" button |

State transitions are managed by showing one element and hiding all others.

#### `showConfig(options, onSolve)`

Renders the filter configuration UI:

- **Language checkboxes:** Populated from available languages in the listings. "English" is pre-checked; all others unchecked.
- **Condition checkboxes:** Populated from available conditions. All pre-checked. "Select all / Select none" links for both.
- **"Exact printings only" toggle:** When unchecked (default), allows alternative printings from other sets.
- **Max Vendors input:** Numeric input, blank for no limit.
- **Minimize Number of Vendors toggle:** Enables multi-solve mode.
- **Exclude banned vendors checkbox:** Loads the ban list from `chrome.storage.sync`. Disabled if no vendors are banned. Stores banned seller keys on the checkbox element for easy access.
- **"Re-fetch Listings" button:** Restarts the fetch phase.

When "Run Optimizer" is clicked, collects all filter values into a config object. Languages and conditions are only sent if not all are selected (empty arrays mean "all").

#### `showResults(result, onApply)`

Renders the single-solution result view:

- **Summary block:** Current cart total, optimized total, item/shipping breakdown, savings amount, item/seller counts.
- **"Apply to Cart" button** (with confirmation dialog) and **"Change Settings" button** (returns to config without re-fetching).
- **Seller list:** Each seller rendered as a card with header (name + total), meta line (item count, subtotal, shipping), and item list.

#### `showMultiResults(results, onApply)`

Renders the multi-solution comparison view (minimize vendors mode):

- **Summary:** Current cart total and best savings.
- **Comparison table:** Each row shows vendor count, total price, premium over cheapest option, and an "Apply" button. Rows are expandable to show the per-seller breakdown.
- **Dominated results** (more vendors at same or higher price) are removed before display.

#### Item Rendering

Items are grouped by `productId + condition + language + price + productConditionId` to show "×2" badges instead of duplicate rows. Each item shows:

- Card thumbnail image (from TCGPlayer CDN)
- Card name with quantity badge
- Printing change indicator (🔀) if the solver chose a different set
- Condition abbreviation, set name, language
- Price (with "ea" suffix if quantity > 1)

#### Set Name Cleaning

The `cleanSetName()` function strips game names (e.g., "Magic: The Gathering"), rarity codes (single letters), and collector numbers from full set name strings like "Set Name, Magic: The Gathering, R, 349".

#### TCGPlayer Direct Styling

Sellers with `isDirect: true` get a special blue-tinted background and the TCGPlayer Direct icon next to their name.

---

### 4.7 ILP Builder

**File:** `src/shared/ilp-builder.js`

Constructs a CPLEX LP format string encoding the cart optimization problem as a binary integer linear program.

#### Mathematical Formulation

**Decision Variables:**

| Variable | Type | Meaning |
|---|---|---|
| $x_{s,l}$ | Binary | 1 if listing $l$ is chosen for card slot $s$ |
| $y_v$ | Binary | 1 if seller $v$ is used (any listing purchased from them) |
| $z_v$ | Binary | 1 if seller $v$'s free shipping threshold is met |

**Objective — Minimize Total Cost:**

$$\min \sum_{s,l} \text{price}_{s,l} \cdot x_{s,l} + \sum_v \text{shipping}_v \cdot y_v - \sum_v \text{shipping}_v \cdot z_v$$

The $-\text{shipping}_v \cdot z_v$ term subtracts shipping when the free shipping threshold is met, making it effectively free.

**Constraints:**

1. **Coverage** — each card slot gets exactly one listing:
$$\sum_l x_{s,l} = 1 \quad \forall s$$

2. **Seller linking** — can only buy from a seller if that seller is "used" (aggregated form—one constraint per seller instead of per listing, dramatically reducing LP size for large carts):
$$\sum_{(s,l) \in v} x_{s,l} \leq N_v \cdot y_v \quad \forall v$$
where $N_v$ is the number of $x$ variables associated with seller $v$. This is mathematically equivalent to the individual form $x_{s,l} \leq y_v$ for each listing but generates ~80% fewer constraints.

3. **Free shipping threshold** — $z_v = 1$ only if the total spend at seller $v$ meets the threshold:
$$\sum_{l \in v} \text{price}_l \cdot x_{s,l} \geq \text{threshold}_v \cdot z_v$$

4. **$z \leq y$** — can't get free shipping without using the seller:
$$z_v \leq y_v$$

5. **Inventory limits** — don't assign more card slots to a seller's specific inventory unit than its available quantity:
$$\sum_{s: \text{same } (v, \text{SKU})} x_{s,l} \leq \text{quantity}$$

6. **Max sellers** (optional) — cap the number of sellers used:
$$\sum_v y_v \leq \text{maxSellers}$$

#### Implementation Details

**Top-K Pruning:** Before building the LP, listings for each slot are sorted by price and pruned to the top `DEFAULT_TOP_K_LISTINGS` (25) cheapest. This dramatically reduces the number of variables without losing optimality in practice (the cheapest solution rarely involves expensive listings).

**Variable naming:** Variables use the pattern `x_s{slotId}_l{index}`, `y_v{sellerIndex}`, `z_v{sellerIndex}` to avoid conflicts.

**Line length splitting:** HiGHS has an internal line buffer of ~560 characters. The `pushExpressionLines()` function splits long constraint expressions across multiple continuation lines (which must start with whitespace per CPLEX LP format). Lines are broken at ~500 characters, splitting on term boundaries (`+` or `-`).

**Coefficient formatting:** `formatCoeff()` formats numbers to 4 decimal places, strips trailing zeros, and guards against `NaN` values (logging a warning and substituting 0).

**Empty objective guard:** If all prices and shipping costs happen to be zero, a dummy `0 x_...` term is added to prevent an invalid LP.

**$1 minimum note:** TCGPlayer requires a $1 minimum order per seller, but this is NOT enforced as a hard constraint in the ILP. Doing so can make the problem infeasible when cheap cards don't aggregate enough per seller. Instead, sellers below the minimum are flagged as warnings in the solution parser.

**Return value:** Returns `{ lp, variableMap, sellerIndex }` where `variableMap` maps variable names back to their associated listings and sellers for solution parsing.

---

### 4.8 Solution Parser

**File:** `src/shared/solution-parser.js`

Converts the raw HiGHS solution object into a structured result that the UI can display and the cart modifier can apply.

#### `parseSolution(solution, variableMap, cardSlots, sellers, currentCartTotal)`

1. **Status check.** Returns an error result if the solver status is not `'Optimal'`.

2. **Extract assignments.** Iterates through all $x$ variables in the solution columns. Values are rounded to 0/1 (the solver may return 0.9999 or 1e-10 due to floating-point precision). Variables with rounded value 1 are recorded as `{ slotId, listing }` assignments.

3. **Build per-seller breakdown.** Groups assignments by seller, accumulating items and subtotals.

4. **TCGPlayer Direct consolidation.** If ALL items from a seller are `directListing`, those items move to a consolidated "TCGPlayer Direct" seller group. If a seller has a mix of direct and non-direct items, all stay with the original seller. The Direct group uses fixed shipping constants: $3.99 shipping, free above $50.

5. **Shipping calculation.** For each non-Direct seller, compares their subtotal against their `freeShippingThreshold`. If met, shipping is $0; otherwise, uses the seller's `shippingCost`.

6. **Sorting.** The Direct group (if any) is placed first; remaining sellers are sorted by total descending.

7. **Minimum order warnings.** Flags sellers with subtotals below TCGPlayer's $1 minimum.

8. **Savings calculation.** `savings = currentCartTotal - totalCost` (rounded to cents).

#### Return Structure

```javascript
{
  success: true,
  status: 'Optimal',
  totalCost,         // Items + shipping
  totalItemCost,     // Items only
  totalShipping,     // Shipping only
  sellerCount,
  itemCount,
  sellers: [{        // One per seller
    sellerId, sellerName, sellerKey, sellerNumericId,
    items: [{        // One per assigned listing
      cardName, productId, productConditionId, condition,
      setName, language, price, printingChanged,
      directSeller, directListing, customListingKey,
    }],
    subtotal, shippingCost, freeShipping, freeShippingThreshold, sellerTotal,
  }],
  savings,
  currentCartTotal,
  warnings,
}
```

---

### 4.9 Constants

**File:** `src/shared/constants.js`

Centralized configuration values:

| Constant | Value | Purpose |
|---|---|---|
| `TCGPLAYER_MIN_ORDER_PER_SELLER` | $1.00 | TCGPlayer's per-seller minimum (used for warnings) |
| `TCGPLAYER_DIRECT_SHIPPING_COST` | $3.99 | Fixed shipping for TCGPlayer Direct |
| `TCGPLAYER_DIRECT_FREE_SHIPPING_THRESHOLD` | $50.00 | Free shipping threshold for Direct |
| `DEFAULT_FETCH_DELAY_MS` | 100 | Stagger delay between concurrent API requests |
| `DEFAULT_MAX_LISTINGS_PER_CARD` | 50 | Max listings to fetch per product |
| `DEFAULT_FETCH_CONCURRENCY` | 5 | Max concurrent API requests |
| `MAX_ALTERNATIVE_PRINTINGS` | 5 | Max alternative set printings per card name |
| `DEFAULT_TOP_K_LISTINGS` | 25 | Listings kept per slot after ILP pruning |
| `DEFAULT_SOLVER_TIMEOUT_S` | 30 | HiGHS solver time limit |
| `LISTINGS_PER_PAGE` | 50 | Listings API page size |

Also defines the `MSG` and `STAGE` enums used throughout the messaging protocol.

---

### 4.10 Popup

**Files:** `src/popup/popup.html`, `src/popup/popup.js`

A minimal 280px-wide popup with two buttons and a status indicator.

#### Behavior

1. On load, queries the active tab's URL.
2. If on a TCGPlayer cart page:
   - Status shows "On cart page"
   - "Show Optimizer" button is enabled
   - Button click sends `TOGGLE_PANEL` message to the content script
   - If the content script isn't loaded (SPA navigation), programmatically injects the CSS and JS, waits 200ms for initialization, then sends the toggle message
3. If not on a cart page:
   - Status shows "Navigate to TCGPlayer cart"
   - Button is disabled
4. "Settings" button opens the options page via `chrome.runtime.openOptionsPage()`.
5. "Clear Seller Cache" button sends `MSG.CLEAR_SELLER_CACHE` to the service worker to wipe all cached seller shipping data. Provides visual feedback ("Clearing..." → "Cache Cleared!") and re-enables after 1.5 seconds.

---

### 4.11 Options Page (Settings)

**Files:** `src/options/options.html`, `src/options/options.js`, `src/options/options.css`

Manages a persistent vendor ban list stored in `chrome.storage.sync` (synced across devices).

#### Seller Search

Uses TCGPlayer's seller search API: `POST /v2/ShopBySeller/GetSellerSearchResults` at `mpapi.tcgplayer.com`. The request body includes `{ sellerName, isDirect: false, isGoldStar: false, isCertified: false, categoryId: 0, page: 1 }`.

Results are nested at `data.results[0].searchResults[]` and displayed with the seller's display name and a "Ban" button.

#### Ban List

The ban list is an array of `{ sellerKey, sellerName }` objects stored at the `bannedSellers` key in `chrome.storage.sync`. Operations include:
- **Add:** Prevents duplicates by checking `sellerKey`.
- **Remove:** Filters by `sellerKey`.
- **Display:** Shows each banned seller with a red-tinted background and "Remove" button.
- **Integration:** The config UI in `results-ui.js` loads the ban list and passes `bannedSellerKeys` to the solve config. The service worker filters out listings from banned sellers before building the ILP.

---

### 4.12 Seller Cache

**File:** `src/background/seller-cache.js`

Manages persistent caching of seller shipping information across browser sessions using `chrome.storage.local`. This avoids re-fetching shipping data from TCGPlayer's API on every optimization run.

#### Cache Entry Format

Each entry is keyed by seller key and stores:

```json
{
  "sellerName": "Store Alpha",
  "sellerKey": "abc123",
  "sellerNumericId": 12345,
  "shippingCost": 1.99,
  "freeShippingThreshold": 5.00,
  "timestamp": 1711200000000
}
```

#### Exported Functions

| Function | Purpose |
|---|---|
| `pruneExpiredEntries()` | Loads cache, removes entries older than 6 hours, persists, returns the pruned cache |
| `getCachedSellers(sellerKeys, cache)` | Pure function — splits an array of seller keys into `{ cached, uncachedKeys }` using a pre-loaded cache object |
| `cacheSellers(sellerEntries)` | Merges new seller entries into the cache with the current timestamp |
| `clearSellerCache()` | Removes the entire cache key from `chrome.storage.local` |

#### Integration with Fetcher

`fetchAllListings()` in `fetcher.js` calls these functions in sequence:
1. `pruneExpiredEntries()` — evict stale data
2. `getCachedSellers()` — identify which sellers need fresh data
3. Apply cached shipping info to the sellers map
4. Call `fetchSellerShippingInfo()` only for uncached sellers
5. `cacheSellers()` — store newly fetched data

#### Integration with Service Worker

The service worker handles `MSG.CLEAR_SELLER_CACHE` messages (sent from the popup's "Clear Seller Cache" button) by calling `clearSellerCache()`.

---

### 4.13 Offscreen Document (Legacy)

**Files:** `src/offscreen/offscreen.html`, `src/offscreen/solver.js`

An earlier implementation that loaded and ran HiGHS in an offscreen document rather than directly in the service worker. This approach created a `<script>` tag from a Blob URL to load the Emscripten module, then listened for `MSG.SOLVE_ILP` messages.

**Not currently used.** The service worker loads HiGHS directly via `importScripts()`, which is simpler and avoids the overhead of creating/managing an offscreen document.

---

## End-to-End Data Flow

```
User clicks "Optimize"
        │
        ▼
Content Script: readCart()
  ├── Parses DOM for cart items
  ├── Extracts product IDs, names, quantities, prices
  └── Sends MSG.START_OPTIMIZATION → Service Worker
        │
        ▼
Service Worker: runFetchPhase()
  ├── Resolves custom listing product IDs
  ├── Builds card slots (item × quantity)
  ├── searchAllCardPrintings() ←→ TCGPlayer Search API
  │     └── Finds alternative printings across sets
  ├── fetchAllListings() ←→ TCGPlayer Listings API
  │     ├── Concurrent fetching (5 at a time)
  │     └── fetchSellerShippingInfo() ←→ TCGPlayer Shipping API
  │           └── Gets free shipping thresholds
  ├── Remaps listings to card slots
  ├── Caches data (in-memory + session storage)
  └── Sends MSG.LISTINGS_READY → Content Script
        │
        ▼
Content Script: showConfig()
  ├── User selects languages, conditions, max vendors, etc.
  └── Sends MSG.SOLVE_WITH_CONFIG → Service Worker
        │
        ▼
Service Worker: runSolvePhase()
  ├── Loads cached data
  ├── Applies filters (language, condition, exact printing, banned sellers)
  ├── buildLP() → CPLEX LP format string
  ├── solveILP() → HiGHS WASM solver
  │     └── Returns optimal assignment
  ├── parseSolution() → structured result
  ├── (Optional) Iterates for fewer vendors at same price
  └── Sends MSG.OPTIMIZATION_RESULT → Content Script
        │
        ▼
Content Script: showResults()
  ├── Displays cost breakdown, savings, per-seller items
  └── User clicks "Apply to Cart"
        │
        ▼
Content Script: applyOptimizedCart()
  ├── Reads cart key from cookie
  ├── clearCart() ←→ TCGPlayer Gateway API
  ├── addItemToCart() × N ←→ TCGPlayer Gateway API
  │     └── CAPI-4 fallback: tries alternative listings
  └── window.location.reload()
```

---

## Message Protocol

All inter-component communication uses `chrome.runtime.sendMessage()` (content ↔ service worker) and `chrome.tabs.sendMessage()` (service worker → content, popup → content).

### Content → Service Worker

| Type | Payload | Purpose |
|---|---|---|
| `START_OPTIMIZATION` | `{ cartData: { cartItems, currentCartTotal } }` | Begin fetch phase |
| `SOLVE_WITH_CONFIG` | `{ config: { languages, conditions, maxSellers, minimizeVendors, exactPrintings, bannedSellerKeys } }` | Begin solve phase |

### Service Worker → Content

| Type | Payload | Purpose |
|---|---|---|
| `OPTIMIZATION_PROGRESS` | `{ stage, message, current?, total? }` | Progress update |
| `LISTINGS_READY` | `{ options: { languages, conditions, cardCount, listingCount, sellerCount } }` | Fetch complete, show config |
| `OPTIMIZATION_RESULT` | `{ result: OptimizationResult }` | Single solve result |
| `OPTIMIZATION_MULTI_RESULT` | `{ results: OptimizationResult[] }` | Multi-solve results |
| `OPTIMIZATION_ERROR` | `{ error: string }` | Error message |

### Popup → Content

| Type | Payload | Purpose |
|---|---|---|
| `TOGGLE_PANEL` | — | Show/hide the optimizer panel |
| `PING` | — | Check if content script is loaded |

### Popup → Service Worker

| Type | Payload | Purpose |
|---|---|---|
| `CLEAR_SELLER_CACHE` | — | Clear all cached seller shipping data |

---

## Caching Strategy

### Tab Data Cache (Per-Session)

Fetched listing data is cached per-tab to enable re-solving with different filter configurations without re-fetching:

| Layer | Storage | Lifetime | Size Limit | Purpose |
|---|---|---|---|---|
| In-memory `Map` | Service worker heap | Until tab close or SW restart | None | Primary cache—fast, unlimited |
| `chrome.storage.session` | Browser session storage | Until tab close or browser restart | ~10MB | Backup—survives SW restarts |

Cache key: `tcgmizer_cache_{tabId}`

Cache value: `{ cardSlots, allListings, sellers, currentCartTotal }`

Cleanup: `chrome.tabs.onRemoved` listener removes both in-memory and session storage entries.

**Design rationale:** Large carts can produce tens of thousands of expanded slot-listings. The session storage quota (even with extended access level) may not be sufficient, so the in-memory cache is always the primary store. Session storage is a best-effort backup for surviving service worker restarts.

### Seller Info Cache (Cross-Session)

Seller shipping data (shipping cost, free-shipping thresholds) is cached persistently across browser sessions using `chrome.storage.local`. This avoids redundant shipping API calls when the user runs multiple optimizations, since seller shipping policies rarely change.

| Property | Value |
|---|---|
| Storage | `chrome.storage.local` |
| Key | `tcgmizer_seller_cache` |
| Entry format | `{ sellerName, sellerKey, sellerNumericId, shippingCost, freeShippingThreshold, timestamp }` |
| Max age | 6 hours (`CACHE_MAX_AGE_MS`) |
| Eviction | Expired entries are pruned at the start of each fetch phase |
| Manual clear | "Clear Seller Cache" button in the popup |

**Lifecycle during an optimization run:**

1. **Prune:** All entries older than 6 hours are deleted from the cache.
2. **Lookup:** The seller keys from the current optimization are checked against the remaining cache. Cached sellers have their `shippingCost` and `freeShippingThreshold` applied directly.
3. **Fetch:** Only uncached sellers are sent to the TCGPlayer shipping API (`fetchSellerShippingInfo`).
4. **Store:** Newly fetched seller data (only sellers that responded — not ghost sellers) is written to the cache with the current timestamp.

**Design rationale:** The shipping API is the second-slowest part of the fetch phase (after listing retrieval). For repeat optimizations — common when experimenting with filter settings or after adding/removing cart items — the vast majority of sellers will already be cached, reducing shipping API calls to near zero. The 6-hour TTL balances freshness against API call reduction.

---

## Error Handling & Fallback Logic

### Fetch Phase Errors

- **No items in cart:** Detected after `readCart()`. Shows error with debug info (main element presence, article count, product link count).
- **Unresolved custom listings:** Logged as warnings; items without product IDs are filtered out.
- **API failures:** Individual product fetch failures are logged and skipped; the optimization proceeds with whatever listings were successfully fetched.
- **No listings found:** If zero listings are returned across all products, shows an error suggesting the API may have changed.

### Solve Phase Errors

- **Uncovered slots:** If any card slot has zero listings after filtering, reports which cards are uncovered and suggests relaxing filters.
- **NaN in seller data:** Logged as warnings; `formatCoeff()` substitutes 0 for NaN values.
- **LP build failure:** Catches `buildLP()` exceptions (e.g., missing listings for a required slot) and reports to the user.
- **Solver failure:** Catches HiGHS exceptions; logs LP string excerpts for debugging.
- **Infeasible:** Reported with advice to increase max vendors or relax filters.

### Cart Application Errors

- **CAPI-4 (sold out):** Automatic retry with fallback listings sorted by price.
- **CAPI-17 (delisted):** Recorded as failed; user notified.
- **CAPI-35 (channel issue):** Prevented upstream by ghost seller filtering; recorded as failed if it still occurs.
- **Total failure:** If ALL items fail, returns error. Partial failures show a detailed alert with which items failed and why.

---

## Performance Considerations

| Area | Optimization |
|---|---|
| **API Fetching** | Sliding-window concurrency (5 concurrent, 100ms stagger) prevents rate limiting while maximizing throughput |
| **Product deduplication** | Multiple cart slots for the same product only trigger one API request |
| **Listing remap** | Pre-indexed `Map<productId, listing[]>` for O(1) slot remapping instead of O(slots × listings) linear scan |
| **Top-K pruning** | Only the 25 cheapest listings per slot are kept, dramatically reducing ILP size without affecting solution quality |
| **Adaptive topK** | Automatically scales down topK for large carts (15 for 75+ items, 20 for 50+ items) to keep ILP within WASM limits |
| **Aggregated constraints** | Seller-linking constraints use one aggregated inequality per seller instead of one per listing—~80% fewer constraints for large models |
| **LP line splitting** | Long constraint expressions are split at ~500 chars to stay within HiGHS's ~560-char line buffer |
| **ILP variable count** | For a cart with $C$ slots and $K=25$ top listings across $S$ sellers: ~$C \times K$ binary $x$ variables, $S$ binary $y$ variables, ≤$S$ binary $z$ variables |
| **Multi-solve** | Each vendor-count solve shares the same LP structure; only the `maxSellers` constraint changes. Dominated results are removed before sending to the UI. |
| **Cart application** | Sequential item addition with 50ms delays (required by the cart API); aggregation reduces duplicate sku+seller additions |
| **WASM solver** | HiGHS solver runs with `presolve: 'on'` and a 30-second time limit. Most carts solve in under 1 second. |
| **WASM stack** | Custom-built highs.wasm with 8MB stack (vs. 64KB in npm release) prevents stack overflow on large models |
| **WASM resilience** | Automatic retry with reduced model size on WASM crash; HiGHS instance reset after abort |
| **Seller cache** | Shipping info cached in `chrome.storage.local` with 6-hour TTL; repeat optimizations skip most shipping API calls |

---

## Key Design Decisions

### Two-Phase Architecture (Fetch → Solve)

The optimization is split into fetch and solve phases so users can adjust filter settings (language, condition, max vendors) and re-solve instantly without re-fetching listing data. This is important because the fetch phase involves many API requests and can take 10-30 seconds for large carts.

### Binary ILP over Heuristics

The extension uses exact optimization (integer linear programming) rather than greedy heuristics. This guarantees the mathematically optimal solution—the cheapest possible cart given the constraints. The HiGHS solver handles problems with thousands of variables efficiently via branch-and-bound with presolving.

### IIFE Bundle Format

Both the service worker and content script are bundled as IIFE (not ESM). The service worker requires IIFE because MV3 demands static `importScripts()` calls that don't work with ESM. The content script uses IIFE because Chrome content scripts don't support module format.

### Product-Link-Centric Cart Reading

Rather than relying on specific CSS class names (which TCGPlayer frequently changes), the cart reader anchors on `<a href="/product/...">` links—a structural invariant of the cart page—and walks outward to find containing elements. This approach has proven more resilient to TCGPlayer UI updates.

### Slot-Based ILP Formulation

Each cart item copy gets its own "slot" in the ILP (e.g., 3 copies of a card = 3 independent slots). This allows the solver to assign different copies to different sellers/printings, enabling more flexible and cheaper solutions than requiring all copies to come from the same listing.

### Free Shipping as a Decision Variable

Free shipping thresholds are modeled with a binary variable $z_v$ rather than being pre-computed. This allows the solver to discover that spending slightly more at one seller triggers free shipping, potentially lowering the overall cost—something that heuristic approaches typically miss.

### Ghost Seller Filtering

Sellers whose listings appear in the search index but whose storefronts are inactive are detected by cross-referencing listing results with shipping API responses. This prevents the solver from choosing solutions that would fail during cart application with CAPI-35 errors.

### No External Dependencies at Runtime

The extension has zero runtime dependencies on external services. All computation happens locally using TCGPlayer's own public APIs. This ensures privacy, reliability, and eliminates the need for server infrastructure.

### Custom WASM Solver Build

Rather than relying on the published `highs` npm package, we build HiGHS WASM from source with an 8MB Emscripten stack. The npm v1.8.0 ships with a 64KB stack—sufficient for small models but catastrophically insufficient for 100-item carts. This was the root cause of "Aborted()" and "function signature mismatch" crashes. The upstream fix (PR #43 to `lovasoa/highs-js`) was merged but never released, so we build ourselves via Docker.

### Graceful Degradation for Large Models

The solver uses a layered defense against oversized ILP models:
1. **Aggregated constraints** reduce LP string size ~80%.
2. **Adaptive topK** scales down the number of candidate listings per slot based on cart size.
3. **Retry with reduction** automatically shrinks the model if WASM still crashes.
4. **Instance reset** re-initializes HiGHS after a WASM abort.
5. **User-facing message** if all retries are exhausted, with actionable suggestions.
