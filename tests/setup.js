// Test setup - mock external services
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.PORT = '3001';

// Mock Redis
jest.mock('../src/config/redis', () => {
  const store = new Map();
  return {
    redisClient: {
      get: jest.fn((key) => Promise.resolve(store.get(key) || null)),
      set: jest.fn((key, value, options) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn((key) => {
        store.delete(key);
        return Promise.resolve(1);
      }),
      exists: jest.fn((key) => Promise.resolve(store.has(key) ? 1 : 0)),
      isOpen: true,
    },
    connectRedis: jest.fn(() => Promise.resolve()),
    _store: store,
  };
});

// Mock database
jest.mock('../src/config/database', () => {
  return {
    pool: {
      query: jest.fn(() => Promise.resolve({ rows: [{ '?column?': 1 }] })),
      end: jest.fn(),
    },
    query: jest.fn(() => Promise.resolve({ rows: [] })),
  };
});
