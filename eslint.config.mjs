import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/**
 * Lint gate (`AGENTS.md` § PROJECT: `pnpm lint`).
 *
 * Rules are deliberately narrow: type-aware correctness is `tsc -b`'s job, so this file only blocks
 * things the compiler cannot see — an unused escape hatch, a floating promise, a hook order bug.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-types/**",
      "**/node_modules/**",
      "**/.wrangler/**",
      "**/coverage/**",
      "docs/**",
      ".agents/**",
      ".claude/**",
      "scripts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["info", "warn", "error"] }],
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
    },
  },
  {
    files: ["**/*.tsx"],
    plugins: { "react-hooks": reactHooks },
    // Only the two rules that catch real bugs are on. The plugin's compiler-oriented rules
    // (`set-state-in-effect`, `purity`, `refs`) flag the app's deliberate patterns — loading data in an
    // effect and reading `performance.now()` inside a match loop — so they are off on purpose, not by
    // accident; `conventions.md` § 9 records this deviation.
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "tests/**/*.{ts,tsx}", "**/tests/**/*.{ts,tsx}"],
    rules: { "no-console": "off", "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
