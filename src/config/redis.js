const { createClient } = require('redis');
const config = require('./env');
const logger = require('../utils/logger');

if (config.nodeEnv === 'production' && !config.redis.host) {
  throw new Error('REDIS_HOST is required in production');
}

const socketOptions = {
  host: config.redis.host,
  port: config.redis.port,
};

if (config.redis.tls) {
  socketOptions.tls = true;
  socketOptions.rejectUnauthorized = false;
}

const redisClient = createClient({
  socket: socketOptions,
  password: config.redis.password,
});

redisClient.on('connect', () => {
  logger.info('Redis connected');
});

redisClient.on('error', (err) => {
  logger.error('Redis error:', err);
});

const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
};

module.exports = { redisClient, connectRedis };
