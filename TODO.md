# Fetch Engines Package TODO List

This list outlines the steps to improve the `@your-org/fetch-engines` package, focusing on reliability, developer experience, and distribution readiness.

## Phase 1: Stabilize Core & Build

- [x] Configure project for ESM (`package.json`, `tsconfig.json`).
- [x] Fix relative import paths to use `.js` extensions.
- [x] Resolve runtime errors when executing examples (`ERR_MODULE_NOT_FOUND` / `ERR_UNKNOWN_FILE_EXTENSION`).
  - [x] Install `ts-node` as a dev dependency.
  - [x] Update `examples/README.md` with correct execution command (`pnpm exec node --loader ts-node/esm ...`).
- [x] Consolidate Browser Pools:
  - [x] Analyze `src/browser/BrowserPool.ts` vs `src/browser/PlaywrightBrowserPool.ts`.
  - [x] Determine if `BrowserPool.ts` is redundant.
  - [x] If redundant, remove `BrowserPool.ts` and any references.
- [x] Verify complete ESM setup (imports, extensions) across the project.

## Phase 2: Enhance Code Quality & Reliability

- [x] Add Linting/Formatting:
  - [x] Set up ESLint with TypeScript rules.
  - [x] Set up Prettier.
  - [x] Add `lint` and `format` scripts to `package.json`.
  - [x] Run initial lint/format pass.
- [ ] Implement Testing:
  - [x] Choose and set up a testing framework (e.g., Vitest, Jest).
  - [x] Write unit tests for `FetchEngine`.
  - [x] Write unit tests for `PlaywrightEngine`.
  - [ ] Write unit tests for `PlaywrightBrowserPool`.
  - [ ] Write unit tests for other core utilities/modules.

## Phase 3: Documentation & Distribution

- [x] Update `package.json` with correct scope (`@purepageio`), version (`0.1.0`), author, and repo URLs.
- [x] Create `README.md` with installation and basic usage instructions.
- [ ] Write more comprehensive documentation (Configuration options, advanced usage, API reference).
- [ ] Set up NPM account and `@purepageio` organization (if needed).
- [ ] Build the package (`pnpm run build`).
- [ ] Log in to NPM (`npm login`).
- [ ] Publish the package (`npm publish --access public`).
- [ ] Create a GitHub release/tag corresponding to the published version.
