import { Hono } from 'hono';
import { db } from '../lib/db.js';
import { requireHatten } from '../middleware/auth.js';
import type { AuthVariables } from '../middleware/auth.js';
import type { Prisma, SessionStatus } from '@prisma/client';
import { assessCommand } from '../lib/dangerousCommand.js';

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

// --- 回答画面（§5.2 / §8 回答画面。Issue #3・#4） ---

// 会話履歴の1メッセージ分のDTO
interface MessageDTO {
  id: string;
  role: string; // USER | ASSISTANT | TOOL
  content: string;
  commandName: string | null; // コマンド系メッセージのみ
  toolCallId: string | null;
  approvalStatus: string | null; // コマンド承認状態（§5.4）
  // コマンド系メッセージの危険度警告（§5.4）。通常メッセージは null
  danger: { isDangerous: boolean; reasons: string[] } | null;
  createdAt: string;
}

// 回答画面用のセッション詳細DTO（キューカードDTO＋全メッセージ履歴）
interface SessionDetailDTO extends QueueSessionDTO {
  messages: MessageDTO[];
}

// 全メッセージを時系列で含めてセッションを取得するための include 定義
const withAllMessages = {
  messages: { orderBy: { createdAt: 'asc' as const } },
  _count: { select: { messages: true } },
};

type SessionWithAllMessages = Prisma.SessionGetPayload<{
  include: typeof withAllMessages;
}>;

function toDetailDTO(session: SessionWithAllMessages): SessionDetailDTO {
  const firstUserMessage = session.messages.find((m) => m.role === 'USER')?.content ?? '';
  return {
    id: session.id,
    queueStatus: toQueueStatus(session.status, session.assigneeId),
    status: session.status,
    source: session.source,
    title: session.title ?? toTitle(firstUserMessage),
    preview: firstUserMessage,
    topic: session.topic,
    assigneeId: session.assigneeId,
    assigneeName: session.assigneeName,
    requesterId: session.requesterId,
    messageCount: session._count.messages,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    messages: session.messages.map((m) => {
      // コマンド系メッセージ（commandName あり）のみ危険度を評価して載せる
      const danger = m.commandName
        ? (() => {
            const a = assessCommand(m.content);
            return { isDangerous: a.isDangerous, reasons: a.reasons };
          })()
        : null;
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        commandName: m.commandName,
        toolCallId: m.toolCallId,
        approvalStatus: m.approvalStatus,
        danger,
        createdAt: m.createdAt.toISOString(),
      };
    }),
  };
}

/**
 * GET /dashboard/sessions/:id
 * 回答画面用にセッション1件の詳細（会話履歴込み）を返す（§5.2）。
 */
dashboardRouter.get('/sessions/:id', async (c) => {
  const id = c.req.param('id');
  const session = await db.session.findUnique({
    where: { id },
    include: withAllMessages,
  });
  if (!session) {
    return c.json({ error: { message: 'セッションが見つかりません', type: 'not_found' } }, 404);
  }
  return c.json({ session: toDetailDTO(session) });
});

/**
 * POST /dashboard/sessions/:id/assign
 * 担当ロックを取得する（§5.2 重複回答防止・Issue #4）。
 * - 未担当なら自分を担当としてロック
 * - 既に自分が担当なら冪等に成功
 * - 他の先輩が担当中なら 409（重複回答防止）
 */
dashboardRouter.post('/sessions/:id/assign', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const session = await db.session.findUnique({ where: { id } });
  if (!session) {
    return c.json({ error: { message: 'セッションが見つかりません', type: 'not_found' } }, 404);
  }

  // 既に他の先輩が担当中なら弾く（自分自身の再取得は許可）
  if (session.assigneeId && session.assigneeId !== user.sub) {
    return c.json(
      {
        error: {
          message: `既に ${session.assigneeName ?? '他の先輩'} が対応中です`,
          type: 'conflict',
        },
      },
      409
    );
  }

  const updated = await db.session.update({
    where: { id },
    data: {
      assigneeId: user.sub,
      assigneeName: user.displayName ?? '先輩',
    },
    include: withAllMessages,
  });
  return c.json({ session: toDetailDTO(updated) });
});

/**
 * DELETE /dashboard/sessions/:id/assign
 * 担当ロックを解除する（自分が担当の場合のみ）。
 */
dashboardRouter.delete('/sessions/:id/assign', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const session = await db.session.findUnique({ where: { id } });
  if (!session) {
    return c.json({ error: { message: 'セッションが見つかりません', type: 'not_found' } }, 404);
  }
  // 他人のロックは解除させない
  if (session.assigneeId && session.assigneeId !== user.sub) {
    return c.json(
      { error: { message: '自分が担当していないセッションは解除できません', type: 'forbidden' } },
      403
    );
  }

  const updated = await db.session.update({
    where: { id },
    data: { assigneeId: null, assigneeName: null },
    include: withAllMessages,
  });
  return c.json({ session: toDetailDTO(updated) });
});

/**
 * POST /dashboard/sessions/:id/reply
 * テキスト回答を送信する（§5.2 回答フォーム＆ルーティング・Issue #3）。
 * - ASSISTANT メッセージとして保存し、セッションを COMPLETED にする
 *   → chatService のポーリングが検知し、正しい後輩のSSEストリームへ自動配信される（構造的ルーティング）
 * - 未担当なら回答者を自動的に担当としても記録する（§5.7 監査・紐付け）
 */
dashboardRouter.post('/sessions/:id/reply', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const body = await c.req.json().catch(() => null);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return c.json(
      { error: { message: '回答内容が空です', type: 'invalid_request' } },
      400
    );
  }

  const session = await db.session.findUnique({ where: { id } });
  if (!session) {
    return c.json({ error: { message: 'セッションが見つかりません', type: 'not_found' } }, 404);
  }

  // 担当ロック中の他の先輩による回答は弾く（§5.2 重複回答防止）。
  // 未担当なら回答者を自動的に担当として記録する。
  if (session.assigneeId && session.assigneeId !== user.sub) {
    return c.json(
      {
        error: {
          message: `既に ${session.assigneeName ?? '他の先輩'} が対応中です`,
          type: 'conflict',
        },
      },
      409
    );
  }

  // 回答を保存し、セッションを完了へ。未担当なら回答者を担当として記録する。
  const [, updated] = await db.$transaction([
    db.message.create({
      data: {
        sessionId: id,
        role: 'ASSISTANT',
        content,
      },
    }),
    db.session.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        assigneeId: session.assigneeId ?? user.sub,
        assigneeName: session.assigneeName ?? user.displayName ?? '先輩',
      },
      include: withAllMessages,
    }),
  ]);

  return c.json({ session: toDetailDTO(updated) });
});

// シェル種別 → OpenAI Tool Call 名の対応（既存の Discord 経路と揃える）
const SHELL_TO_TOOL: Record<string, string> = {
  bash: 'run_bash',
  sh: 'run_bash',
  zsh: 'run_bash',
  powershell: 'run_powershell',
  pwsh: 'run_powershell',
};

/**
 * POST /dashboard/sessions/:id/command
 * 先輩がダッシュボードから後輩のシェルでコマンドを実行させる（§5.2 コマンド送信）。
 * 安全設計（§5.4）:
 * - 承認状態 PENDING で保存し、後輩の承認まで実行されない前提でセッションを EXECUTING に
 * - 危険コマンドを検知して警告を返す（後輩の承認プロンプトでも再掲する）
 * - 担当ロックを尊重し、他の先輩が担当中なら 409
 */
dashboardRouter.post('/sessions/:id/command', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const body = await c.req.json().catch(() => null);
  const command = typeof body?.command === 'string' ? body.command.trim() : '';
  const shell = typeof body?.shell === 'string' ? body.shell.toLowerCase() : 'bash';
  if (!command) {
    return c.json({ error: { message: 'コマンドが空です', type: 'invalid_request' } }, 400);
  }
  const commandName = SHELL_TO_TOOL[shell] ?? 'run_bash';

  const session = await db.session.findUnique({ where: { id } });
  if (!session) {
    return c.json({ error: { message: 'セッションが見つかりません', type: 'not_found' } }, 404);
  }
  // 担当ロック中の他の先輩による送信は弾く（§5.2 重複防止）
  if (session.assigneeId && session.assigneeId !== user.sub) {
    return c.json(
      {
        error: { message: `既に ${session.assigneeName ?? '他の先輩'} が対応中です`, type: 'conflict' },
      },
      409
    );
  }

  // 危険コマンドの検知（§5.4）。ブロックはせず警告として返し、最終判断は後輩の承認に委ねる。
  const danger = assessCommand(command);

  const [, updated] = await db.$transaction([
    db.message.create({
      data: {
        sessionId: id,
        role: 'ASSISTANT',
        content: command,
        commandName,
        toolCallId: `call_${id.slice(0, 8)}_${session.updatedAt.getTime()}`,
        approvalStatus: 'PENDING', // 後輩の実行前承認を必須にする（§5.4）
      },
    }),
    db.session.update({
      where: { id },
      data: {
        status: 'EXECUTING',
        assigneeId: session.assigneeId ?? user.sub,
        assigneeName: session.assigneeName ?? user.displayName ?? '先輩',
      },
      include: withAllMessages,
    }),
  ]);

  return c.json({
    session: toDetailDTO(updated),
    danger: { isDangerous: danger.isDangerous, reasons: danger.reasons },
  });
});
