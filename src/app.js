const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/env');
const { pool } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { apiLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const setupSocket = require('./socket/messageSocket');
const logger = require('./utils/logger');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const contactRoutes = require('./routes/contacts');
const messageRoutes = require('./routes/messages');
const chatRoomRoutes = require('./routes/chatrooms');

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api/', apiLimiter);
app.use('/auth/', apiLimiter);
app.use('/users/', apiLimiter);
app.use('/contacts/', apiLimiter);
app.use('/chatrooms/', apiLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// New API routes (frontend spec)
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/contacts', contactRoutes);
app.use('/chatrooms', chatRoomRoutes);

// Legacy API routes (backward compatibility)
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/messages', messageRoutes);

// Error handler
app.use(errorHandler);

// Initialize Socket.io
setupSocket(io);

// Start server
async function start() {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    logger.info('PostgreSQL connection verified');

    // Connect Redis
    await connectRedis();
    logger.info('Redis connection verified');

    const port = config.port;
    server.listen(port, () => {
      logger.info(`UniTalk server running on port ${port} [${config.nodeEnv}]`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    pool.end();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    pool.end();
    process.exit(0);
  });
});

// Export for testing
module.exports = { app, server, io };

// Start only if not imported (i.e., not in test)
if (require.main === module) {
  start();
}
