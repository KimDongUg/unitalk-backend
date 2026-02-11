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

  describe('POST /auth/otp/send', () => {
    test('should send OTP for valid phone number', async () => {
      const res = await request(app)
        .post('/auth/otp/send')
        .send({ phone: '+821012345678' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('+821012345678');
    });

    test('should reject invalid phone number format', async () => {
      const res = await request(app)
        .post('/auth/otp/send')
        .send({ phone: '01012345678' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    test('should reject missing phone number', async () => {
      const res = await request(app)
        .post('/auth/otp/send')
        .send({});

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /auth/otp/verify', () => {
    test('should verify OTP and return JWT token with isNew flag', async () => {
      // Store OTP in mock Redis
      redisClient.get.mockResolvedValueOnce('123456');

      // Mock user lookup and creation (findOrCreate: findByPhone returns nothing, then create)
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
              target_language: null,
              created_at: new Date(),
            },
          ],
        }); // create user

      const res = await request(app)
        .post('/auth/otp/verify')
        .send({ phone: '+821012345678', code: '123456' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.isNew).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBeDefined();

      // Verify the token is valid
      const decoded = jwt.verify(res.body.token, 'test_jwt_secret');
      expect(decoded.id).toBeDefined();
    });

    test('should return isNew false for existing user', async () => {
      redisClient.get.mockResolvedValueOnce('123456');

      // Mock user lookup - user exists
      query.mockResolvedValueOnce({
        rows: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            phone: '+821012345678',
            name: 'Alice',
            profile_image_url: null,
            language_code: 'ko',
            target_language: 'en',
            fcm_token: null,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      }); // findByPhone - found

      const res = await request(app)
        .post('/auth/otp/verify')
        .send({ phone: '+821012345678', code: '123456' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isNew).toBe(false);
      expect(res.body.user.name).toBe('Alice');
    });

    test('should reject invalid OTP', async () => {
      redisClient.get.mockResolvedValueOnce('654321');

      const res = await request(app)
        .post('/auth/otp/verify')
        .send({ phone: '+821012345678', code: '123456' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid OTP');
    });

    test('should reject expired OTP', async () => {
      redisClient.get.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/auth/otp/verify')
        .send({ phone: '+821012345678', code: '123456' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('OTP expired or not found');
    });

    test('should reject code with wrong length', async () => {
      const res = await request(app)
        .post('/auth/otp/verify')
        .send({ phone: '+821012345678', code: '123' });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /auth/me', () => {
    test('should return current user info', async () => {
      const token = jwt.sign(
        { id: '550e8400-e29b-41d4-a716-446655440000', phone: '+821012345678' },
        'test_jwt_secret',
        { expiresIn: '1d' }
      );

      query.mockResolvedValueOnce({
        rows: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            phone: '+821012345678',
            name: 'Alice',
            profile_image_url: null,
            language_code: 'ko',
            target_language: 'en',
            fcm_token: null,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });

      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(res.body.user.name).toBe('Alice');
    });

    test('should require authentication', async () => {
      const res = await request(app).get('/auth/me');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    test('should logout successfully', async () => {
      const token = jwt.sign(
        { id: '550e8400-e29b-41d4-a716-446655440000', phone: '+821012345678' },
        'test_jwt_secret',
        { expiresIn: '1d' }
      );

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
