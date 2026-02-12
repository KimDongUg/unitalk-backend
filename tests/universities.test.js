const request = require('supertest');

require('./setup');

const { query } = require('../src/config/database');
const { app } = require('../src/app');

const TEST_UNIVERSITY_ID = '880e8400-e29b-41d4-a716-446655440000';

describe('Universities API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/universities', () => {
    test('should return list of universities', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_UNIVERSITY_ID,
            name: '서울대학교',
            name_en: 'Seoul National University',
            domain: 'snu.ac.kr',
            country: 'KR',
            created_at: new Date(),
          },
          {
            id: '880e8400-e29b-41d4-a716-446655440001',
            name: '연세대학교',
            name_en: 'Yonsei University',
            domain: 'yonsei.ac.kr',
            country: 'KR',
            created_at: new Date(),
          },
        ],
      });

      const res = await request(app).get('/api/universities');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.universities).toHaveLength(2);
      expect(res.body.universities[0].name).toBe('서울대학교');
    });

    test('should filter universities by search', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_UNIVERSITY_ID,
            name: '서울대학교',
            name_en: 'Seoul National University',
            domain: 'snu.ac.kr',
            country: 'KR',
            created_at: new Date(),
          },
        ],
      });

      const res = await request(app).get('/api/universities?search=Seoul');

      expect(res.statusCode).toBe(200);
      expect(res.body.universities).toHaveLength(1);
    });

    test('should filter universities by country', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            id: '880e8400-e29b-41d4-a716-446655440010',
            name: '東京大学',
            name_en: 'University of Tokyo',
            domain: 'u-tokyo.ac.jp',
            country: 'JP',
            created_at: new Date(),
          },
        ],
      });

      const res = await request(app).get('/api/universities?country=JP');

      expect(res.statusCode).toBe(200);
      expect(res.body.universities[0].country).toBe('JP');
    });
  });

  describe('GET /api/universities/:id', () => {
    test('should return university with groups', async () => {
      // Mock findById
      query.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_UNIVERSITY_ID,
            name: '서울대학교',
            name_en: 'Seoul National University',
            domain: 'snu.ac.kr',
            country: 'KR',
            created_at: new Date(),
          },
        ],
      });

      // Mock findByUniversityId (groups)
      query.mockResolvedValueOnce({
        rows: [
          {
            id: '990e8400-e29b-41d4-a716-446655440001',
            university_id: TEST_UNIVERSITY_ID,
            name: '새내기 Q&A',
            category: 'freshman',
            type: 'default',
            is_public: true,
            member_count: 10,
          },
        ],
      });

      const res = await request(app).get(`/api/universities/${TEST_UNIVERSITY_ID}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.university.name).toBe('서울대학교');
      expect(res.body.groups).toHaveLength(1);
    });

    test('should return 404 for non-existent university', async () => {
      query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get(`/api/universities/${TEST_UNIVERSITY_ID}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('University not found');
    });
  });
});
