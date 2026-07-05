# Docker 実行・デプロイ ガイド

本システムは、コンテナ化によってバックエンド（API・Discord Bot）およびフロントエンド（Next.js Web アプリ）を簡単に起動・デプロイできるよう設計されています。

本ドキュメントでは、Docker および Docker Compose を用いた実行手順について解説します。

---

## 🏗️ 構成と対象ファイル

- **Dockerfile**: ルートにある `Dockerfile` は、マルチステージビルドに対応しており、ビルド時のターゲット（`api` または `web`）を指定することで、バックエンドとフロントエンドを切り替えてビルドできます。
- **docker-compose.yml**: 開発環境などで両サービスを一括・個別管理するための設定ファイルです。

---

## 🔑 事前準備: 環境変数の設定

バックエンドの実行には、Neon データベースや Discord Bot の接続情報が必要です。
`apps/api/.env` ファイルを用意し、以下の環境変数を適切に設定してください。

```ini
# Neon (PostgreSQL) 接続URL
DATABASE_URL="postgresql://username:password@hostname/dbname?sslmode=require"

# Discord Bot 設定
DISCORD_TOKEN="YOUR_DISCORD_BOT_TOKEN"
DISCORD_CLIENT_ID="YOUR_DISCORD_CLIENT_ID"
DISCORD_CHANNEL_ID="YOUR_DISCORD_CHANNEL_ID"
```

---

## 🚀 実行手順 1: Docker Compose を使用する場合（推奨）

Docker Compose を利用すると、ビルドターゲットや環境変数、ポートマップの設定が自動で適用されるため、最も簡単な実行方法です。

### 1. バックエンド（API + Discord Bot）の起動
```bash
docker compose up api --build -d
```
- ポート `7070` で起動します。
- `apps/api/.env` の値が自動的に読み込まれます。

### 2. フロントエンド（Next.js）の起動
```bash
docker compose up web --build -d
```
- ポート `3000` で起動します。

### 3. 両方のサービスを一括起動
```bash
docker compose up --build -d
```

### 4. 停止とログ確認
- ログの監視: `docker compose logs -f`
- サービスの停止: `docker compose down`

---

## 🐳 実行手順 2: Docker コマンド単体を使用する場合

クラウドへの個別デプロイなど、Docker 単体で実行する場合は以下の手順を行います。

### バックエンド (API)
```bash
# ビルド
docker build --target api -t llm-senpai-api .

# 起動
docker run -d -p 7070:7070 --env-file apps/api/.env --name llm-senpai-api-container llm-senpai-api
```

### フロントエンド (Web)
```bash
# ビルド
docker build --target web -t llm-senpai-web .

# 起動
docker run -d -p 3000:3000 --name llm-senpai-web-container llm-senpai-web
```

---

## 🛠️ トラブルシューティング

### Q. 起動時に「DATABASE_URL が設定されていません」と表示される
- コンテナ起動時に環境変数が正しく渡されているか確認してください。
- `docker run` の場合は `--env-file apps/api/.env` オプションが付いているか、Docker Compose の場合は `apps/api/.env` が正しい位置に存在するか確認してください。

### Q. Prisma のマイグレーションでエラーが出る
- `DATABASE_URL` に設定されている Neon データベースへのネットワーク接続（インターネット環境、セキュリティグループ、SSL設定など）を確認してください。
- コンテナ内の起動スクリプト（`apps/api/start.sh`）で自動的に `prisma db push` が走ります。
