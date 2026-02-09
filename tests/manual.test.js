/**
 * UniTalk API Manual Test Script
 *
 * 실행 방법: node tests/manual.test.js
 * 사전 조건: 서버가 localhost:3000에서 실행 중이어야 합니다.
 *
 * 순차적으로 다음 API를 테스트합니다:
 *  1. POST /api/auth/send-otp
 *  2. POST /api/auth/verify-otp
 *  3. GET  /api/users/me
 *  4. PUT  /api/users/me
 *  5. POST /api/contacts/sync
 */

const BASE_URL = 'http://localhost:3000';

let authToken = null;
let userId = null;
let passed = 0;
let failed = 0;

async function request(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, options);
  const data = await res.json();
  return { status: res.status, data };
}

function printResult(name, success, details = '') {
  const icon = success ? '[PASS]' : '[FAIL]';
  console.log(`  ${icon} ${name}${details ? ' - ' + details : ''}`);
  if (success) passed++;
  else failed++;
}

// =============================================================
// Test 1: POST /api/auth/send-otp
// =============================================================
async function testSendOtp() {
  console.log('\n1. POST /api/auth/send-otp');

  // 성공 케이스
  const res = await request('POST', '/api/auth/send-otp', {
    phone: '+821011111111',
  });
  printResult(
    'Valid phone number',
    res.status === 200 && res.data.success === true,
    `status=${res.status}, message=${res.data.message || res.data.error}`
  );

  // 실패 케이스: 잘못된 전화번호 형식
  const res2 = await request('POST', '/api/auth/send-otp', {
    phone: '01011111111',
  });
  printResult(
    'Invalid phone format rejected',
    res2.status === 400,
    `status=${res2.status}`
  );
}

// =============================================================
// Test 2: POST /api/auth/verify-otp
// =============================================================
async function testVerifyOtp() {
  console.log('\n2. POST /api/auth/verify-otp');

  // OTP 먼저 발송
  await request('POST', '/api/auth/send-otp', {
    phone: '+821011111111',
  });

  // 개발 모드에서 OTP는 콘솔에 출력됨 - Redis에서 직접 가져와야 함
  // 하지만 테스트 환경(NODE_ENV=test)이 아닌 개발 모드이므로 실제 OTP를 알 수 없음
  // Redis에서 OTP 확인
  const { createClient } = require('redis');
  const redisClient = createClient({ socket: { host: 'localhost', port: 6379 } });
  await redisClient.connect();
  const otp = await redisClient.get('otp:+821011111111');
  await redisClient.disconnect();

  if (!otp) {
    printResult('Verify OTP', false, 'Could not retrieve OTP from Redis');
    return;
  }

  console.log(`  (OTP from Redis: ${otp})`);

  // 성공 케이스
  const res = await request('POST', '/api/auth/verify-otp', {
    phone: '+821011111111',
    otp: otp,
  });
  printResult(
    'Valid OTP verification',
    res.status === 200 && res.data.token && res.data.user,
    `status=${res.status}, userId=${res.data.user?.id}`
  );

  if (res.data.token) {
    authToken = res.data.token;
    userId = res.data.user.id;
  }

  // 실패 케이스: 잘못된 OTP
  // 새 OTP 발급
  await request('POST', '/api/auth/send-otp', {
    phone: '+821011111111',
  });

  const res2 = await request('POST', '/api/auth/verify-otp', {
    phone: '+821011111111',
    otp: '000000',
  });
  printResult(
    'Invalid OTP rejected',
    res2.status === 400,
    `status=${res2.status}, error=${res2.data.error}`
  );
}

// =============================================================
// Test 3: GET /api/users/me
// =============================================================
async function testGetMe() {
  console.log('\n3. GET /api/users/me');

  // 성공 케이스
  const res = await request('GET', '/api/users/me', null, authToken);
  printResult(
    'Get current user profile',
    res.status === 200 && res.data.id === userId,
    `status=${res.status}, name=${res.data.name}, lang=${res.data.language_code}`
  );

  // 실패 케이스: 인증 없이
  const res2 = await request('GET', '/api/users/me');
  printResult(
    'No token rejected',
    res2.status === 401,
    `status=${res2.status}`
  );
}

// =============================================================
// Test 4: PUT /api/users/me
// =============================================================
async function testUpdateMe() {
  console.log('\n4. PUT /api/users/me');

  // 이름 + 언어 업데이트
  const res = await request(
    'PUT',
    '/api/users/me',
    { name: 'Alice Kim (Updated)', language_code: 'ko' },
    authToken
  );
  printResult(
    'Update name and language',
    res.status === 200 && res.data.success === true,
    `status=${res.status}, name=${res.data.user?.name}, lang=${res.data.user?.language_code}`
  );

  // 업데이트 확인
  const res2 = await request('GET', '/api/users/me', null, authToken);
  printResult(
    'Verify update persisted',
    res2.data.name === 'Alice Kim (Updated)' && res2.data.language_code === 'ko',
    `name=${res2.data.name}, lang=${res2.data.language_code}`
  );
}

// =============================================================
// Test 5: POST /api/contacts/sync
// =============================================================
async function testContactSync() {
  console.log('\n5. POST /api/contacts/sync');

  // 시드 데이터의 전화번호들로 동기화
  const res = await request(
    'POST',
    '/api/contacts/sync',
    {
      contacts: ['+821022222222', '+821033333333', '+14155551234', '+819012345678'],
    },
    authToken
  );
  printResult(
    'Sync contacts',
    res.status === 200 && res.data.friends && res.data.count > 0,
    `status=${res.status}, matched=${res.data.count} friends`
  );

  // 친구 목록 반환 확인
  if (res.data.friends) {
    const friendNames = res.data.friends.map((f) => f.name || f.phone).join(', ');
    printResult(
      'Friends data returned',
      res.data.friends.length > 0,
      `friends: [${friendNames}]`
    );
  }

  // GET /api/contacts/friends 확인
  const res2 = await request('GET', '/api/contacts/friends', null, authToken);
  printResult(
    'GET friends list',
    res2.status === 200 && res2.data.friends,
    `status=${res2.status}, count=${res2.data.friends?.length}`
  );
}

// =============================================================
// Main
// =============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('  UniTalk API Manual Test');
  console.log('  Server: ' + BASE_URL);
  console.log('='.repeat(60));

  // Health check
  try {
    const health = await request('GET', '/health');
    console.log(`\n  Health: ${health.data.status} (${health.data.timestamp})`);
  } catch (error) {
    console.error('\n  ERROR: Server is not running at ' + BASE_URL);
    console.error('  Start the server first: npm run dev');
    process.exit(1);
  }

  try {
    await testSendOtp();
    await testVerifyOtp();

    if (!authToken) {
      console.error('\n  ERROR: Authentication failed. Stopping tests.');
      process.exit(1);
    }

    await testGetMe();
    await testUpdateMe();
    await testContactSync();
  } catch (error) {
    console.error('\n  UNEXPECTED ERROR:', error.message);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main();
