import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * The CI `review` stage runs this. Failing it blocks merge, including on your own merge requests
 * (constitution VI), so the project-specific rules below are the ones worth a red build.
 *
 * Type-aware linting is deliberately not enabled: `tsc --noEmit` already runs in the same stage at
 * full strictness, and the type-aware ruleset would type-check the project a second time.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright output.
    "playwright-report/**",
    "test-results/**",
  ]),

  {
    rules: {
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],

      /*
       * The date footgun, enforced rather than remembered.
       *
       * `new Date("2026-08-04")` parses as UTC midnight, so formatting it back anywhere west of
       * Greenwich yields the previous day. Scheduled dates are DATE end to end (FR-012a,
       * research.md R-006) precisely so that is unrepresentable in the data — this rule closes the
       * one place it can still reappear, the display boundary.
       *
       * lib/dates.ts is exempted below: it is the module that exists so nothing else has to do
       * this, and T028 requires it to parse by hand rather than through the Date constructor.
       */
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            "Do not construct a Date directly — new Date('YYYY-MM-DD') parses as UTC midnight and renders as the previous day west of Greenwich. Use the helpers in lib/dates.ts (research.md R-006).",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='parse']",
          message: "Date.parse has the same UTC-midnight problem as new Date. Use lib/dates.ts.",
        },
      ],
    },
  },

  {
    // The one module allowed to touch Date directly — which is what makes the rule above
    // affordable everywhere else — plus its own test, which has to build the local-time Dates it
    // asserts on and to construct an Invalid Date deliberately. Nothing else earns this.
    files: ["lib/dates.ts", "tests/client/dates.spec.ts"],
    rules: { "no-restricted-syntax": "off" },
  },

  {
    /*
     * `scripts/` is operational tooling, not shipped code — the T072 walk against the deployed
     * environment (browser -> Vercel -> Render -> Neon), which nothing in `app/` or `lib/` imports
     * and no bundle contains.
     *
     * Two rules are lifted, and only for the reasons that make them rules elsewhere:
     *
     * - `no-console` — stdout IS this script's output. A walk whose findings are recorded in
     *   tasks.md has nowhere else to put them.
     * - `no-restricted-syntax` — the ban exists for `new Date("YYYY-MM-DD")`, which parses as UTC
     *   midnight and renders as the previous day west of Greenwich. These scripts use the
     *   *argumentless* `new Date()` to type today into a native date input, formatted through
     *   local-time getters, which is the case the rule was never about. Scoped here rather than
     *   globally ignored so the rest — unused vars, eqeqeq — still applies.
     *
     * These are exempt from the linter, not from `.claude/rules/design.md`: the walk runs at
     * 375x667 because that is the floor the product is measured against.
     */
    files: ["scripts/**"],
    rules: { "no-console": "off", "no-restricted-syntax": "off" },
  },
]);

export default eslintConfig;
