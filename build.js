import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const isWatch = process.argv.includes('--watch');
const isDebug = process.argv.includes('--debug');

if (isDebug) {
  console.log('Building with DEBUG_MODE enabled');
}

// Common build options
const commonOptions = {
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  minify: !isWatch && !isDebug,
  logLevel: 'info',
  define: {
    'DEBUG_MODE': isDebug ? 'true' : 'false',
  },
};

async function build() {
  // 1. Bundle the background service worker
  // Use IIFE format (not ESM) so importScripts() works for loading HiGHS WASM.
  await esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'src/background/service-worker.js')],
    outfile: resolve(__dirname, 'dist/background.js'),
    format: 'iife',
  });

  // 2. Bundle the content script
  await esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(__dirname, 'src/content/content.js')],
    outfile: resolve(__dirname, 'dist/content.js'),
    format: 'iife', // content scripts must be IIFE
  });

  // 3. Copy HiGHS WASM and JS files to dist (loaded dynamically by service worker)
  const highsDir = resolve(__dirname, 'node_modules/highs/build');
  mkdirSync(resolve(__dirname, 'dist'), { recursive: true });

  try {
    cpSync(resolve(highsDir, 'highs.wasm'), resolve(__dirname, 'dist/highs.wasm'));
    // Copy the main highs JS module for the offscreen document to import
    cpSync(resolve(highsDir, 'highs.js'), resolve(__dirname, 'dist/highs.js'));
  } catch (e) {
    // Try alternate paths
    const altHighsDir = resolve(__dirname, 'node_modules/highs');
    try {
      // Find the wasm file
      const { execSync } = await import('child_process');
      const wasmPath = execSync('find node_modules/highs -name "*.wasm" | head -1', { encoding: 'utf8' }).trim();
      if (wasmPath) {
        cpSync(resolve(__dirname, wasmPath), resolve(__dirname, 'dist/highs.wasm'));
      }
      const jsPath = execSync('find node_modules/highs -name "highs.js" | head -1', { encoding: 'utf8' }).trim();
      if (jsPath) {
        cpSync(resolve(__dirname, jsPath), resolve(__dirname, 'dist/highs.js'));
      }
    } catch (e2) {
      console.warn('Warning: Could not copy HiGHS files. You may need to copy them manually.');
      console.warn(e2.message);
    }
  }

  console.log('Build complete!');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
