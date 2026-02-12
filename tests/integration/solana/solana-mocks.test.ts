import { ConnectionService } from '../../../src/infrastructure/solana/connection.service';
import { Connection } from '@solana/web3.js';

// Mock @solana/web3.js
jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  return {
    ...actual,
    Connection: jest.fn(),
  };
});

describe('Solana Blockchain Mocks', () => {
  let connectionService: ConnectionService;
  let mockConnection: {
    getBalance: jest.Mock;
    getParsedTransaction: jest.Mock;
    getSignaturesForAddress: jest.Mock;
  };

  beforeEach(() => {
    // Setup mock connection
    mockConnection = {
      getBalance: jest.fn(),
      getParsedTransaction: jest.fn(),
      getSignaturesForAddress: jest.fn(),
    };

    // Mock Connection constructor to return our mock
    (Connection as jest.Mock).mockImplementation(() => mockConnection);

    // Create service after mocking
    connectionService = new ConnectionService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Balance Queries', () => {
    it('should get SOL balance', async () => {
      const mockBalance = 1.5 * 1e9; // 1.5 SOL in lamports
      mockConnection.getBalance.mockResolvedValue(mockBalance);

      const balance = await connectionService.getBalance(
        '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
      );

      expect(balance).toBe(1.5);
      expect(mockConnection.getBalance).toHaveBeenCalled();
    });

    it('should return 0 for empty wallet', async () => {
      mockConnection.getBalance.mockResolvedValue(0);

      const balance = await connectionService.getBalance(
        '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
      );

      expect(balance).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      mockConnection.getBalance.mockRejectedValue(new Error('Network error'));

      const balance = await connectionService.getBalance('invalid-address');

      expect(balance).toBe(0);
    });
  });

  describe('Transaction Scanning', () => {
    it('should scan for transactions', async () => {
      const mockSignatures = [
        {
          signature: '5x28V9v...',
          slot: 123456789,
          err: null,
          memo: null,
          blockTime: 1234567890,
          confirmationStatus: 'confirmed',
        },
        {
          signature: '3a7K2mN...',
          slot: 123456788,
          err: null,
          memo: null,
          blockTime: 1234567880,
          confirmationStatus: 'confirmed',
        },
      ];

      mockConnection.getSignaturesForAddress.mockResolvedValue(mockSignatures);

      const signatures = await connectionService.getSignaturesForAddress(
        '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        { limit: 10 }
      );

      expect(signatures).toHaveLength(2);
      expect(signatures[0]!.signature).toBe('5x28V9v...');
      expect(mockConnection.getSignaturesForAddress).toHaveBeenCalledWith(expect.anything(), {
        before: undefined,
        limit: 10,
      });
    });

    it('should handle no transactions found', async () => {
      mockConnection.getSignaturesForAddress.mockResolvedValue([]);

      const signatures = await connectionService.getSignaturesForAddress(
        '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
      );

      expect(signatures).toHaveLength(0);
    });

    it('should handle errors gracefully', async () => {
      mockConnection.getSignaturesForAddress.mockRejectedValue(new Error('Network error'));

      const signatures = await connectionService.getSignaturesForAddress(
        '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
      );

      expect(signatures).toHaveLength(0);
    });
  });

  describe('Token Balance', () => {
    it('should return 0 when token account does not exist', async () => {
      // Mock getAssociatedTokenAddress to throw error (account doesn't exist)
      jest.mock('@solana/spl-token', () => ({
        getAssociatedTokenAddress: jest.fn().mockRejectedValue(new Error('Account not found')),
        getAccount: jest.fn(),
      }));

      const balance = await connectionService.getTokenBalance(
        '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      );

      expect(balance).toBe(0);
    });
  });
});
