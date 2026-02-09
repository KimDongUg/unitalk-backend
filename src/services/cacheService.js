const { redisClient } = require('../config/redis');
const logger = require('../utils/logger');

const cacheService = {
  async get(key) {
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  },

  async set(key, value, ttlSeconds) {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await redisClient.set(key, serialized, { EX: ttlSeconds });
      } else {
        await redisClient.set(key, serialized);
      }
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  },

  async del(key) {
    try {
      await redisClient.del(key);
    } catch (error) {
      logger.error('Cache del error:', error);
    }
  },

  async exists(key) {
    try {
      return await redisClient.exists(key);
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  },

  async setRaw(key, value, ttlSeconds) {
    try {
      if (ttlSeconds) {
        await redisClient.set(key, value, { EX: ttlSeconds });
      } else {
        await redisClient.set(key, value);
      }
    } catch (error) {
      logger.error('Cache setRaw error:', error);
    }
  },

  async getRaw(key) {
    try {
      return await redisClient.get(key);
    } catch (error) {
      logger.error('Cache getRaw error:', error);
      return null;
    }
  },
};

module.exports = cacheService;
