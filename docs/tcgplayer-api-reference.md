# TCGPlayer API Reference

Reverse-engineered from TCGPlayer.com's own network requests and built into TCGmizer.

## Base URLs

| Alias | URL | Purpose |
|-------|-----|---------|
| Search API | `https://mp-search-api.tcgplayer.com` | Product search & listing search |
| Root API | `https://mpapi.tcgplayer.com` | Seller info, shipping, user data |
| Gateway API | `https://mpgateway.tcgplayer.com` | Cart operations (add/clear/summary) |

---

## 1. Product Listings Search

Fetches seller listings for a specific product (card).

**Endpoint:** `POST /v1/product/{productId}/listings`  
**Base:** Search API

### Request

```json
{
  "filters": {
    "term": {
      "sellerStatus": "Live",
      "channelId": 0,
      "language": ["English"]
    },
    "range": {
      "quantity": { "gte": 1 }
    },
    "exclude": {
      "channelExclusion": 0
    }
  },
  "context": {
    "shippingCountry": "US",
    "cart": {}
  },
  "sort": {
    "field": "price",
    "order": "asc"
  },
  "from": 0,
  "size": 50,
  "aggregations": ["listingType"]
}
```

### Filter Fields

| Field | Value | Purpose |
|-------|-------|---------|
| `sellerStatus` | `"Live"` | Only active sellers |
| `channelId` | `0` | Main TCGPlayer marketplace channel |
| `language` | `["English"]` | Optional — filter by language |
| `quantity.gte` | `1` | In stock only |
| **`channelExclusion`** | `0` | **Critical** — excludes sellers whose channel 0 access has been revoked. Without this, "ghost sellers" appear in results but fail with CAPI-35 when adding to cart. |

### Pagination

- `from`: 0-based offset
- `size`: page size (max 50)
- Loop until `innerResults.length < pageSize` or `listings.length >= totalResults`

### Sort Options

TCGPlayer's site uses `"price+shipping"` for the default sort. The field `"price"` sorts by item price only.

### Aggregations

TCGPlayer sends `"aggregations": ["listingType"]` to get a breakdown of listing types. The first (aggregation-only) request uses `"size": 0` to just get counts. Known aggregation keys: `"listingType"`, `"seller-key"`, `"condition"`, `"quantity"`, `"language"`, `"printing"`.

### Response

```json
{
  "errors": [],
  "results": [
    {
      "totalResults": 79,
      "resultId": "li52927b95-...",
      "aggregations": {
        "listingType": [{"value": "standard", "count": 79}],
        "condition": [
          {"value": "Near Mint", "count": 67},
          {"value": "Lightly Played", "count": 9}
        ]
      },
      "results": [
        {
          "listingId": 633372429,
          "channelId": 0,
          "conditionId": 1,
          "productId": 535813,
          "productConditionId": 7715648,
          "sellerId": "239288",
          "sellerKey": "277b05a9",
          "sellerName": "Anon TCG",
          "sellerRating": 100,
          "sellerSales": "3995",
          "sellerPrograms": ["CertifiedHobbyShop", "Pro", "VIP", "Presale"],
          "sellerPrice": 0.4,
          "sellerShippingPrice": 2.31,
          "price": 0.4,
          "shippingPrice": 2.31,
          "rankedShippingPrice": 2.31,
          "condition": "Near Mint",
          "language": "English",
          "languageId": 1,
          "languageAbbreviation": "EN",
          "printing": "Normal",
          "quantity": 10,
          "score": 2.71,
          "listingType": "standard",
          "directSeller": false,
          "directListing": false,
          "directProduct": true,
          "directInventory": 32,
          "goldSeller": true,
          "verifiedSeller": true,
          "forwardFreight": false,
          "customData": {"images": []}
        },
        {
          "listingId": 2772095,
          "channelId": 0,
          "conditionId": 1,
          "productId": 222039,
          "productConditionId": 4562830,
          "sellerId": "432376",
          "sellerKey": "831e3326",
          "sellerName": "GOL Card sales",
          "sellerRating": 100,
          "sellerSales": "1610",
          "sellerPrice": 0.38,
          "sellerShippingPrice": 0.99,
          "price": 0.38,
          "shippingPrice": 1.31,
          "rankedShippingPrice": 1.31,
          "condition": "Near Mint",
          "language": "English",
          "languageId": 1,
          "languageAbbreviation": "EN",
          "printing": "Normal",
          "quantity": 1,
          "score": 0.38,
          "listingType": "custom",
          "directSeller": false,
          "directListing": false,
          "directProduct": true,
          "directInventory": 0,
          "goldSeller": true,
          "verifiedSeller": false,
          "forwardFreight": false,
          "customData": {
            "images": ["EE7C7C85-3AFE-442D-8481-6958C4F84468"],
            "title": "Kazuul's Fury",
            "description": "",
            "linkId": "ELL_jwNn3T01"
          }
        }
      ]
    }
  ]
}
```

### Response Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `listingId` | number | Unique listing identifier |
| `productId` | number | The product this listing is for |
| `productConditionId` | number | **The SKU** — uniquely identifies product+condition+language+printing. This is what the cart API calls `sku`. |
| `sellerId` | string | Numeric seller ID (comes as a string despite being a number) |
| `sellerKey` | string | UUID-style seller identifier — **the canonical seller ID** used in all other APIs |
| `sellerName` | string | Display name |
| `sellerPrograms` | string[] | Seller certifications: `"CertifiedHobbyShop"`, `"Pro"`, `"VIP"`, `"Presale"`, `"DirectViewable"`, `"International"` |
| `price` / `sellerPrice` | number | Item price (appear to be the same) |
| `shippingPrice` / `sellerShippingPrice` | number | Shipping cost (appear to be the same) |
| `rankedShippingPrice` | number | Shipping price used for ranking/sorting |
| `condition` | string | `"Near Mint"`, `"Lightly Played"`, `"Moderately Played"`, `"Heavily Played"`, `"Damaged"` |
| `conditionId` | number | Numeric condition ID (1 = Near Mint) |
| `language` | string | Full language name |
| `languageId` | number | Numeric language ID |
| `languageAbbreviation` | string | 2-letter code (`"EN"`) |
| `printing` | string | `"Normal"`, `"Foil"`, etc. |
| `quantity` | number | Available quantity from this seller |
| `score` | number | Relevance/ranking score |
| `listingType` | string | `"standard"` for normal listings, `"custom"` for listings with user-uploaded images |
| `directSeller` | boolean | Whether the seller participates in TCGPlayer Direct |
| `directListing` | boolean | Whether this specific listing is fulfilled via Direct |
| `directProduct` | boolean | Whether TCGPlayer Direct has inventory for this product |
| `directInventory` | number | Total Direct inventory count across all Direct sellers |
| `goldSeller` | boolean | Gold star seller badge |
| `verifiedSeller` | boolean | Identity verified seller |
| `forwardFreight` | boolean | Related to freight forwarding |
| `customData` | object | Contains `images` array and, for custom listings, a `linkId` field |
| `customData.linkId` | string | **Custom Listing Key** — present only when `listingType` is `"custom"`. Used as `customListingKey` in the `/listo/add` cart endpoint. Example: `"ELL_jwNn3T01"`. |

### Key Gotchas

1. **Double-nested results:** `data.results[0].results` contains listings; `data.results[0].totalResults` has the count.
2. **sellerId is a string:** Despite being numeric, `sellerId` comes as a string (`"239288"`, not `239288`).
3. **productConditionId = SKU:** This is the crucial mapping — the listings API calls it `productConditionId`, the cart API calls it `sku`.
4. **channelExclusion is critical:** Without `"exclude": {"channelExclusion": 0}`, the API returns listings from sellers who have been banned/suspended from channel 0 but haven't been purged from the search index. These listings can never be added to cart (CAPI-35).
5. **Custom listings have a different cart endpoint:** When `listingType` is `"custom"`, the listing has a `customData.linkId` field. These listings must be added to the cart via `/listo/add` (not `/item/add`). Using the standard endpoint for custom listings returns CAPI-17.

---

## 2. Product Search (by Name)

Search for products (cards) by name, used to find alternative printings of the same card across different sets.

**Endpoint:** `POST /v1/search/request?q={encodedCardName}&isList=false`  
**Base:** Search API

### Request

```json
{
  "algorithm": "revenue_dismax",
  "from": 0,
  "size": 50,
  "filters": {
    "term": {},
    "range": {},
    "match": {}
  },
  "listingSearch": {
    "context": { "cart": {} },
    "filters": {
      "term": { "sellerStatus": "Live", "channelId": 0 },
      "range": { "quantity": { "gte": 1 } },
      "exclude": { "channelExclusion": 0 }
    }
  },
  "context": {
    "cart": {},
    "shippingCountry": "US"
  },
  "settings": {
    "useFuzzySearch": true,
    "didYouMean": {}
  },
  "sort": {}
}
```

### Fields

| Field | Value | Purpose |
|-------|-------|---------|
| `algorithm` | `"revenue_dismax"` | **Required** — must be `"revenue_dismax"`. An empty string causes 400 errors. |
| `size` | `50` max | **Max page size is 50.** Values above 50 (e.g. 100) cause 400 Bad Request. |
| `filters.term` | `{}` | Empty by default. Can include `productLineName` to restrict to a game (see below). |
| `filters.range` | `{}` | **Must be empty `{}`**. Older filter fields like `marketPrice` are not valid on this endpoint and cause 400 errors. |
| `listingSearch` | object | Listing-level filters. Mirrors the structure used by the listings endpoint. |
| `settings.useFuzzySearch` | `true` | Enables fuzzy matching for card names. |

### Product Line Filtering

To restrict search to a specific game/product line, add `productLineName` to `filters.term`:

```json
{
  "filters": {
    "term": {
      "productLineName": ["magic"]
    },
    "range": {},
    "match": {}
  }
}
```

The `productLineName` filter value is the `productLineUrlName` field from the Product Lines API (see [Section 8](#8-product-lines)). These are lowercase URL slugs like `"magic"`, `"pokemon"`, `"yugioh"` — not the display names like `"Magic: The Gathering"`.

### Invalid Fields (Cause 400 Errors)

The following fields were previously used but are **not valid** on this endpoint:

| Invalid Field | Notes |
|---------------|-------|
| `filters.term.productTypeName` | Not a valid search filter. Causes 400. |
| `filters.range.marketPrice` | Not a valid search range filter. Causes 400. |
| `algorithm: ""` | Empty string is rejected. Must be `"revenue_dismax"`. |
| `size` > 50 | Max page size is 50. |

### Response

```json
{
  "results": [
    {
      "totalResults": 15,
      "results": [
        {
          "productId": 534753,
          "productName": "Blood Crypt",
          "groupName": "Ravnica Allegiance",
          "setName": "Ravnica Allegiance",
          "marketPrice": 12.50,
          "lowestPrice": 10.99,
          "lowestPriceWithShipping": 11.99,
          "totalListings": 247,
          "productLineId": 3,
          "productLineName": "Magic: The Gathering",
          "productTypeId": 1,
          "productTypeName": "Cards",
          "productUrlName": "Blood Crypt",
          "productLineUrlName": "Magic",
          "setUrlName": "Ravnica-Allegiance",
          "rarityName": "Rare",
          "isPresale": false,
          "isOutOfStock": false,
          "customAttributes": { ... }
        }
      ]
    }
  ]
}
```

### Filtering Applied After Response

1. **Exact name match:** `productName.toLowerCase()` must equal the search term, or start with `cardName + " ("` (allows treatment suffixes like `"(Extended Art)"`, `"(Borderless)"`)
2. **Has listings:** Products with `totalListings === 0` are excluded
3. **Same game:** Only products with the same `productLineId` as the original cart items are used

---

## 3. Product Details

Get detailed information about a specific product.

**Endpoint:** `GET /v2/product/{productId}/details`  
**Base:** Search API

### Response (key fields)

```json
{
  "productId": 535813,
  "productName": "Alandra, Sky Dreamer",
  "productLineName": "Magic: The Gathering",
  "productLineId": 1,
  "setName": "Commander: Murders at Karlov Manor",
  "setId": 23363,
  "setCode": "MKC",
  "marketPrice": 4.15,
  "lowestPrice": 0.62,
  "lowestPriceWithShipping": 3.0,
  "medianPrice": 4.23,
  "listings": 79,
  "sellers": 73,
  "maxFulfillableQuantity": 255,
  "customListings": 0,
  "shippingCategoryId": 1,
  "productTypeName": "Cards",
  "rarityName": "Rare",
  "normalOnly": true,
  "foilOnly": false,
  "sealed": false,
  "sellerListable": true,
  "skus": [
    {"sku": 7715648, "condition": "Near Mint", "variant": "Normal", "language": "English"},
    {"sku": 7715649, "condition": "Lightly Played", "variant": "Normal", "language": "English"},
    {"sku": 7715650, "condition": "Moderately Played", "variant": "Normal", "language": "English"}
  ],
  "formattedAttributes": {
    "Rarity": "R",
    "#": "94",
    "Card Type": "Legendary Creature — Merfolk Wizard",
    "P / T": "2 / 4",
    "Artist": "Caroline Gariba"
  }
}
```

### Important Notes

- The `skus` array maps conditions/languages/variants to their numeric SKU IDs. The SKU here matches `productConditionId` from the listings API.
- `maxFulfillableQuantity` = total inventory across all sellers

---

## 4. Seller Shipping Info

Get shipping rates and free-shipping thresholds for sellers.

**Endpoint:** `POST /v2/seller/shippinginfo?countryCode=US`  
**Base:** Root API

### Request

Body is a **plain array** (not wrapped in an object):

```json
[
  {"sellerId": 214769, "largestShippingCategoryId": 1},
  {"sellerId": 66786, "largestShippingCategoryId": 1}
]
```

| Field | Type | Description |
|-------|------|-------------|
| `sellerId` | number | **Numeric** seller ID (not sellerKey) |
| `largestShippingCategoryId` | number | `1` = card singles |

### Batching

- Send in batches of **50 sellers** max
- **200ms delay** between batches

### Response

```json
{
  "results": [
    [
      {
        "sellerId": 214769,
        "sellerKey": "277b05a9",
        "sellerShippingOptions": [
          {
            "shippingPriceUnderThreshold": 0.99,
            "shippingPriceOverThreshold": 0.00,
            "thresholdPrice": 35.00
          }
        ]
      }
    ]
  ]
}
```

### Free Shipping Logic

- If `shippingPriceOverThreshold < shippingPriceUnderThreshold`: the seller offers free (or reduced) shipping above `thresholdPrice`
- If `shippingPriceOverThreshold >= shippingPriceUnderThreshold`: no free shipping benefit, threshold is ignored

### Ghost Seller Detection

Sellers that appear in the listings search index but are NOT returned by the shipping API are considered "ghost sellers." Their listings are filtered out because they always fail with CAPI-35 when adding to cart.

### Response Parsing Quirk

The response may be `data.results[0]` (array of arrays) or `data.results` (just the array). Code handles both with `Array.isArray()` check.

---

## 5. Direct Info

Check if the current user is eligible for TCGPlayer Direct and what the free shipping threshold is.

**Endpoint:** `GET /v2/search/directInfo?userKey={userKey}&shippingCountry=US`  
**Base:** Root API

### Response

```json
{
  "errors": [],
  "results": [{"isUserDirectEligible": true, "directShippingThreshold": 50.00}]
}
```

---

## 6. Free Shipping Threshold

Global free shipping threshold for Direct.

**Endpoint:** `GET /v2/param/freeshippingthreshold`  
**Base:** Root API

---

## 7. Cart Operations

All cart operations require the cart key, obtained from the `StoreCart_PRODUCTION` cookie.

### Cart Key

**Cookie:** `StoreCart_PRODUCTION`  
**Format:** `CK={cartKey}&Ignore=false`  
**Example key:** `c3738f5da18948758a9b885fab70306a`

### 7a. Create Anonymous Cart

**Endpoint:** `POST /v1/cart/create/anonymouscart`  
**Base:** Gateway API

Called by TCGPlayer's site when no cart exists. Returns the new cart key.

### 7b. Clear Cart

**Endpoint:** `DELETE /v1/cart/{cartKey}/items/all`  
**Base:** Gateway API  
**Credentials:** `include` (cookies required)

Returns HTTP 200 on success.

### 7c. Add Item to Cart

**Endpoint:** `POST /v1/cart/{cartKey}/item/add`  
**Base:** Gateway API  
**Credentials:** `include` (cookies required)

### Request Body

```json
{
  "sku": 7715648,
  "sellerKey": "277b05a9",
  "channelId": 0,
  "requestedQuantity": 1,
  "price": 4.65,
  "isDirect": false,
  "countryCode": "US"
}
```

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| `sku` | number | Yes | `productConditionId` from listings | The SKU identifying product+condition+language |
| `sellerKey` | string | Yes | `sellerKey` from listings | UUID-style seller identifier |
| `channelId` | number | Yes | Hardcoded `0` | Main marketplace channel |
| `requestedQuantity` | number | Yes | Computed | Aggregated if same sku+seller appears multiple times |
| `price` | number | Yes | `price` from listings | Unit price |
| `isDirect` | boolean | Yes | `directSeller` from listings | Whether this is a Direct listing |
| `countryCode` | string | Yes | Hardcoded `"US"` | |

### What is NOT Sent

TCGPlayer's own site does **not** send these fields to `/item/add` (and sending them may cause issues):
- `sellerId` (the numeric seller ID) — **never sent**

**Note:** Custom listings (with user-uploaded images) use an entirely different endpoint — see section 7d below.

### Response (Success)

```json
{
  "errors": [],
  "results": [
    {
      "isDirect": false,
      "sellerQuantityAvailable": 1,
      "itemQuantityInCart": 1,
      "currentPrice": 0.10,
      "status": 0
    }
  ]
}
```

### Response (Error)

HTTP 400 or 422 with error body:

```json
{
  "errors": [
    {"code": "CAPI-35", "message": "ProductCategoryNotVisible"}
  ],
  "results": []
}
```

**Note:** HTTP 200 can also contain errors in the body. Always check `data.errors.length`.

### Error Codes

| Code | HTTP Status | Message | Meaning | Root Cause |
|------|------------|---------|---------|------------|
| `CAPI-4` | 422 | `CartItemQuantityNotAvailable` | Item sold out | Seller's inventory is 0; the listing is stale in the search index |
| `CAPI-17` | 400 | `ProductNotFound` | Product delisted or custom listing | Product has been removed from TCGPlayer, **or** a custom listing was sent to `/item/add` instead of `/listo/add` |
| `CAPI-35` | 400 | `ProductCategoryNotVisible` | Seller banned/suspended | Seller's channel 0 access revoked. Prevented by `channelExclusion` filter in listings search |

### 7d. Add Custom Listing to Cart

**Endpoint:** `POST /v1/cart/{cartKey}/listo/add`  
**Base:** Gateway API  
**Credentials:** `include` (cookies required)

Used for listings with `listingType: "custom"` — these are listings where the seller has uploaded their own product images rather than using TCGPlayer's stock images. They appear on the product page with a "Custom Listing" badge.

### Request Body

```json
{
  "customListingKey": "ELL_jwNn3T01",
  "priceAtAdd": 0.38,
  "quantityToBuy": 1,
  "channelId": 0,
  "countryCode": "US"
}
```

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| `customListingKey` | string | Yes | `customData.linkId` from listings | The unique key identifying this custom listing |
| `priceAtAdd` | number | Yes | `price` from listings | Unit price |
| `quantityToBuy` | number | Yes | Computed | Equivalent of `requestedQuantity` on `/item/add` |
| `channelId` | number | Yes | Hardcoded `0` | Main marketplace channel |
| `countryCode` | string | Yes | Hardcoded `"US"` | |

### What to Notice

- Uses a **completely different request body** — no `sku`, no `sellerKey`, no `isDirect`
- The `customListingKey` value comes from the `customData.linkId` field in the listings API response (NOT a top-level field)
- The `priceAtAdd` field replaces `price`; `quantityToBuy` replaces `requestedQuantity`
- The response format is the same as `/item/add`

### How to Detect Custom Listings

In the listings API response, check:
- `entry.listingType === "custom"` — the listing type field
- `entry.customData?.linkId` — the custom listing key (present only on custom listings)

If either is present, use `/listo/add` instead of `/item/add`.

### 7e. Cart Summary

**Endpoint:** `GET /v1/cart/{cartKey}/summary`  
**Base:** Gateway API

Returns cart contents and totals. Variant: `?includeTaxes=false`

### 7f. Cart Summary Count

**Endpoint:** `GET /v1/cart/{cartKey}/summary/count`  
**Base:** Gateway API

Returns just the item count.

### 7g. Cart Summary Meta

**Endpoint:** `GET /v1/cart/{cartKey}/summary/meta`  
**Base:** Gateway API

---

## 8. Product Lines

Fetches the list of all product lines (games/categories) on TCGPlayer. Used to map a product line name (e.g. "Magic: The Gathering") to the URL slug needed for search filters (e.g. "magic").

**Endpoint:** `GET /v1/search/productLines`  
**Base:** Search API

### Response

Returns a JSON array of product line objects:

```json
[
  {
    "productLineId": 1,
    "productLineName": "Magic: The Gathering",
    "productLineUrlName": "magic",
    "isDirect": true
  },
  {
    "productLineId": 2,
    "productLineName": "YuGiOh",
    "productLineUrlName": "yugioh",
    "isDirect": true
  },
  {
    "productLineId": 3,
    "productLineName": "Pokemon",
    "productLineUrlName": "pokemon",
    "isDirect": true
  }
]
```

### Fields

| Field | Type | Purpose |
|-------|------|---------|
| `productLineId` | number | Unique ID for the product line |
| `productLineName` | string | Display name (e.g. "Magic: The Gathering") |
| `productLineUrlName` | string | URL slug used in search filters (e.g. "magic") |
| `isDirect` | boolean | Whether TCGPlayer Direct is available for this product line |

### Usage in TCGmizer

The `productLineUrlName` is the value used in the Product Search filter `filters.term.productLineName`. For example, to restrict search to Magic: The Gathering cards, set `productLineName: ["magic"]`.

TCGmizer fetches this list once and caches it for the session. The `productLineName` from cart items (extracted from the DOM's set info string, e.g. "Lorwyn Eclipsed, **Magic: The Gathering**, R, 349") is matched case-insensitively against `productLineName` to find the corresponding `productLineUrlName` slug.

---

## 9. Other Observed Endpoints

These endpoints were observed in TCGPlayer's network traffic but are not currently used by TCGmizer:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/recommendation/faceted` | POST | Product recommendations ("you might also like") |
| `/v1/pricepoints/marketprice/skus/search` | POST | Market price data for SKUs |
| `/v1/pricepoints/marketprice/skus/{sku}/volatility` | GET | Price volatility data |
| `/v1/pricepoints/buylist/marketprice/products/{id}` | GET | Buylist prices |
| `/v2/product/{id}/latestsales` | POST | Recent sales history |
| `/v2/Catalog/SetName/{setId}` | GET | Set name lookup |
| `/v2/Catalog/CatalogGroups` | GET | All catalog groups |
| `/v2/Catalog/CategoryFilters` | GET | Category filter definitions |
| `/v1/product/categoryfilters?categoryId=1` | GET | Category-specific filters |
| `/v2/user` | GET | Current user info |
| `/v2/kickbacks?active=true` | GET | Active promotions/kickbacks |
| `/v2/address/countryCodes` | GET | Supported countries |
| `/v1/product/latestsets/{lineIds}` | GET | Latest sets per product line |

---

## Key Concept: The Listings-to-Cart Field Translation

This is the most important mapping in the entire system:

```
Listings API Field          →  Cart API Field
────────────────────────       ─────────────────
productConditionId          →  sku
sellerKey                   →  sellerKey
(hardcoded 0)               →  channelId
(computed)                  →  requestedQuantity
price                       →  price
directSeller                →  isDirect
(hardcoded "US")            →  countryCode
```

**`productConditionId` = `sku`** is the single most critical mapping. If you get this wrong, you'll get `CAPI-17` Product Not Found errors.

---

## Key Concept: channelExclusion Filter

The `"exclude": {"channelExclusion": 0}` filter in the listings search request is **essential**. It tells the search API to exclude sellers who have had their channel 0 (standard marketplace) access revoked.

### Without channelExclusion

The search index may contain listings from sellers who:
- Have been suspended or banned
- Have closed their stores
- Have had their marketplace access revoked

These sellers appear with `sellerStatus: "Live"` in the index (it hasn't been updated), but:
- Their seller profile APIs return **404**
- Their shipping info API **doesn't return them**
- Adding their items to cart **always fails with CAPI-35**

### Evidence

Diagnosed sellers 428494 (`f491f4b8`), 71949 (`0328ba13`), and 81739 (`3f77485f`):
- All seller APIs (`/v2/seller/{key}`, `/v2/seller/{key}/store`) → **404**
- Gateway seller API (`/v1/seller/{key}`) → **404**
- Product condition API → **404**
- But their listings appeared in the search index with `sellerStatus: "Live"`

---

## Key Concept: Direct vs Standard Listings

TCGPlayer has two fulfillment types:

### Standard Listings
- Shipped directly from the seller
- `directSeller: false`, `directListing: false`
- Shipping cost varies by seller
- `isDirect: false` in cart add request

### TCGPlayer Direct Listings
- Inventory held at TCGPlayer's warehouse
- `directSeller: true`, `directListing: true`
- Unified shipping: free above a threshold ($50 typical)
- `isDirect: true` in cart add request
- The highlighted "TCGplayer Direct" box at the top of a product page picks the cheapest Direct listing

### Product-Level Direct Fields
- `directProduct: true` — the product _has_ Direct inventory available
- `directInventory: 109` — total Direct inventory count
- These appear on ALL listings for that product, not just Direct listings

---

## Key Concept: Cart Workflow

1. **Get cart key** from `StoreCart_PRODUCTION` cookie
2. **Clear cart** — `DELETE /v1/cart/{cartKey}/items/all`
3. **Add items one at a time:**
   - Standard listings → `POST /v1/cart/{cartKey}/item/add`
   - Custom listings (with `customData.linkId`) → `POST /v1/cart/{cartKey}/listo/add`
   - 50ms delay between requests
   - CAPI-4 errors (sold out) trigger automatic fallback to next-cheapest listing
   - Aggregate same sku+seller into single request with combined quantity
4. **Report results** — partial success possible (some items fail while others succeed)

---

## Key Concept: Seller Identification

TCGPlayer has two seller identifiers:

| Identifier | Format | Where Used |
|------------|--------|-----------|
| `sellerId` | Numeric (e.g., `239288`) | Shipping API request body, listings API response |
| `sellerKey` | UUID-style string (e.g., `"277b05a9"`) | Cart API, seller profile URLs, seller pages |

**`sellerKey` is canonical.** The cart API only accepts `sellerKey`, not `sellerId`. The listings API returns both, but the seller is keyed internally by `sellerKey`.

Seller page URL pattern: `https://www.tcgplayer.com/sellers/{SellerName}/{sellerKey}`

---

## Key Concept: Cart Page DOM Structure

The cart page (`/cart`) renders items as `<li>` elements inside `<article>` containers. Each item has product links used to identify the card.

### Standard Items

Standard items have links with the format `/product/{productId}/...`:

```html
<a href="/product/222039/magic--kazuul-s-fury">
  <p class="name" data-testid="productName">Kazuul's Fury</p>
</a>
```

The product ID (`222039`) is extracted directly from the URL with the regex `/\/product\/(\d+)/`.

### Custom Listing Items

Custom listings (seller-uploaded images) have a different URL format — `/product/listing/{customListingKey}/...`:

```html
<a href="/product/listing/ELL_jwNn3T01/magic-zendikar-rising-kazuul-s-fury">
  <p class="name" data-testid="productName">Kazuul's Fury</p>
</a>
```

Key differences from standard items:
- The URL contains the `customListingKey` (e.g., `ELL_jwNn3T01`) instead of a numeric product ID
- The image wrapper has an additional CSS class `listo-image`
- There is **no product ID in the URL** — it must be resolved by searching the card name via the product search API

### Extracting Product Info

The cart reader uses two regex patterns:

| URL Pattern | Regex | Extracts |
|---|---|---|
| `/product/222039/...` | `/\/product\/(\d+)/` | `productId: 222039` |
| `/product/listing/ELL_jwNn3T01/...` | `/\/product\/listing\/([^/]+)/` | `customListingKey: "ELL_jwNn3T01"` |

For custom listing items, the product ID is resolved by calling the product search API with the card name, then using the first matching result's `productId`.

### Common Item Fields (from DOM)

Both standard and custom items share the same metadata structure:

| Selector / Method | Field | Example |
|---|---|---|
| `[data-testid="productName"]` | Card name | `"Kazuul's Fury"` |
| `[data-testid="txtItemCondition"]` | Condition | `"Near Mint"` |
| `[data-testid="txtItemPrice"]` | Price | `"$0.38"` |
| `p.item-metadata` spans | Set/game/rarity | `"Zendikar Rising, Magic: The Gathering, U, 146"` |
| `select` or `[aria-label*="quantity"]` | Quantity | `1` |

---

## Authentication

Most APIs work without authentication for reading data. The cart modification APIs require the session cookie (sent via `credentials: 'include'`). The cookie `StoreCart_PRODUCTION` contains the cart key.

No API keys or tokens are needed for the endpoints used by TCGmizer — they're all public marketplace APIs accessed from the TCGPlayer domain origin.

---

## Rate Limiting

No explicit rate limits were observed, but the extension uses conservative delays:

| Operation | Delay |
|-----------|-------|
| Between listing fetches per product | 100ms (5 concurrent) |
| Between product name searches | 200ms |
| Between shipping info batches | 200ms |
| Between cart add requests | 50ms |

---

## Response Pattern

All TCGPlayer APIs follow the same envelope pattern:

```json
{
  "errors": [],
  "results": [ ... ]
}
```

Many have a **double-nested** results structure where `results[0]` contains the actual data:
- Listings: `data.results[0].results` (array of listings)
- Search: `data.results[0].results` (array of products)
- Shipping: `data.results[0]` (array of seller shipping info)
