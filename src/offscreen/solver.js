/**
 * Offscreen document that hosts the HiGHS WASM solver.
 * Receives LP strings via chrome.runtime.onMessage, solves them, and returns results.
 */

import { MSG } from '../shared/constants.js';

let highs = null;
let highsLoading = null;

/**
 * Initialize the HiGHS solver (lazy, cached).
 */
async function getHighs() {
  if (highs) return highs;
  if (highsLoading) return highsLoading;

  highsLoading = (async () => {
    // Load the HiGHS emscripten module.
    // The build copies highs.js and highs.wasm into dist/.
    // We load the JS module via importScripts-style dynamic import,
    // then call it with locateFile to find the .wasm.
    const wasmUrl = chrome.runtime.getURL('dist/highs.wasm');
    const jsUrl = chrome.runtime.getURL('dist/highs.js');

    // Load the emscripten-generated module loader
    const response = await fetch(jsUrl);
    const jsText = await response.text();

    // The highs.js file is a CommonJS module that returns a factory function.
    // We need to evaluate it in a way that captures the module export.
    // Wrap it to extract the factory.
    const blob = new Blob([jsText + '\n;globalThis.__highs_factory = Module;'], { type: 'text/javascript' });
    const blobUrl = URL.createObjectURL(blob);

    // Use dynamic import won't work with CJS, so we use a script tag approach
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = blobUrl;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    URL.revokeObjectURL(blobUrl);

    // The factory should now be available
    const factory = globalThis.__highs_factory;
    if (!factory) {
      throw new Error('Failed to load HiGHS module');
    }

    // Initialize with locateFile pointing to our WASM
    highs = await factory({
      locateFile: (file) => {
        if (file.endsWith('.wasm')) return wasmUrl;
        return file;
      }
    });
    return highs;
  })();

  return highsLoading;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== MSG.SOLVE_ILP) return false;

  (async () => {
    try {
      const solver = await getHighs();
      const lpString = message.lpString;
      const timeLimit = message.timeLimit || 30;

      console.log(`[TCGmizer Solver] Solving ILP (${lpString.length} chars, timeout ${timeLimit}s)...`);
      const startTime = performance.now();

      const solution = solver.solve(lpString, {
        time_limit: timeLimit,
        presolve: 'on',
      });

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      console.log(`[TCGmizer Solver] Done in ${elapsed}s — Status: ${solution.Status}, Objective: ${solution.ObjectiveValue}`);

      sendResponse({ success: true, solution });
    } catch (err) {
      console.error('[TCGmizer Solver] Error:', err);
      sendResponse({ success: false, error: err.message || String(err) });
    }
  })();

  return true; // keep sendResponse channel open for async
});

console.log('[TCGmizer] Offscreen solver document loaded.');
