import { joinSession } from '@github/copilot-sdk/extension';

function architectureContext() {
  return `## TCGmizer Project Context

TCGmizer is a Manifest V3 Chrome extension that optimizes TCGPlayer.com shopping carts
using integer linear programming (HiGHS WASM solver).

### Key subsystems and files
- \`src/background/service-worker.js\` — Orchestrator: fetch → solve → results
- \`src/background/fetcher.js\` — TCGPlayer API client (listings, product search, alternate printings)
- \`src/content/content.js\` — Content script entry point (injects UI into cart page)
- \`src/content/results-ui.js\` — Optimizer config panel and results overlay
- \`src/content/cart-reader.js\` — DOM parser for cart items
- \`src/content/cart-modifier.js\` — Cart clear & re-add via gateway API
- \`src/shared/ilp-builder.js\` — Generates CPLEX LP format for the solver
- \`src/shared/solution-parser.js\` — Parses HiGHS solution into structured result
- \`src/shared/constants.js\` — Config values, message types, stages
- \`src/options/\` — Settings page (options.html/js/css)
- \`src/popup/\` — Extension popup

### Build, test, and format commands
- \`make build\` — Build with esbuild (produces dist/background.js and dist/content.js)
- \`make test\` — Run all unit tests
- \`make format\` — Format all source and test files with Prettier

### Documentation
- \`docs/DEVELOPMENT.md\` — Contributor workflow, build system, debugging
- \`docs/technical-design.md\` — Full architecture and implementation details
- \`docs/tcgplayer-api-reference.md\` — TCGPlayer API endpoint docs
- \`docs/highs-ilp-reference.md\` — HiGHS LP format reference
- \`README.md\` — User-facing features and usage`;
}

function codingPolicyContext() {
  return `## TCGmizer Coding Policy

1. **Always write tests** for new functionality. Add tests to the appropriate file in \`test/\`
   or create a new test file following existing patterns. Run \`make test\` to verify.

2. **Always update documentation** when adding or changing behavior:
   - \`README.md\` for user-visible features
   - \`docs/technical-design.md\` for architecture and implementation changes
   - \`docs/DEVELOPMENT.md\` for contributor workflow and build/test changes

3. **Format code** with \`make format\` (Prettier) after making changes.

4. **Verify changes** by running \`make format && make build && make test\` before finishing.`;
}

const session = await joinSession({
  hooks: {
    onSessionStart: async () => {
      return {
        additionalContext: architectureContext(),
      };
    },

    onUserPromptSubmitted: async () => {
      return {
        additionalContext: codingPolicyContext(),
      };
    },

    onPostToolUse: async (input) => {
      if (input.toolName === 'edit' || input.toolName === 'create') {
        const filePath = String(input.toolArgs?.path || '');
        const isSrc = filePath.includes('/src/');
        const isTest = filePath.includes('/test/');
        if (isSrc || isTest) {
          return {
            additionalContext:
              'Reminder: if behavior changed, ensure tests exist and docs are updated. ' +
              'Run `make format && make build && make test` when done with code changes.',
          };
        }
      }
    },
  },
  tools: [],
});
