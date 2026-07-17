import type { Context, Next } from 'hono';
import { readSession, type SessionPayload } from '../auth/session.js';

// c.get('user') / c.set('user') の型
export type AuthVariables = {
  user: SessionPayload;
};

/**
 * 部員全員（基礎班・発展班）に許可するミドルウェア。
 * 質問受付API（Web UI / OpenAI互換API）に適用する。§5.7
 */
export async function requireMember(c: Context, next: Next) {
  const user = await readSession(c);
  if (!user) {
    return c.json({ error: { message: '認証が必要です', type: 'unauthorized' } }, 401);
  }
  c.set('user', user);
  await next();
}

/**
 * 発展班（先輩）のみに許可するミドルウェア。
 * ダッシュボード配下API（キュー・担当ロック・回答・コマンド送信）に適用する。§5.7
 */
export async function requireHatten(c: Context, next: Next) {
  const user = await readSession(c);
  if (!user) {
    return c.json({ error: { message: '認証が必要です', type: 'unauthorized' } }, 401);
  }
  if (user.role !== 'HATTEN') {
    return c.json(
      { error: { message: 'このリソースは発展班（先輩）のみ利用できます', type: 'forbidden' } },
      403
    );
  }
  c.set('user', user);
  await next();
}
