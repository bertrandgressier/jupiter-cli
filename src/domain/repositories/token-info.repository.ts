import { TokenInfo } from '../entities/token-info.entity';

export interface TokenInfoRepository {
  findByMint(mint: string): Promise<TokenInfo | null>;
  findByMints(mints: string[]): Promise<TokenInfo[]>;
  upsert(tokenInfo: TokenInfo): Promise<TokenInfo>;
  delete(mint: string): Promise<void>;
}
