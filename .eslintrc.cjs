module.exports = {
  parser: "@typescript-eslint/parser",
  extends: [
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended", // Enables eslint-plugin-prettier and displays prettier errors as ESLint errors.
  ],
  parserOptions: {
    ecmaVersion: "latest", // Allows for the parsing of modern ECMAScript features
    sourceType: "module", // Allows for the use of imports
  },
  rules: {
    // Place to specify ESLint rules. Can be used to overwrite rules specified from the extended configs
    // e.g. "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }], // Warn about unused vars, except those starting with _
    "@typescript-eslint/no-explicit-any": "warn", // Warn about explicit 'any'
  },
  env: {
    node: true, // Add node environment globals
  },
  ignorePatterns: ["dist/**/*", "node_modules/**/*", "*.js", "*.cjs"], // Ignore build output, node_modules, and config files
};
