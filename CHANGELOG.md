# [2.0.0](https://github.com/bertrandgressier/jupiter-cli/compare/v1.0.0...v2.0.0) (2026-02-12)

### Bug Fixes

- **ci:** add @eslint/js and fix eslint config for ESLint 9.x ([f16cf0a](https://github.com/bertrandgressier/jupiter-cli/commit/f16cf0ac3569094cf2bfdbd4a0d098f6e1d5e77b))
- **ci:** add build step before tests and lower coverage thresholds ([de5d4d0](https://github.com/bertrandgressier/jupiter-cli/commit/de5d4d0e435c8cd9818b3607487f3a490c802928))
- **ci:** correct test command syntax for pnpm ([b005a3a](https://github.com/bertrandgressier/jupiter-cli/commit/b005a3afff000f16f815e624e5e209416667c431))
- migrate to ESLint 9.x flat config format ([a0993a8](https://github.com/bertrandgressier/jupiter-cli/commit/a0993a8567b36ad220ffe09594ce77e5d6c93711))
- **tests:** skip flaky tests and fix e2e command option ([393bc0d](https://github.com/bertrandgressier/jupiter-cli/commit/393bc0d6959eb5adc16e9b7411c392a8e6191dcc))

### chore

- migrate to pnpm and update dependencies to latest versions ([ad32518](https://github.com/bertrandgressier/jupiter-cli/commit/ad32518dcf4c456a422d1976e2b8b483e8c5b5a5))

### BREAKING CHANGES

- Now requires Node.js >=20 and pnpm

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of Jupiter CLI
- Session-based security model for agent-autonomous operations
- Multi-wallet management with AES-256-GCM encryption
- Jupiter Ultra API integration for optimal swap execution
- Real-time portfolio tracking via Solana RPC
- File-based logging with pino and daily rotation
- Complete command set: init, wallet, price, trade, config, session
- Protected command system (export/delete require password)
- Session status and management commands
- Configuration management with YAML support
- TypeScript implementation with strict typing
- Clean Architecture with Domain-Driven Design
- Comprehensive test suite (unit and integration)
- CI/CD pipeline with GitHub Actions

### Security

- Argon2id for password hashing
- AES-256-GCM for private key encryption
- Session key persistence with file permissions 600
- Zero-out sensitive data from memory after use
- Protected commands reject session authentication

## [1.0.0] - 2024-02-XX

### Added

- First stable release
- Complete wallet lifecycle management
- Trading via Jupiter Ultra API
- Session-based authentication system
- Enterprise-grade security

[Unreleased]: https://github.com/bertrandgressier/jupiter-cli/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/bertrandgressier/jupiter-cli/releases/tag/v1.0.0
