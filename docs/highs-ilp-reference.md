# HiGHS ILP Solver — Reference & Integration Guide

Comprehensive documentation of the HiGHS library, the CPLEX LP format it consumes, and how TCGmizer integrates it to optimize TCGPlayer shopping carts.

---

## Table of Contents

1. [What is HiGHS](#what-is-highs)
2. [Installation & Packaging](#installation--packaging)
3. [Loading HiGHS in a Chrome Extension](#loading-highs-in-a-chrome-extension)
4. [The HiGHS JavaScript API](#the-highs-javascript-api)
5. [CPLEX LP Format](#cplex-lp-format)
6. [Known HiGHS Limitations & Gotchas](#known-highs-limitations--gotchas)
7. [The TCGmizer ILP Model](#the-tcgmizer-ilp-model)
8. [Variable Naming Conventions](#variable-naming-conventions)
9. [Constraint Reference](#constraint-reference)
10. [Solution Object Reference](#solution-object-reference)
11. [Solution Parsing](#solution-parsing)
12. [Multi-Solve (Minimize Vendors)](#multi-solve-minimize-vendors)
13. [Debugging the ILP](#debugging-the-ilp)
14. [Performance Considerations](#performance-considerations)

---

## What is HiGHS

**HiGHS** (High-performance Solver) is an open-source solver for linear programming (LP), mixed-integer programming (MIP), and quadratic programming (QP). It is developed at the University of Edinburgh and is one of the fastest open-source solvers available.

- **Repository**: https://github.com/ERGO-Code/HiGHS
- **npm package**: [`highs`](https://www.npmjs.com/package/highs) (v1.8.0)
- **License**: MIT
- **WASM build**: The npm package includes an Emscripten-compiled WASM binary (`highs.wasm`) and a JavaScript loader (`highs.js`) that can run in browsers and service workers.

TCGmizer uses HiGHS to solve an **Integer Linear Program (ILP)** — specifically a **binary ILP** where all decision variables are 0 or 1 — to find the minimum-cost assignment of card listings to sellers, accounting for item prices, shipping costs, and free shipping thresholds.

---

## Installation & Packaging

### npm Dependency

```json
{
  "dependencies": {
    "highs": "^1.8.0"
  }
}
```

### Build Process

The build script (`build.js`) copies the HiGHS runtime files from `node_modules` into the extension's `dist/` directory:

```javascript
// Copy HiGHS WASM and JS files to dist
const highsDir = resolve(__dirname, 'node_modules/highs/build');
cpSync(resolve(highsDir, 'highs.wasm'), resolve(__dirname, 'dist/highs.wasm'));
cpSync(resolve(highsDir, 'highs.js'), resolve(__dirname, 'dist/highs.js'));
```

This produces two files in `dist/`:
- **`highs.js`** — Emscripten-generated JavaScript module loader (~300KB). Exports a factory function (`Module`) that initializes the WASM solver.
- **`highs.wasm`** — The compiled HiGHS solver binary (~1.5MB).

### Manifest Configuration

The WASM file must be declared as a web-accessible resource and the CSP must allow WASM evaluation:

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  },
  "web_accessible_resources": [
    {
      "resources": ["dist/highs.wasm"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

- **`'wasm-unsafe-eval'`** is required because WASM compilation involves `WebAssembly.compile()` / `WebAssembly.instantiate()`, which Chrome's default Manifest V3 CSP blocks.
- The WASM file must be web-accessible so the Emscripten loader can fetch it by URL.

---

## Loading HiGHS in a Chrome Extension

### Service Worker Approach (Current)

The service worker loads HiGHS using `importScripts()`, which is only available in **classic** (non-module) service workers. The background script is bundled as IIFE format by esbuild:

```javascript
// esbuild config
await esbuild.build({
  entryPoints: ['src/background/service-worker.js'],
  outfile: 'dist/background.js',
  format: 'iife',  // Required for importScripts() support
});
```

Loading sequence in `service-worker.js`:

```javascript
// Step 1: Load the HiGHS JS module at top level (synchronous)
try {
  importScripts('highs.js');
  console.log('[TCGmizer SW] HiGHS JS loaded via importScripts');
} catch (e) {
  console.error('[TCGmizer SW] Failed to load HiGHS JS:', e);
}

// Step 2: Initialize the WASM module (async, lazy, cached)
let highs = null;
let highsLoading = null;

async function getHighs() {
  if (highs) return highs;
  if (highsLoading) return highsLoading;

  highsLoading = (async () => {
    const wasmUrl = chrome.runtime.getURL('dist/highs.wasm');

    // globalThis.Module is set by highs.js when loaded via importScripts
    const factory = globalThis.Module;
    if (!factory) {
      throw new Error('HiGHS module factory not found. importScripts may have failed.');
    }

    // Initialize HiGHS with locateFile pointing to our bundled WASM
    const instance = await factory({
      locateFile: (file) => {
        if (file.endsWith('.wasm')) return wasmUrl;
        return file;
      }
    });

    highs = instance;
    return highs;
  })();

  return highsLoading;
}
```

**Key details:**

1. `importScripts('highs.js')` must use a **static string literal** — Manifest V3 requires statically analyzable `importScripts` calls in service workers.
2. The path `'highs.js'` is relative to the service worker location (`dist/background.js`), so it resolves to `dist/highs.js`.
3. `highs.js` sets `globalThis.Module` to a factory function. This factory is called with a config object containing `locateFile` to tell Emscripten where to find the WASM binary.
4. The `locateFile` callback uses `chrome.runtime.getURL()` to get the full `chrome-extension://` URL for the WASM file.
5. Initialization is lazy — it doesn't happen until the first solve request.
6. The `highsLoading` promise ensures concurrent solve requests don't re-initialize.

### Offscreen Document Approach (Legacy/Alternative)

There is also an offscreen document solver (`src/offscreen/solver.js`) that was an earlier approach. It loads HiGHS differently:

```javascript
// Fetch the JS source, inject it as a <script> tag, then call the factory
const response = await fetch(jsUrl);
const jsText = await response.text();
const blob = new Blob([jsText + '\n;globalThis.__highs_factory = Module;'], 
                      { type: 'text/javascript' });
const blobUrl = URL.createObjectURL(blob);
const script = document.createElement('script');
script.src = blobUrl;
document.head.appendChild(script);
```

This approach is not currently used — the service worker loads HiGHS directly via `importScripts`, which is simpler and avoids the overhead of creating/managing an offscreen document.

---

## The HiGHS JavaScript API

### `Module(config)` — Factory Function

Returns a Promise that resolves to a HiGHS solver instance.

```javascript
const highs = await Module({
  locateFile: (file) => {
    if (file.endsWith('.wasm')) return '/path/to/highs.wasm';
    return file;
  }
});
```

**Config options:**
| Property | Type | Description |
|---|---|---|
| `locateFile` | `(filename: string) => string` | Callback to resolve paths to companion files (`.wasm`). Required. |

### `highs.solve(lpString, options)` — Solve an LP/ILP

The primary method. Takes a CPLEX LP format string and returns a solution object.

```javascript
const solution = highs.solve(lpString, {
  time_limit: 30,
  presolve: 'on',
});
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `lpString` | `string` | The optimization problem in CPLEX LP format (see below). |
| `options` | `object` | Solver options (optional). |

**Solver options used by TCGmizer:**

| Option | Type | Default | Description |
|---|---|---|---|
| `time_limit` | `number` | `inf` | Maximum solve time in seconds. TCGmizer uses `30` (from `DEFAULT_SOLVER_TIMEOUT_S`). |
| `presolve` | `string` | `'choose'` | Presolve mode. `'on'` enables presolve, which simplifies the problem before solving. Generally faster for ILPs. |

**Other HiGHS options** (not currently used but available):

| Option | Type | Default | Description |
|---|---|---|---|
| `mip_rel_gap` | `number` | `1e-4` | Relative MIP optimality gap. Solver stops when gap is below this. |
| `mip_abs_gap` | `number` | `1e-6` | Absolute MIP optimality gap. |
| `mip_max_nodes` | `number` | `inf` | Maximum branch-and-bound nodes. |
| `mip_max_leaves` | `number` | `inf` | Maximum branch-and-bound leaves. |
| `parallel` | `string` | `'choose'` | `'on'`, `'off'`, or `'choose'`. WASM builds are single-threaded so this has no effect. |
| `solver` | `string` | `'choose'` | LP solver: `'simplex'`, `'ipm'` (interior point), or `'choose'`. |
| `output_flag` | `boolean` | `true` | Whether HiGHS prints log output to the console. |

### Return Value: Solution Object

See [Solution Object Reference](#solution-object-reference) below.

---

## CPLEX LP Format

HiGHS accepts problems in **CPLEX LP format** — a human-readable text format for specifying linear and integer programs. This is the format TCGmizer generates in `ilp-builder.js`.

### Overview

```
Minimize
 obj: 0.99 x1 + 1.49 x2 + 3.99 y1 + 2.99 y2

Subject To
 cover1: x1 + x2 = 1
 link_x1: x1 - y1 <= 0
 link_x2: x2 - y2 <= 0

Binary
 x1 x2 y1 y2

End
```

### Sections

The LP format has these sections, in order:

#### 1. Objective Direction

One of:
```
Minimize
```
or:
```
Maximize
```

TCGmizer always uses `Minimize` since we're minimizing total cost.

#### 2. Objective Function

The line(s) immediately after `Minimize`/`Maximize`. Defines the objective as a named linear expression:

```
 obj: 3.5 x1 + 2.1 x2 - 1.0 z1
```

- Must start with whitespace (space or tab).
- Name (e.g., `obj`) followed by colon, then terms.
- Terms are `coefficient variable_name`, separated by `+` or `-`.
- Coefficient of `1` can be omitted: `x1` is the same as `1 x1`.

#### 3. Subject To

Constraints section, introduced by `Subject To` (or `st` or `s.t.`):

```
Subject To
 cover_0: x1 + x2 + x3 = 1
 link_x1: x1 - y1 <= 0
 thresh_v0: 0.99 x1 + 1.49 x2 - 5 z1 >= 0
```

Each constraint:
- Must start with whitespace.
- Optional name followed by colon.
- Linear expression.
- Comparison operator: `<=`, `>=`, or `=`.
- Right-hand side constant.

#### 4. Bounds (Optional)

```
Bounds
 0 <= x1 <= 10
 x2 >= 0
 x3 free
```

TCGmizer does **not** use the Bounds section because all variables are binary (0 or 1).

#### 5. General / Integer / Binary

Declares variable types:

```
Binary
 x1 x2 y1 y2 z1
```

- **`Binary`**: Variables are restricted to 0 or 1. This is what TCGmizer uses.
- **`General`** or **`Integer`**: Variables are integers (no upper bound of 1).

All TCGmizer variables (x, y, z) are binary — each represents a yes/no decision.

#### 6. End

```
End
```

Terminates the LP. Required.

### Continuation Lines

CPLEX LP format supports **continuation lines**: any line that begins with whitespace is treated as a continuation of the previous logical expression. This is critical for long expressions:

```
 obj: 0.99 x1 + 1.49 x2 + 0.79 x3
  + 2.99 x4 + 0.50 x5 + 1.25 x6
  + 3.49 x7
```

The above is parsed as a single objective expression. The continuation lines starting with `  + ` are appended to the objective.

### Naming Rules

- Variable names can contain: letters, digits, underscores, periods.
- Variable names must **not** start with a digit.
- Constraint names follow the same rules, followed by a colon.
- Names are case-sensitive.

### Whitespace Rules

- The objective direction (`Minimize`/`Maximize`) must start at column 1.
- Section headers (`Subject To`, `Binary`, `End`) must start at column 1.
- All constraint and objective lines **must** start with whitespace (at least one space or tab).
- This is how the parser distinguishes section headers from expression lines.

---

## Known HiGHS Limitations & Gotchas

These are issues we've encountered while integrating HiGHS into TCGmizer.

### 1. Line Length Buffer (~560 characters)

**The most critical limitation.** HiGHS's LP reader has an internal line buffer of approximately **560 characters**. Lines longer than this cause a **silent parse failure**:

```
Unable to read LP model (see http://web.mit.edu/lpsolve/doc/CPLEX-format.htm)
HiGHS error -1
```

This error is **not** informative — it doesn't tell you which line or what went wrong. The only symptom is the model fails to load.

**When this happens:** For a cart with 40+ cards and 25 listings each, the objective line can contain 1000+ terms (one for each x-variable, plus y and z variables). A single variable like `x_s535813_0_l12` is ~18 characters, and with coefficient and separator (`0.99 x_s535813_0_l12 + `) it's ~24 characters. So 1000 terms × 24 chars = ~24,000 characters on one line, far exceeding the buffer.

**Solution:** Use continuation lines to split long expressions at ~500 characters. See the `pushExpressionLines()` function below.

The same issue can affect:
- Long constraint lines (coverage constraints with many listings per slot)
- Free shipping threshold constraints (many terms per seller)
- Inventory constraints (many slots sharing the same inventory)
- Binary variable declarations (many variables)

### 2. No Useful Parse Error Messages

When the LP string is malformed, HiGHS returns `error -1` with the generic message above. It does **not** report:
- Which line number failed
- What character offset caused the issue
- What was expected vs. what was found

Debugging requires careful manual inspection or pre-validation of the LP string.

### 3. WASM is Single-Threaded

The WASM build of HiGHS runs single-threaded. The `parallel` option has no effect. For very large ILPs, the solver may take a long time — hence the 30-second timeout.

### 4. NaN in Coefficients

If a `NaN` value appears in the LP string (e.g., from a missing price or shipping cost), HiGHS will fail to parse it. TCGmizer guards against this in `formatCoeff()`:

```javascript
function formatCoeff(n) {
  if (n == null || Number.isNaN(n)) {
    console.warn('[TCGmizer ILP] formatCoeff received invalid value:', n);
    return '0';
  }
  return Number(n).toFixed(4).replace(/\.?0+$/, '') || '0';
}
```

The `solveILP()` function also pre-validates the LP string for the literal text `NaN`:

```javascript
if (lpString.includes('NaN')) {
  const nanIdx = lpString.indexOf('NaN');
  throw new Error(`LP string contains NaN at position ${nanIdx}: ...`);
}
```

### 5. Scientific Notation

HiGHS may not parse coefficients in scientific notation (`1.5e-4`). Use `toFixed()` instead to produce decimal strings.

### 6. Empty Objective

An empty `Minimize` section (no terms) produces an invalid LP. TCGmizer guards against this by adding a dummy `0 firstVar` term if no objective terms are generated.

### 7. Solver Returns Status "Infeasible"

When no assignment of variables can satisfy all constraints simultaneously, HiGHS returns `Status: "Infeasible"`. This is not a bug — it means the problem as stated has no solution. Common causes:
- Too restrictive `maxSellers` constraint (can't cover all cards with N sellers)
- Inventory constraints prevent assignment (not enough stock)
- Filters removed all listings for some card

### 8. Floating-Point Solutions for Binary Variables

Even though variables are declared Binary, the solver may return values like `0.999999` or `1e-10` instead of exact 0 or 1. The solution parser rounds to 0/1:

```javascript
const val = Math.round(col.Primal);
if (val === 1) { /* this variable is selected */ }
```

---

## The TCGmizer ILP Model

### Problem Statement

Given:
- A set of **card slots** (each card×quantity copy to purchase)
- A set of **sellers** offering listings for those cards
- Each seller has a **shipping cost** and optionally a **free shipping threshold**

**Minimize:** total cost = item prices + shipping costs − shipping savings from free shipping thresholds

### Decision Variables

All variables are **binary** (0 or 1):

| Variable | Meaning |
|---|---|
| `x_s{slotId}_l{listingIndex}` | 1 if we buy listing `l` for card slot `s` |
| `y_v{sellerIndex}` | 1 if seller `v` is used (at least one item bought) |
| `z_v{sellerIndex}` | 1 if seller `v` qualifies for free shipping |

### Objective Function

```
Minimize
 obj: Σ (price_i × x_i) + Σ (shippingCost_j × y_j) - Σ (shippingCost_j × z_j)
```

- **Item prices**: Each x-variable contributes the listing's price.
- **Shipping costs**: Each y-variable contributes the seller's base shipping cost (only charged if we use that seller).
- **Free shipping savings**: Each z-variable subtracts the shipping cost (if the seller qualifies for free shipping, we don't pay shipping).

The net shipping for a seller is: `shippingCost × y - shippingCost × z`, which equals:
- `shippingCost` if `y=1, z=0` (used seller, didn't hit threshold)
- `0` if `y=1, z=1` (used seller, hit free shipping threshold)
- `0` if `y=0, z=0` (didn't use seller)

### Variable Construction

Listings are grouped by card slot, sorted by price, and pruned to the top-K cheapest (default K=25, from `DEFAULT_TOP_K_LISTINGS`). This keeps the ILP tractable — with 40 cards × 25 listings, there are 1,000 x-variables.

The seller index maps each unique seller ID to a sequential integer for compact variable names:
```javascript
const sellerIndex = new Map(); // sellerId → 0, 1, 2, ...
```

### Objective Term Construction

```javascript
// Item price terms
objTerms.push(`${formatCoeff(listing.price)} ${varName}`);  // e.g., "0.99 x_s123_l0"

// Shipping cost terms
objTerms.push(`${formatCoeff(seller.shippingCost)} ${yVar}`);  // e.g., "3.99 y_v0"

// Free shipping savings (negative = reduces cost when z=1)
objTerms.push(`${formatCoeff(-seller.shippingCost)} ${zVar}`);  // e.g., "-3.99 z_v0"
```

---

## Variable Naming Conventions

| Pattern | Example | Meaning |
|---|---|---|
| `x_s{slotId}_l{index}` | `x_s535813_0_l12` | Buy listing #12 for slot `535813_0` |
| `y_v{sellerIndex}` | `y_v7` | Use seller #7 |
| `z_v{sellerIndex}` | `z_v7` | Seller #7 qualifies for free shipping |

**Slot IDs** are formatted as `{productId}_{quantityIndex}`, e.g., `535813_0` is the first copy of product 535813.

**Seller indices** are sequential integers starting from 0, assigned in the order sellers are encountered. The `variableMap` preserves the mapping back to actual seller IDs.

**Listing indices** are sequential per slot, after sorting by price and pruning to top-K.

---

## Constraint Reference

### Constraint 1: Coverage

**Every card slot must be assigned exactly one listing.**

```
cover_{slotId}: x_s{slotId}_l0 + x_s{slotId}_l1 + ... + x_s{slotId}_lN = 1
```

This ensures we buy exactly one copy of each card. There is one coverage constraint per card slot.

### Constraint 2: Seller Linking

**If we buy any item from a seller, that seller must be marked as "used".**

```
link_{xVar}: x_s{slotId}_l{i} - y_v{sellerIndex} <= 0
```

This means: `x_i ≤ y_j` — if we pick listing `x_i` (which belongs to seller `j`), then `y_j` must be 1. There is one linking constraint per x-variable.

### Constraint 3: Free Shipping Threshold

**A seller only qualifies for free shipping if total spend meets the threshold.**

```
thresh_v{i}: Σ (price × x) - threshold × z_v{i} >= 0
```

This means: `Σ(price × x) ≥ threshold × z`. If `z=1` (free shipping claimed), then the total items purchased from that seller must meet or exceed the threshold. If `z=0`, the constraint is trivially satisfied. There is one threshold constraint per seller that has a free shipping threshold.

### Constraint 4: Z-Y Linking

**Can't get free shipping from a seller you're not using.**

```
zlink_v{i}: z_v{i} - y_v{i} <= 0
```

This means: `z_j ≤ y_j` — free shipping is only possible if the seller is used.

### Constraint 5: Inventory Quantity

**Don't assign more slots to a seller's listing than its available stock.**

```
inv_{i}: x_s{slot1}_l{a} + x_s{slot2}_l{b} + ... <= quantity
```

Multiple card slots might use the same physical listing (same seller, same product condition). This constraint ensures we don't buy more copies than the seller has in stock. Only generated when a listing appears in more slots than its available quantity.

The inventory key is `{sellerId}:{productConditionId}`, identifying a unique inventory unit.

### Constraint 6: Max Sellers (Optional)

**Limit the total number of distinct sellers used.**

```
maxsellers: y_v0 + y_v1 + ... + y_vN <= maxSellers
```

Only generated when `options.maxSellers` is set and there are more active sellers than the limit. Used by the "minimize vendors" feature to find price-vendor tradeoffs.

### Note: $1 Minimum Per Seller (Not a Constraint)

TCGPlayer requires a minimum order of $1.00 per seller. This is intentionally **not** modeled as a hard constraint because it can make the ILP infeasible when cheap cards don't aggregate enough per seller. Instead, the solution parser flags sellers below $1 as **warnings** in the result.

---

## Solution Object Reference

The object returned by `highs.solve()`:

```javascript
{
  Status: "Optimal",          // or "Infeasible", "Time limit reached", etc.
  ObjectiveValue: 42.57,       // The optimal objective value (total cost)
  Columns: {
    "x_s535813_0_l3": {
      Index: 0,
      Status: "BS",           // Basis status
      Lower: 0,
      Upper: 1,
      Primal: 1.0,            // The solution value (0 or 1 for binary vars)
      Dual: 0,
      Type: "BV",             // Variable type (BV = binary)
      Name: "x_s535813_0_l3"
    },
    "y_v0": {
      Index: 1,
      Status: "BS",
      Lower: 0,
      Upper: 1,
      Primal: 1.0,
      Dual: 0,
      Type: "BV",
      Name: "y_v0"
    },
    // ... one entry per variable
  },
  Rows: {
    "cover_535813_0": {
      Index: 0,
      Name: "cover_535813_0",
      Lower: 1,                // Constraint bounds
      Upper: 1,
      Primal: 1.0,            // Constraint value at solution
      Dual: 0.99              // Shadow price / dual value
    },
    // ... one entry per constraint
  }
}
```

### Status Values

| Status | Meaning |
|---|---|
| `"Optimal"` | An optimal solution was found. |
| `"Infeasible"` | No feasible solution exists for the given constraints. |
| `"Unbounded"` | The objective can be made arbitrarily good (shouldn't happen with our model). |
| `"Time limit reached"` | Solver hit the time limit. May have a feasible (non-optimal) solution. |
| `"Iteration limit reached"` | Solver hit iteration limit. |
| `"Unknown"` | Solver could not determine status. |
| `"Load error"` | The LP string failed to parse (malformed input). |
| `"Model error"` | The model has structural issues. |

### Column Properties

| Property | Type | Description |
|---|---|---|
| `Index` | `number` | Sequential variable index. |
| `Status` | `string` | Basis status (`"BS"` = basic, `"LB"` = at lower bound, `"UB"` = at upper bound). |
| `Lower` | `number` | Variable lower bound (0 for binary). |
| `Upper` | `number` | Variable upper bound (1 for binary). |
| `Primal` | `number` | **The solution value.** For binary variables: 0.0 or 1.0 (may have floating-point noise). |
| `Dual` | `number` | Reduced cost (dual value). |
| `Type` | `string` | Variable type. `"BV"` = binary, `"CO"` = continuous. |
| `Name` | `string` | Variable name as specified in the LP string. |

### Row Properties

| Property | Type | Description |
|---|---|---|
| `Index` | `number` | Sequential constraint index. |
| `Name` | `string` | Constraint name. |
| `Lower` | `number` | Constraint lower bound. |
| `Upper` | `number` | Constraint upper bound. |
| `Primal` | `number` | Constraint expression value at the solution. |
| `Dual` | `number` | Shadow price / dual value of the constraint. |

---

## Solution Parsing

The `parseSolution()` function in `solution-parser.js` transforms the raw HiGHS solution into a structured result:

### Process

1. **Check status**: If not `"Optimal"`, return an error result immediately.

2. **Extract x-variable assignments**: For each x-variable, round `Primal` to 0/1. Variables with value 1 represent the chosen listing for each slot.

3. **Group by seller**: Aggregate chosen listings by seller to compute per-seller subtotals.

4. **Calculate shipping**: For each seller:
   - Look up base shipping cost from seller info
   - Check if the subtotal meets the free shipping threshold
   - Calculate actual shipping: `0` if free shipping, `shippingCost` otherwise

5. **Build result**: Per-seller breakdown with items, subtotal, shipping, total. Global totals, savings vs. current cart.

6. **Warn on $1 minimum**: Flag sellers whose subtotal is below TCGPlayer's $1 minimum.

### Result Object

```javascript
{
  success: true,
  status: "Optimal",
  totalCost: 42.57,             // Items + shipping
  totalItemCost: 38.58,         // Sum of all item prices
  totalShipping: 3.99,          // Sum of all shipping charges
  sellerCount: 3,               // Number of distinct sellers used
  itemCount: 15,                // Number of items (matches card slot count)
  sellers: [                    // Per-seller breakdown, sorted by total descending
    {
      sellerId: "abc123",
      sellerName: "CardShop",
      sellerNumericId: 12345,
      sellerKey: "abc123",
      items: [
        {
          cardName: "Lightning Bolt",
          productId: 535813,
          originalProductId: 535813,      // Original cart product (for alt printing detection)
          listingId: "listing_12345",
          productConditionId: 12345,
          condition: "Near Mint",
          setName: "Magic 2010",
          language: "English",
          price: 0.99,
          attributeChanged: false,        // true if alt printing was substituted
          directSeller: false,
        },
        // ...
      ],
      subtotal: 15.99,
      shippingCost: 3.99,
      freeShipping: false,
      freeShippingThreshold: 35.00,
      sellerTotal: 19.98,
    },
    // ...
  ],
  savings: 8.43,                // currentCartTotal - totalCost
  currentCartTotal: 51.00,      // The user's original cart total
  warnings: [                   // Optional warnings
    "BudgetCards: $0.50 subtotal is below TCGPlayer's $1 minimum"
  ],
}
```

---

## Multi-Solve (Minimize Vendors)

When the user enables "Minimize Vendors" mode, TCGmizer runs multiple ILP solves to find the tradeoff between vendor count and total cost:

### Algorithm

1. **Baseline solve**: Solve with no vendor limit (or user's configured max) to find the cheapest possible price. Record the number of vendors used.

2. **Iterate downward**: For each vendor count from `baseline_vendors - 1` down to `1`:
   - Solve with `maxSellers = n`
   - If feasible and uses a different vendor count than any previous result, record it
   - If infeasible, stop (fewer vendors won't work either)

3. **Return all results**: Sorted by vendor count ascending. The UI displays these as a grid of options.

### Example

| Vendors | Total Cost |
|---|---|
| 2 | $54.99 |
| 3 | $48.50 |
| 5 | $45.20 |
| 8 | $43.57 |

The user can then choose their preferred price/convenience tradeoff.

### Performance

Each solve takes a few seconds on a large cart. With 8 vendors in the baseline, that's up to 8 sequential solves. The solver timeout applies per-solve, so the total wall time can be up to `8 × 30s = 240s` in the worst case (though most solves complete in under 5 seconds).

---

## Debugging the ILP

### Console Logging

TCGmizer keeps extensive debug logging throughout the ILP pipeline. All log messages are prefixed with `[TCGmizer ILP]` or `[TCGmizer SW]`.

#### ILP Builder Logs

```
[TCGmizer ILP] Built LP: 40 slots, 150 sellers, 1000 x-vars, 150 y-vars, 45 z-vars, 1195 obj terms, 28500 chars
[TCGmizer ILP] LP preview (first 500 chars): ...
[TCGmizer ILP] LP tail (last 200 chars): ...
```

#### Solver Logs

```
[TCGmizer SW] Solving ILP (28500 chars, timeout 30s)...
[TCGmizer SW] Solved in 2.35s — Status: Optimal, Objective: 42.57
```

#### On Solver Failure

```
[TCGmizer SW] Solver error: <error message>
[TCGmizer SW] LP string that failed (first 1000 chars): ...
[TCGmizer SW] LP string tail (last 300 chars): ...
```

### LP Pre-Validation

Before sending the LP string to HiGHS, `solveILP()` runs sanity checks:

```javascript
if (!lpString.includes('Minimize') && !lpString.includes('Maximize'))
  throw new Error('LP string missing objective direction');
if (!lpString.includes('Subject To'))
  throw new Error('LP string missing Subject To section');
if (!lpString.includes('End'))
  throw new Error('LP string missing End marker');
if (lpString.includes('NaN'))
  throw new Error(`LP string contains NaN at position ${idx}`);
```

These catch structural problems before they hit HiGHS's unhelpful parser.

### NaN Seller Warning

During the solve phase, sellers with `NaN` shipping data are logged:

```
[TCGmizer SW] 3 sellers have NaN shipping data: CardKingdom (shipping=NaN, threshold=NaN), ...
```

This helps identify upstream data issues before they corrupt the LP.

### Inspecting the Full LP String

For deep debugging, the LP preview/tail logs show the beginning and end of the generated LP. For the full LP, you can add a breakpoint or `console.log(lp)` in `solveSingle()` after the `buildLP()` call. Be warned: for large carts the LP can be 30,000+ characters.

---

## Performance Considerations

### Problem Size

| Cart Size | x-vars | y-vars | z-vars | Constraints | Typical Solve Time |
|---|---|---|---|---|---|
| 5 cards | ~125 | ~50 | ~15 | ~200 | < 0.5s |
| 15 cards | ~375 | ~100 | ~30 | ~600 | 1-3s |
| 40 cards | ~1000 | ~200 | ~60 | ~1500 | 2-10s |
| 100 cards | ~2500 | ~300 | ~100 | ~3500 | 5-30s |

### Top-K Pruning

The `topK` parameter (default 25) limits listings per card slot to the K cheapest by unit price. This dramatically reduces problem size — without it, popular cards might have 500+ listings, making the ILP intractable.

The tradeoff: pruning by price alone might eliminate a slightly more expensive listing from a seller offering free shipping on a large order. In practice, top-25 captures enough pricing diversity.

### Solver Timeout

Set to 30 seconds (`DEFAULT_SOLVER_TIMEOUT_S`). If the solver hasn't found an optimal solution by then, it returns whatever feasible solution it has (status `"Time limit reached"`). Currently, TCGmizer treats non-Optimal results as failures.

### Memory

The HiGHS WASM module uses ~10-20MB of memory. The LP string itself can be 30-100KB for large carts. Chrome service workers have no hard memory limit, but the WASM instance persists for the lifetime of the service worker (cached in the `highs` global).

### Line Splitting

The `pushExpressionLines()` function ensures no LP line exceeds ~500 characters, avoiding the HiGHS line buffer overflow. This adds a negligible amount of processing time (string operations on the LP string).

```javascript
function pushExpressionLines(lines, name, expr, rhs) {
  const MAX_LINE = 500;
  const prefix = ` ${name}: `;
  const suffix = rhs ? ` ${rhs}` : '';

  const fullLine = `${prefix}${expr}${suffix}`;
  if (fullLine.length <= MAX_LINE) {
    lines.push(fullLine);
    return;
  }

  // Split on term boundaries (before + or -)
  const tokens = expr.split(/(?= [+-] )/g);
  let currentLine = prefix;
  for (const token of tokens) {
    if (currentLine.length + token.length > MAX_LINE && currentLine.length > prefix.length) {
      lines.push(currentLine);
      currentLine = '  ' + token.trimStart();
    } else {
      currentLine += token;
    }
  }
  currentLine += suffix;
  lines.push(currentLine);
}
```

The function splits at term boundaries (before `+` or `-` operators), ensuring each continuation line starts with whitespace (required by CPLEX LP format). Binary variable declarations are also split into groups of 10 per line for the same reason.
