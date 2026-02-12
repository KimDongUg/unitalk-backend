const request = require('supertest');
const jwt = require('jsonwebtoken');

require('./setup');

const { query } = require('../src/config/database');
const { app } = require('../src/app');

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEST_OTHER_USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const TEST_CONVERSATION_ID = '660e8400-e29b-41d4-a716-446655440000';

function generateToken(userId = TEST_USER_ID) {
  return jwt.sign({ id: userId, phone: '+821012345678' }, 'test_jwt_secret', {
    expiresIn: '1d',
  });
}

describe('Chat Rooms & Messages API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /chatrooms', () => {
    test('should create a new chat room', async () => {
      const token = generateToken();

      // Mock findOrCreate: findById (no existing) then insert
      query
        .mockResolvedValueOnce({ rows: [] }) // findOrCreate - no existing conversation
        .mockResolvedValueOnce({
          rows: [
            {
              id: TEST_CONVERSATION_ID,
              user1_id: TEST_USER_ID,
              user2_id: TEST_OTHER_USER_ID,
              last_message_at: new Date(),
              created_at: new Date(),
            },
          ],
        }); // insert conversation

      const res = await request(app)
        .post('/chatrooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: TEST_USER_ID, otherUserId: TEST_OTHER_USER_ID });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.chatRoom).toBeDefined();
      expect(res.body.isNew).toBe(true);
    });

    test('should return existing chat room', async () => {
      const token = generateToken();

      // Mock findOrCreate: found existing
      query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_CONVERSATION_ID,
            user1_id: TEST_USER_ID,
            user2_id: TEST_OTHER_USER_ID,
            last_message_at: new Date(),
            created_at: new Date(),
          },
        ],
      });

      const res = await request(app)
        .post('/chatrooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: TEST_USER_ID, otherUserId: TEST_OTHER_USER_ID });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isNew).toBe(false);
    });
  });

  describe('GET /chatrooms/:id/messages', () => {
    test('should return messages with page-based pagination', async () => {
      const token = generateToken();

      query
        .mockResolvedValueOnce({ rows: [{ '1': 1 }] }) // isParticipant
        .mockResolvedValueOnce({
          rows: [
            {
              id: TEST_USER_ID,
              phone: '+821012345678',
              name: 'Alice',
              language_code: 'ko',
              target_language: 'en',
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
              sender_language: 'en',
              original_language: 'en',
              created_at: new Date(),
              read_at: null,
            },
          ],
        }) // findByConversation
        .mockResolvedValueOnce({ rows: [{ total: '1' }] }); // count

      const res = await request(app)
        .get(`/chatrooms/${TEST_CONVERSATION_ID}/messages?page=1&limit=50`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.messages).toBeDefined();
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body.messages[0].senderLang).toBe('en');
      expect(res.body.total).toBeDefined();
      expect(res.body.page).toBe(1);
      expect(res.body.hasMore).toBeDefined();
    });

    test('should deny access to non-participant', async () => {
      const token = generateToken();

      // Mock: not a participant
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get(`/chatrooms/${TEST_CONVERSATION_ID}/messages?page=1`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('Access denied');
    });

    test('should require authentication', async () => {
      const res = await request(app).get(
        `/chatrooms/${TEST_CONVERSATION_ID}/messages`
      );

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /chatrooms/:id/messages', () => {
    test('should send a message with senderLang', async () => {
      const token = generateToken();

      query
        .mockResolvedValueOnce({
          rows: [
            {
              id: TEST_CONVERSATION_ID,
              user1_id: TEST_USER_ID,
              user2_id: TEST_OTHER_USER_ID,
            },
          ],
        }) // findById (conversation)
        .mockResolvedValueOnce({ rows: [{ '1': 1 }] }) // isParticipant
        .mockResolvedValueOnce({
          rows: [
            {
              id: TEST_USER_ID,
              name: 'Alice',
              language_code: 'ko',
            },
          ],
        }) // findById (sender)
        .mockResolvedValueOnce({
          rows: [
            {
              id: TEST_OTHER_USER_ID,
              name: 'Bob',
              language_code: 'en',
              fcm_token: null,
              is_active: true,
            },
          ],
        }) // findById (recipient)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-new',
              conversation_id: TEST_CONVERSATION_ID,
              sender_id: TEST_USER_ID,
              original_text: '안녕하세요',
              original_language: 'ko',
              sender_language: 'ko',
              translated_texts: { en: 'Hello' },
              created_at: new Date(),
            },
          ],
        }) // Message.create
        .mockResolvedValueOnce({ rows: [] }) // updateLastMessage
        .mockResolvedValueOnce({
          rows: [
            {
              id: TEST_OTHER_USER_ID,
              name: 'Bob',
              language_code: 'en',
              fcm_token: null,
              is_active: true,
            },
          ],
        }); // findById (recipient again for push notification)

      const res = await request(app)
        .post(`/chatrooms/${TEST_CONVERSATION_ID}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          text: '안녕하세요',
          user: { _id: TEST_USER_ID },
          senderLang: 'ko',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBeDefined();
      expect(res.body.message.senderLang).toBe('ko');
    });
  });

  describe('GET /users/:userId/chatrooms', () => {
    test('should return user chat rooms (dm + group)', async () => {
      const token = generateToken();

      // Mock findByUserId - returns both dm and group conversations
      query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_CONVERSATION_ID,
            user1_id: TEST_USER_ID,
            user2_id: TEST_OTHER_USER_ID,
            other_user_id: TEST_OTHER_USER_ID,
            type: 'dm',
            group_name: null,
            g_id: null,
            last_message_at: new Date(),
          },
        ],
      });

      // Mock findById (other user) and unread count
      query
        .mockResolvedValueOnce({
          rows: [
            {
              id: TEST_OTHER_USER_ID,
              name: 'Bob',
              profile_image_url: null,
              language_code: 'en',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: '3' }] });

      const res = await request(app)
        .get(`/users/${TEST_USER_ID}/chatrooms`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.chatRooms).toBeDefined();
      expect(Array.isArray(res.body.chatRooms)).toBe(true);
      expect(res.body.chatRooms[0].type).toBe('dm');
    });
  });

  describe('POST /api/messages/read (legacy)', () => {
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
});
