# [2.2.0](https://github.com/bertrandgressier/jup-cli/compare/v2.1.0...v2.2.0) (2026-02-13)

### Bug Fixes

- fallback to search API when getTokenInfo fails for mint address ([77d0962](https://github.com/bertrandgressier/jup-cli/commit/77d096253199ef1852fb4a43b612dd6dc3109adc))

### Features

- add TokenInfo table for token symbol display ([5ba6096](https://github.com/bertrandgressier/jup-cli/commit/5ba6096590b3857ccccd92a26513a8bbbc9b9c5f))
- centralize token resolution in TokenInfoService ([39f4473](https://github.com/bertrandgressier/jup-cli/commit/39f44731305d06405e403b8350f636e1d50872a7))
- display token symbol and mint address in wallet show ([5ff7cb3](https://github.com/bertrandgressier/jup-cli/commit/5ff7cb3cb72986f1b9ff68901e3916b08c11e45f))
- use Jupiter search API to resolve token symbols ([661c7df](https://github.com/bertrandgressier/jup-cli/commit/661c7dfc469e825f69f58615178db93ef8947aed))

# [2.1.0](https://github.com/bertrandgressier/jup-cli/compare/v2.0.8...v2.1.0) (2026-02-13)

### Bug Fixes

- remove non-null assertion in test file ([2f3d996](https://github.com/bertrandgressier/jup-cli/commit/2f3d996984f961821976458d88c4a09e513b7c58))

### Features

- add flexible wallet identifier resolution (number, name, UUID) ([58ebf67](https://github.com/bertrandgressier/jup-cli/commit/58ebf67ffb0781edb313f349af14c4663d3b5f52))
- auto-run migrations on app startup ([ca96664](https://github.com/bertrandgressier/jup-cli/commit/ca9666416142dc11e97faee808c28fc5714dd99f))

## [2.0.8](https://github.com/bertrandgressier/jup-cli/compare/v2.0.7...v2.0.8) (2026-02-13)

### Bug Fixes

- update CLI help messages to use correct command name (jup-cli) ([4398404](https://github.com/bertrandgressier/jup-cli/commit/439840401e34dfd13da84b1669896eb7cd9044c2))
- update husky pre-commit hook to v9 format ([5d48ee7](https://github.com/bertrandgressier/jup-cli/commit/5d48ee75056feeb6ba60cbbd4b3b6fa81f531e2e))

## [2.0.7](https://github.com/bertrandgressier/jup-cli/compare/v2.0.6...v2.0.7) (2026-02-12)

### Bug Fixes

- read version from package.json at runtime ([0634931](https://github.com/bertrandgressier/jup-cli/commit/063493150154edc66856a0fcc9306865b52946fc))

## [2.0.6](https://github.com/bertrandgressier/jup-cli/compare/v2.0.5...v2.0.6) (2026-02-12)

### Bug Fixes

- update version to 2.0.5 and program name to jup-cli ([a84515c](https://github.com/bertrandgressier/jup-cli/commit/a84515c53569969da926eb27171511950c754f70))

## [2.0.5](https://github.com/bertrandgressier/jup-cli/compare/v2.0.4...v2.0.5) (2026-02-12)

### Bug Fixes

- move prisma to dependencies for postinstall hook ([5bf3492](https://github.com/bertrandgressier/jup-cli/commit/5bf349229e5179be6fea329eb74794944ce9daad))
- update pnpm-lock.yaml ([0a40248](https://github.com/bertrandgressier/jup-cli/commit/0a40248ae1586bfc330297d5ff2c1048e373a206))

## [2.0.4](https://github.com/bertrandgressier/jup-cli/compare/v2.0.3...v2.0.4) (2026-02-12)

### Bug Fixes

- update bin name to jup-cli and update README ([fb73172](https://github.com/bertrandgressier/jup-cli/commit/fb73172f712f1b26b9cb4504fb6dc7b851442aad))

## [2.0.3](https://github.com/bertrandgressier/jup-cli/compare/v2.0.2...v2.0.3) (2026-02-12)

### Bug Fixes

- publish as jup-cli ([78bdcea](https://github.com/bertrandgressier/jup-cli/commit/78bdcea71f06bc7a284549a722b8063687072fa4))

## [2.0.2](https://github.com/bertrandgressier/jup-cli/compare/v2.0.1...v2.0.2) (2026-02-12)

### Bug Fixes

- republish to npm ([1733ca1](https://github.com/bertrandgressier/jup-cli/commit/1733ca183e552ce7fe6a3b4aabbffb663f6cf97c))

## [2.0.1](https://github.com/bertrandgressier/jup-cli/compare/v2.0.0...v2.0.1) (2026-02-12)

### Bug Fixes

- trigger npm publish ([416df26](https://github.com/bertrandgressier/jup-cli/commit/416df26dba87bacc8625b8b78fd4055cce8564b5))

# [2.0.0](https://github.com/bertrandgressier/jup-cli/compare/v1.0.0...v2.0.0) (2026-02-12)

### Bug Fixes

- **ci:** add @eslint/js and fix eslint config for ESLint 9.x ([f16cf0a](https://github.com/bertrandgressier/jup-cli/commit/f16cf0ac3569094cf2bfdbd4a0d098f6e1d5e77b))
- **ci:** add build step before tests and lower coverage thresholds ([de5d4d0](https://github.com/bertrandgressier/jup-cli/commit/de5d4d0e435c8cd9818b3607487f3a490c802928))
- **ci:** correct test command syntax for pnpm ([b005a3a](https://github.com/bertrandgressier/jup-cli/commit/b005a3afff000f16f815e624e5e209416667c431))
- migrate to ESLint 9.x flat config format ([a0993a8](https://github.com/bertrandgressier/jup-cli/commit/a0993a8567b36ad220ffe09594ce77e5d6c93711))
- **tests:** skip flaky tests and fix e2e command option ([393bc0d](https://github.com/bertrandgressier/jup-cli/commit/393bc0d6959eb5adc16e9b7411c392a8e6191dcc))

### chore

- migrate to pnpm and update dependencies to latest versions ([ad32518](https://github.com/bertrandgressier/jup-cli/commit/ad32518dcf4c456a422d1976e2b8b483e8c5b5a5))

### BREAKING CHANGES

- Now requires Node.js >=20 and pnpm

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of Jup CLI
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

[Unreleased]: https://github.com/bertrandgressier/jup-cli/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/bertrandgressier/jup-cli/releases/tag/v1.0.0
