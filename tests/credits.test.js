const credits = require('../services/credits');
const { randomUUID } = require('crypto');

function uniqUserId() {
  return `credits_${randomUUID()}`;
}

describe('Credits Service', () => {
  let mockDb;

  beforeEach(() => {
    // Reset the service to not use a DB pool initially
    credits.init(null);

    mockDb = {
      query: jest.fn(),
    };

    // Suppress console.error during tests to keep output clean,
    // but allow us to spy on it.
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Without DB Pool (memoryStore fallback)', () => {
    it('should return 0 for a new user', async () => {
      const userId = uniqUserId();
      const balance = await credits.getCredits(userId);
      expect(balance).toBe(0);
    });

    it('should add credits and retrieve the correct balance', async () => {
      const userId = uniqUserId();
      await credits.addCredits(userId, 100);
      const balance = await credits.getCredits(userId);
      expect(balance).toBe(100);
    });

    it('should parse string amounts when adding credits', async () => {
      const userId = uniqUserId();
      await credits.addCredits(userId, '50.5');
      const balance = await credits.getCredits(userId);
      expect(balance).toBe(50.5);
    });

    it('should deduct credits correctly', async () => {
      const userId = uniqUserId();
      await credits.addCredits(userId, 200);
      await credits.deductCredits(userId, 50);
      const balance = await credits.getCredits(userId);
      expect(balance).toBe(150);
    });

    it('should throw INSUFFICIENT_CREDITS if trying to deduct more than balance', async () => {
      const userId = uniqUserId();
      await credits.addCredits(userId, 20);

      await expect(credits.deductCredits(userId, 50)).rejects.toThrow('INSUFFICIENT_CREDITS');

      // Balance should remain unchanged
      const balance = await credits.getCredits(userId);
      expect(balance).toBe(20);
    });
  });

  describe('With DB Pool', () => {
    beforeEach(() => {
      credits.init(mockDb);
    });

    describe('getCredits', () => {
      it('should retrieve balance from database', async () => {
        const userId = uniqUserId();
        mockDb.query.mockResolvedValueOnce({ rows: [{ balance: '150.00' }] });

        const balance = await credits.getCredits(userId);

        expect(mockDb.query).toHaveBeenCalledWith('SELECT balance FROM user_credits WHERE user_id=$1', [userId]);
        expect(balance).toBe(150);
      });

      it('should return 0 if no row is returned from database', async () => {
        const userId = uniqUserId();
        mockDb.query.mockResolvedValueOnce({ rows: [] });

        const balance = await credits.getCredits(userId);
        expect(balance).toBe(0);
      });

      it('should fallback to memoryStore if query throws an error', async () => {
        const userId = uniqUserId();
        const dbError = new Error('Database connection failed');
        mockDb.query.mockRejectedValueOnce(dbError);

        // Add credits while no db to setup memory state
        credits.init(null);
        await credits.addCredits(userId, 75);
        credits.init(mockDb);

        const balance = await credits.getCredits(userId);

        expect(console.error).toHaveBeenCalledWith('[credits] getCredits failed:', 'Database connection failed');
        expect(balance).toBe(75);
      });
    });

    describe('addCredits', () => {
      it('should insert/update user_credits and insert transaction in database', async () => {
        const userId = uniqUserId();
        mockDb.query.mockResolvedValue({}); // Mocks success for both queries

        await credits.addCredits(userId, 100);

        expect(mockDb.query).toHaveBeenCalledTimes(2);

        // Check first query (upsert)
        const upsertQueryArg = mockDb.query.mock.calls[0][0];
        const upsertParams = mockDb.query.mock.calls[0][1];
        expect(upsertQueryArg).toContain('INSERT INTO user_credits');
        expect(upsertParams).toEqual([userId, 100]);

        // Check second query (transaction)
        const txnQueryArg = mockDb.query.mock.calls[1][0];
        const txnParams = mockDb.query.mock.calls[1][1];
        expect(txnQueryArg).toContain('INSERT INTO credit_transactions');
        expect(txnParams).toEqual([userId, 100, 'topup', 'checkout']);
      });

      it('should fallback to memoryStore if query throws an error', async () => {
        const userId = uniqUserId();
        const dbError = new Error('Insert failed');
        mockDb.query.mockRejectedValueOnce(dbError);

        await credits.addCredits(userId, 200);

        expect(console.error).toHaveBeenCalledWith('[credits] addCredits failed:', 'Insert failed');

        // Verify it was saved to memoryStore
        credits.init(null); // Temporarily drop DB to check memory store
        const balance = await credits.getCredits(userId);
        expect(balance).toBe(200);
      });
    });

    describe('deductCredits', () => {
      it('should update user_credits and insert transaction in database', async () => {
        const userId = uniqUserId();
        // First getCredits is called inside deductCredits
        mockDb.query.mockResolvedValueOnce({ rows: [{ balance: '500' }] });
        // Then two updates are called
        mockDb.query.mockResolvedValueOnce({});
        mockDb.query.mockResolvedValueOnce({});

        await credits.deductCredits(userId, 100);

        expect(mockDb.query).toHaveBeenCalledTimes(3);

        // Check update query
        const updateQueryArg = mockDb.query.mock.calls[1][0];
        const updateParams = mockDb.query.mock.calls[1][1];
        expect(updateQueryArg).toContain('UPDATE user_credits SET balance = balance - $1');
        expect(updateParams).toEqual([100, userId]);

        // Check transaction query
        const txnQueryArg = mockDb.query.mock.calls[2][0];
        const txnParams = mockDb.query.mock.calls[2][1];
        expect(txnQueryArg).toContain('INSERT INTO credit_transactions');
        expect(txnParams).toEqual([userId, -100, 'deduction', 'execution']);
      });

      it('should throw INSUFFICIENT_CREDITS if database balance is less than amount', async () => {
        const userId = uniqUserId();
        mockDb.query.mockResolvedValueOnce({ rows: [{ balance: '50' }] });

        await expect(credits.deductCredits(userId, 100)).rejects.toThrow('INSUFFICIENT_CREDITS');

        // Only getCredits query should have been called
        expect(mockDb.query).toHaveBeenCalledTimes(1);
      });

      it('should fallback to memoryStore if update query throws an error', async () => {
        const userId = uniqUserId();
        // First getCredits returns 300
        mockDb.query.mockResolvedValueOnce({ rows: [{ balance: '300' }] });
        // Update query throws
        const dbError = new Error('Update failed');
        mockDb.query.mockRejectedValueOnce(dbError);

        await credits.deductCredits(userId, 100);

        expect(console.error).toHaveBeenCalledWith('[credits] deductCredits failed:', 'Update failed');

        // Check that memory store got updated (it should use the fetched balance (300) minus amount (100) = 200)
        credits.init(null);
        const memoryBalance = await credits.getCredits(userId);
        expect(memoryBalance).toBe(200);
      });
    });
  });
});
