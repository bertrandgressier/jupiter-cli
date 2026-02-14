// Types for Jupiter Tokens V2 API responses

export interface SwapStats {
  priceChange: number | null;
  holderChange: number | null;
  liquidityChange: number | null;
  volumeChange: number | null;
  buyVolume: number | null;
  sellVolume: number | null;
  buyOrganicVolume: number | null;
  sellOrganicVolume: number | null;
  numBuys: number | null;
  numSells: number | null;
  numTraders: number | null;
  numOrganicBuyers: number | null;
  numNetBuyers: number | null;
}

export interface TokenAudit {
  isSus: boolean | null;
  mintAuthorityDisabled: boolean | null;
  freezeAuthorityDisabled: boolean | null;
  topHoldersPercentage: number | null;
  devBalancePercentage: number | null;
  devMigrations: number | null;
}

export interface FirstPool {
  id: string;
  createdAt: string;
}

export interface MintInformation {
  id: string;
  name: string;
  symbol: string;
  icon: string | null;
  decimals: number;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  dev: string | null;
  circSupply: number | null;
  totalSupply: number | null;
  tokenProgram: string;
  launchpad: string | null;
  graduatedPool: string | null;
  graduatedAt: string | null;
  holderCount: number | null;
  fdv: number | null;
  mcap: number | null;
  usdPrice: number | null;
  liquidity: number | null;
  stats5m: SwapStats | null;
  stats1h: SwapStats | null;
  stats6h: SwapStats | null;
  stats24h: SwapStats | null;
  firstPool: FirstPool | null;
  audit: TokenAudit | null;
  organicScore: number;
  organicScoreLabel: 'high' | 'medium' | 'low';
  isVerified: boolean | null;
  cexes: string[] | null;
  tags: string[] | null;
  updatedAt: string;
}

// Shield API types

export type ShieldWarningSeverity = 'info' | 'warning' | 'critical';

export type ShieldWarningType =
  | 'NOT_VERIFIED'
  | 'LOW_LIQUIDITY'
  | 'NOT_SELLABLE'
  | 'LOW_ORGANIC_ACTIVITY'
  | 'HAS_MINT_AUTHORITY'
  | 'HAS_FREEZE_AUTHORITY'
  | 'HAS_PERMANENT_DELEGATE'
  | 'NEW_LISTING'
  | 'VERY_LOW_TRADING_ACTIVITY'
  | 'HIGH_SUPPLY_CONCENTRATION'
  | 'NON_TRANSFERABLE'
  | 'MUTABLE_TRANSFER_FEES'
  | 'SUSPICIOUS_DEV_ACTIVITY'
  | 'SUSPICIOUS_TOP_HOLDER_ACTIVITY'
  | 'HIGH_SINGLE_OWNERSHIP'
  | string; // for dynamic types like '{}%_TRANSFER_FEES'

export interface ShieldWarning {
  type: ShieldWarningType;
  message: string;
  severity: ShieldWarningSeverity;
  source?: string;
}

export interface ShieldResponse {
  warnings: Record<string, ShieldWarning[]>;
}

// Price V3 API types

export interface PriceDepth {
  '10': number;
  '100': number;
  '1000': number;
}

export interface PriceV3ExtraInfo {
  lastSwappedPrice?: {
    lastJupiterSellAt: number;
    lastJupiterSellPrice: string;
    lastJupiterBuyAt: number;
    lastJupiterBuyPrice: string;
  };
  quotedPrice?: {
    buyPrice: string;
    buyAt: number;
    sellPrice: string;
    sellAt: number;
  };
  confidenceLevel?: 'high' | 'medium' | 'low';
  depth?: {
    buyPriceImpactRatio?: {
      depth: PriceDepth;
    };
    sellPriceImpactRatio?: {
      depth: PriceDepth;
    };
  };
}

export interface PriceV3Data {
  id: string;
  type: string;
  price: string;
  extraInfo?: PriceV3ExtraInfo;
}

export interface PriceV3Response {
  data: Record<string, PriceV3Data>;
  timeTaken: number;
}

// Category and interval types

export type TokenCategory = 'toporganicscore' | 'toptraded' | 'toptrending';
export type TokenInterval = '5m' | '1h' | '6h' | '24h';
export type TokenTag = 'lst' | 'verified';

// Port interfaces

export interface TokenDiscoveryPort {
  searchTokens(query: string): Promise<MintInformation[]>;
  getTokensByTag(tag: TokenTag): Promise<MintInformation[]>;
  getTokensByCategory(
    category: TokenCategory,
    interval: TokenInterval,
    limit?: number
  ): Promise<MintInformation[]>;
  getRecentTokens(): Promise<MintInformation[]>;
}

export interface ShieldPort {
  getShieldWarnings(mints: string[]): Promise<ShieldResponse>;
}

export interface PriceV3Port {
  getPricesV3(mints: string[]): Promise<PriceV3Response>;
}
