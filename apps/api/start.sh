#!/bin/sh
set -e

cd /app/apps/api

# 起動時にデータベーススキーマ（Neon / PostgreSQL）を同期します
echo "Running prisma db push..."
npx prisma db push

# Hono サーバーと Discord Bot の同時起動
echo "Starting Hono and Discord Bot..."
npm run start
