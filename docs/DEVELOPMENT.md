# TCGmizer — Development Guide

How to build, modify, and maintain the TCGmizer Chrome extension.

---

## Prerequisites

- **Node.js** (v18+)
- **Docker** (only needed for rebuilding the WASM solver)
- **Google Chrome** (for testing the extension)

---

## Quick Start

```bash
make build
```

This installs dependencies (if needed) and builds the extension. To see all available targets:

```bash
make
```

Then load the extension in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the repository root
4. Navigate to your [TCGPlayer cart](https://www.tcgplayer.com/cart) and click the TCGmizer icon

---

## Build System

### Extension Build (`node build.js`)

Uses [esbuild](https://esbuild.github.io/) to produce two IIFE bundles:

| Entry | Output | Notes |
|---|---|---|
| `src/background/service-worker.js` | `dist/background.js` | Must be IIFE for `importScripts()` |
| `src/content/content.js` | `dist/content.js` | Must be IIFE (Chrome content script requirement) |

The build also copies `highs.js` and `highs.wasm` from `node_modules/highs/build/` into `dist/` as a fallback — but the **custom-built** versions already checked into `dist/` should take priority (see [WASM Solver Build](#wasm-solver-build) below).

### Commands

```bash
make build           # One-time production build (minified)
make watch           # Rebuild on file changes (unminified, faster iteration)
make clean           # Remove build artifacts (keeps dist/highs.*)
```

`make build` is incremental — it only rebuilds when source files have changed.

After building, reload the extension in `chrome://extensions` (click the ↻ button on the extension card) to pick up changes. The service worker restarts automatically; content scripts require a page refresh.

---

## Testing

```bash
make test            # Run all unit tests
```

This runs all offline unit tests in `test/`:

| Test file | What it covers |
|---|---|
| `test-ilp.js` | ILP builder + solver end-to-end (coverage, shipping thresholds, scaling) |
| `test-direct-remap.js` | TCGPlayer Direct listing remapping (pure-Direct, mixed, edge cases) |
| `test-maxsellers.js` | Max-sellers constraint generation |
| `test-alt-printings-unit.js` | Alternative printings search/filter logic (mocked fetch) |

The remaining files in `test/` (e.g., `test-api.js`, `test-find-api*.js`) are exploratory scripts that hit live TCGPlayer APIs — they are **not** run by `make test`.

---

## WASM Solver Build

### Background

The HiGHS ILP solver is compiled to WebAssembly via [Emscripten](https://emscripten.org/) from the [`lovasoa/highs-js`](https://github.com/lovasoa/highs-js) wrapper around [ERGO-Code/HiGHS](https://github.com/ERGO-Code/HiGHS).

**Why we build our own:** The published `highs` npm package (v1.8.0) was compiled with Emscripten's default **64KB stack**. Large ILP models (100+ card carts with alternative printings) cause a stack overflow, manifesting as:
- `RuntimeError: Aborted()`
- `RuntimeError: function signature mismatch`

An upstream fix ([lovasoa/highs-js PR #43](https://github.com/lovasoa/highs-js/pull/43)) increased the stack to 4MB, but it was merged *after* the v1.8.0 release and has never been published as a new npm version (as of March 2026).

We build with an **8MB stack** to give extra headroom.

### How to Rebuild

```bash
# Default: 8MB stack
make rebuild-wasm

# Custom stack size (e.g., 16MB)
STACK_SIZE=16777216 make rebuild-wasm
```

**What the script does:**
1. Clones `lovasoa/highs-js` at `main` (which includes the stack fix) into a temp directory
2. Patches `build.sh` to set the desired `STACK_SIZE`
3. Runs the build inside the `emscripten/emsdk:3.1.51` Docker container
4. Copies the output `highs.js` (~30KB) and `highs.wasm` (~2.6MB) into `dist/`
5. Cleans up the temp directory

**Prerequisites:** Docker must be running. No local emcc or cmake needed — everything happens inside the container.

**Duration:** ~3–5 minutes (mostly C++ compilation of HiGHS + Emscripten linking).

**Linker warnings:** You'll see `wasm-ld: warning: function signature mismatch` warnings about C++ standard library symbols (`basic_streambuf`). These are harmless and appear in upstream builds too — they're caused by LTO/closure interactions with the C++ standard library, not our solver code.

### When to Rebuild

- If the `highs` npm package publishes a new version with the stack fix (check if `STACK_SIZE` in their `build.sh` is ≥4MB), you can switch back to the npm package and remove the custom build.
- If carts still crash with the current 8MB stack, increase `STACK_SIZE` (try 16MB).
- If you need a newer version of HiGHS (for bug fixes or performance), the rebuild script will pull the latest `main` branch automatically.

### Verifying the Build

After rebuilding, run the extension build and test:

```bash
make build                       # Ensure esbuild still bundles cleanly
make test                        # Run unit tests
# Then test with a large cart (50+ items) in TCGPlayer
```

The custom `dist/highs.js` and `dist/highs.wasm` files should be committed to the repo so that `npm install && npm run build` works without Docker.

---

## Project Structure

```
├── manifest.json                 # Chrome extension manifest (MV3)
├── Makefile                      # Development task runner (run `make` for help)
├── build.js                      # esbuild bundler script
├── package.json                  # Dependencies: highs, esbuild
├── scripts/
│   └── rebuild-highs-wasm.sh     # Docker-based WASM rebuild script
├── dist/                         # Build output (committed for highs.js/wasm)
│   ├── background.js             # Bundled service worker
│   ├── content.js                # Bundled content script
│   ├── highs.js                  # Custom-built HiGHS JS loader
│   └── highs.wasm                # Custom-built HiGHS WASM (8MB stack)
├── src/
│   ├── background/
│   │   ├── service-worker.js     # Orchestrator: fetch → solve → results
│   │   └── fetcher.js            # TCGPlayer API client (listings, shipping, search)
│   ├── content/
│   │   ├── content.js            # Content script entry point
│   │   ├── cart-reader.js        # DOM parser for cart items
│   │   ├── cart-modifier.js      # Cart clear & re-add via gateway API
│   │   ├── results-ui.js         # Overlay panel UI
│   │   └── results-ui.css        # Panel styles
│   ├── shared/
│   │   ├── constants.js          # Config values, message types, stages
│   │   ├── ilp-builder.js        # CPLEX LP format generator
│   │   └── solution-parser.js    # HiGHS solution → structured result
│   ├── popup/
│   │   ├── popup.html            # Extension popup
│   │   └── popup.js              # Popup logic
│   └── offscreen/                # Legacy (not used)
│       ├── offscreen.html
│       └── solver.js
├── docs/
│   ├── technical-design.md       # Full architecture & implementation doc
│   ├── DEVELOPMENT.md            # This file
│   ├── highs-ilp-reference.md    # HiGHS LP format reference
│   └── tcgplayer-api-reference.md # TCGPlayer API endpoint docs
├── icons/                        # Extension icons
└── test/                         # API response snapshots & test scripts
```

---

## Key Configuration (constants.js)

| Constant | Value | Purpose |
|---|---|---|
| `DEFAULT_FETCH_DELAY_MS` | 100ms | Stagger between concurrent API requests |
| `DEFAULT_FETCH_CONCURRENCY` | 5 | Max parallel API requests |
| `DEFAULT_MAX_LISTINGS_PER_CARD` | 50 | Max listings fetched per product |
| `DEFAULT_TOP_K_LISTINGS` | 25 | Listings kept per slot for ILP (pruned by price) |
| `MAX_ALTERNATIVE_PRINTINGS` | 5 | Max alternative set printings per card |
| `DEFAULT_SOLVER_TIMEOUT_S` | 30 | HiGHS time limit in seconds |
| `LISTINGS_PER_PAGE` | 50 | TCGPlayer listings API page size |

---

## Performance Design Decisions

These are the major performance optimizations made and why, so future developers understand the reasoning:

### Concurrent Fetching (fetcher.js)

**Problem:** Originally, listings were fetched one product at a time with a 600ms delay between requests. A 100-item cart with alternatives could take 10+ minutes.

**Solution:** Sliding-window concurrency — up to 5 requests in flight simultaneously with 100ms stagger. Products are deduplicated so the same productId is only fetched once even if multiple cart slots reference it.

**Why not more concurrency?** TCGPlayer rate-limits aggressive callers. 5 concurrent with 100ms stagger stays well under the threshold.

### O(1) Listing Remap (service-worker.js)

**Problem:** Remapping listings to card slots used `rawListings.filter(l => l.productId === slot.productId)` inside a loop — O(slots × listings). For 100 items with 50 listings each, that's 500,000 comparisons.

**Solution:** Pre-index listings into a `Map<productId, listing[]>` for O(1) lookup per slot.

### Aggregated Link Constraints (ilp-builder.js)

**Problem:** The seller-linking constraint originally generated one inequality per x-variable (`x_i - y_s <= 0`). A 100-item cart with 25 listings per slot and 500 sellers produced ~2,500 constraints, making the LP string hundreds of KB.

**Solution:** Aggregate to one constraint per seller: `sum(x_i for seller s) - N * y_s <= 0`, where N is the count of x-variables for that seller. Mathematically equivalent, ~80% fewer constraints.

### Adaptive topK + Retry (service-worker.js)

**Problem:** Even with aggregated constraints, very large carts (100+ items) could exceed the WASM stack/memory.

**Solution:** Three-layer defense:
1. Scale topK down based on cart size (25 → 20 → 15)
2. If WASM still crashes, retry with topK reduced by 40%
3. Reset the HiGHS instance after crashes (corrupted Emscripten state)

### Custom WASM Build (scripts/rebuild-highs-wasm.sh)

**Problem:** The published highs npm v1.8.0 has a 64KB Emscripten stack. The HiGHS solver's internal call stack for branch-and-bound overflows on models with >~1,000 variables.

**Solution:** Rebuild from source with 8MB stack via Docker. The adaptive topK / retry logic remains as a safety net.

---

## Debugging Tips

### Inspecting the Service Worker

1. Go to `chrome://extensions`
2. Find TCGmizer and click **Inspect views: service worker**
3. This opens DevTools for the service worker — you can see console logs, network requests, and errors

### Common Errors

| Error | Likely Cause | Fix |
|---|---|---|
| `HiGHS module factory not found` | `highs.js` not in `dist/` | Run `npm run build` |
| `Aborted()` or `signature mismatch` | WASM stack overflow | Rebuild WASM with larger stack, or reduce cart size |
| `CAPI-4` during cart apply | Item sold out between fetch and apply | Automatic fallback handles this; re-optimize if persistent |
| `CAPI-35` during cart apply | Ghost seller | Should be filtered out; check shipping API response |
| Content script not loading | SPA navigation | The service worker auto-injects; check `tabs.onUpdated` listener |

### Viewing the ILP Model

The service worker logs LP string excerpts (first 1000 + last 300 chars) when the solver fails. For full LP output, add `console.log(lp)` in `solveSingleAttempt()` before the `solveILP()` call.

### Testing with Large Carts

The solver's limits are most stressed with large carts (50–100+ items). To test:
1. Add many items to a TCGPlayer cart
2. Uncheck "Exact printings only" to maximize alternative printings (multiplies listings)
3. Watch the console for adaptive topK messages: `HiGHS WASM failed with topK=X, retrying with topK=Y`

---

## Making Changes

### Adding a new filter option

1. Add the UI control in `results-ui.js` `showConfig()`
2. Include the value in the config object sent via `MSG.SOLVE_WITH_CONFIG`
3. Handle it in `runSolvePhase()` in the service worker (filter listings before building the ILP)

### Changing the ILP formulation

1. Modify `buildLP()` in `ilp-builder.js`
2. Update `variableMap` if adding new variable types
3. Update `parseSolution()` if the new variables affect the output
4. Test with both small and large carts — constraint count matters for WASM limits

### Updating the TCGPlayer API

TCGPlayer's internal APIs are undocumented and can change. If the extension breaks:
1. Open TCGPlayer cart in Chrome DevTools → Network tab
2. Filter by `Fetch/XHR`
3. Click through cart actions and inspect request/response payloads
4. Update the corresponding fetch calls in `fetcher.js` or `cart-modifier.js`
5. Document findings in `docs/tcgplayer-api-reference.md`
