# PLAN: Trading, Limit Orders & PnL

## Table of Contents

1. [Challenges & Design Decisions](#1-challenges--design-decisions)
2. [Architecture](#2-architecture)
3. [Database Changes](#3-database-changes)
4. [New Services](#4-new-services)
5. [CLI Commands](#5-cli-commands)
6. [Display Formats](#6-display-formats)
7. [Execution Flows](#7-execution-flows)
8. [Implementation Phases](#8-implementation-phases)
9. [Complete Test Plan](#9-complete-test-plan)

---

## 1. Challenges & Design Decisions

### C1: PnL Method — Cost Average vs FIFO

| Criteria         | Cost Average           | FIFO                    |
| ---------------- | ---------------------- | ----------------------- |
| Complexity       | Simple                 | Moderate (lot tracking) |
| Storage          | 1 row per token/wallet | N rows per token/wallet |
| Fiscal precision | Approximate            | Exact                   |
| Reconstruction   | Easy from trades       | Complex                 |

**Decision: Cost Average, calculated dynamically from trades.**

Rationale:

- Trades are stored in DB with USD values at execution time.
- PnL is always recomputed from trades (no stale data).
- No separate `CostBasis` table needed — the existing `CostBasis` model will be **removed**.
- If FIFO is needed later, trade history is preserved and FIFO can be computed from the same data.

---

### C2: USD Price at Trade Time

**Problem:** Without historical price data, chain-of-trades (SOL→BONK→SOL) lose USD context.

**Decision: Capture USD price at execution time via Jupiter Price API.**

Flow:

1. Before/after executing a swap, call `getPrice([inputMint, outputMint])`.
2. Store `inputUsdPrice` and `outputUsdPrice` (price per unit) in the `Trade` row.
3. Compute `inputUsdValue = inputAmount × inputUsdPrice` and `outputUsdValue = outputAmount × outputUsdPrice`.

Fallback chain:

1. Jupiter Price API → primary source.
2. Implicit price from swap ratio (if one side is a stablecoin: USDC, USDT, PYUSD).
3. Store `null` if no price available — these trades are excluded from PnL with a warning.

---

### C3: Limit Orders — Execution Detection

**Problem:** Jupiter executes limit orders server-side. We need to detect when an order fills.

**Decision: Lazy detection at `wallet show` time + dedicated `order sync` command.**

Flow:

1. On `wallet show`, call `getTriggerOrders(address, 'active')` for active orders display.
2. On `wallet show` or `order sync`, call `getTriggerOrders(address, 'history')` and compare with stored trades.
3. New filled orders → create `Trade` entries with `type = 'limit_order'`.
4. USD price: use the implicit price from `makingAmount / takingAmount` (this is the target price the user set, which is the execution price for limit orders with 0 slippage).

Pagination concern:

- Trigger API paginates at 10 per page.
- On first sync, we may need to paginate through all history.
- After first sync, we only need to check the first page(s) for new fills.
- Store `lastSyncedAt` timestamp to optimize.

---

### C4: Tokens Received Outside CLI

**Problem:** Airdrops, transfers, staking rewards — tokens appear in balance but have no Trade in DB.

**Decision: Acknowledge the gap, don't try to solve it.**

- PnL report shows a "Tracked" vs "Untracked" distinction.
- Tokens with balance but no trade history show `cost: unknown` and are excluded from PnL totals.
- Future: `jupiter import-trade` command to manually add historical trades.

---

### C5: `order create --target` Semantics

**Problem:** `--target 200` is ambiguous. Price per unit? Total output amount?

**Decision: `--target` is the price per unit of the INPUT token in terms of OUTPUT token.**

```bash
# "Sell 1 SOL when SOL reaches 200 USDC"
jupiter order create SOL USDC 1 --target 200 -w Trading
# → makingAmount = 1 SOL (in lamports)
# → takingAmount = 200 USDC (in smallest unit)
# → Executes when 1 SOL >= 200 USDC

# "Buy SOL with 150 USDC when SOL drops to 150"
jupiter order create USDC SOL 150 --target 1 -w Trading
# → makingAmount = 150 USDC
# → takingAmount = 1 SOL
# → Executes when 150 USDC >= 1 SOL
```

This maps directly to the Trigger API's `makingAmount` / `takingAmount`.

---

### C6: Existing CostBasis Entity — Deprecation

**Decision: Remove `CostBasis` model from Prisma schema and delete the entity + test.**

Rationale:

- PnL will be computed dynamically from `Trade` records.
- No duplication of cost tracking logic.
- Migration will drop the `CostBasis` table.

---

### C7: Partial Fill of Limit Orders

**Problem:** Can a limit order be partially filled on Jupiter Trigger API?

**Decision: Treat as binary (filled or not) for now.**

Jupiter Trigger orders execute fully or not at all (they are not order book style). The Trigger API status is either `active`, `filled`, `cancelled`, or `expired`. No partial fill state exists.

---

### C8: PnL Calculation — Correct Cost Reduction on Sell

**Problem:** When selling a token, we must reduce the **cost basis proportionally**, not subtract the sale USD value.

**Correct formula:**

```
On sell of X units of token T:
  ratio = X / total_acquired_T
  cost_removed = total_cost_T × ratio
  realized_pnl = sale_usd_value - cost_removed

  total_acquired_T -= X
  total_cost_T -= cost_removed
```

**Example:**

```
Buy 10 SOL @ $100 → cost = $1,000
Buy 5 SOL @ $200  → cost = $1,000 + $1,000 = $2,000, total = 15 SOL
Avg cost = $2,000 / 15 = $133.33

Sell 10 SOL @ $180:
  ratio = 10 / 15 = 0.6667
  cost_removed = $2,000 × 0.6667 = $1,333.33
  realized_pnl = $1,800 - $1,333.33 = +$466.67

  Remaining: 5 SOL, cost = $666.67, avg = $133.33
```

---

## 2. Architecture

### Layer Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           INTERFACE LAYER                           │
│  CLI Commands (Commander.js)                                        │
├─────────────────────────────────────────────────────────────────────┤
│  wallet show    │ trade swap     │ order create/list/cancel         │
│  history        │ pnl show       │ order sync                      │
└────────┬────────┴────────┬───────┴──────────┬───────────────────────┘
         │                 │                  │
         ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        APPLICATION LAYER                            │
│  Services                                                           │
├─────────────────────────────────────────────────────────────────────┤
│  WalletSyncService (exists)  │  TradeService (NEW)                  │
│  WalletManagerService (exists)│  PnLService (NEW)                   │
│  TokenInfoService (exists)    │  OrderSyncService (NEW)             │
└────────┬────────┬────────────┴──────────┬───────────────────────────┘
         │        │                       │
         ▼        ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       DOMAIN LAYER                                  │
│  Entities & Repository Interfaces                                   │
├─────────────────────────────────────────────────────────────────────┤
│  Wallet (exists)       │  Trade (NEW)                               │
│  TokenInfo (exists)    │  TradeRepository (NEW)                     │
│  CostBasis (REMOVE)    │                                            │
└────────┬───────────────┴────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     INFRASTRUCTURE LAYER                             │
│  External Implementations                                           │
├─────────────────────────────────────────────────────────────────────┤
│  PrismaTradeRepository (NEW)  │  TriggerApiService (NEW)            │
│  PrismaWalletRepository       │  UltraApiService (exists)           │
│  SolanaRpcService (exists)    │  JupiterClient (exists)             │
└─────────────────────────────────────────────────────────────────────┘
```

### New Files

```
src/
├── domain/
│   ├── entities/
│   │   └── trade.entity.ts                    # NEW: Trade entity
│   └── repositories/
│       └── trade.repository.ts                # NEW: TradeRepository interface
│
├── application/
│   └── services/
│       ├── trade/
│       │   └── trade.service.ts               # NEW: Record trades, fetch history
│       ├── pnl/
│       │   └── pnl.service.ts                 # NEW: PnL calculation from trades
│       └── order/
│           └── order-sync.service.ts          # NEW: Sync limit order fills
│
├── infrastructure/
│   ├── jupiter-api/
│   │   └── trigger/
│   │       ├── trigger-api.service.ts         # NEW: Trigger API client
│   │       └── trigger.types.ts               # NEW: Trigger API types
│   └── repositories/
│       └── prisma-trade.repository.ts         # NEW: Prisma Trade implementation
│
└── interface/
    └── cli/
        └── commands/
            ├── order/
            │   └── order.cmd.ts               # NEW: create, list, cancel, sync
            ├── history/
            │   └── history.cmd.ts             # NEW: trade history
            └── pnl/
                └── pnl.cmd.ts                 # NEW: PnL report

tests/
├── unit/
│   ├── entities/
│   │   └── trade.entity.test.ts               # NEW
│   ├── services/
│   │   ├── trade.service.test.ts              # NEW
│   │   ├── pnl.service.test.ts                # NEW
│   │   └── order-sync.service.test.ts         # NEW
│   └── infrastructure/
│       └── trigger-api.service.test.ts        # NEW
└── integration/
    ├── trade/
    │   └── trade-recording.test.ts            # NEW
    └── pnl/
        └── pnl-calculation.test.ts            # NEW
```

### Files Modified

```
prisma/schema.prisma                           # Add Trade model, remove CostBasis
src/domain/entities/index.ts                   # Export Trade, remove CostBasis
src/domain/repositories/index.ts               # Export TradeRepository
src/interface/cli/commands/trade/trade.cmd.ts   # Record trade after swap
src/interface/cli/commands/wallet/wallet.cmd.ts # Show PnL, orders, recent trades
src/index.ts                                   # Register new commands
```

### Files Removed

```
src/domain/entities/cost-basis.entity.ts       # Replaced by Trade-based PnL
tests/unit/entities/cost-basis.entity.test.ts  # No longer relevant
```

---

## 3. Database Changes

### New Model: `Trade`

```prisma
model Trade {
  id             String    @id @default(uuid())
  walletId       String

  // Tokens
  inputMint      String
  outputMint     String
  inputSymbol    String?
  outputSymbol   String?

  // Amounts (human-readable, NOT smallest units)
  inputAmount    String    // e.g., "1.5" (SOL)
  outputAmount   String    // e.g., "270" (USDC)

  // USD prices per unit at execution time
  inputUsdPrice  String?   // e.g., "180.00" (price of 1 SOL in USD)
  outputUsdPrice String?   // e.g., "1.00" (price of 1 USDC in USD)

  // Computed USD values (amount × price)
  inputUsdValue  String?   // e.g., "270.00"
  outputUsdValue String?   // e.g., "270.00"

  // Execution metadata
  type           String    // "swap" | "limit_order"
  signature      String    // On-chain tx signature
  executedAt     DateTime  @default(now())

  // Relations
  wallet         Wallet    @relation(fields: [walletId], references: [id])

  @@index([walletId, executedAt])
  @@index([walletId, outputMint])
  @@index([walletId, inputMint])
  @@index([signature])
}
```

### Modify Model: `Wallet`

```prisma
model Wallet {
  // ... existing fields ...
  trades      Trade[]     // ADD this relation
  // costBasis CostBasis[] // REMOVE this relation
}
```

### Remove Model: `CostBasis`

The entire `CostBasis` model and its `@@unique`, `@@index` directives are removed.

### Migration

```bash
npm run prisma:migrate -- --name add_trade_remove_cost_basis
```

### Design Decisions on Trade Schema

**Why store human-readable amounts (not smallest units)?**

- Simpler to display, debug, and reason about.
- No need to track decimals per token in every trade row.
- `inputAmount = "1.5"` is clearer than `"1500000000"` (lamports).

**Why store both `UsdPrice` (per unit) and `UsdValue` (total)?**

- `UsdPrice` is the raw data (what the API returned).
- `UsdValue` is precomputed for performance (avoids recalculation in queries).
- Redundant but cheap (2 extra string columns) and useful for debugging.

**Why `signature` is not unique?**

- A single Solana transaction could theoretically contain multiple swaps (e.g., route plans).
- In practice it will be unique, but we don't enforce it to avoid edge case failures.

---

## 4. New Services

### 4.1 Trade Entity

```typescript
// src/domain/entities/trade.entity.ts
export type TradeType = 'swap' | 'limit_order';

export class Trade {
  constructor(
    public readonly id: string,
    public readonly walletId: string,
    public readonly inputMint: string,
    public readonly outputMint: string,
    public readonly inputAmount: string,
    public readonly outputAmount: string,
    public readonly type: TradeType,
    public readonly signature: string,
    public readonly executedAt: Date,
    public readonly inputSymbol?: string,
    public readonly outputSymbol?: string,
    public readonly inputUsdPrice?: string,
    public readonly outputUsdPrice?: string,
    public readonly inputUsdValue?: string,
    public readonly outputUsdValue?: string
  ) {}
}
```

### 4.2 Trade Repository Interface

```typescript
// src/domain/repositories/trade.repository.ts
export interface TradeRepository {
  create(trade: Trade): Promise<Trade>;
  findByWallet(
    walletId: string,
    options?: {
      mint?: string;
      type?: TradeType;
      limit?: number;
      offset?: number;
    }
  ): Promise<Trade[]>;
  countByWallet(
    walletId: string,
    options?: {
      mint?: string;
      type?: TradeType;
    }
  ): Promise<number>;
  findBySignature(signature: string): Promise<Trade | null>;
  findByWalletAndMint(walletId: string, mint: string): Promise<Trade[]>;
}
```

### 4.3 TradeService

```typescript
// src/application/services/trade/trade.service.ts
export class TradeService {
  constructor(
    private tradeRepo: TradeRepository,
    private priceProvider: PriceProvider
  ) {}

  // Record a swap execution — fetches USD prices and stores the trade
  async recordSwap(params: RecordSwapParams): Promise<Trade>;

  // Record a filled limit order
  async recordLimitOrderFill(params: RecordLimitFillParams): Promise<Trade>;

  // Get recent trades for a wallet
  async getRecentTrades(walletId: string, limit?: number): Promise<Trade[]>;

  // Get full trade history with pagination
  async getTradeHistory(
    walletId: string,
    options?: TradeHistoryOptions
  ): Promise<{
    trades: Trade[];
    total: number;
  }>;

  // Check if a trade with this signature already exists
  async isTradeRecorded(signature: string): Promise<boolean>;
}
```

### 4.4 PnLService

```typescript
// src/application/services/pnl/pnl.service.ts
export class PnLService {
  constructor(
    private tradeRepo: TradeRepository,
    private rpcService: SolanaRpcPort,
    private priceProvider: PriceProvider
  ) {}

  // Calculate PnL for a wallet (all tokens or specific mint)
  async calculatePnL(walletId: string, walletAddress: string, mint?: string): Promise<PnLResult>;

  // Pure function: compute cost basis from trades (testable without I/O)
  calculateCostByMint(trades: Trade[]): Map<string, TokenCost>;

  // Pure function: compute PnL from costs + current state
  computePnL(
    costs: Map<string, TokenCost>,
    balances: Map<string, number>,
    prices: Map<string, number>
  ): PnLResult;
}

export interface TokenCost {
  totalAcquired: Big; // Total units ever acquired via trades
  totalDisposed: Big; // Total units ever sold via trades
  remainingCost: Big; // Cost basis of remaining holdings (USD)
  realizedPnl: Big; // Sum of realized PnL from sales (USD)
}

export interface TokenPnL {
  mint: string;
  symbol?: string;
  balance: number; // Current on-chain balance
  currentPrice: number; // Current price (Jupiter API)
  currentValue: number; // balance × currentPrice
  avgCost: number; // remainingCost / remaining units
  totalCost: number; // Cost of current holdings
  unrealizedPnl: number; // currentValue - totalCost
  unrealizedPnlPercent: number;
  realizedPnl: number; // From past sales
  tracked: boolean; // false if no trades exist for this token
}

export interface PnLResult {
  tokens: TokenPnL[];
  totalValue: number;
  totalCost: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPercent: number;
  totalRealizedPnl: number;
  untrackedTokens: string[]; // Mints with balance but no trades
}
```

### 4.5 TriggerApiService

```typescript
// src/infrastructure/jupiter-api/trigger/trigger-api.service.ts
export class TriggerApiService {
  constructor(client?: JupiterClient) {}

  // Create a limit order
  async createOrder(params: CreateOrderParams): Promise<CreateOrderResponse>;

  // Get active or historical orders
  async getOrders(
    walletAddress: string,
    status: 'active' | 'history',
    page?: number
  ): Promise<GetOrdersResponse>;

  // Cancel a single order
  async cancelOrder(maker: string, orderId: string): Promise<CancelOrderResponse>;

  // Cancel multiple orders
  async cancelOrders(maker: string, orderIds: string[]): Promise<CancelOrdersResponse>;

  // Execute (send signed tx)
  async execute(signedTransaction: string, requestId: string): Promise<ExecuteResponse>;
}
```

### 4.6 OrderSyncService

```typescript
// src/application/services/order/order-sync.service.ts
export class OrderSyncService {
  constructor(
    private triggerApi: TriggerApiService,
    private tradeService: TradeService,
    private priceProvider: PriceProvider
  ) {}

  // Fetch filled orders and record them as trades (returns count of new trades)
  async syncFilledOrders(walletId: string, walletAddress: string): Promise<number>;

  // Fetch active orders with current price comparison
  async getActiveOrdersWithPrices(walletAddress: string): Promise<ActiveOrderWithPrice[]>;
}

export interface ActiveOrderWithPrice {
  orderId: string;
  inputMint: string;
  outputMint: string;
  inputSymbol?: string;
  outputSymbol?: string;
  inputAmount: string;
  outputAmount: string;
  targetPrice: number; // takingAmount / makingAmount (normalized)
  currentPrice: number; // From Jupiter Price API
  diffPercent: number; // ((target - current) / current) × 100
  direction: 'up' | 'down'; // Price needs to go up or down
  createdAt: Date;
}
```

---

## 5. CLI Commands

### 5.1 Modified: `wallet show <wallet>`

Adds 3 new sections to the existing output:

- **PnL per token** (in the token balances table)
- **Active Limit Orders** (from Trigger API)
- **Recent Trades** (last 5, from DB)

### 5.2 Modified: `trade swap`

After successful execution, records the trade in DB with USD prices.

### 5.3 New: `order create <input> <output> <amount> --target <price> -w <wallet>`

Creates a limit order via Trigger API.

Options:

- `--target <price>` — Target price per unit of input token (required)
- `--expiry <seconds>` — Order expiry in seconds (optional)
- `-w, --wallet <id>` — Wallet identifier (required)
- `-p, --password <password>` — Master password (optional if session)
- `-y, --yes` — Skip confirmation

### 5.4 New: `order list -w <wallet>`

Lists active limit orders with current price comparison.

Options:

- `--history` — Show filled/cancelled/expired orders instead of active
- `-w, --wallet <id>` — Wallet identifier (required)

### 5.5 New: `order cancel <orderId> -w <wallet>`

Cancels a limit order.

Options:

- `--all` — Cancel all active orders
- `-w, --wallet <id>` — Wallet identifier (required)
- `-p, --password <password>` — Master password (optional if session)

### 5.6 New: `order sync -w <wallet>`

Forces sync of filled limit orders → creates Trade entries.

### 5.7 New: `history -w <wallet>`

Full trade history with pagination.

Options:

- `--token <symbol>` — Filter by token
- `--type <type>` — Filter by trade type (`swap` | `limit_order`)
- `--limit <n>` — Number of results (default: 20)
- `--page <n>` — Page number (default: 1)
- `-w, --wallet <id>` — Wallet identifier (required)

### 5.8 New: `pnl show -w <wallet>`

Full PnL report.

Options:

- `<token>` — Optional: show PnL for specific token only
- `-w, --wallet <id>` — Wallet identifier (required)

---

## 6. Display Formats

### 6.1 `wallet show` (enhanced)

```
📊 Wallet: Trading

💰 Portfolio Summary
──────────────────────────────────────────────────────────────
Total Value:        $2,340.56
Unrealized PnL:     +$340.56 (+17.0%)

📈 Token Balances
──────────────────────────────────────────────────────────────────────────────
Token   Balance        Price       Value         PnL
──────────────────────────────────────────────────────────────────────────────
SOL     10.0000        $180.00     $1,800.00     +$200.00 (+12.5%)
USDC    500.00         $1.00       $500.00       —
BONK    1,000,000      $0.00002    $20.00        -$5.00 (-20.0%)
WBTC    0.0010         $95,000     $95.00        (untracked)

⏳ Active Limit Orders (2)
──────────────────────────────────────────────────────────────────────────────
Input           Output              Target     Current    Diff
──────────────────────────────────────────────────────────────────────────────
1 SOL           → 200 USDC          $200.00    $180.00    +11.1% ↑
50 USDC         → 0.3 SOL           $166.67    $180.00     -7.4% ↓

📋 Recent Trades
──────────────────────────────────────────────────────────────────────────────
Date              Type    Input            Output
──────────────────────────────────────────────────────────────────────────────
Today 14:30       Swap    0.5 SOL          90 USDC
Today 10:15       Limit   100 USDC         0.55 SOL
Yesterday         Swap    1 SOL            180 USDC

Use 'jupiter history -w Trading' for full trade history
```

### 6.2 `pnl show`

```
📊 PnL Report — Wallet: Trading

────────────────────────────────────────────────────────────────────────────
Token   Balance     Avg Cost    Current    Value        Unrealized     Realized
────────────────────────────────────────────────────────────────────────────
SOL     10.00       $160.00     $180.00    $1,800.00    +$200.00       +$50.00
USDC    500.00      $1.00       $1.00      $500.00      $0.00          $0.00
BONK    1M          $0.000025   $0.00002   $20.00       -$5.00         $0.00
────────────────────────────────────────────────────────────────────────────
TOTAL                                       $2,320.00    +$195.00       +$50.00
                                                         (+9.2%)

⚠ Untracked tokens (no trade history): WBTC
  These tokens were received outside the CLI (transfers, airdrops, etc.)
  PnL cannot be calculated for untracked tokens.

Calculated from 15 recorded trades (cost average method)
```

### 6.3 `order list`

```
⏳ Active Limit Orders — Wallet: Trading

──────────────────────────────────────────────────────────────────────────────
#  Input           Output              Target     Current    Diff      Created
──────────────────────────────────────────────────────────────────────────────
1  1 SOL           → 200 USDC          $200.00    $180.00    +11.1% ↑  2h ago
2  50 USDC         → 0.3 SOL           $166.67    $180.00     -7.4% ↓  1d ago
3  100 USDC        → 500,000 BONK      $0.00020   $0.00002   +900% ↑   3d ago

Color coding:
  Green  = diff < 5% (close to execution)
  Yellow = diff 5-15%
  Red    = diff > 15% (far from execution)
```

### 6.4 `history`

```
📋 Trade History — Wallet: Trading

──────────────────────────────────────────────────────────────────────────────
Date              Type    Input              Output             USD Value
──────────────────────────────────────────────────────────────────────────────
2025-02-13 14:30  Swap    0.5 SOL            90.00 USDC         $90.00
2025-02-13 10:15  Limit   100.00 USDC        0.55 SOL           $100.00
2025-02-12 18:00  Swap    1.00 SOL           180.00 USDC        $180.00
2025-02-11 09:30  Swap    200.00 USDC        1.10 SOL           $200.00
──────────────────────────────────────────────────────────────────────────────
Page 1 of 3 (showing 20 per page)
```

---

## 7. Execution Flows

### 7.1 Swap Execution (modified `trade swap`)

```
User: jupiter trade swap SOL USDC 0.5 -w Trading -y

1. Resolve tokens (symbol → mint)
2. Get order from Jupiter Ultra
3. Display quote, confirm
4. Sign transaction
5. Execute via Ultra API
6. IF success:
   a. Fetch USD prices: getPrice([SOL_MINT, USDC_MINT])
   b. Create Trade record:
      - inputMint: SOL_MINT
      - outputMint: USDC_MINT
      - inputAmount: "0.5"
      - outputAmount: "90.0"
      - inputUsdPrice: "180.00"
      - outputUsdPrice: "1.00"
      - inputUsdValue: "90.00"
      - outputUsdValue: "90.00"
      - type: "swap"
      - signature: "abc123..."
   c. Display result
```

### 7.2 Limit Order Creation

```
User: jupiter order create SOL USDC 1 --target 200 -w Trading

1. Resolve tokens
2. Calculate:
   - makingAmount = 1 × 10^9 = "1000000000" (lamports)
   - takingAmount = 200 × 10^6 = "200000000" (USDC smallest unit)
3. Fetch current price for preview
4. Display preview:
   "Sell 1 SOL when price reaches $200 (currently $180, +11.1%)"
5. Confirm
6. POST /trigger/v1/createOrder
7. Sign transaction
8. Send to network
9. Display order ID
```

### 7.3 Limit Order Sync

```
Triggered by: jupiter wallet show, jupiter order sync

1. Fetch getTriggerOrders(address, 'history', page=1)
2. For each filled order:
   a. Check if trade already recorded (by comparing order data with existing trades)
   b. If not recorded:
      - Calculate implicit USD price from makingAmount/takingAmount
      - Optionally fetch current USD price from Jupiter API
      - Create Trade record with type = "limit_order"
3. Return count of new trades synced
```

### 7.4 PnL Calculation

```
User: jupiter pnl show -w Trading

1. Fetch all trades for wallet from DB (sorted by executedAt ASC)
2. For each trade, update cost map:

   OUTPUT token (acquired):
     tokenCost.totalAcquired += outputAmount
     tokenCost.remainingCost += outputUsdValue

   INPUT token (disposed):
     IF tokenCost.totalAcquired > 0:
       ratio = inputAmount / tokenCost.totalAcquired
       costRemoved = tokenCost.remainingCost × ratio
       tokenCost.realizedPnl += (inputUsdValue - costRemoved)
       tokenCost.totalAcquired -= inputAmount
       tokenCost.totalDisposed += inputAmount
       tokenCost.remainingCost -= costRemoved

3. Fetch current balances from RPC
4. Fetch current prices from Jupiter API
5. For each token with balance:
   IF token has cost data (tracked):
     unrealizedPnl = (balance × currentPrice) - remainingCost
   ELSE:
     Mark as "untracked"
6. Aggregate totals
7. Display report
```

---

## 8. Implementation Phases

### Phase 1: Database & Domain (TDD)

1. Write tests for Trade entity
2. Implement Trade entity
3. Write tests for TradeRepository
4. Implement PrismaTradeRepository
5. Create Prisma migration (add Trade, remove CostBasis)
6. Remove CostBasis entity, test, and Prisma model

### Phase 2: PnL Service (TDD)

1. Write tests for PnLService.calculateCostByMint (pure function)
2. Write tests for PnLService.computePnL (pure function)
3. Implement PnLService
4. Write integration tests for full PnL flow (with mocked APIs)

### Phase 3: Trade Recording

1. Write tests for TradeService
2. Implement TradeService
3. Modify `trade swap` to record trades
4. Write integration tests

### Phase 4: Trigger API

1. Write tests for TriggerApiService (with mocked HTTP)
2. Implement TriggerApiService
3. Write tests for OrderSyncService
4. Implement OrderSyncService

### Phase 5: CLI Commands

1. `order create` command
2. `order list` command
3. `order cancel` command
4. `order sync` command
5. `history` command
6. `pnl show` command
7. Modify `wallet show` to include PnL, orders, recent trades

### Phase 6: Integration Testing

1. Full flow: swap → record → PnL
2. Full flow: create order → sync fill → PnL
3. Edge cases and error handling

---

## 9. Complete Test Plan

### 9.1 Unit Tests — Trade Entity

**File:** `tests/unit/entities/trade.entity.test.ts`

```
describe('Trade Entity')

  describe('constructor')
    ✓ should create a trade with all required fields
    ✓ should create a trade with optional fields (symbols, USD prices)
    ✓ should create a trade without optional fields (null USD prices)
    ✓ should preserve all field values exactly as provided
    ✓ should handle executedAt as Date object

  describe('trade types')
    ✓ should accept type "swap"
    ✓ should accept type "limit_order"
```

### 9.2 Unit Tests — PnLService.calculateCostByMint

**File:** `tests/unit/services/pnl.service.test.ts`

```
describe('PnLService')

  describe('calculateCostByMint')

    describe('single token — acquisitions only')
      ✓ should calculate cost for a single buy
      ✓ should calculate cost for multiple buys at different prices
      ✓ should compute correct average cost after multiple buys
      ✓ should handle very small amounts (dust: "0.000001")
      ✓ should handle very large amounts ("1000000000")
      ✓ should handle zero-amount trade (no-op)

    describe('single token — acquisitions and disposals')
      ✓ should reduce cost proportionally on partial sell
      ✓ should reduce cost to zero on full sell
      ✓ should calculate correct realized PnL on profitable sell
      ✓ should calculate correct realized PnL on losing sell
      ✓ should calculate zero realized PnL on break-even sell
      ✓ should handle sell after multiple buys (cost average)
      ✓ should handle multiple partial sells
      ✓ should handle buy → sell → buy → sell cycle
      ✓ should handle selling entire position then buying again

    describe('single token — edge cases')
      ✓ should handle sell when no prior acquisition (cost = 0, full realized loss)
      ✓ should handle trades with null USD values (skip in cost calc)
      ✓ should maintain precision with Big.js (no floating point errors)
      ✓ should handle trade where inputMint == outputMint (self-trade, should not happen but be safe)

    describe('multiple tokens')
      ✓ should track cost independently per mint
      ✓ should handle swap between two non-stablecoin tokens (SOL→BONK)
      ✓ should correctly update both input and output sides of a swap
      ✓ should handle complex chain: USDC→SOL→BONK→USDC

    describe('stablecoin handling')
      ✓ should not generate PnL for USDC↔USDT swaps (stablecoin pairs)
      ✓ should handle USDC with price slightly != $1.00

    describe('order of operations')
      ✓ should process trades in chronological order (executedAt ASC)
      ✓ should produce same result regardless of insertion order (sorted internally)
```

### 9.3 Unit Tests — PnLService.computePnL

```
  describe('computePnL')

    describe('basic scenarios')
      ✓ should return zero PnL for empty portfolio (no trades, no balances)
      ✓ should return zero PnL for portfolio at break-even
      ✓ should calculate positive unrealized PnL (price went up)
      ✓ should calculate negative unrealized PnL (price went down)
      ✓ should include realized PnL from past sales

    describe('untracked tokens')
      ✓ should mark tokens with balance but no trades as "untracked"
      ✓ should include untracked tokens in totalValue but not in PnL
      ✓ should list untracked mints in untrackedTokens array

    describe('tokens with zero balance')
      ✓ should still show realized PnL for tokens fully sold
      ✓ should show zero unrealized PnL for tokens with no balance

    describe('aggregation')
      ✓ should sum totalValue across all tokens
      ✓ should sum totalCost across all tracked tokens
      ✓ should sum totalUnrealizedPnl across all tracked tokens
      ✓ should sum totalRealizedPnl across all tracked tokens
      ✓ should calculate correct totalUnrealizedPnlPercent

    describe('precision')
      ✓ should handle tokens with 0 decimals
      ✓ should handle tokens with 9 decimals (SOL)
      ✓ should handle tokens with 6 decimals (USDC)
      ✓ should not produce NaN or Infinity for edge cases
      ✓ should handle division by zero (cost = 0, pnlPercent = 0)
```

### 9.4 Unit Tests — PnLService.calculatePnL (integration of both)

```
  describe('calculatePnL — full flow')
    ✓ should call tradeRepo, rpcService, and priceProvider
    ✓ should handle empty wallet (no trades, no balance)
    ✓ should handle wallet with trades but zero balance (everything sold)
    ✓ should handle wallet with balance but no trades (untracked)
    ✓ should handle wallet with mix of tracked and untracked tokens
    ✓ should filter by specific mint when provided
    ✓ should handle RPC error gracefully
    ✓ should handle price API returning null for some tokens
```

### 9.5 Unit Tests — TradeService

**File:** `tests/unit/services/trade.service.test.ts`

```
describe('TradeService')

  describe('recordSwap')
    ✓ should create a trade with type "swap"
    ✓ should fetch USD prices from price provider
    ✓ should calculate inputUsdValue = inputAmount × inputUsdPrice
    ✓ should calculate outputUsdValue = outputAmount × outputUsdPrice
    ✓ should store null USD values if price API returns no data
    ✓ should store null USD values if price API throws
    ✓ should not throw if price fetch fails (trade still recorded)
    ✓ should use stablecoin price ($1.00) as fallback for USDC/USDT

  describe('recordLimitOrderFill')
    ✓ should create a trade with type "limit_order"
    ✓ should calculate implicit price from makingAmount/takingAmount
    ✓ should not create duplicate trade if signature already exists

  describe('getRecentTrades')
    ✓ should return trades ordered by executedAt DESC
    ✓ should respect limit parameter
    ✓ should default to 5 trades
    ✓ should return empty array if no trades

  describe('getTradeHistory')
    ✓ should return trades with total count
    ✓ should support pagination (limit + offset)
    ✓ should filter by mint (input OR output matches)
    ✓ should filter by type
    ✓ should return empty result for wallet with no trades

  describe('isTradeRecorded')
    ✓ should return true if signature exists in DB
    ✓ should return false if signature not found
```

### 9.6 Unit Tests — OrderSyncService

**File:** `tests/unit/services/order-sync.service.test.ts`

```
describe('OrderSyncService')

  describe('syncFilledOrders')
    ✓ should fetch order history from Trigger API
    ✓ should create Trade entries for filled orders not yet recorded
    ✓ should skip orders already recorded (by signature match)
    ✓ should return count of newly synced trades
    ✓ should handle empty order history
    ✓ should handle API error gracefully (return 0, log warning)
    ✓ should handle pagination (multiple pages of history)

  describe('getActiveOrdersWithPrices')
    ✓ should fetch active orders from Trigger API
    ✓ should fetch current prices for all involved tokens
    ✓ should calculate target price from makingAmount/takingAmount
    ✓ should calculate diff percentage correctly (positive = price needs to go up)
    ✓ should calculate diff percentage correctly (negative = price needs to go down)
    ✓ should set direction "up" when target > current
    ✓ should set direction "down" when target < current
    ✓ should handle zero current price gracefully
    ✓ should return empty array if no active orders
    ✓ should resolve token symbols for display
```

### 9.7 Unit Tests — TriggerApiService

**File:** `tests/unit/infrastructure/trigger-api.service.test.ts`

```
describe('TriggerApiService')

  describe('createOrder')
    ✓ should POST to /trigger/v1/createOrder with correct body
    ✓ should return order ID, transaction, and requestId
    ✓ should pass optional expiredAt parameter
    ✓ should throw JupiterApiError on 400 response
    ✓ should throw JupiterApiError if makingAmount < $5 USD

  describe('getOrders')
    ✓ should GET /trigger/v1/getTriggerOrders with user and orderStatus=active
    ✓ should GET /trigger/v1/getTriggerOrders with orderStatus=history
    ✓ should pass page parameter
    ✓ should return hasMoreData flag for pagination
    ✓ should return empty array if no orders
    ✓ should handle API error gracefully

  describe('cancelOrder')
    ✓ should POST to /trigger/v1/cancelOrder with maker and order
    ✓ should return transaction to sign
    ✓ should throw on non-existent order

  describe('cancelOrders')
    ✓ should POST to /trigger/v1/cancelOrders with array of order IDs
    ✓ should return array of transactions
    ✓ should handle partial failures (some orders already cancelled)
```

### 9.8 Unit Tests — PrismaTradeRepository

**File:** `tests/unit/infrastructure/prisma-trade.repository.test.ts`

(These can be unit tests with a mocked PrismaClient, or lightweight integration tests with an in-memory SQLite.)

```
describe('PrismaTradeRepository')

  describe('create')
    ✓ should insert a trade record
    ✓ should return the created trade as entity
    ✓ should handle null optional fields

  describe('findByWallet')
    ✓ should return all trades for a wallet, ordered by executedAt DESC
    ✓ should filter by mint (match inputMint OR outputMint)
    ✓ should filter by type
    ✓ should respect limit
    ✓ should respect offset
    ✓ should return empty array if no trades

  describe('countByWallet')
    ✓ should return total count of trades for wallet
    ✓ should respect filters (mint, type)
    ✓ should return 0 for empty wallet

  describe('findBySignature')
    ✓ should return trade matching signature
    ✓ should return null if not found

  describe('findByWalletAndMint')
    ✓ should return trades where mint appears as input OR output
    ✓ should return empty array if no matches
```

### 9.9 Integration Tests — Trade Recording Flow

**File:** `tests/integration/trade/trade-recording.test.ts`

```
describe('Trade Recording Integration')

  describe('swap → record → verify')
    ✓ should record a trade after successful swap (mocked Ultra API)
    ✓ should fetch USD prices at recording time
    ✓ should persist trade in database
    ✓ should be retrievable via getRecentTrades
    ✓ should handle price API failure (trade still recorded, USD values null)

  describe('limit order → sync → verify')
    ✓ should detect filled limit order via getTriggerOrders
    ✓ should create Trade record for newly filled order
    ✓ should not duplicate trade on re-sync
    ✓ should handle multiple filled orders in one sync
```

### 9.10 Integration Tests — PnL Calculation Flow

**File:** `tests/integration/pnl/pnl-calculation.test.ts`

```
describe('PnL Calculation Integration')

  describe('simple scenario')
    ✓ Buy 10 SOL @ $100, price now $120 → unrealized PnL = +$200
    ✓ Buy 10 SOL @ $100, price now $80  → unrealized PnL = -$200
    ✓ Buy 10 SOL @ $100, price now $100 → unrealized PnL = $0

  describe('buy and sell')
    ✓ Buy 10 SOL @ $100, sell 5 @ $120 → realized +$100, unrealized +$100
    ✓ Buy 10 SOL @ $100, sell 10 @ $120 → realized +$200, unrealized $0
    ✓ Buy 10 SOL @ $100, sell 5 @ $80 → realized -$100, unrealized -$100

  describe('multiple buys then sell')
    ✓ Buy 10 @ $100, buy 5 @ $200, sell 12 @ $150 → verify cost average math
    ✓ Buy 5 @ $100, buy 5 @ $300, sell 10 @ $200 → verify break-even detection

  describe('multi-token portfolio')
    ✓ USDC→SOL→BONK→USDC chain: verify PnL for each token
    ✓ Multiple tokens with different PnL directions

  describe('untracked tokens')
    ✓ Token in balance with no trades → listed as untracked
    ✓ Untracked token value included in totalValue but not PnL

  describe('edge cases')
    ✓ Empty wallet → all zeros
    ✓ Wallet with only stablecoins → PnL ~0
    ✓ Very old trades + current price = 0 (dead token)
    ✓ Token with null USD values in trades → warning message
```

### 9.11 Unit Tests — Limit Order Price Display

**File:** `tests/unit/services/order-price-display.test.ts`

(This can be part of `order-sync.service.test.ts` or separate.)

```
describe('Limit Order Price Display')

  describe('target price calculation')
    ✓ Sell 1 SOL → 200 USDC: target = $200/SOL
    ✓ Buy SOL with 150 USDC → 1 SOL: target = $150/SOL
    ✓ Sell 1000 BONK → 0.1 SOL: target expressed in SOL, then USD

  describe('diff percentage')
    ✓ Target $200, current $180 → +11.1%
    ✓ Target $150, current $180 → -16.7%
    ✓ Target $180, current $180 → 0%
    ✓ Target $0.01, current $0.001 → +900%

  describe('direction')
    ✓ Sell order (target > current) → direction "up"
    ✓ Buy order (target < current) → direction "down"
    ✓ At target → direction "up" (will execute soon)

  describe('color coding')
    ✓ |diff| < 5% → green
    ✓ 5% <= |diff| < 15% → yellow
    ✓ |diff| >= 15% → red
```

### 9.12 Summary: Test Count

| Category                    | File                              | Tests          |
| --------------------------- | --------------------------------- | -------------- |
| Trade Entity                | `trade.entity.test.ts`            | 7              |
| PnL — calculateCostByMint   | `pnl.service.test.ts`             | 25             |
| PnL — computePnL            | `pnl.service.test.ts`             | 15             |
| PnL — calculatePnL (full)   | `pnl.service.test.ts`             | 8              |
| TradeService                | `trade.service.test.ts`           | 17             |
| OrderSyncService            | `order-sync.service.test.ts`      | 16             |
| TriggerApiService           | `trigger-api.service.test.ts`     | 14             |
| PrismaTradeRepository       | `prisma-trade.repository.test.ts` | 13             |
| Trade Recording Integration | `trade-recording.test.ts`         | 8              |
| PnL Integration             | `pnl-calculation.test.ts`         | 14             |
| Order Price Display         | `order-price-display.test.ts`     | 11             |
| **TOTAL**                   |                                   | **~148 tests** |
