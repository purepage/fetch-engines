// eslint.config.js
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

export default tseslint.config(
  // Extends can be replaced by spreading configurations
  ...tseslint.configs.recommended,

  // Prettier recommended config should be last
  eslintPluginPrettierRecommended,

  {
    // Files to lint (equivalent to root: true and patterns)
    files: ["src/**/*.ts", "examples/**/*.ts"],
    // Language options (equivalent to parserOptions)
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        // project: true, // REMOVED: Disable project-specific parsing for now to fix example file error
      },
      globals: {
        ...globals.node, // Include Node.js globals
      },
    },
    // Rules (equivalent to rules section)
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Specific overrides for PlaywrightBrowserPool.ts
    files: ["src/browser/PlaywrightBrowserPool.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off", // Allow require() for playwright-extra
      "@typescript-eslint/no-var-requires": "off", // Allow require() for playwright-extra
    },
  },
  {
    // Ignores (equivalent to ignorePatterns)
    ignores: [
      "dist/**/*",
      "node_modules/**/*",
      "*.js",
      "*.cjs",
      "*.mjs",
      "coverage/**/*",
      "LICENSE", // Ignore LICENSE file explicitly
      "*.yaml",
      "*.md",
      "*.json",
      "*.lock",
      ".git/",
      ".vscode/",
      ".DS_Store",
    ],
  }
);
