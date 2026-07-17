import { Hono } from 'hono';
import { db } from '../lib/db.js';
import { requireHatten } from '../middleware/auth.js';
import type { AuthVariables } from '../middleware/auth.js';
import type { Prisma, SessionStatus } from '@prisma/client';

// 先輩ダッシュボード配下のAPI（§5.2 / §5.7）。
// キュー取得・担当ロック・回答送信などを束ねる。発展班（先輩）のみアクセス可。
export const dashboardRouter = new Hono<{ Variables: AuthVariables }>();

// このルーター配下はすべて発展班（先輩）限定
dashboardRouter.use('*', requireHatten);

// キュー画面の3分類（§8: 未対応 / 対応中 / 完了）
type QueueStatus = 'WAITING' | 'IN_PROGRESS' | 'COMPLETED';

// 完了タブに載せる履歴の上限（部内ツールのため直近のみで十分）
const COMPLETED_LIMIT = 50;
// カードの要約に使う本文の最大文字数
const TITLE_MAX_LENGTH = 60;

// キューカード1件分のDTO（フロントの表示に必要な最小限）
interface QueueSessionDTO {
  id: string;
  queueStatus: QueueStatus;
  status: SessionStatus;
  source: string;
  title: string; // 見出し（session.title、無ければ最初の質問から生成）
  preview: string; // 最初の質問の抜粋
  topic: string | null; // 言語・技術（自動ルーティング未実装のため現状は null が多い）
  assigneeId: string | null;
  assigneeName: string | null;
  requesterId: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

// セッションのステータスを、キュー画面の3分類へ写像する。
// - 完了/エラー → COMPLETED（終了系）
// - 実行中、または担当者が付いている → IN_PROGRESS（対応中）
// - それ以外（WAITING / OPEN） → WAITING（未対応）
function toQueueStatus(status: SessionStatus, assigneeId: string | null): QueueStatus {
  if (status === 'COMPLETED' || status === 'ERROR') return 'COMPLETED';
  if (status === 'EXECUTING' || assigneeId) return 'IN_PROGRESS';
  return 'WAITING';
}

// 本文の先頭行を指定文字数で切り詰めて見出し用の要約を作る
function toTitle(content: string): string {
  const firstLine = content.trim().split('\n')[0]?.trim() ?? '';
  if (firstLine.length <= TITLE_MAX_LENGTH) return firstLine || '（無題の質問）';
  return `${firstLine.slice(0, TITLE_MAX_LENGTH)}…`;
}

// 最初の（最も古い）ユーザー発言を含めてセッションを取得するための include 定義
const withFirstUserMessage = {
  messages: {
    where: { role: 'USER' as const },
    orderBy: { createdAt: 'asc' as const },
    take: 1,
  },
  _count: { select: { messages: true } },
};

type SessionWithFirstMessage = Prisma.SessionGetPayload<{
  include: typeof withFirstUserMessage;
}>;

function toDTO(session: SessionWithFirstMessage): QueueSessionDTO {
  const firstMessage = session.messages[0]?.content ?? '';
  return {
    id: session.id,
    queueStatus: toQueueStatus(session.status, session.assigneeId),
    status: session.status,
    source: session.source,
    title: session.title ?? toTitle(firstMessage),
    preview: firstMessage,
    topic: session.topic,
    assigneeId: session.assigneeId,
    assigneeName: session.assigneeName,
    requesterId: session.requesterId,
    messageCount: session._count.messages,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

/**
 * GET /dashboard/sessions
 * 質問キュー一覧を返す（§5.2 / §8）。
 * - 進行中（未対応・対応中）は全件、新着順
 * - 完了は直近 COMPLETED_LIMIT 件のみ
 * - counts は全ステータスの総数（フロントのバッジ表示用）
 */
dashboardRouter.get('/sessions', async (c) => {
  // 進行中（終了していない）セッション: 全件を新着順で
  const activeSessions = await db.session.findMany({
    where: { status: { in: ['WAITING', 'OPEN', 'EXECUTING'] } },
    orderBy: { createdAt: 'desc' },
    include: withFirstUserMessage,
  });

  // 完了・エラー: 直近のものだけ（更新順）
  const completedSessions = await db.session.findMany({
    where: { status: { in: ['COMPLETED', 'ERROR'] } },
    orderBy: { updatedAt: 'desc' },
    take: COMPLETED_LIMIT,
    include: withFirstUserMessage,
  });

  const activeDTOs = activeSessions.map(toDTO);
  const completedDTOs = completedSessions.map(toDTO);
  const sessions = [...activeDTOs, ...completedDTOs];

  // 完了の総数（表示上限 COMPLETED_LIMIT と無関係に本当の件数をバッジへ）
  const completedTotal = await db.session.count({
    where: { status: { in: ['COMPLETED', 'ERROR'] } },
  });

  // 未対応・対応中は進行中セッションを全件取得しているため、
  // 実際のカード分類（toQueueStatus）と同じ基準で数えてバッジと列の件数を一致させる。
  const counts = {
    waiting: activeDTOs.filter((s) => s.queueStatus === 'WAITING').length,
    inProgress: activeDTOs.filter((s) => s.queueStatus === 'IN_PROGRESS').length,
    completed: completedTotal,
  };

  return c.json({ sessions, counts });
});
