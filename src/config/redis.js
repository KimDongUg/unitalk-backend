const { createClient } = require('redis');
const config = require('./env');
const logger = require('../utils/logger');

const redisEnabled = !!(config.redis && config.redis.host);

let redisClient = null;

if (redisEnabled) {
  const socketOptions = {
    host: config.redis.host,
    port: config.redis.port,
  };

  if (config.redis.tls) {
    socketOptions.tls = true;
    socketOptions.rejectUnauthorized = false;
  }

  redisClient = createClient({
    socket: socketOptions,
    password: config.redis.password,
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis error:', err);
  });
} else {
  logger.warn('Redis is not configured — caching disabled');
}

const connectRedis = async () => {
  if (!redisClient) return;
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
};

module.exports = { redisClient, connectRedis, redisEnabled };
