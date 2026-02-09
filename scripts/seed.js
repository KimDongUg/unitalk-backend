const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'unitalk_dev',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

function hashPhone(phone) {
  return crypto.createHash('sha256').update(phone).digest('hex');
}

const testUsers = [
  { phone: '+821011111111', name: 'Alice Kim', language_code: 'ko' },
  { phone: '+821022222222', name: 'Bob Park', language_code: 'en' },
  { phone: '+821033333333', name: 'Charlie Lee', language_code: 'ja' },
  { phone: '+14155551234', name: 'David Smith', language_code: 'en' },
  { phone: '+819012345678', name: 'Yuki Tanaka', language_code: 'ja' },
];

async function seed() {
  const client = await pool.connect();

  try {
    console.log('Seeding database with test data...\n');

    // Insert test users
    const userIds = [];
    for (const user of testUsers) {
      const result = await client.query(
        `INSERT INTO users (phone, phone_hash, name, language_code)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (phone) DO UPDATE SET name = $3
         RETURNING id, phone, name`,
        [user.phone, hashPhone(user.phone), user.name, user.language_code]
      );
      userIds.push(result.rows[0].id);
      console.log(`  User: ${result.rows[0].name} (${result.rows[0].phone}) -> ${result.rows[0].id}`);
    }

    // Create contact relationships (Alice <-> Bob, Alice <-> Charlie)
    await client.query(
      `INSERT INTO contacts (user_id, contact_user_id)
       VALUES ($1, $2), ($2, $1), ($1, $3), ($3, $1)
       ON CONFLICT DO NOTHING`,
      [userIds[0], userIds[1], userIds[2]]
    );
    console.log('\n  Contacts: Alice <-> Bob, Alice <-> Charlie');

    // Create a conversation between Alice and Bob
    const convResult = await client.query(
      `INSERT INTO conversations (user1_id, user2_id)
       VALUES ($1, $2)
       ON CONFLICT (user1_id, user2_id) DO UPDATE SET last_message_at = NOW()
       RETURNING id`,
      [userIds[0], userIds[1]]
    );
    const conversationId = convResult.rows[0].id;
    console.log(`\n  Conversation (Alice <-> Bob): ${conversationId}`);

    // Add sample messages
    const messages = [
      { sender: 0, text: '안녕하세요! 만나서 반갑습니다.', translations: { en: 'Hello! Nice to meet you.' } },
      { sender: 1, text: 'Nice to meet you too! How are you?', translations: { ko: '저도 만나서 반가워요! 어떻게 지내세요?' } },
      { sender: 0, text: '잘 지내고 있어요. 감사합니다!', translations: { en: "I'm doing well. Thank you!" } },
    ];

    for (const msg of messages) {
      await client.query(
        `INSERT INTO messages (conversation_id, sender_id, original_text, translated_texts)
         VALUES ($1, $2, $3, $4)`,
        [conversationId, userIds[msg.sender], msg.text, JSON.stringify(msg.translations)]
      );
    }
    console.log(`  Messages: ${messages.length} sample messages added`);

    console.log('\nSeed completed successfully!');
    console.log('\nTest credentials:');
    testUsers.forEach((u) => {
      console.log(`  ${u.name}: ${u.phone}`);
    });
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
