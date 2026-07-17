# AGENTS.md — LLMSenpai（Human as LLM）

AIコーディングエージェント向けのプロジェクトガイドです。詳細は `docs/` 配下の各ドキュメントを参照してください。

## プロジェクト概要

「人に質問する心理的ハードルを消すツール」。後輩（プログラミング初心者）が Web UI や AIエディタ（Cursor / Copilot 等）から LLM に質問しているように見えるが、裏側では**人間の先輩がリアルタイムに回答する**システム。

- 対象: クローズドな部活動内ツール（部外非公開・活動時間中のみ運用）。SaaS化・24時間対応は非目標。
- 後輩 = ギルドロール `@基礎班`（質問側）、先輩 = `@発展班`（回答側・ダッシュボード利用可）。
- Q&Aデータは将来のLLMファインチューニング用資産として蓄積する。
- 正典となる要件定義: **`docs/specification.md`**（v2.1）。変更時はこのファイルも更新すること。

## アーキテクチャ（v2: ハイブリッド構成）

```
後輩 (Web UI / OpenAI互換API)
  → バックエンド (Hono) → DB (PostgreSQL/Prisma)
  → Discord へ「新着通知＋ダッシュボードリンク」のみ投稿
先輩 → Webダッシュボードで回答 → 後輩へ SSE ストリーミング配信
```

- **Discord は通知チャネルに降格**（v1の「スレッド内リプライを回答として検知する」経路は段階的に廃止予定。現状のコードにはまだ残っている）。
- OpenAI互換API (`POST /v1/chat/completions`) は SSE で Keep-Alive チャンクを送りタイムアウトを防止（2秒間隔DBポーリング／最大5分待機）。
- 先輩が後輩のシェルでコマンドを実行させる Tool Call 機能あり。**後輩側の実行前承認・危険コマンド警告・実行ログ保存（role=TOOL）は必須の安全要件**（RCE対策、`docs/specification.md` §5.4）。
- 認証・認可（v2.1・未着手）: Discord OAuth2（scope は `identify` のみ）＋ Bot によるギルド所属・ロール照会。ダッシュボード配下APIは発展班のみ許可。

## リポジトリ構成（npm workspaces モノレポ）

```
apps/api/   バックエンド: Node.js + Hono + discord.js + Prisma（実装済み）
  src/index.ts              エントリポイント
  src/routes/chat.ts        OpenAI互換API
  src/discord/              Bot（クライアント・ハンドラ・先輩サービス）
  src/services/chatService.ts
  prisma/                   スキーマ（Session / Message モデル）
apps/web/   フロントエンド: Next.js + React + Tailwind CSS 4（雛形のみ）
docs/       specification.md（要件定義）/ ROADMAP.md / usage_guide.md / docker_guide.md
ui/         web_llm_ui.pen（Pencilデザイン。Read/Grep禁止 — pencil MCPツールでのみ操作）
```

## 開発コマンド

```bash
# バックエンド（ポート 7070）
npm run dev -w api        # tsx watch
npm run build -w api      # tsc
npm run start -w api      # node dist/index.js

# フロントエンド（ポート 3000）
npm run dev -w web
npm run lint -w web

# Docker（詳細は docs/docker_guide.md）
docker compose up api --build -d
docker compose up web --build -d
```

- 環境変数は `apps/api/.env` に置く: `DATABASE_URL`（Neon PostgreSQL）, `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CHANNEL_ID`。
- コンテナ起動時は `apps/api/start.sh` が `prisma db push` を自動実行する。
- Formatter は Prettier（ルート devDependency）。

## データモデル（`apps/api/prisma/`）

- **Session**: `id` / `source(WEB|API)` / `discordThreadId` / `status(OPEN|WAITING|EXECUTING|COMPLETED|ERROR)` / `messages[]`
- **Message**: `id` / `sessionId` / `role(USER|ASSISTANT|TOOL)` / `content` / `toolCallId` / `commandName` / `discordMessageId` / `createdAt`
- v2で追加予定: Session に `assigneeId`（担当ロック）/ `requesterId` / `title` / `topic`、Message に `approvalStatus`、認証用 `User` モデル（`discordUserId` / `role: KISO|HATTEN` 等）。詳細は `docs/specification.md` §7。

## 現在の開発状況と優先順位（specification.md §9）

実装済み: OpenAI互換API＋SSE、Discord Bot（スレッド回答方式）、Prisma スキーマ。
未着手・進行中（優先度順）:

0. **認証・認可基盤**（Discord OAuth2 ＋ 部員/ロール判定）— 最優先
1. データモデル拡張（担当ロック・コマンド承認状態・User モデル）
2. 先輩ダッシュボード: 質問キュー画面（リアルタイム一覧）
3. 先輩ダッシュボード: 回答フォーム & ルーティング
4. 先輩ダッシュボード: 担当ロック（重複回答防止）
5. コマンド実行の後輩側承認フロー（安全設計・必須）
6. Discord連携をハイブリッド通知へ移行
7. （任意）LLM下書き支援 / 過去Q&A参照

## 作業上の注意

- ドキュメント・コミットメッセージ・UI文言は**日本語**で書く。
- ブランチ: `develop` から作業ブランチを切って作業し、PR先は `develop`。
- 仕様に影響する変更をしたら `docs/specification.md` の変更履歴を更新する。
- ダッシュボードUIは `ui/web_llm_ui.pen` のトーン＆マナーに揃える（キュー画面・回答画面・完了/履歴画面の3ビュー、§8）。
- ユーザーのUIは `ui/web_user_ui.pen` のトーン＄マナーに揃える
- コマンド実行機能に触れる際は §5.4 の安全要件（実行前承認・警告・監査ログ）を必ず維持する。
- デプロイ先: Render（バックエンド）。`PORT` 環境変数を読み `0.0.0.0` にバインドする実装になっている点に注意。
