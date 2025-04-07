# TODO: Implement HTML to Markdown Conversion Feature

This outlines the steps needed to add the functionality to convert fetched HTML content into Markdown using a new `markdown: boolean` flag.

## 1. Setup & Dependencies

- [x] Install required dependencies:
  ```bash
  pnpm install turndown turndown-plugin-gfm node-html-parser
  ```
- [x] Add necessary types for dependencies (if needed, e.g., `@types/turndown`).

## 2. Integrate MarkdownConverter

- [x] Create `src/utils/markdown-converter.ts`.
- [x] Paste the `MarkdownConverter` class code into the new file.
- [x] Define the `ConversionOptions` type within `src/utils/markdown-converter.ts` or a shared types file (e.g., `src/types.ts`). Start with a basic definition:
  ```typescript
  export interface ConversionOptions {
    extractionMode?: "precision" | "recall" | "balanced";
    attemptRecovery?: boolean;
    maxContentLength?: number;
  }
  ```
- [x] Refactor `MarkdownConverter` based on previous analysis (optional but recommended):
  - [x] Simplify preprocessing logic (consider starting with `balanced` mode only).
  - [x] Remove redundant rules/logic (e.g., `high-link-density` rule).
  - [x] Extract hardcoded values (selectors, thresholds) into constants.
  - [x] Improve error handling and type safety.
  - [x] Verify and potentially remove unused methods (e.g., `findLargestTextContainers`).
  - [x] Adjust imports/exports for ESM.

## 3. Modify Fetch Logic

- [x] Identify the central place where fetched HTML is processed (e.g., a base engine class method or utility function). (Decided to modify each engine: `FetchEngine`, `PlaywrightEngine`, `HybridEngine`)
- [x] Import the `MarkdownConverter` into the relevant file(s).
- [x] Add a new option (e.g., `markdown: boolean`) to the engine's configuration/options type (e.g., `FetchEngineOptions`, `PlaywrightEngineConfig`).
- [x] Modify the engine's constructor to accept and store this new option.
- [x] In the method that processes/returns the final `HTMLFetchResult` (likely `fetchHTML` or an internal helper):
  - [x] After successfully obtaining the HTML content (`result.html`).
  - [x] Check if the `markdown` option is true.
  - [x] If true, instantiate `MarkdownConverter`.
  - [x] Call `converter.convert(result.html)`.
  - [x] Replace `result.html` with the returned Markdown string.
  - [x] Add basic error handling around the conversion process (e.g., log errors, potentially return original HTML if conversion fails).
- [x] Repeat the modification process for all relevant engines (`FetchEngine.ts`, `PlaywrightEngine.ts`, `HybridEngine.ts`) ensuring consistent behavior.

## 4. Update Public API & Documentation

- [x] Update the main entry point (`src/index.ts` or similar) if necessary to expose the new option in factory functions or default configurations. (N/A - index.ts only exports classes)

## 5. Expose User Option

- [x] Update the main API/function signature in `src/index.ts` (or equivalent) to accept the `markdown` option. (N/A - User instantiates class directly)
- [x] If there's a CLI (`src/cli.ts`?), add a `--markdown` flag using the CLI argument parsing library (e.g., `yargs`, `commander`). (N/A - No CLI script found)
- [x] Pass the value of the `markdown` option/flag down through the function calls to the fetch logic modified in step 3. (N/A - No CLI)

## 6. Update Documentation

- [ ] Edit `README.md`.
- [ ] Add a section explaining the new `markdown` option/flag.
- [ ] Provide usage examples for both the library API and the CLI (if applicable).

## 7. Update Tests

- [ ] Locate the test suite (e.g., `test/`, `tests/`).
- [ ] Add new test cases specifically for the markdown conversion:
  - Test with the `markdown` flag set to `true`.
  - Provide sample HTML input.
  - Assert that the output is valid Markdown.
  - Consider testing edge cases (e.g., empty HTML, malformed HTML if converter handles it).
- [ ] Review existing tests: Modify any tests that rely on specific HTML output and might be affected when the `markdown` flag is used.

## 8. Review & Refine

- [ ] Test the functionality thoroughly with various websites/HTML inputs.
- [ ] Refine the `
