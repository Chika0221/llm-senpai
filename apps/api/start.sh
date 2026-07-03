#!/bin/sh
set -e

# 起動時にデータベーススキーマ（Neon / PostgreSQL）を同期します
echo "Running prisma db push..."
npx prisma db push --schema=apps/api/prisma/schema.prisma

# Hono サーバーと Discord Bot の同時起動
echo "Starting Hono and Discord Bot..."
npm run start --workspace=apps/api
