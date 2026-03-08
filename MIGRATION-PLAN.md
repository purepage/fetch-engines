# Migration Plan: `@purepageio/fetch-engines` → `purepage`

## Overview

Rename the npm package from `@purepageio/fetch-engines` to `purepage` (unscoped) and move the GitHub repo to `github.com/purepage/purepage`. The source code has zero internal references to the package name — this is purely a config, docs, and registry operation.

## Pre-flight

- [ ] Confirm `purepage` is available on npm (`npm view purepage` should 404)
- [ ] Confirm `github.com/purepage/purepage` repo exists or can be created
- [ ] Decide on version: start fresh at `1.0.0` or continue from `0.11.0`

## Phase 1 — Rename in the codebase

All changes are in config and documentation files. No source code changes required.

### package.json

| Field            | Old                                                  | New                                           |
| ---------------- | ---------------------------------------------------- | --------------------------------------------- |
| `name`           | `@purepageio/fetch-engines`                          | `purepage`                                    |
| `repository.url` | `git+https://github.com/purepage/fetch-engines`      | `git+https://github.com/purepage/purepage`    |
| `bugs.url`       | `https://github.com/purepageio/fetch-engines/issues` | `https://github.com/purepage/purepage/issues` |
| `homepage`       | `https://github.com/purepageio/fetch-engines#readme` | `https://github.com/purepage/purepage#readme` |
| `keywords`       | add `purepage`, `web-extraction`, `markdown`, `rag`  | —                                             |

Consider dropping the `publishConfig.access: "public"` field — unscoped packages are public by default.

### README.md (7 references)

- Title: `# @purepageio/fetch-engines` → `# purepage`
- npm badge URL: update to `purepage`
- CI badge URLs: update to `purepage/purepage`
- "Why fetch-engines?" → "Why purepage?"
- "Why trust fetch-engines" → "Why trust purepage"
- Comparison table: `fetch-engines` → `purepage`
- Install command: `pnpm add @purepageio/fetch-engines` → `pnpm add purepage`
- Import examples (3 occurrences): `from "@purepageio/fetch-engines"` → `from "purepage"`

### CHANGELOG.md (15+ references)

- All comparison links: `purepage/fetch-engines` → `purepage/purepage`
- Add a new entry at the top documenting the rename
- Prose references to `fetch-engines` in existing entries can stay as-is (they're historical)

### AGENTS.md (3 references)

- Title: `@purepageio/fetch-engines` → `purepage`
- Example CHANGELOG links in the guidelines section

### REQUIREMENTS.md (2 references)

- Title and first paragraph

### .github/ISSUE_TEMPLATE/bug_report.md (1 reference)

- Version label: `@purepageio/fetch-engines version:` → `purepage version:`

### .github/workflows/\*.yml

- No references to the package name, but verify the CI badge paths in README match the new repo after the GitHub rename

## Phase 2 — GitHub repo rename

1. Go to `github.com/purepage/fetch-engines` → Settings → rename to `purepage`
2. GitHub auto-redirects the old URL for a period, so existing links won't immediately break
3. Update the local git remote:

```bash
git remote set-url origin git@github.com:purepage/purepage.git
```

## Phase 3 — Publish the new package

```bash
# Build and verify
pnpm build && pnpm typecheck && pnpm lint && pnpm test

# Publish under the new name
npm publish
```

## Phase 4 — Deprecate the old package

Publish one final version of `@purepageio/fetch-engines` that re-exports from `purepage`:

```typescript
// src/index.ts (temporary, for the deprecation release only)
console.warn("[@purepageio/fetch-engines] This package has been renamed to 'purepage'. Please update your dependency.");
export * from "purepage";
```

Then mark it deprecated on npm:

```bash
npm deprecate @purepageio/fetch-engines "This package has been renamed to 'purepage'. Install purepage instead."
```

This means existing users:

- Don't break immediately (re-export keeps their imports working)
- See a clear warning in their terminal on install and at runtime
- Know exactly what to change

## Phase 5 — Verify

- [ ] `npm view purepage` shows the new package
- [ ] `npm view @purepageio/fetch-engines` shows the deprecation notice
- [ ] GitHub repo at `github.com/purepage/purepage` is live
- [ ] CI badges in README resolve correctly
- [ ] `pnpm add purepage` works and `import { HybridEngine } from "purepage"` resolves

## Files changed summary

| File                                   | Changes                                                             |
| -------------------------------------- | ------------------------------------------------------------------- |
| `package.json`                         | name, repository, bugs, homepage, keywords                          |
| `README.md`                            | title, badges, install, imports, section headings, comparison table |
| `CHANGELOG.md`                         | comparison links, new rename entry                                  |
| `AGENTS.md`                            | title, example links                                                |
| `REQUIREMENTS.md`                      | title, first paragraph                                              |
| `.github/ISSUE_TEMPLATE/bug_report.md` | version label                                                       |
| `src/**/*.ts`                          | **No changes**                                                      |
| `test/**/*.ts`                         | **No changes**                                                      |
| `examples/**/*.ts`                     | **No changes**                                                      |
| `scripts/**/*.mjs`                     | **No changes**                                                      |

## Risk

**Low.** The package is pre-1.0 with a small user base. Source code and tests have zero references to the package name. The deprecation shim means existing installs keep working. This is the cheapest the rename will ever be.
