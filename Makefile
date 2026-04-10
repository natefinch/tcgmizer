.PHONY: help deps build build-chrome build-firefox build-debug watch test clean format rebuild-wasm

# Default target: show help
help: ## Show this help message
	@echo "TCGmizer Development Targets"
	@echo "============================"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ── Dependencies ──────────────────────────────────────────────

node_modules: package.json
	npm install
	@touch node_modules

deps: node_modules ## Install/update npm dependencies

# ── Build ─────────────────────────────────────────────────────

dist/chrome/background.js dist/firefox/background.js &: node_modules $(shell find src -name '*.js' -o -name '*.css' -o -name '*.html') build.js manifests/*.json
	node build.js

build: dist/chrome/background.js dist/firefox/background.js ## Build for Chrome and Firefox

build-chrome: node_modules ## Build Chrome extension only
	node build.js chrome

build-firefox: node_modules ## Build Firefox add-on only
	node build.js firefox

build-debug: node_modules ## Build with debug features enabled
	node build.js --debug

# ── Test ──────────────────────────────────────────────────────

test: node_modules build ## Run all unit tests
	@echo "Running unit tests..."
	@failed=0; \
	for f in test/test-ilp.js test/test-direct-remap.js test/test-maxsellers.js test/test-alt-printings-unit.js test/test-exclusion-filter.js; do \
		echo ""; \
		echo "━━━ $$f ━━━"; \
		node "$$f" || failed=1; \
	done; \
	echo ""; \
	if [ $$failed -ne 0 ]; then \
		echo "\033[31m✗ Some tests failed\033[0m"; \
		exit 1; \
	else \
		echo "\033[32m✓ All test files passed\033[0m"; \
	fi

# ── Watch ─────────────────────────────────────────────────────

watch: node_modules ## Rebuild on file changes (dev mode)
	node build.js --watch

# ── Format ────────────────────────────────────────────────────

format: node_modules ## Format all source and test files with Prettier
	npx prettier --write 'src/**/*.{js,css,html}' 'test/**/*.js'

# ── WASM Solver ───────────────────────────────────────────────

rebuild-wasm: ## Rebuild HiGHS WASM solver (requires Docker)
	scripts/rebuild-highs-wasm.sh

# ── Clean ─────────────────────────────────────────────────────

clean: ## Remove build artifacts
	rm -rf dist/chrome dist/firefox
