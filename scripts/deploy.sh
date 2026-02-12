#!/bin/bash

# === UniTalk 안전 배포 스크립트 ===
# 가이드: UniTalk_AWS_Safe_Deploy_Guide.pdf
# 사용법: bash /home/ubuntu/scripts/deploy.sh

set -e  # 에러 발생 시 즉시 중단

PROJECT_DIR=/home/ubuntu/unitalk
BACKUP_DIR=/home/ubuntu/backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 백업 디렉토리 확인
mkdir -p $BACKUP_DIR

echo ""
echo "============================================"
echo "  UniTalk 안전 배포 시작 ($TIMESTAMP)"
echo "============================================"
echo ""

echo "=== [1/7] .env 백업 ==="
if [ -f "$PROJECT_DIR/.env" ]; then
  cp $PROJECT_DIR/.env $BACKUP_DIR/.env.backup.$TIMESTAMP
  echo "  -> .env 백업 완료: $BACKUP_DIR/.env.backup.$TIMESTAMP"
else
  echo "  -> .env 파일 없음 (건너뜀)"
fi

echo ""
echo "=== [2/7] DB 백업 ==="
# RDS 사용 시 환경변수에서 DB 정보 읽기
if [ -f "$PROJECT_DIR/.env" ]; then
  source <(grep -E '^DB_' $PROJECT_DIR/.env | sed 's/^/export /')
fi
DB_HOST_VAL=${DB_HOST:-localhost}
DB_PORT_VAL=${DB_PORT:-5432}
DB_NAME_VAL=${DB_NAME:-unitalk_dev}
DB_USER_VAL=${DB_USER:-postgres}

if PGPASSWORD=$DB_PASSWORD pg_dump -h $DB_HOST_VAL -p $DB_PORT_VAL -U $DB_USER_VAL -d $DB_NAME_VAL > $BACKUP_DIR/db.$TIMESTAMP.sql 2>/dev/null; then
  echo "  -> DB 백업 완료: $BACKUP_DIR/db.$TIMESTAMP.sql"
else
  echo "  -> DB 백업 실패 (RDS 접근 불가할 수 있음, 계속 진행)"
fi

echo ""
echo "=== [3/7] 서버 로컬 변경사항 확인 ==="
cd $PROJECT_DIR
if [ -n "$(git status --porcelain)" ]; then
  echo "  ⚠️  서버에 수정된 파일이 있습니다:"
  git status --short
  echo "  stash로 임시 저장합니다..."
  git stash save "server-changes-$TIMESTAMP"
  echo "  -> stash 완료"
else
  echo "  -> 서버 로컬 변경사항 없음 (깨끗)"
fi

echo ""
echo "=== [4/7] GitHub에서 최신 코드 가져오기 ==="
git pull origin main
echo "  -> git pull 완료"

echo ""
echo "=== [5/7] 패키지 설치 ==="
npm install --production
echo "  -> npm install 완료"

echo ""
echo "=== [6/7] DB 마이그레이션 ==="
node scripts/migrate.js
echo "  -> 마이그레이션 완료"

echo ""
echo "=== [7/7] PM2 재시작 ==="
pm2 reload ecosystem.config.js --env production --update-env
echo "  -> PM2 재시작 완료"

echo ""
echo "============================================"
echo "  ✅ 배포 완료! ($TIMESTAMP)"
echo "  백업 위치: $BACKUP_DIR"
echo "============================================"
echo ""

# 서비스 상태 확인
echo "=== 서비스 상태 ==="
pm2 status
echo ""

# health check
sleep 3
echo "=== Health Check ==="
if curl -s http://localhost:3000/health | grep -q '"status":"ok"'; then
  echo "  ✅ 서버 정상 동작 확인"
else
  echo "  ⚠️  Health check 실패! 로그를 확인하세요:"
  echo "  pm2 logs unitalk-backend --lines 20"
  echo ""
  echo "  롤백 방법:"
  echo "  1. 코드 롤백: git log --oneline -5 → git checkout <이전커밋>"
  echo "  2. .env 복구: cp $BACKUP_DIR/.env.backup.$TIMESTAMP $PROJECT_DIR/.env"
  echo "  3. DB 롤백: psql -h $DB_HOST_VAL -U $DB_USER_VAL -d $DB_NAME_VAL < $BACKUP_DIR/db.$TIMESTAMP.sql"
  echo "  4. PM2 재시작: pm2 reload all --update-env"
fi
