#!/bin/sh
set -e

cd /app/apps/api

# DATABASE_URLの存在確認
if [ -z "$DATABASE_URL" ]; then
  echo "❌ エラー: DATABASE_URL 環境変数が設定されていません！"
  echo "Render のダッシュボードの「Environment (環境変数)」設定で DATABASE_URL を登録してください。"
  exit 1
fi

# 起動時にデータベーススキーマ（Neon / PostgreSQL）を同期します
echo "Running prisma db push..."
npx prisma db push

# Hono サーバーと Discord Bot の同時起動
echo "Starting Hono and Discord Bot..."
npm run start
