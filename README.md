# TCGmizer

A browser extension for Chrome and Firefox that optimizes your [TCGPlayer](https://www.tcgplayer.com) shopping cart to find the mathematically cheapest combination of sellers, including shipping costs.

<img width="550" height="806" alt="image" src="https://github.com/user-attachments/assets/73c80ee1-f1d4-4c7e-8294-7dabbd4ff712" />
<img width="550" height="777" alt="image" src="https://github.com/user-attachments/assets/53479c69-b242-4d7b-a8b2-e097bfda3471" />



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
- **Max vendors** — optionally cap the number of sellers to reduce the number of packages you receive.
- **Minimize vendors mode** — solves at multiple vendor counts and shows you the price/convenience tradeoff so you can choose.
- **Free shipping awareness** — knows each seller's free shipping threshold and factors it into the optimization. Sometimes spending slightly more at one seller triggers free shipping and saves money overall.
- **Custom listing support** — handles seller-uploaded custom listings (the ones with their own photos) alongside standard listings.
- **One-click apply** — replaces your cart with the optimized version. If any item is sold out, it automatically falls back to the next cheapest option.
- **Runs entirely in your browser** — no external servers, no accounts, no data collection. Everything happens locally using TCGPlayer's own public APIs.

## Installation

1. Clone this repository.
2. Install dependencies and build:
   ```
   npm install
   npm run build
   ```

### Chrome
3. Open Chrome and go to `chrome://extensions`.
4. Enable **Developer mode** (toggle in the top right).
5. Click **Load unpacked** and select the `dist/chrome` folder.
6. Navigate to your [TCGPlayer cart](https://www.tcgplayer.com/cart) and click the TCGmizer icon.

### Firefox
3. Build and sign the Firefox add-on: `npm run sign:firefox`
4. Open Firefox → `about:addons`
5. Click the gear icon (⚙) → **Install Add-on From File…**
6. Select the generated `.xpi` file from the project root.

## Building

```
npm run build           # Build for both Chrome and Firefox
npm run build:chrome    # Build Chrome only
npm run build:firefox   # Build Firefox only
npm run watch           # Rebuild on changes (both browsers)
```

## Requirements

- Google Chrome or Mozilla Firefox (Manifest V3)
- A TCGPlayer cart with items in it
