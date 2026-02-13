export class TokenInfo {
  private _symbol: string;
  private _name?: string;
  private _decimals: number;
  private _logoURI?: string;
  private _verified: boolean;
  private _fetchedAt: Date;

  constructor(
    public readonly mint: string,
    symbol: string,
    decimals: number,
    options?: {
      name?: string;
      logoURI?: string;
      verified?: boolean;
      fetchedAt?: Date;
    }
  ) {
    this.validateMint(mint);
    this.validateSymbol(symbol);
    this.validateDecimals(decimals);

    this._symbol = symbol;
    this._decimals = decimals;
    this._name = options?.name;
    this._logoURI = options?.logoURI;
    this._verified = options?.verified ?? false;
    this._fetchedAt = options?.fetchedAt ?? new Date();
  }

  get symbol(): string {
    return this._symbol;
  }

  get name(): string | undefined {
    return this._name;
  }

  get decimals(): number {
    return this._decimals;
  }

  get logoURI(): string | undefined {
    return this._logoURI;
  }

  get verified(): boolean {
    return this._verified;
  }

  get fetchedAt(): Date {
    return this._fetchedAt;
  }

  updateFetchedAt(): void {
    this._fetchedAt = new Date();
  }

  private validateMint(mint: string): void {
    if (!mint || mint.trim().length === 0) {
      throw new Error('Token mint address cannot be empty');
    }
  }

  private validateSymbol(symbol: string): void {
    if (!symbol || symbol.trim().length === 0) {
      throw new Error('Token symbol cannot be empty');
    }
    if (symbol.length > 20) {
      throw new Error('Token symbol cannot exceed 20 characters');
    }
  }

  private validateDecimals(decimals: number): void {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
      throw new Error('Token decimals must be an integer between 0 and 18');
    }
  }
}
