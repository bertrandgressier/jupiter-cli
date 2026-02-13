import { WalletResolverService } from '../../../src/application/services/wallet/wallet-resolver.service';
import { WalletRepository } from '../../../src/domain/repositories/wallet.repository';
import { Wallet } from '../../../src/domain/entities/wallet.entity';
import { WalletNotFoundError } from '../../../src/core/errors/wallet.errors';

function createMockWallet(id: string, name: string, address: string): Wallet {
  return new Wallet(id, name, address, 'encrypted-key', 'nonce', 'salt', 'auth-tag');
}

function createMockRepository(wallets: Wallet[]): jest.Mocked<WalletRepository> {
  return {
    findAll: jest.fn().mockResolvedValue(wallets),
    findById: jest.fn().mockImplementation(async (id: string) => {
      return wallets.find((w) => w.id === id) ?? null;
    }),
    findByName: jest.fn().mockImplementation(async (name: string) => {
      return wallets.find((w) => w.name === name) ?? null;
    }),
    findByAddress: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

describe('WalletResolverService', () => {
  let resolver: WalletResolverService;
  let mockRepo: jest.Mocked<WalletRepository>;
  let wallets: Wallet[];

  beforeEach(() => {
    wallets = [
      createMockWallet('uuid-1', 'Trading', 'addr-1'),
      createMockWallet('uuid-2', 'Savings', 'addr-2'),
      createMockWallet('550e8400-e29b-41d4-a716-446655440000', 'Main', 'addr-3'),
    ];
    mockRepo = createMockRepository(wallets);
    resolver = new WalletResolverService(mockRepo);
  });

  describe('resolve', () => {
    describe('by index (number)', () => {
      it('should resolve wallet by index "1"', async () => {
        const wallet = await resolver.resolve('1');
        expect(wallet.name).toBe('Trading');
        expect(mockRepo.findAll).toHaveBeenCalled();
      });

      it('should resolve wallet by index "2"', async () => {
        const wallet = await resolver.resolve('2');
        expect(wallet.name).toBe('Savings');
      });

      it('should throw WalletNotFoundError for index out of bounds', async () => {
        await expect(resolver.resolve('10')).rejects.toThrow(WalletNotFoundError);
      });

      it('should throw WalletNotFoundError for index "0"', async () => {
        await expect(resolver.resolve('0')).rejects.toThrow(WalletNotFoundError);
      });
    });

    describe('by name', () => {
      it('should resolve wallet by name', async () => {
        const wallet = await resolver.resolve('Trading');
        expect(wallet.id).toBe('uuid-1');
        expect(mockRepo.findByName).toHaveBeenCalledWith('Trading');
      });

      it('should resolve wallet by name with different case', async () => {
        const firstWallet = wallets[0];
        if (!firstWallet) throw new Error('Test setup failed');
        mockRepo.findByName.mockResolvedValueOnce(firstWallet);
        const wallet = await resolver.resolve('Trading');
        expect(wallet.name).toBe('Trading');
      });

      it('should throw WalletNotFoundError for non-existent name', async () => {
        await expect(resolver.resolve('NonExistent')).rejects.toThrow(WalletNotFoundError);
      });
    });

    describe('by UUID', () => {
      it('should resolve wallet by UUID', async () => {
        const wallet = await resolver.resolve('550e8400-e29b-41d4-a716-446655440000');
        expect(wallet.name).toBe('Main');
        expect(mockRepo.findById).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
      });

      it('should throw WalletNotFoundError for non-existent UUID', async () => {
        await expect(resolver.resolve('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
          WalletNotFoundError
        );
      });
    });

    describe('resolution order', () => {
      it('should try index first when identifier is numeric', async () => {
        await resolver.resolve('1');
        expect(mockRepo.findAll).toHaveBeenCalled();
      });

      it('should try UUID lookup first when identifier looks like UUID', async () => {
        await resolver.resolve('550e8400-e29b-41d4-a716-446655440000');
        expect(mockRepo.findById).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
      });

      it('should try name lookup for non-UUID string', async () => {
        await resolver.resolve('Trading');
        expect(mockRepo.findByName).toHaveBeenCalledWith('Trading');
      });
    });

    describe('edge cases', () => {
      it('should handle empty wallet list', async () => {
        mockRepo.findAll.mockResolvedValue([]);
        await expect(resolver.resolve('1')).rejects.toThrow(WalletNotFoundError);
      });

      it('should handle identifier that could be name or UUID fallback', async () => {
        mockRepo.findByName.mockResolvedValue(null);
        mockRepo.findById.mockResolvedValue(null);

        await expect(resolver.resolve('SomeName')).rejects.toThrow(WalletNotFoundError);
        expect(mockRepo.findByName).toHaveBeenCalledWith('SomeName');
        expect(mockRepo.findById).toHaveBeenCalledWith('SomeName');
      });
    });
  });

  describe('resolveByIndex', () => {
    it('should return first wallet for index 1', async () => {
      const wallet = await resolver.resolveByIndex(1);
      expect(wallet).toBe(wallets[0]);
    });

    it('should return last wallet for index equal to length', async () => {
      const wallet = await resolver.resolveByIndex(3);
      expect(wallet).toBe(wallets[2]);
    });

    it('should throw for index 0', async () => {
      await expect(resolver.resolveByIndex(0)).rejects.toThrow(WalletNotFoundError);
    });

    it('should throw for negative index', async () => {
      await expect(resolver.resolveByIndex(-1)).rejects.toThrow(WalletNotFoundError);
    });

    it('should throw for index beyond list length', async () => {
      await expect(resolver.resolveByIndex(100)).rejects.toThrow(WalletNotFoundError);
    });
  });
});
