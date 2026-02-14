import {
  formatPrice,
  formatLargeNumber,
  formatPercent,
  formatOrganicScore,
  formatVerified,
} from '../../../src/interface/cli/commands/token/token-formatters';

// Strip ANSI codes for testing
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001B\[[0-9;]*m/g, '');
}

describe('Token Formatters', () => {
  describe('formatPrice', () => {
    it('should return N/A for null', () => {
      expect(stripAnsi(formatPrice(null))).toBe('N/A');
    });

    it('should return N/A for undefined', () => {
      expect(stripAnsi(formatPrice(undefined))).toBe('N/A');
    });

    it('should return $0 for zero', () => {
      expect(stripAnsi(formatPrice(0))).toBe('$0');
    });

    it('should use scientific notation for very small prices', () => {
      const result = stripAnsi(formatPrice(0.0000001));
      expect(result).toMatch(/^\$\d\.\d+e/);
    });

    it('should show 6 decimals for small prices', () => {
      expect(formatPrice(0.005)).toBe('$0.005000');
    });

    it('should show 4 decimals for sub-dollar prices', () => {
      expect(formatPrice(0.5)).toBe('$0.5000');
    });

    it('should show 2 decimals for normal prices', () => {
      expect(formatPrice(150.5)).toBe('$150.50');
    });

    it('should abbreviate thousands', () => {
      expect(formatPrice(5000)).toBe('$5.0K');
    });

    it('should abbreviate millions', () => {
      expect(formatPrice(5000000)).toBe('$5.0M');
    });

    it('should abbreviate billions', () => {
      expect(formatPrice(5000000000)).toBe('$5.0B');
    });
  });

  describe('formatLargeNumber', () => {
    it('should return N/A for null', () => {
      expect(stripAnsi(formatLargeNumber(null))).toBe('N/A');
    });

    it('should return N/A for undefined', () => {
      expect(stripAnsi(formatLargeNumber(undefined))).toBe('N/A');
    });

    it('should show numbers under 1000 as-is', () => {
      expect(formatLargeNumber(500)).toBe('500');
    });

    it('should abbreviate thousands', () => {
      expect(formatLargeNumber(5000)).toBe('5.0K');
    });

    it('should abbreviate millions', () => {
      expect(formatLargeNumber(1500000)).toBe('1.5M');
    });

    it('should abbreviate billions', () => {
      expect(formatLargeNumber(2000000000)).toBe('2.0B');
    });
  });

  describe('formatPercent', () => {
    it('should return N/A for null', () => {
      expect(stripAnsi(formatPercent(null))).toBe('N/A');
    });

    it('should return N/A for undefined', () => {
      expect(stripAnsi(formatPercent(undefined))).toBe('N/A');
    });

    it('should format positive values with + sign', () => {
      const result = stripAnsi(formatPercent(5.5));
      expect(result).toBe('+5.5%');
    });

    it('should format negative values', () => {
      const result = stripAnsi(formatPercent(-3.2));
      expect(result).toBe('-3.2%');
    });

    it('should format zero', () => {
      const result = stripAnsi(formatPercent(0));
      expect(result).toBe('+0.0%');
    });
  });

  describe('formatOrganicScore', () => {
    it('should format high score', () => {
      const result = stripAnsi(formatOrganicScore(95, 'high'));
      expect(result).toBe('95 (high)');
    });

    it('should format medium score', () => {
      const result = stripAnsi(formatOrganicScore(50, 'medium'));
      expect(result).toBe('50 (medium)');
    });

    it('should format low score', () => {
      const result = stripAnsi(formatOrganicScore(10, 'low'));
      expect(result).toBe('10 (low)');
    });
  });

  describe('formatVerified', () => {
    it('should show V for verified', () => {
      const result = stripAnsi(formatVerified(true));
      expect(result).toBe('V');
    });

    it('should show x for unverified', () => {
      const result = stripAnsi(formatVerified(false));
      expect(result).toBe('x');
    });

    it('should show x for null', () => {
      const result = stripAnsi(formatVerified(null));
      expect(result).toBe('x');
    });
  });
});
