const request = require('supertest');
const jwt = require('jsonwebtoken');

require('./setup');

const { query } = require('../src/config/database');
const { app } = require('../src/app');

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEST_CONVERSATION_ID = '660e8400-e29b-41d4-a716-446655440000';

function generateToken(userId = TEST_USER_ID) {
  return jwt.sign({ id: userId, phone: '+821012345678' }, 'test_jwt_secret', {
    expiresIn: '1d',
  });
}

describe('Messages API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/messages/:conversationId', () => {
    test('should return messages for authorized user', async () => {
      const token = generateToken();

      // Mock conversation participant check
      query
        .mockResolvedValueOnce({ rows: [{ '1': 1 }] }) // isParticipant
        .mockResolvedValueOnce({
          rows: [
            {
              id: TEST_USER_ID,
              phone: '+821012345678',
              name: 'Alice',
              language_code: 'ko',
            },
          ],
        }) // findById (user)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-1',
              sender_id: TEST_USER_ID,
              original_text: 'Hello',
              translated_texts: { ko: '안녕하세요' },
              created_at: new Date(),
              read_at: null,
            },
          ],
        }) // findByConversation
        .mockResolvedValueOnce({ rows: [{ total: '1' }] }); // count

      const res = await request(app)
        .get(`/api/messages/${TEST_CONVERSATION_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.messages).toBeDefined();
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body.total).toBeDefined();
      expect(res.body.has_more).toBeDefined();
    });

    test('should deny access to non-participant', async () => {
      const token = generateToken();

      // Mock: not a participant
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get(`/api/messages/${TEST_CONVERSATION_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('Access denied');
    });

    test('should require authentication', async () => {
      const res = await request(app).get(
        `/api/messages/${TEST_CONVERSATION_ID}`
      );

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/messages/read', () => {
    test('should mark messages as read', async () => {
      const token = generateToken();
      const messageIds = [
        '770e8400-e29b-41d4-a716-446655440001',
        '770e8400-e29b-41d4-a716-446655440002',
      ];

      // Mock markAsRead
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/messages/read')
        .set('Authorization', `Bearer ${token}`)
        .send({ message_ids: messageIds });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('should reject empty message_ids', async () => {
      const token = generateToken();

      const res = await request(app)
        .post('/api/messages/read')
        .set('Authorization', `Bearer ${token}`)
        .send({ message_ids: [] });

      expect(res.statusCode).toBe(400);
    });

    test('should reject invalid UUID format', async () => {
      const token = generateToken();

      const res = await request(app)
        .post('/api/messages/read')
        .set('Authorization', `Bearer ${token}`)
        .send({ message_ids: ['not-a-uuid'] });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/messages/conversations', () => {
    test('should return user conversations', async () => {
      const token = generateToken();

      // Mock findByUserId
      query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_CONVERSATION_ID,
            user1_id: TEST_USER_ID,
            user2_id: '550e8400-e29b-41d4-a716-446655440001',
            other_user_id: '550e8400-e29b-41d4-a716-446655440001',
            last_message_at: new Date(),
          },
        ],
      });

      // Mock findById (other user) and unread count
      query
        .mockResolvedValueOnce({
          rows: [
            {
              id: '550e8400-e29b-41d4-a716-446655440001',
              name: 'Bob',
              profile_image_url: null,
              language_code: 'en',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] });

      const res = await request(app)
        .get('/api/messages/conversations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.conversations).toBeDefined();
      expect(Array.isArray(res.body.conversations)).toBe(true);
    });
  });
});
