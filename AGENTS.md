# Agent Guidelines for @purepageio/fetch-engines

This document provides guidelines for AI agents working with this repository. Follow these practices to ensure consistency, quality, and maintainability.

## Table of Contents

- [Version Management](#version-management)
- [Testing Requirements](#testing-requirements)
- [Documentation Updates](#documentation-updates)
- [Code Quality](#code-quality)
- [Change Checklist](#change-checklist)

## Version Management

### Semantic Versioning (Semver)

Always follow [Semantic Versioning](https://semver.org/) when bumping versions in `package.json`:

- **MAJOR (x.0.0)**: Breaking changes that are incompatible with previous versions

  - Examples: Removing public APIs, changing function signatures, removing features
  - ⚠️ **Avoid breaking changes unless absolutely necessary**

- **MINOR (0.x.0)**: New features added in a backward-compatible manner

  - Examples: Adding new methods, new options, new exports
  - ✅ **Default choice for new features**

- **PATCH (0.0.x)**: Bug fixes in a backward-compatible manner
  - Examples: Fixing bugs, improving error messages, performance improvements
  - ✅ **Use for bug fixes only**

### Version Bumping Rules

1. **Check current version** in `package.json` before making changes
2. **Determine change type**:
   - New feature → MINOR bump
   - Bug fix → PATCH bump
   - Breaking change → MAJOR bump (avoid if possible)
3. **Update version** in `package.json` (e.g., `0.7.0` → `0.7.1` for patch)
4. **Always update CHANGELOG.md** (see below)

### Pre-1.0 Versioning

Since this package is pre-1.0 (`0.x.x`), breaking changes are more acceptable but should still be documented clearly. Prefer MINOR bumps for breaking changes in pre-1.0.

## Testing Requirements

### Always Write/Update Tests

1. **New features MUST include tests**

   - Add tests in the appropriate test file (e.g., `test/StructuredContentEngine.test.ts`)
   - Test both success and error cases
   - Test edge cases and boundary conditions

2. **Bug fixes MUST include regression tests**

   - Add a test that reproduces the bug (should fail before fix)
   - Verify the test passes after the fix

3. **Refactoring MUST maintain test coverage**
   - Ensure all existing tests still pass
   - Update tests if behavior changes intentionally

### Test Structure

- Use Vitest (`describe`, `it`, `expect`)
- Group related tests with `describe` blocks
- Use descriptive test names: `"should do X when Y"`
- Mock external dependencies appropriately
- Clean up resources in `afterEach`/`afterAll`

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test -- StructuredContentEngine.test.ts

# Run live network tests (requires LIVE_NETWORK=1)
pnpm test:live
```

**Before committing, ensure all tests pass.**

## Documentation Updates

### README.md

**ALWAYS update README.md when:**

- Adding new features or APIs
- Changing existing APIs
- Adding new configuration options
- Changing usage patterns
- Adding new examples

**Update sections:**

- Usage examples (if applicable)
- Configuration options table
- Quick start examples
- Any relevant sections

### CHANGELOG.md

**ALWAYS update CHANGELOG.md** following the [Keep a Changelog](https://keepachangelog.com/) format:

1. **Add entry under `[Unreleased]`** for changes not yet released
2. **When releasing**, move `[Unreleased]` to a new version section with date
3. **Use proper categories**:

   - `### Added` - New features
   - `### Changed` - Changes in existing functionality
   - `### Deprecated` - Soon-to-be removed features
   - `### Removed` - Removed features
   - `### Fixed` - Bug fixes
   - `### Security` - Security fixes

4. **Format example**:

   ```markdown
   ## [0.7.0] - 2024-12-20

   ### Added

   - Support for OpenAI-compatible APIs via `apiConfig` option
   - New `ApiConfig` interface

   ### Changed

   - Error message for missing API key now mentions both options

   ### Fixed

   - Fixed issue with markdown conversion for nested lists
   ```

5. **Update comparison links** at the bottom:
   ```markdown
   [Unreleased]: https://github.com/purepage/fetch-engines/compare/v0.7.0...HEAD
   [0.7.0]: https://github.com/purepage/fetch-engines/compare/v0.6.2...v0.7.0
   ```

### Code Comments

- Add JSDoc comments for public APIs
- Document complex logic with inline comments
- Keep comments up-to-date with code changes

## Code Quality

### TypeScript Standards

- **Always use TypeScript** - no `any` types unless absolutely necessary
- **Use proper types** - leverage existing types from `types.ts`
- **Export types** - if creating new public types, export them from `index.ts`
- **Type safety** - prefer strict typing over loose types

### Code Style

1. **Format code** using Prettier:

   ```bash
   pnpm format
   ```

2. **Lint code** using ESLint:

   ```bash
   pnpm lint
   ```

3. **Follow existing patterns**:
   - Use ESM imports/exports (not CommonJS)
   - Follow existing naming conventions
   - Match code structure and organization

### File Organization

- Source files in `src/`
- Tests in `test/` (mirror `src/` structure)
- Examples in `examples/`
- Scripts in `scripts/`

### Import/Export

- Use ESM syntax: `import`/`export`
- Use `.js` extensions in imports (TypeScript requirement)
- Export public APIs from `src/index.ts`

## Change Checklist

Before completing any change, verify:

- [ ] **Version bumped** in `package.json` (following semver)
- [ ] **Tests added/updated** and all tests pass (`pnpm test`)
- [ ] **README.md updated** with new features/changes
- [ ] **CHANGELOG.md updated** with proper entry under `[Unreleased]`
- [ ] **Code formatted** (`pnpm format`)
- [ ] **Code linted** (`pnpm lint`)
- [ ] **TypeScript compiles** (`pnpm build`)
- [ ] **No breaking changes** (or clearly documented if necessary)
- [ ] **Examples updated** (if applicable)
- [ ] **JSDoc comments** added for new public APIs

## Specific Guidelines

### Adding New Features

1. Implement feature in appropriate file
2. Add comprehensive tests
3. Update README.md with usage examples
4. Update CHANGELOG.md under `[Unreleased]` → `### Added`
5. Bump MINOR version
6. Export new types/functions from `src/index.ts` if public

### Fixing Bugs

1. Fix the bug
2. Add regression test
3. Update CHANGELOG.md under `[Unreleased]` → `### Fixed`
4. Bump PATCH version
5. Update README.md if documentation was incorrect

### Refactoring

1. Ensure all tests pass before and after
2. Update CHANGELOG.md under `[Unreleased]` → `### Changed` if behavior changes
3. Update README.md if usage changes
4. Bump MINOR version if public API changes, PATCH if internal only

### Breaking Changes

1. **Avoid if possible** - prefer deprecation warnings
2. If necessary:
   - Bump MAJOR version (or MINOR if pre-1.0)
   - Document clearly in CHANGELOG.md under `### Changed` or `### Removed`
   - Update README.md with migration guide
   - Add deprecation notices if applicable

## Examples

### Example: Adding a New Feature

```typescript
// 1. Add feature to src/StructuredContentEngine.ts
export interface NewFeatureOptions {
  enabled: boolean;
}

// 2. Add tests to test/StructuredContentEngine.test.ts
describe("newFeature", () => {
  it("should work correctly", () => {
    // test implementation
  });
});

// 3. Update README.md
// Add usage example in appropriate section

// 4. Update CHANGELOG.md
## [Unreleased]

### Added
- New feature X with `NewFeatureOptions` interface

// 5. Update package.json
"version": "0.8.0"  // MINOR bump
```

### Example: Fixing a Bug

```typescript
// 1. Fix bug in src/SomeEngine.ts

// 2. Add regression test
it("should handle edge case correctly", () => {
  // test that would have failed before fix
});

// 3. Update CHANGELOG.md
## [Unreleased]

### Fixed
- Fixed issue where X failed when Y occurred

// 4. Update package.json
"version": "0.7.1"  // PATCH bump
```

## Common Mistakes to Avoid

❌ **Don't** skip tests
❌ **Don't** forget to update CHANGELOG.md
❌ **Don't** forget to update README.md
❌ **Don't** use `any` types unnecessarily
❌ **Don't** commit without running tests
❌ **Don't** break backward compatibility without documenting
❌ **Don't** forget to format/lint code
❌ **Don't** bump version incorrectly (use semver)

✅ **Do** write comprehensive tests
✅ **Do** update all documentation
✅ **Do** follow semver strictly
✅ **Do** maintain backward compatibility
✅ **Do** format and lint before committing
✅ **Do** verify builds succeed

## Questions?

When in doubt:

1. Check existing code patterns
2. Review similar changes in git history
3. Follow the checklist above
4. Prefer being explicit over implicit

---

**Remember**: Quality > Speed. Take time to write good tests and documentation.
