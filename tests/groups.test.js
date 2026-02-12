const request = require('supertest');
const jwt = require('jsonwebtoken');

require('./setup');

const { query } = require('../src/config/database');
const { app } = require('../src/app');

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEST_UNIVERSITY_ID = '880e8400-e29b-41d4-a716-446655440000';
const TEST_GROUP_ID = '990e8400-e29b-41d4-a716-446655440000';
const TEST_CONVERSATION_ID = '660e8400-e29b-41d4-a716-446655440000';

function generateToken(userId = TEST_USER_ID) {
  return jwt.sign(
    { id: userId, nickname: 'TestUser', universityId: TEST_UNIVERSITY_ID },
    'test_jwt_secret',
    { expiresIn: '1d' }
  );
}

describe('Groups API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/groups?universityId=', () => {
    test('should return groups for a university', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_GROUP_ID,
            university_id: TEST_UNIVERSITY_ID,
            name: '새내기 Q&A',
            category: 'freshman',
            type: 'default',
            is_public: true,
            member_count: 15,
            university_name: '서울대학교',
          },
          {
            id: '990e8400-e29b-41d4-a716-446655440001',
            university_id: TEST_UNIVERSITY_ID,
            name: '자유게시판',
            category: 'general',
            type: 'default',
            is_public: true,
            member_count: 30,
            university_name: '서울대학교',
          },
        ],
      });

      const res = await request(app).get(
        `/api/groups?universityId=${TEST_UNIVERSITY_ID}`
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.groups).toHaveLength(2);
    });

    test('should require universityId', async () => {
      const res = await request(app).get('/api/groups');

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/groups/my', () => {
    test('should return user groups', async () => {
      const token = generateToken();

      query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_GROUP_ID,
            name: '새내기 Q&A',
            category: 'freshman',
            role: 'member',
            university_name: '서울대학교',
            last_message: 'Hello!',
            last_message_at: new Date(),
          },
        ],
      });

      const res = await request(app)
        .get('/api/groups/my')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.groups).toHaveLength(1);
      expect(res.body.groups[0].role).toBe('member');
    });
  });

  describe('POST /api/groups', () => {
    test('should create a custom group', async () => {
      const token = generateToken();

      // Mock Group.create
      query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_GROUP_ID,
            university_id: TEST_UNIVERSITY_ID,
            name: 'Study Group',
            description: 'A study group',
            category: 'study',
            type: 'custom',
            is_public: true,
            member_count: 0,
            created_by: TEST_USER_ID,
            created_at: new Date(),
          },
        ],
      });
      // Mock GroupMember.join (creator auto-join)
      query.mockResolvedValueOnce({
        rows: [{ id: 'gm-1', group_id: TEST_GROUP_ID, user_id: TEST_USER_ID, role: 'admin' }],
      });
      // Mock incrementMemberCount
      query.mockResolvedValueOnce({ rows: [] });
      // Mock findOrCreateForGroup - no existing
      query.mockResolvedValueOnce({ rows: [] });
      // Mock insert conversation
      query.mockResolvedValueOnce({
        rows: [{ id: TEST_CONVERSATION_ID, group_id: TEST_GROUP_ID }],
      });

      const res = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Study Group',
          description: 'A study group',
          universityId: TEST_UNIVERSITY_ID,
          category: 'study',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.group.name).toBe('Study Group');
    });
  });

  describe('POST /api/groups/:id/join', () => {
    test('should join a group', async () => {
      const token = generateToken();

      // Mock Group.findById
      query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_GROUP_ID,
            name: '새내기 Q&A',
            member_count: 10,
          },
        ],
      });
      // Mock isMember - not a member
      query.mockResolvedValueOnce({ rows: [] });
      // Mock GroupMember.join
      query.mockResolvedValueOnce({
        rows: [{ id: 'gm-2', group_id: TEST_GROUP_ID, user_id: TEST_USER_ID, role: 'member' }],
      });
      // Mock incrementMemberCount
      query.mockResolvedValueOnce({ rows: [] });
      // Mock findOrCreateForGroup - existing
      query.mockResolvedValueOnce({
        rows: [{ id: TEST_CONVERSATION_ID, group_id: TEST_GROUP_ID }],
      });

      const res = await request(app)
        .post(`/api/groups/${TEST_GROUP_ID}/join`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('should reject if already a member', async () => {
      const token = generateToken();

      // Mock Group.findById
      query.mockResolvedValueOnce({
        rows: [{ id: TEST_GROUP_ID, name: '새내기 Q&A' }],
      });
      // Mock isMember - already a member
      query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });

      const res = await request(app)
        .post(`/api/groups/${TEST_GROUP_ID}/join`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe('Already a member');
    });
  });

  describe('DELETE /api/groups/:id/leave', () => {
    test('should leave a group', async () => {
      const token = generateToken();

      // Mock GroupMember.leave
      query.mockResolvedValueOnce({
        rows: [{ id: 'gm-1', group_id: TEST_GROUP_ID, user_id: TEST_USER_ID }],
      });
      // Mock decrementMemberCount
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .delete(`/api/groups/${TEST_GROUP_ID}/leave`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('should return 404 if not a member', async () => {
      const token = generateToken();

      // Mock GroupMember.leave - no rows
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .delete(`/api/groups/${TEST_GROUP_ID}/leave`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Not a member');
    });
  });

  describe('GET /api/groups/:id/members', () => {
    test('should return group members', async () => {
      const token = generateToken();

      query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_USER_ID,
            name: 'Alice',
            profile_image_url: null,
            language_code: 'ko',
            role: 'admin',
            joined_at: new Date(),
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            name: 'Bob',
            profile_image_url: null,
            language_code: 'en',
            role: 'member',
            joined_at: new Date(),
          },
        ],
      });

      const res = await request(app)
        .get(`/api/groups/${TEST_GROUP_ID}/members`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.members).toHaveLength(2);
    });
  });

  describe('POST /api/groups/:id/announcement', () => {
    test('should send announcement with translations', async () => {
      const token = generateToken();

      // Mock isMember
      query.mockResolvedValueOnce({ rows: [{ '1': 1 }] });
      // Mock getMemberLanguages
      query.mockResolvedValueOnce({
        rows: [{ language_code: 'ko' }, { language_code: 'en' }, { language_code: 'ja' }],
      });
      // Mock findOrCreateForGroup - existing
      query.mockResolvedValueOnce({
        rows: [{ id: TEST_CONVERSATION_ID, group_id: TEST_GROUP_ID }],
      });
      // Mock Message.create
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 'msg-ann-1',
            conversation_id: TEST_CONVERSATION_ID,
            sender_id: TEST_USER_ID,
            original_text: '공지사항입니다',
            translated_texts: { en: 'This is an announcement', ja: 'お知らせです' },
            created_at: new Date(),
          },
        ],
      });
      // Mock update is_announcement
      query.mockResolvedValueOnce({ rows: [] });
      // Mock updateLastMessage
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post(`/api/groups/${TEST_GROUP_ID}/announcement`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: '공지사항입니다', senderLang: 'ko' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message.is_announcement).toBe(true);
      expect(res.body.message.original_text).toBe('공지사항입니다');
    });

    test('should reject announcement from non-member', async () => {
      const token = generateToken();

      // Mock isMember - not a member
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post(`/api/groups/${TEST_GROUP_ID}/announcement`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: '공지사항입니다', senderLang: 'ko' });

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('Not a group member');
    });
  });
});
