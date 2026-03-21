# TCGmizer

A Chrome extension that optimizes your [TCGPlayer](https://www.tcgplayer.com) shopping cart to find the mathematically cheapest combination of sellers, including shipping costs.

### Filter the way you like
<img width="957" height="758" alt="image" src="https://github.com/user-attachments/assets/7f5f73bb-9bb0-483c-bac1-673202847b6a" />

### Save money and time
<img width="943" height="811" alt="image" src="https://github.com/user-attachments/assets/0825d071-2bb4-4dfa-9ed2-8758c4d0a85a" />


## The Problem

When buying trading cards on TCGPlayer, each seller charges their own shipping fee. A cart with cards spread across many sellers can rack up significant shipping costs. Manually figuring out which sellers to buy from — balancing item prices, shipping fees, and free shipping thresholds — is tedious and nearly impossible to do optimally by hand.

## The Solution

TCGmizer uses [integer linear programming](https://en.wikipedia.org/wiki/Integer_programming) (ILP) to find the true mathematical optimum. It reads your cart, fetches current listings and shipping rates from TCGPlayer, builds a cost-minimization model, solves it, and can apply the optimized cart with one click.

## How It Works

1. **Navigate to your TCGPlayer cart** and click the TCGmizer icon (or use the popup button).
2. **TCGmizer reads your cart** directly from the page — no copy-pasting needed.
3. **It fetches all available listings** for your cards, including alternative printings from other sets.
4. **It fetches shipping rates** and free shipping thresholds for every seller.
5. **The ILP solver finds the optimal solution** — the combination of sellers that minimizes your total cost (items + shipping), while respecting seller inventory limits.
6. **Review the results**, which show you how much you'll save, broken down by seller.
7. **Apply the optimized cart** with one click — TCGmizer clears your cart and re-adds everything from the optimal sellers.

## Features

- **Mathematically optimal** — not a heuristic or approximation. Uses the [HiGHS](https://highs.dev/) solver (the same engine used in academic and industrial optimization) running entirely in your browser via WebAssembly.
- **Alternative printings** — automatically searches for cheaper printings of each card across all sets. Toggle "Exact printings only" if you want specific versions.
- **Filter by language and condition** — choose which languages and conditions are acceptable before solving.
- **Minimize vendors mode** — solves at multiple vendor counts and shows you the price/convenience tradeoff so you can choose.
- **Vendor ban list** — search for sellers by name and add them to a persistent ban list via the Settings page. When optimizing, check "Exclude banned vendors" to automatically remove their listings from consideration. The ban list syncs across devices via Chrome storage.
- **Free shipping awareness** — knows each seller's free shipping threshold and factors it into the optimization. Sometimes spending slightly more at one seller triggers free shipping and saves money overall.
- **One-click apply** — replaces your cart with the optimized version. If any item is sold out, it automatically falls back to the next cheapest option.
- **Runs entirely in your browser** — no external servers, no accounts, no data collection. Everything happens locally using TCGPlayer's own public APIs.

## Installation

1. Dowload and unzip the latest [release](https://github.com/natefinch/tcgmizer/releases).
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top right).
4. Click **Load unpacked** and select the repository folder.
5. Navigate to your [TCGPlayer cart](https://www.tcgplayer.com/cart) and click the TCGmizer icon.

## Building for Development

```
npm run build        # One-time build
npm run watch        # Rebuild on changes
```
