import { Hono } from 'hono';
import { db } from '../lib/db.js';
import { requireMember } from '../middleware/auth.js';
import type { AuthVariables } from '../middleware/auth.js';
import { assessCommand } from '../lib/dangerousCommand.js';

// 後輩（質問者）側のコマンド実行 承認フロー API（§5.4 安全要件）。
// 部員全員（基礎班・発展班）がアクセス可。将来の後輩Web UI／エディタ連携が利用する。
//
// フロー:
//   先輩がコマンド送信 → Message(commandName, approvalStatus=PENDING) / Session=EXECUTING
//   → 後輩が pending-command を取得（危険警告つき）
//   → approve（承認）→ 実行 → result（結果を role=TOOL で監査保存）
//     または reject（拒否）→ 先輩へ差し戻し
export const kohaiRouter = new Hono<{ Variables: AuthVariables }>();

kohaiRouter.use('*', requireMember);

// 質問者本人以外の操作を防ぐ（requesterId が記録されている場合のみ適用）。
// requesterId 未記録のセッション（既存のAPI経由等）は暫定的に部員全員へ許可する。
function assertOwner(
  session: { requesterId: string | null },
  userSub: string
): boolean {
  if (session.requesterId && session.requesterId !== userSub) return false;
  return true;
}

// セッション内で「最後のコマンド系メッセージ」を取得する。
async function findLatestCommand(sessionId: string) {
  return db.message.findFirst({
    where: { sessionId, commandName: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * GET /kohai/sessions/:id/pending-command
 * 承認待ちのコマンドと危険警告を返す（後輩の承認プロンプト用）。
 * 承認待ちが無ければ pending: null。
 */
kohaiRouter.get('/sessions/:id/pending-command', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const session = await db.session.findUnique({ where: { id } });
  if (!session) {
    return c.json({ error: { message: 'セッションが見つかりません', type: 'not_found' } }, 404);
  }
  if (!assertOwner(session, user.sub)) {
    return c.json({ error: { message: '本人のセッションではありません', type: 'forbidden' } }, 403);
  }

  const cmd = await findLatestCommand(id);
  if (!cmd || cmd.approvalStatus !== 'PENDING') {
    return c.json({ pending: null });
  }

  const danger = assessCommand(cmd.content);
  return c.json({
    pending: {
      messageId: cmd.id,
      commandName: cmd.commandName,
      command: cmd.content,
      toolCallId: cmd.toolCallId,
      danger: { isDangerous: danger.isDangerous, reasons: danger.reasons },
      createdAt: cmd.createdAt.toISOString(),
    },
  });
});

/**
 * POST /kohai/sessions/:id/pending-command/approve
 * 後輩がコマンド実行を承認する（§5.4 実行前承認）。approvalStatus=APPROVED。
 * 実際の実行はクライアント側で行い、結果は result エンドポイントへ送る。
 */
kohaiRouter.post('/sessions/:id/pending-command/approve', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const session = await db.session.findUnique({ where: { id } });
  if (!session) {
    return c.json({ error: { message: 'セッションが見つかりません', type: 'not_found' } }, 404);
  }
  if (!assertOwner(session, user.sub)) {
    return c.json({ error: { message: '本人のセッションではありません', type: 'forbidden' } }, 403);
  }

  const cmd = await findLatestCommand(id);
  if (!cmd || cmd.approvalStatus !== 'PENDING') {
    return c.json({ error: { message: '承認待ちのコマンドがありません', type: 'invalid_state' } }, 409);
  }

  await db.message.update({ where: { id: cmd.id }, data: { approvalStatus: 'APPROVED' } });
  return c.json({ ok: true, messageId: cmd.id, approvalStatus: 'APPROVED' });
});

/**
 * POST /kohai/sessions/:id/pending-command/reject
 * 後輩がコマンド実行を拒否する（§5.4）。approvalStatus=REJECTED、
 * セッションは先輩の再対応待ち（WAITING）へ戻す。
 */
kohaiRouter.post('/sessions/:id/pending-command/reject', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const session = await db.session.findUnique({ where: { id } });
  if (!session) {
    return c.json({ error: { message: 'セッションが見つかりません', type: 'not_found' } }, 404);
  }
  if (!assertOwner(session, user.sub)) {
    return c.json({ error: { message: '本人のセッションではありません', type: 'forbidden' } }, 403);
  }

  const cmd = await findLatestCommand(id);
  if (!cmd || cmd.approvalStatus !== 'PENDING') {
    return c.json({ error: { message: '承認待ちのコマンドがありません', type: 'invalid_state' } }, 409);
  }

  await db.$transaction([
    db.message.update({ where: { id: cmd.id }, data: { approvalStatus: 'REJECTED' } }),
    // 実行しないので EXECUTING を解除し、先輩の再対応待ちへ戻す
    db.session.update({ where: { id }, data: { status: 'WAITING' } }),
  ]);
  return c.json({ ok: true, messageId: cmd.id, approvalStatus: 'REJECTED' });
});

/**
 * POST /kohai/sessions/:id/pending-command/result
 * 承認済みコマンドの実行結果を監査ログ（role=TOOL）として保存する（§5.4 実行ログ保存）。
 * body: { output: string }
 * 保存後、セッションは先輩の次の対応待ち（WAITING）へ。
 */
kohaiRouter.post('/sessions/:id/pending-command/result', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const body = await c.req.json().catch(() => null);
  const output = typeof body?.output === 'string' ? body.output : '';

  const session = await db.session.findUnique({ where: { id } });
  if (!session) {
    return c.json({ error: { message: 'セッションが見つかりません', type: 'not_found' } }, 404);
  }
  if (!assertOwner(session, user.sub)) {
    return c.json({ error: { message: '本人のセッションではありません', type: 'forbidden' } }, 403);
  }

  const cmd = await findLatestCommand(id);
  // 承認済みのコマンドに対してのみ結果を受け付ける（未承認の実行結果は記録しない）
  if (!cmd || cmd.approvalStatus !== 'APPROVED') {
    return c.json(
      { error: { message: '承認済みのコマンドがありません', type: 'invalid_state' } },
      409
    );
  }

  const [toolMessage] = await db.$transaction([
    db.message.create({
      data: {
        sessionId: id,
        role: 'TOOL', // 監査可能な実行ログ（§5.4）
        content: output,
        toolCallId: cmd.toolCallId,
        commandName: cmd.commandName,
      },
    }),
    db.session.update({ where: { id }, data: { status: 'WAITING' } }),
  ]);
  return c.json({ ok: true, messageId: toolMessage.id });
});
