const request = require('supertest');
const jwt = require('jsonwebtoken');

// Setup mocks before requiring app
require('./setup');

const { query } = require('../src/config/database');
const { redisClient } = require('../src/config/redis');
const { app } = require('../src/app');

describe('Authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/send-otp', () => {
    test('should send OTP for valid phone number', async () => {
      const res = await request(app)
        .post('/api/auth/send-otp')
        .send({ phone: '+821012345678' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('+821012345678');
    });

    test('should reject invalid phone number format', async () => {
      const res = await request(app)
        .post('/api/auth/send-otp')
        .send({ phone: '01012345678' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    test('should reject missing phone number', async () => {
      const res = await request(app)
        .post('/api/auth/send-otp')
        .send({});

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/verify-otp', () => {
    test('should verify OTP and return JWT token', async () => {
      // Store OTP in mock Redis
      redisClient.get.mockResolvedValueOnce('123456');

      // Mock user lookup and creation
      query
        .mockResolvedValueOnce({ rows: [] }) // findByPhone - not found
        .mockResolvedValueOnce({
          rows: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              phone: '+821012345678',
              name: null,
              profile_image_url: null,
              language_code: 'en',
              created_at: new Date(),
            },
          ],
        }); // create user

      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ phone: '+821012345678', otp: '123456' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBeDefined();

      // Verify the token is valid
      const decoded = jwt.verify(res.body.token, 'test_jwt_secret');
      expect(decoded.id).toBeDefined();
    });

    test('should reject invalid OTP', async () => {
      redisClient.get.mockResolvedValueOnce('654321');

      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ phone: '+821012345678', otp: '123456' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid OTP');
    });

    test('should reject expired OTP', async () => {
      redisClient.get.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ phone: '+821012345678', otp: '123456' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('OTP expired or not found');
    });

    test('should reject OTP with wrong length', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ phone: '+821012345678', otp: '123' });

      expect(res.statusCode).toBe(400);
    });
  });
});
