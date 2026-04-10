#!/usr/bin/env node
// TCGmizer build script — bundles src/ into dist/chrome/ and dist/firefox/.

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'fs';
import { join } from 'path';

const BROWSERS = ['chrome', 'firefox'];
const ROOT = import.meta.dirname;

const isWatch = process.argv.includes('--watch');
const isDebug = process.argv.includes('--debug');

if (isDebug) {
  console.log('Building with DEBUG_MODE enabled');
}

const commonOptions = {
  bundle: true,
  target: 'es2022',
  sourcemap: true,
  minify: !isWatch && !isDebug,
  logLevel: 'info',
  define: {
    'DEBUG_MODE': isDebug ? 'true' : 'false',
  },
};

// Files copied as-is (no bundling). Paths relative to repo root.
const COPY_FILES = [
  { src: 'src/content/results-ui.css', dest: 'results-ui.css' },
  { src: 'src/popup/popup.html',       dest: 'popup/popup.html' },
  { src: 'src/popup/popup.js',         dest: 'popup/popup.js' },
  { src: 'src/options/options.html',    dest: 'options/options.html' },
  { src: 'src/options/options.js',      dest: 'options/options.js' },
  { src: 'src/options/options.css',     dest: 'options/options.css' },
];

function mergeManifests(browser) {
  const base = JSON.parse(readFileSync(join(ROOT, 'manifests', 'base.json'), 'utf-8'));
  const override = JSON.parse(readFileSync(join(ROOT, 'manifests', `${browser}.json`), 'utf-8'));
  return { ...base, ...override };
}

function findHighsFiles() {
  const highsDir = join(ROOT, 'node_modules/highs/build');
  const wasmSrc = join(highsDir, 'highs.wasm');
  const jsSrc = join(highsDir, 'highs.js');
  try {
    readFileSync(wasmSrc); // will throw if missing
    return { wasmSrc, jsSrc };
  } catch {
    console.warn('Warning: Could not locate HiGHS files in node_modules/highs/build/.');
    console.warn('You may need to run npm install or copy them manually.');
    return { wasmSrc: null, jsSrc: null };
  }
}

async function buildBrowser(browser) {
  const dist = join(ROOT, 'dist', browser);

  // Clean and create dist dir.
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  // Bundle entry points (IIFE for service worker and content script).
  await esbuild.build({
    ...commonOptions,
    entryPoints: [join(ROOT, 'src/background/service-worker.js')],
    outfile: join(dist, 'background.js'),
    format: 'iife',
  });

  await esbuild.build({
    ...commonOptions,
    entryPoints: [join(ROOT, 'src/content/content.js')],
    outfile: join(dist, 'content.js'),
    format: 'iife',
  });

  // Copy non-bundled files.
  for (const { src, dest } of COPY_FILES) {
    const destPath = join(dist, dest);
    mkdirSync(join(destPath, '..'), { recursive: true });
    cpSync(join(ROOT, src), destPath);
  }

  // Copy icons.
  cpSync(join(ROOT, 'icons'), join(dist, 'icons'), { recursive: true });

  // Copy HiGHS WASM and JS.
  const { wasmSrc, jsSrc } = findHighsFiles();
  if (wasmSrc) cpSync(wasmSrc, join(dist, 'highs.wasm'));
  if (jsSrc) cpSync(jsSrc, join(dist, 'highs.js'));

  // Merge and write manifest.
  const manifest = mergeManifests(browser);
  writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`✔ Built ${browser} → dist/${browser}/`);
}

async function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const targets = args.length > 0 ? args : BROWSERS;

  for (const browser of targets) {
    if (!BROWSERS.includes(browser)) {
      console.error(`Unknown browser: ${browser}. Use: ${BROWSERS.join(', ')}`);
      process.exit(1);
    }
    await buildBrowser(browser);
  }
}

await main().catch(err => {
  console.error(err);
  process.exit(1);
});

// ─── Watch mode ─────────────────────────────────────────────────────
if (isWatch) {
  const { watch } = await import('fs');
  const dirs = [join(ROOT, 'src'), join(ROOT, 'manifests'), join(ROOT, 'icons')];
  let timer = null;

  function rebuild() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        for (const browser of BROWSERS) await buildBrowser(browser);
      } catch (e) {
        console.error('Build error:', e.message);
      }
    }, 100);
  }

  for (const dir of dirs) {
    watch(dir, { recursive: true }, rebuild);
  }
  console.log('\n👀 Watching for changes… (Ctrl+C to stop)');
}
