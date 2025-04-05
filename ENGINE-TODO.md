# Engine Enhancements TODO (Cloudflare/Anti-Bot Focus)

This list outlines planned improvements specifically aimed at enhancing the `PlaywrightEngine`'s ability to handle websites protected by sophisticated anti-bot measures like Cloudflare, based on failures observed with sites like `essentialenergy.com.au`.

## Phase 1: Enhance PlaywrightEngine Stealth & Handling

These are internal improvements to the existing engine structure.

- [ ] **Improve Fingerprint Evasion (`applyStealthMode`)**

  - [x] Implement more `navigator` property overrides (e.g., `plugins`, `permissions`, `hardwareConcurrency`, `deviceMemory`).
  - [x] Add WebGL vendor/renderer spoofing.
  - [x] Add Canvas fingerprinting noise/spoofing.
  - [x] Ensure consistency between spoofed properties (e.g., `navigator.platform` should align with `User-Agent` and `Sec-CH-UA-Platform`).

- [ ] **Refine Headers (`applyStealthMode` / `applyBasicStealthMode`)**

  - [x] Use a wider variety/library of realistic, up-to-date User Agents.
  - [x] Ensure corresponding `Sec-CH-UA-*` (Client Hints) headers are generated and sent when appropriate for the chosen User-Agent.
  - [x] Ensure header order is realistic.

- [ ] **Smarter Challenge Waiting (`attemptBypassChallenges`)**

  - [x] Replace fixed delays with more intelligent waiting (e.g., `networkidle` again after challenge detection, wait for specific challenge elements to disappear).
  - [x] Potentially increase challenge detection timeout slightly.

- [ ] **Add Proxy Support**
  - [x] Add optional `proxy` configuration object (server, username, password) to `PlaywrightEngineConfig`.
  - [x] Pass proxy configuration through to `chromium.launch({ proxy: ... })` within `PlaywrightBrowserPool`.
  - [x] Update `HybridEngine` constructor to accept and pass `proxy` config.
  - [x] Update `README.md` configuration section to include proxy options.

## Phase 2: More Advanced Options (If Phase 1 is Insufficient)

These may require more significant changes or external dependencies.

- [~] **Investigate `--headless=new` (Investigated - Reverted due to instability)**

  - [x] Test if using Chrome's newer headless mode (`headless: 'new'` in launch options) provides better undetectability compared to the current default (`headless: true`). Requires Playwright version check/conditional logic potentially.

- [x] **Explore `playwright-extra` and `puppeteer-extra-plugin-stealth`**
  - [x] Evaluate integrating `playwright-extra` with its stealth plugin as an alternative to manual evasions. This could simplify `applyStealthMode` significantly but adds a dependency.
