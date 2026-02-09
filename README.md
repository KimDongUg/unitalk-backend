# UniTalk Backend

실시간 번역 메신저 앱의 백엔드 API 서버입니다.

## Tech Stack

- **Runtime**: Node.js + Express
- **Realtime**: Socket.io
- **Database**: PostgreSQL
- **Cache**: Redis
- **Auth**: JWT + SMS OTP (Twilio)
- **Translation**: Google Cloud Translate API
- **Push**: Firebase Cloud Messaging (FCM)

## Project Structure

```
src/
├── config/          # DB, Redis, 환경변수 설정
├── controllers/     # API 요청 처리
├── middleware/       # JWT 인증, Rate Limiting, 에러 처리
├── models/          # DB 쿼리 (User, Conversation, Message)
├── routes/          # Express 라우트 정의
├── services/        # 번역, SMS, 푸시, 캐시 서비스
├── socket/          # Socket.io 실시간 메시징
├── utils/           # 로거, 입력 검증
└── app.js           # 엔트리 포인트
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- (선택) Docker & Docker Compose

### Installation

```bash
git clone https://github.com/<your-username>/unitalk-backend.git
cd unitalk-backend
npm install
```

### Environment Variables

`.env.example`을 복사하여 `.env` 파일을 생성합니다.

```bash
cp .env.example .env
```

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | 서버 포트 (기본: 3000) | No |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | PostgreSQL 접속 정보 | Yes |
| `REDIS_HOST` / `REDIS_PORT` | Redis 접속 정보 | Yes |
| `JWT_SECRET` | JWT 서명 키 | Yes |
| `GOOGLE_API_KEY` | Google Translate API 키 | No (dev fallback) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | Twilio SMS 설정 | No (dev fallback) |
| `FIREBASE_PROJECT_ID` / `FIREBASE_PRIVATE_KEY` / `FIREBASE_CLIENT_EMAIL` | FCM 푸시 설정 | No (dev fallback) |

> 개발 모드에서는 외부 API 키 없이도 작동합니다. OTP는 콘솔에 출력되고, 번역은 원문을 반환합니다.

### Database Setup

**Option A: Docker (권장)**

```bash
docker compose up -d    # PostgreSQL + Redis 실행
npm run migrate         # 테이블 생성
npm run seed            # 테스트 데이터 삽입
```

**Option B: 로컬 설치**

PostgreSQL과 Redis를 직접 설치한 후:

```bash
npm run migrate
npm run seed
```

### Running

```bash
# 개발 모드 (nodemon)
npm run dev

# 프로덕션
npm start
```

서버가 `http://localhost:3000`에서 실행됩니다.

## API Endpoints

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/send-otp` | SMS OTP 발송 |
| POST | `/api/auth/verify-otp` | OTP 검증 + JWT 토큰 발급 |

### Users

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users/me` | 내 프로필 조회 |
| PUT | `/api/users/me` | 프로필 수정 (이름, 언어) |
| POST | `/api/users/me/fcm-token` | FCM 토큰 등록 |

### Contacts

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/contacts/sync` | 연락처 동기화 (전화번호 매칭) |
| GET | `/api/contacts/friends` | 친구 목록 조회 |

### Messages

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/messages/conversations` | 대화방 목록 조회 |
| GET | `/api/messages/:conversationId` | 메시지 조회 (페이지네이션) |
| POST | `/api/messages/read` | 읽음 처리 |

### Socket.io Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `authenticate` | Client -> Server | JWT 토큰으로 소켓 인증 |
| `send_message` | Client -> Server | 메시지 전송 (자동 번역) |
| `typing` | Client -> Server | 타이핑 표시 |
| `mark_read` | Client -> Server | 읽음 처리 |
| `new_message` | Server -> Client | 새 메시지 수신 |
| `message_sent` | Server -> Client | 전송 확인 |
| `messages_read` | Server -> Client | 읽음 알림 |
| `friend_online` / `friend_offline` | Server -> Client | 온라인 상태 알림 |

## Testing

```bash
# Jest 단위 테스트
npm test

# 수동 API 테스트 (서버 실행 중일 때)
node tests/manual-api-test.js
```

## Deployment

PM2를 사용한 프로덕션 배포:

```bash
npm install -g pm2
pm2 start ecosystem.config.js --env production
```

## License

MIT
