require('./setup');

const translationService = require('../src/services/translationService');
const cacheService = require('../src/services/cacheService');

// Mock cacheService
jest.mock('../src/services/cacheService', () => ({
  getRaw: jest.fn(),
  setRaw: jest.fn(),
}));

describe('Translation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hashText', () => {
    test('should produce consistent MD5 hash', () => {
      const hash1 = translationService.hashText('Hello');
      const hash2 = translationService.hashText('Hello');
      expect(hash1).toBe(hash2);
    });

    test('should produce different hashes for different text', () => {
      const hash1 = translationService.hashText('Hello');
      const hash2 = translationService.hashText('World');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('translateText', () => {
    test('should return cached translation if available', async () => {
      cacheService.getRaw.mockResolvedValueOnce('안녕하세요');

      const result = await translationService.translateText('Hello', 'ko');

      expect(result).toBe('안녕하세요');
      expect(cacheService.getRaw).toHaveBeenCalledTimes(1);
    });

    test('should return dev fallback when API is not configured', async () => {
      cacheService.getRaw.mockResolvedValueOnce(null);

      const result = await translationService.translateText('Hello', 'ko');

      // Without GOOGLE_API_KEY, dev fallback is used
      expect(result).toBe('[ko] Hello');
      expect(cacheService.getRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('detectLanguage', () => {
    test('should return en as fallback when API is not configured', async () => {
      const result = await translationService.detectLanguage('Hello');
      expect(result).toBe('en');
    });
  });
});
