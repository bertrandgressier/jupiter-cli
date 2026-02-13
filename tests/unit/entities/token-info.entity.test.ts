import { TokenInfo } from '../../../src/domain/entities/token-info.entity';

describe('TokenInfo Entity', () => {
  const validMint = 'So11111111111111111111111111111111111111112';
  const validSymbol = 'SOL';
  const validDecimals = 9;

  describe('constructor', () => {
    it('should create a TokenInfo with required fields', () => {
      const tokenInfo = new TokenInfo(validMint, validSymbol, validDecimals);

      expect(tokenInfo.mint).toBe(validMint);
      expect(tokenInfo.symbol).toBe(validSymbol);
      expect(tokenInfo.decimals).toBe(validDecimals);
      expect(tokenInfo.name).toBeUndefined();
      expect(tokenInfo.logoURI).toBeUndefined();
      expect(tokenInfo.verified).toBe(false);
      expect(tokenInfo.fetchedAt).toBeInstanceOf(Date);
    });

    it('should create a TokenInfo with all optional fields', () => {
      const fetchedAt = new Date('2024-01-01');
      const tokenInfo = new TokenInfo(validMint, validSymbol, validDecimals, {
        name: 'Solana',
        logoURI: 'https://example.com/logo.png',
        verified: true,
        fetchedAt,
      });

      expect(tokenInfo.mint).toBe(validMint);
      expect(tokenInfo.symbol).toBe(validSymbol);
      expect(tokenInfo.decimals).toBe(validDecimals);
      expect(tokenInfo.name).toBe('Solana');
      expect(tokenInfo.logoURI).toBe('https://example.com/logo.png');
      expect(tokenInfo.verified).toBe(true);
      expect(tokenInfo.fetchedAt).toBe(fetchedAt);
    });
  });

  describe('mint validation', () => {
    it('should throw error if mint is empty', () => {
      expect(() => new TokenInfo('', validSymbol, validDecimals)).toThrow(
        'Token mint address cannot be empty'
      );
    });

    it('should throw error if mint is whitespace only', () => {
      expect(() => new TokenInfo('   ', validSymbol, validDecimals)).toThrow(
        'Token mint address cannot be empty'
      );
    });
  });

  describe('symbol validation', () => {
    it('should throw error if symbol is empty', () => {
      expect(() => new TokenInfo(validMint, '', validDecimals)).toThrow(
        'Token symbol cannot be empty'
      );
    });

    it('should throw error if symbol is whitespace only', () => {
      expect(() => new TokenInfo(validMint, '   ', validDecimals)).toThrow(
        'Token symbol cannot be empty'
      );
    });

    it('should throw error if symbol exceeds 20 characters', () => {
      expect(() => new TokenInfo(validMint, 'A'.repeat(21), validDecimals)).toThrow(
        'Token symbol cannot exceed 20 characters'
      );
    });

    it('should accept symbol with exactly 20 characters', () => {
      const tokenInfo = new TokenInfo(validMint, 'A'.repeat(20), validDecimals);
      expect(tokenInfo.symbol).toBe('A'.repeat(20));
    });
  });

  describe('decimals validation', () => {
    it('should throw error if decimals is negative', () => {
      expect(() => new TokenInfo(validMint, validSymbol, -1)).toThrow(
        'Token decimals must be an integer between 0 and 18'
      );
    });

    it('should throw error if decimals is greater than 18', () => {
      expect(() => new TokenInfo(validMint, validSymbol, 19)).toThrow(
        'Token decimals must be an integer between 0 and 18'
      );
    });

    it('should throw error if decimals is not an integer', () => {
      expect(() => new TokenInfo(validMint, validSymbol, 9.5)).toThrow(
        'Token decimals must be an integer between 0 and 18'
      );
    });

    it('should accept 0 decimals', () => {
      const tokenInfo = new TokenInfo(validMint, validSymbol, 0);
      expect(tokenInfo.decimals).toBe(0);
    });

    it('should accept 18 decimals', () => {
      const tokenInfo = new TokenInfo(validMint, validSymbol, 18);
      expect(tokenInfo.decimals).toBe(18);
    });
  });

  describe('updateFetchedAt', () => {
    it('should update fetchedAt to current date', async () => {
      const oldDate = new Date('2024-01-01');
      const tokenInfo = new TokenInfo(validMint, validSymbol, validDecimals, {
        fetchedAt: oldDate,
      });

      expect(tokenInfo.fetchedAt).toBe(oldDate);

      await new Promise((resolve) => setTimeout(resolve, 10));
      tokenInfo.updateFetchedAt();

      expect(tokenInfo.fetchedAt).not.toBe(oldDate);
      expect(tokenInfo.fetchedAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });
  });
});
