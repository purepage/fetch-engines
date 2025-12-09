# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.0] - 2025-01-XX

### Added

- Schema field descriptions are now required - all Zod schema fields must include `.describe()` calls to guide the AI model
- Improved error messages for structured content extraction failures, including better detection of key mismatches and type validation errors
- Automatic suppression of AI SDK warnings about responseFormat/structuredOutputs when using OpenAI-compatible APIs

### Changed

- **BREAKING**: `fetchStructuredContent` now requires all schema fields to have descriptions via `.describe()` method. Update your schemas to add `.describe()` calls to each field.
- Enhanced system prompt to include field descriptions, improving extraction accuracy and data type handling

### Fixed

- Route OpenAI-compatible `apiConfig.baseURL` values through `createOpenAICompatible` to avoid cookie-based auth errors
- Fixed price extraction - models now correctly return numeric values instead of currency strings when descriptions specify the expected format

## [0.7.3] - 2025-12-09

### Fixed

- Ensure `apiConfig` uses provided API keys for OpenAI-compatible providers by always sending an `Authorization` header and supporting the `OPENROUTER_API_KEY` environment variable as a fallback

## [0.7.2] - 2025-02-13

### Fixed

- Ensure `apiConfig` uses provided API keys for OpenAI-compatible providers by always sending an `Authorization` header and supporting the `OPENROUTER_API_KEY` environment variable as a fallback

## [0.7.0] - 2024-12-XX

### Added

- Support for OpenAI-compatible APIs (OpenRouter, etc.) via new `apiConfig` option in `StructuredContentOptions`
- `ApiConfig` interface with `apiKey`, `baseURL`, and `headers` options for custom API providers
- Flexible model names - `model` parameter now accepts any string (not just predefined OpenAI models)

### Changed

- **BREAKING**: `model` is now required in `StructuredContentOptions` (no default model)
- Error message for missing API key now mentions both `apiConfig.apiKey` and `OPENAI_API_KEY` environment variable

## [0.6.2] - YYYY-MM-DD

### Fixed

- (Previous releases - add as needed)

[Unreleased]: https://github.com/purepage/fetch-engines/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/purepage/fetch-engines/compare/v0.7.3...v0.8.0
[0.7.3]: https://github.com/purepage/fetch-engines/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/purepage/fetch-engines/compare/v0.7.0...v0.7.2
[0.7.0]: https://github.com/purepage/fetch-engines/compare/v0.6.2...v0.7.0
[0.6.2]: https://github.com/purepage/fetch-engines/compare/v0.6.1...v0.6.2
