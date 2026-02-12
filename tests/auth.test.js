const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Setup mocks before requiring app
require('./setup');

const { query } = require('../src/config/database');
const { redisClient } = require('../src/config/redis');
const { app } = require('../src/app');

const TEST_UNIVERSITY_ID = '880e8400-e29b-41d4-a716-446655440000';

describe('Authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/register', () => {
    test('should register a new user with nickname and password', async () => {
      // Mock findByName - not found (nickname available)
      query.mockResolvedValueOnce({ rows: [] });
      // Mock createWithPassword
      query.mockResolvedValueOnce({
        rows: [
          {
            id: '550e8400-e29b-41d4-a716-446655440099',
            name: 'TestUser',
            language_code: 'ko',
            target_language: 'en',
            university_id: TEST_UNIVERSITY_ID,
            created_at: new Date(),
          },
        ],
      });
      // Mock joinDefaultGroups
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/auth/register')
        .send({
          nickname: 'TestUser',
          password: 'password123',
          universityId: TEST_UNIVERSITY_ID,
          viewLang: 'ko',
          inputLang: 'en',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.nickname).toBe('TestUser');
      expect(res.body.user.universityId).toBe(TEST_UNIVERSITY_ID);
    });

    test('should reject duplicate nickname', async () => {
      // Mock findByName - found (nickname taken)
      query.mockResolvedValueOnce({
        rows: [{ id: 'existing-id', name: 'TestUser' }],
      });

      const res = await request(app)
        .post('/auth/register')
        .send({
          nickname: 'TestUser',
          password: 'password123',
          universityId: TEST_UNIVERSITY_ID,
        });

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe('Nickname already taken');
    });

    test('should reject short password', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          nickname: 'TestUser',
          password: '123',
          universityId: TEST_UNIVERSITY_ID,
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    test('should login with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('password123', 12);

      // Mock findByNameWithPassword
      query.mockResolvedValueOnce({
        rows: [
          {
            id: '550e8400-e29b-41d4-a716-446655440099',
            name: 'TestUser',
            password: hashedPassword,
            language_code: 'ko',
            target_language: 'en',
            university_id: TEST_UNIVERSITY_ID,
          },
        ],
      });
      // Mock UserDevice.upsert
      query.mockResolvedValueOnce({
        rows: [{ id: 'device-1', user_id: '550e8400-e29b-41d4-a716-446655440099', device_type: 'mobile' }],
      });

      const res = await request(app)
        .post('/auth/login')
        .send({ nickname: 'TestUser', password: 'password123' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.nickname).toBe('TestUser');
    });

    test('should login with deviceType pc', async () => {
      const hashedPassword = await bcrypt.hash('password123', 12);

      query.mockResolvedValueOnce({
        rows: [
          {
            id: '550e8400-e29b-41d4-a716-446655440099',
            name: 'TestUser',
            password: hashedPassword,
            language_code: 'ko',
            target_language: 'en',
            university_id: TEST_UNIVERSITY_ID,
          },
        ],
      });
      // Mock UserDevice.upsert for PC
      query.mockResolvedValueOnce({
        rows: [{ id: 'device-pc', user_id: '550e8400-e29b-41d4-a716-446655440099', device_type: 'pc' }],
      });

      const res = await request(app)
        .post('/auth/login')
        .send({ nickname: 'TestUser', password: 'password123', deviceType: 'pc', deviceName: 'My PC' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();

      // Verify token includes deviceType
      const decoded = jwt.verify(res.body.token, 'test_jwt_secret');
      expect(decoded.deviceType).toBe('pc');
    });

    test('should reject invalid password', async () => {
      const hashedPassword = await bcrypt.hash('password123', 12);

      query.mockResolvedValueOnce({
        rows: [
          {
            id: '550e8400-e29b-41d4-a716-446655440099',
            name: 'TestUser',
            password: hashedPassword,
          },
        ],
      });

      const res = await request(app)
        .post('/auth/login')
        .send({ nickname: 'TestUser', password: 'wrongpassword' });

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Invalid nickname or password');
    });

    test('should reject non-existent user', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/auth/login')
        .send({ nickname: 'NonExistent', password: 'password123' });

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Invalid nickname or password');
    });
  });

  describe('QR Login', () => {
    test('POST /auth/qr/generate should return qrToken', async () => {
      const res = await request(app).post('/auth/qr/generate');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.qrToken).toBeDefined();
      expect(res.body.expiresIn).toBe(180);
    });

    test('POST /auth/qr/verify should approve QR login', async () => {
      const token = jwt.sign(
        { id: '550e8400-e29b-41d4-a716-446655440099', nickname: 'TestUser', universityId: TEST_UNIVERSITY_ID },
        'test_jwt_secret',
        { expiresIn: '1d' }
      );

      // Mock Redis: qr token exists and is pending
      redisClient.get.mockResolvedValueOnce('pending');
      // Mock User.findById
      query.mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440099',
          name: 'TestUser',
          university_id: TEST_UNIVERSITY_ID,
          language_code: 'ko',
          target_language: 'en',
        }],
      });
      // Mock UserDevice.upsert for PC
      query.mockResolvedValueOnce({
        rows: [{ id: 'device-pc', device_type: 'pc' }],
      });

      const res = await request(app)
        .post('/auth/qr/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ qrToken: 'test-qr-token-123' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('QR login approved');
    });

    test('POST /auth/qr/verify should reject expired QR', async () => {
      const token = jwt.sign(
        { id: '550e8400-e29b-41d4-a716-446655440099', nickname: 'TestUser' },
        'test_jwt_secret',
        { expiresIn: '1d' }
      );

      // QR token not found in Redis
      redisClient.get.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/auth/qr/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ qrToken: 'expired-token' });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('QR code expired or invalid');
    });
  });

  describe('Device Management', () => {
    test('GET /auth/devices should return user devices', async () => {
      const token = jwt.sign(
        { id: '550e8400-e29b-41d4-a716-446655440099' },
        'test_jwt_secret',
        { expiresIn: '1d' }
      );

      // Mock UserDevice.findByUserId
      query.mockResolvedValueOnce({
        rows: [
          { id: 'dev-1', user_id: '550e8400-e29b-41d4-a716-446655440099', device_type: 'mobile', is_online: true },
          { id: 'dev-2', user_id: '550e8400-e29b-41d4-a716-446655440099', device_type: 'pc', is_online: false },
        ],
      });

      const res = await request(app)
        .get('/auth/devices')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.devices).toHaveLength(2);
    });

    test('DELETE /auth/devices/:deviceId should remove device', async () => {
      const token = jwt.sign(
        { id: '550e8400-e29b-41d4-a716-446655440099' },
        'test_jwt_secret',
        { expiresIn: '1d' }
      );

      // Mock UserDevice.remove
      query.mockResolvedValueOnce({
        rows: [{ id: 'dev-2', device_type: 'pc' }],
      });

      const res = await request(app)
        .delete('/auth/devices/dev-2')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('DELETE /auth/devices/:deviceId should return 404 for non-existent device', async () => {
      const token = jwt.sign(
        { id: '550e8400-e29b-41d4-a716-446655440099' },
        'test_jwt_secret',
        { expiresIn: '1d' }
      );

      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .delete('/auth/devices/non-existent')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(404);
    });
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
