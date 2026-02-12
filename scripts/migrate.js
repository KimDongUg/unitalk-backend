const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'unitalk_dev',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
};

if (process.env.DB_SSL === 'true') {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

const migrations = [
  {
    name: '001_create_users',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone VARCHAR(20) UNIQUE NOT NULL,
        phone_hash VARCHAR(64) NOT NULL,
        name VARCHAR(100),
        profile_image_url TEXT,
        language_code VARCHAR(10) DEFAULT 'en',
        fcm_token TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON users(phone_hash);
    `,
  },
  {
    name: '002_create_contacts',
    sql: `
      CREATE TABLE IF NOT EXISTS contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        contact_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, contact_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
    `,
  },
  {
    name: '003_create_conversations',
    sql: `
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user1_id UUID REFERENCES users(id) ON DELETE CASCADE,
        user2_id UUID REFERENCES users(id) ON DELETE CASCADE,
        last_message_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user1_id, user2_id)
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_users ON conversations(user1_id, user2_id);
    `,
  },
  {
    name: '004_create_messages',
    sql: `
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
        original_text TEXT NOT NULL,
        original_language VARCHAR(10),
        translated_texts JSONB,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
    `,
  },
  {
    name: '005_create_migrations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      );
    `,
  },
  {
    name: '006_add_sender_language_to_messages',
    sql: `
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_language VARCHAR(10);
    `,
  },
  {
    name: '007_add_target_language_to_users',
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS target_language VARCHAR(10);
    `,
  },
  {
    name: '008_create_universities',
    sql: `
      CREATE TABLE IF NOT EXISTS universities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        name_en VARCHAR(200),
        domain VARCHAR(100),
        country VARCHAR(10) DEFAULT 'KR',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_universities_country ON universities(country);
      CREATE INDEX IF NOT EXISTS idx_universities_name ON universities(name);
    `,
  },
  {
    name: '009_alter_users_for_v2',
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES universities(id);
      ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_unique ON users(name) WHERE name IS NOT NULL;
    `,
  },
  {
    name: '010_create_groups',
    sql: `
      CREATE TABLE IF NOT EXISTS groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        university_id UUID REFERENCES universities(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        category VARCHAR(50) DEFAULT 'general',
        type VARCHAR(20) DEFAULT 'default',
        is_public BOOLEAN DEFAULT true,
        member_count INTEGER DEFAULT 0,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_groups_university ON groups(university_id);
      CREATE INDEX IF NOT EXISTS idx_groups_category ON groups(category);
    `,
  },
  {
    name: '011_create_group_members',
    sql: `
      CREATE TABLE IF NOT EXISTS group_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(group_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
    `,
  },
  {
    name: '012_alter_conversations_for_groups',
    sql: `
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE CASCADE;
      ALTER TABLE conversations ALTER COLUMN user1_id DROP NOT NULL;
      ALTER TABLE conversations ALTER COLUMN user2_id DROP NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_conversations_group ON conversations(group_id);
    `,
  },
  {
    name: '013_add_announcement_to_messages',
    sql: `
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_announcement BOOLEAN DEFAULT false;
    `,
  },
  {
    name: '014_seed_universities',
    sql: `
      INSERT INTO universities (name, name_en, domain, country) VALUES
        ('서울대학교', 'Seoul National University', 'snu.ac.kr', 'KR'),
        ('연세대학교', 'Yonsei University', 'yonsei.ac.kr', 'KR'),
        ('고려대학교', 'Korea University', 'korea.ac.kr', 'KR'),
        ('카이스트', 'KAIST', 'kaist.ac.kr', 'KR'),
        ('포항공과대학교', 'POSTECH', 'postech.ac.kr', 'KR'),
        ('성균관대학교', 'Sungkyunkwan University', 'skku.edu', 'KR'),
        ('한양대학교', 'Hanyang University', 'hanyang.ac.kr', 'KR'),
        ('중앙대학교', 'Chung-Ang University', 'cau.ac.kr', 'KR'),
        ('경희대학교', 'Kyung Hee University', 'khu.ac.kr', 'KR'),
        ('한국외국어대학교', 'Hankuk University of Foreign Studies', 'hufs.ac.kr', 'KR'),
        ('서강대학교', 'Sogang University', 'sogang.ac.kr', 'KR'),
        ('이화여자대학교', 'Ewha Womans University', 'ewha.ac.kr', 'KR'),
        ('건국대학교', 'Konkuk University', 'konkuk.ac.kr', 'KR'),
        ('동국대학교', 'Dongguk University', 'dongguk.edu', 'KR'),
        ('홍익대학교', 'Hongik University', 'hongik.ac.kr', 'KR'),
        ('국민대학교', 'Kookmin University', 'kookmin.ac.kr', 'KR'),
        ('숭실대학교', 'Soongsil University', 'ssu.ac.kr', 'KR'),
        ('세종대학교', 'Sejong University', 'sejong.ac.kr', 'KR'),
        ('광운대학교', 'Kwangwoon University', 'kw.ac.kr', 'KR'),
        ('명지대학교', 'Myongji University', 'mju.ac.kr', 'KR'),
        ('부산대학교', 'Pusan National University', 'pusan.ac.kr', 'KR'),
        ('경북대학교', 'Kyungpook National University', 'knu.ac.kr', 'KR'),
        ('전남대학교', 'Chonnam National University', 'jnu.ac.kr', 'KR'),
        ('충남대학교', 'Chungnam National University', 'cnu.ac.kr', 'KR'),
        ('전북대학교', 'Jeonbuk National University', 'jbnu.ac.kr', 'KR'),
        ('제주대학교', 'Jeju National University', 'jejunu.ac.kr', 'KR'),
        ('인하대학교', 'Inha University', 'inha.ac.kr', 'KR'),
        ('아주대학교', 'Ajou University', 'ajou.ac.kr', 'KR'),
        ('단국대학교', 'Dankook University', 'dankook.ac.kr', 'KR'),
        ('숙명여자대학교', 'Sookmyung Women''s University', 'sookmyung.ac.kr', 'KR'),
        ('東京大学', 'University of Tokyo', 'u-tokyo.ac.jp', 'JP'),
        ('京都大学', 'Kyoto University', 'kyoto-u.ac.jp', 'JP'),
        ('早稲田大学', 'Waseda University', 'waseda.jp', 'JP'),
        ('慶應義塾大学', 'Keio University', 'keio.ac.jp', 'JP'),
        ('大阪大学', 'Osaka University', 'osaka-u.ac.jp', 'JP'),
        ('北京大学', 'Peking University', 'pku.edu.cn', 'CN'),
        ('清华大学', 'Tsinghua University', 'tsinghua.edu.cn', 'CN'),
        ('复旦大学', 'Fudan University', 'fudan.edu.cn', 'CN'),
        ('National University of Singapore', 'National University of Singapore', 'nus.edu.sg', 'SG'),
        ('Nanyang Technological University', 'Nanyang Technological University', 'ntu.edu.sg', 'SG')
      ON CONFLICT DO NOTHING;
    `,
  },
  {
    name: '015_seed_default_groups',
    sql: `
      INSERT INTO groups (university_id, name, description, category, type, is_public)
      SELECT u.id, '새내기 Q&A / Freshman Q&A', '신입생 질문 및 답변 / Questions and answers for new students', 'freshman', 'default', true
      FROM universities u
      ON CONFLICT DO NOTHING;

      INSERT INTO groups (university_id, name, description, category, type, is_public)
      SELECT u.id, '생활/행정 / Campus Life', '캠퍼스 생활 및 행정 정보 / Campus life and administrative info', 'life', 'default', true
      FROM universities u
      ON CONFLICT DO NOTHING;

      INSERT INTO groups (university_id, name, description, category, type, is_public)
      SELECT u.id, '팀플/연구 / Study & Research', '팀 프로젝트 및 연구 모집 / Team projects and research recruitment', 'study', 'default', true
      FROM universities u
      ON CONFLICT DO NOTHING;

      INSERT INTO groups (university_id, name, description, category, type, is_public)
      SELECT u.id, '자유게시판 / Free Board', '자유로운 대화 / Free discussion', 'general', 'default', true
      FROM universities u
      ON CONFLICT DO NOTHING;
    `,
  },
  {
    name: '016_seed_hannam_university',
    sql: `
      INSERT INTO universities (name, name_en, domain, country)
      VALUES ('한남대학교', 'Hannam University', 'hnu.kr', 'KR')
      ON CONFLICT DO NOTHING;

      INSERT INTO groups (university_id, name, description, category, type, is_public)
      SELECT u.id, '새내기 Q&A / Freshman Q&A', '신입생 질문 및 답변 / Questions and answers for new students', 'freshman', 'default', true
      FROM universities u WHERE u.domain = 'hnu.kr'
      ON CONFLICT DO NOTHING;

      INSERT INTO groups (university_id, name, description, category, type, is_public)
      SELECT u.id, '생활/행정 / Campus Life', '캠퍼스 생활 및 행정 정보 / Campus life and administrative info', 'life', 'default', true
      FROM universities u WHERE u.domain = 'hnu.kr'
      ON CONFLICT DO NOTHING;

      INSERT INTO groups (university_id, name, description, category, type, is_public)
      SELECT u.id, '팀플/연구 / Study & Research', '팀 프로젝트 및 연구 모집 / Team projects and research recruitment', 'study', 'default', true
      FROM universities u WHERE u.domain = 'hnu.kr'
      ON CONFLICT DO NOTHING;

      INSERT INTO groups (university_id, name, description, category, type, is_public)
      SELECT u.id, '자유게시판 / Free Board', '자유로운 대화 / Free discussion', 'general', 'default', true
      FROM universities u WHERE u.domain = 'hnu.kr'
      ON CONFLICT DO NOTHING;
    `,
  },
  {
    name: '017_create_user_devices',
    sql: `
      CREATE TABLE IF NOT EXISTS user_devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_type VARCHAR(10) NOT NULL CHECK (device_type IN ('mobile', 'pc', 'tablet')),
        device_name VARCHAR(100),
        device_token VARCHAR(500),
        socket_id VARCHAR(100),
        is_online BOOLEAN DEFAULT false,
        last_active_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, device_type)
      );
      CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_devices_online ON user_devices(user_id, is_online);
    `,
  },
  {
    name: '018_add_message_source_device',
    sql: `
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS source_device VARCHAR(10) DEFAULT 'mobile';
    `,
  },
];

async function migrate() {
  const client = await pool.connect();

  try {
    // Ensure migrations table exists first
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      );
    `);

    for (const migration of migrations) {
      // Check if already executed
      const result = await client.query(
        'SELECT 1 FROM _migrations WHERE name = $1',
        [migration.name]
      );

      if (result.rows.length === 0) {
        console.log(`Running migration: ${migration.name}`);
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO _migrations (name) VALUES ($1)',
          [migration.name]
        );
        console.log(`  -> Done`);
      } else {
        console.log(`Skipping migration: ${migration.name} (already executed)`);
      }
    }

    console.log('\nAll migrations completed successfully!');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
