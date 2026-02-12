# Jup CLI

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Jupiter](https://img.shields.io/badge/Jupiter-API-purple.svg)](https://jup.ag/)

> A secure, multi-wallet CLI for trading on Solana via Jupiter DEX aggregator with enterprise-grade session management.

## ✨ Features

- 🔐 **Secure Session Management** - Agent-autonomous operations without exposing private keys
- 👛 **Multi-Wallet Support** - Create, import, and manage multiple wallets
- 💱 **Jupiter Ultra API** - Execute swaps with the best rates and lowest slippage
- 📊 **Real-time Balances** - Live portfolio tracking via Solana RPC
- 🛡️ **Enterprise Security** - AES-256-GCM encryption with Argon2 key derivation
- 🔄 **Session-based Trading** - Execute trades without entering passwords repeatedly
- 📝 **Structured Logging** - File-based logging with daily rotation
- 🎯 **Zero-trust Architecture** - Private keys never exposed to agents

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/bertrandgressier/jup-cli.git
cd jup-cli

# Install dependencies
npm install

# Build the project
npm run build

# Install globally (optional)
npm link
```

### Initial Setup

```bash
# Initialize CLI with a master password
jup-cli init --password "YourSecurePassword123!"

# Set your Jupiter API key (get one at https://portal.jup.ag/)
jup-cli config set-jupiter-key your-api-key-here

# Check session status
jup-cli session status
```

### Create or Import Wallets

```bash
# Create a new wallet
jup-cli wallet create --name "Trading Wallet"

# Import an existing wallet (one-time operation)
jup-cli wallet import --name "Main Wallet" --private-key "your-private-key" --password "YourSecurePassword123!"

# List all wallets
jup-cli wallet list
```

### Execute Trades

```bash
# Get current prices
jup-cli price get SOL USDC

# Get a quote (dry run)
jup-cli trade swap USDC SOL 0.1 --wallet <wallet-id> --dry-run

# Execute a swap
jup-cli trade swap USDC SOL 0.1 --wallet <wallet-id> --yes
```

## 📖 Usage Guide

### Session-Based Architecture

Jup CLI uses a unique **session-based security model** that allows agents to operate autonomously while protecting sensitive operations.

```
┌─────────────────────────────────────────────────────────────────┐
│  SETUP PHASE (Human with master password)                        │
├─────────────────────────────────────────────────────────────────┤
│  $ jup-cli init --password <pwd>                                │
│      → Creates database                                          │
│      → Generates SESSION_KEY stored in ~/.solana/jup-cli/   │
│                                                                  │
│  $ jup-cli wallet import --name "Main" --private-key <key>      │
│      → Wallet encrypted with session key                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  AGENT PHASE (Autonomous, no password needed)                    │
├─────────────────────────────────────────────────────────────────┤
│  ✅ ALLOWED with session:                                        │
│     - jup-cli wallet list                                        │
│     - jup-cli wallet show <id>                                   │
│     - jup-cli price get SOL USDC                                 │
│     - jup-cli trade swap USDC SOL 0.1 -w <id> -y                │
│     - jup-cli session status                                     │
│                                                                  │
│  ❌ PROTECTED (password required):                               │
│     - jup-cli wallet export <id>    → Exposes private key       │
│     - jup-cli wallet delete <id>    → Irreversible              │
│     - jup-cli transfer <...>        → Outgoing transfers        │
└─────────────────────────────────────────────────────────────────┘
```

### Command Reference

#### Global Options

```bash
jup-cli [options] <command>

Options:
  -V, --version          Show version number
  -d, --data-dir <path>  Custom data directory (default: ~/.solana/jup-cli/)
  -v, --verbose          Enable verbose console logging
  -h, --help             Display help
```

#### Initialization Commands

| Command                         | Description                         | Password Required |
| ------------------------------- | ----------------------------------- | ----------------- |
| `jup-cli init`                  | Initialize CLI with master password | ✅ Yes            |
| `jup-cli init --password <pwd>` | Non-interactive initialization      | ✅ Yes            |

#### Wallet Management

| Command                                                   | Description                    | Session | Password        |
| --------------------------------------------------------- | ------------------------------ | ------- | --------------- |
| `jup-cli wallet create --name <name>`                     | Create new wallet              | ✅      | ✅              |
| `jup-cli wallet import --name <name> --private-key <key>` | Import existing wallet         | ❌      | ✅              |
| `jup-cli wallet list`                                     | List all wallets               | ✅      | ❌              |
| `jup-cli wallet show <id>`                                | Show wallet details & balances | ✅      | ❌              |
| `jup-cli wallet export <id>`                              | Export private key             | ❌      | ✅ **Required** |
| `jup-cli wallet delete <id>`                              | Delete wallet                  | ❌      | ✅ **Required** |

**Examples:**

```bash
# Create a new wallet (uses session)
jup-cli wallet create --name "Trading Bot"

# Import wallet with private key (password required for decryption)
jup-cli wallet import --name "Savings" --private-key "abc123..." --password "mypwd"

# View wallet (no password needed after import)
jup-cli wallet show 31bae462-255a-48f1-8dc6-6d51ae5e5871

# Export private key (password REQUIRED - session not allowed)
jup-cli wallet export 31bae462-255a-48f1-8dc6-6d51ae5e5871 --password "mypwd"
```

#### Price Commands

| Command                               | Description       | Session |
| ------------------------------------- | ----------------- | ------- |
| `jup-cli price get <token1> <token2>` | Get token prices  | ✅      |
| `jup-cli price search <query>`        | Search for tokens | ✅      |

**Examples:**

```bash
# Get SOL and USDC prices
jup-cli price get SOL USDC

# Search for a token
jup-cli price search "jupiter"
```

#### Trading Commands

| Command                                        | Description        | Session |
| ---------------------------------------------- | ------------------ | ------- |
| `jup-cli trade swap <input> <output> <amount>` | Execute token swap | ✅      |

**Options:**

- `-w, --wallet <id>` - Wallet ID to use
- `-s, --slippage <bps>` - Slippage tolerance (default: 100 = 1%)
- `--dry-run` - Get quote without executing
- `-y, --yes` - Skip confirmation prompt

**Examples:**

```bash
# Get a quote without executing
jup-cli trade swap USDC SOL 0.1 --wallet <id> --dry-run

# Execute swap with default slippage
jup-cli trade swap USDC SOL 0.1 --wallet <id> --yes

# Execute with custom slippage (0.5%)
jup-cli trade swap USDC SOL 0.1 --wallet <id> --slippage 50 --yes
```

#### Session Management

| Command                      | Description            | Password        |
| ---------------------------- | ---------------------- | --------------- |
| `jup-cli session status`     | Show session status    | ❌              |
| `jup-cli session regenerate` | Regenerate session key | ✅ **Required** |
| `jup-cli session clear`      | Clear current session  | ❌              |

#### Configuration Commands

| Command                                | Description                               |
| -------------------------------------- | ----------------------------------------- |
| `jup-cli config show`                  | Display current configuration             |
| `jup-cli config set-jupiter-key <key>` | Set Jupiter API key                       |
| `jup-cli config remove-jupiter-key`    | Remove API key                            |
| `jup-cli config set-rpc <url>`         | Set custom Solana RPC URL                 |
| `jup-cli config set-log-level <level>` | Set logging level (debug/info/warn/error) |

## 🔒 Security Model

### Key Principles

1. **Session-based Authorization** - Once initialized, agents can operate without passwords for routine operations
2. **Protected Commands** - Sensitive operations (export, delete, transfers) always require the master password
3. **Encryption at Rest** - All private keys are encrypted with AES-256-GCM
4. **Secure Key Derivation** - Argon2id for password hashing
5. **Memory Safety** - Private keys are zeroed from memory immediately after use

### Session Characteristics

| Property   | Value                                             |
| ---------- | ------------------------------------------------- |
| Scope      | Global (one session for all wallets)              |
| Storage    | `~/.solana/jup-cli/session/key` (permissions 600) |
| Expiration | Never (until manual regeneration)                 |
| Encryption | AES-256-GCM with master password                  |

### Security Levels

**Level 1 - Agent Operations (Session Allowed)**

- Wallet list/show
- Price queries
- Trade execution
- Configuration viewing

**Level 2 - Protected Operations (Password Required)**

- Wallet export (exposes private keys)
- Wallet delete (irreversible)
- Outgoing transfers
- Session regeneration

**Level 3 - Setup Operations (Password Required)**

- CLI initialization
- Wallet creation/import

## ⚙️ Configuration

### Configuration File

Location: `~/.solana/jup-cli/config.yaml`

```yaml
paths:
  data: ~/.solana/jup-cli/data
  logs: ~/.solana/jup-cli/logs
  cache: ~/.solana/jup-cli/cache

database:
  provider: sqlite
  url: file:~/.solana/jup-cli/data/jupiter.db

jupiter:
  baseUrl: https://api.jup.ag
  apiKey: your-api-key-here
  timeoutMs: 30000
  maxRetries: 3

solana:
  rpcUrl: https://api.mainnet-beta.solana.com
  commitment: confirmed

logging:
  level: info
  console: false # Logs to file only by default
  file: true
  maxFiles: 30 # Keep 30 days of logs

trading:
  defaultSlippageBps: 100 # 1%
  maxSlippageBps: 500 # 5%
```

### Environment Variables

```bash
# Override data directory
export JUPITER_DATA_DIR=/custom/path

# Custom database URL
export DATABASE_URL=file:/custom/path/jupiter.db
```

### Logging

By default, logs are written to files only (`~/.solana/jup-cli/logs/jupiter.1.log`) with daily rotation (30 days retention).

To enable console logging for debugging:

```bash
jup-cli --verbose wallet show <id>
```

## 🏗️ Architecture

This CLI follows **Clean Architecture** principles with clear separation of concerns:

```
src/
├── core/           # Cross-cutting concerns (crypto, config, logging)
├── domain/         # Entities and repository interfaces
├── application/    # Business logic and service interfaces
├── infrastructure/ # External implementations (Prisma, Solana RPC, Jupiter API)
└── interface/      # CLI commands (Commander.js)
```

For detailed architecture documentation, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## 🧪 Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Jupiter API key (https://portal.jup.ag/)

### Setup

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run in development mode
npm run dev -- --data-dir ./dev-data init
```

### Testing

```bash
# Run all tests
npm test

# Run specific test
npx jest tests/unit/wallet.service.test.ts

# Run integration tests
npx jest tests/integration/
```

### Build

```bash
# Build TypeScript
npm run build

# Type check without emitting
npm run typecheck

# Run linter
npm run lint

# Format code
npm run format
```

## 📊 API Reference

### Jupiter Ultra API

The CLI uses Jupiter's Ultra API for optimal swap execution:

| Endpoint                 | Description                |
| ------------------------ | -------------------------- |
| `GET /ultra/v1/order`    | Get swap order             |
| `POST /ultra/v1/execute` | Execute signed transaction |
| `GET /ultra/v1/search`   | Token search               |

### Solana RPC

Default: `https://api.mainnet-beta.solana.com`

Configurable via `jup-cli config set-rpc <url>`

## 🐛 Troubleshooting

### Session Not Found

If you get "No active session" errors:

```bash
# Regenerate session with your password
jup-cli session regenerate --password "your-password"
```

### API Key Issues

```bash
# Verify API key is set
jup-cli config show

# Set a new API key
jup-cli config set-jupiter-key your-new-api-key
```

### Permission Errors

Ensure the data directory has correct permissions:

```bash
chmod 700 ~/.solana/jup-cli
chmod 600 ~/.solana/jup-cli/session/key
```

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 🔗 Links

- [Jupiter DEX](https://jup.ag/)
- [Jupiter API Documentation](https://station.jup.ag/docs/apis/)
- [Solana Documentation](https://docs.solana.com/)
- [Report Issues](https://github.com/bertrandgressier/jup-cli/issues)

## 🙏 Acknowledgments

- Jupiter Labs for the excellent DEX aggregator and APIs
- Solana Labs for the high-performance blockchain
- The open-source community for the amazing tools and libraries

---

**Disclaimer**: This CLI is for educational and development purposes. Trading cryptocurrencies involves significant risk. Always verify transactions before signing and never share your private keys.
