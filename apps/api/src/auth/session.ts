import type { Context } from 'hono';
import { sign, verify } from 'hono/jwt';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { SESSION_SECRET, NODE_ENV, COOKIE_DOMAIN } from '../env.js';
import type { MemberRole } from './discordRoles.js';

export const SESSION_COOKIE = 'senpai_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7日

// JWT に載せるログイン時スナップショット（§5.7: 役割はログイン時点で保持）
export interface SessionPayload {
  sub: string;              // Discord ユーザーID
  role: MemberRole;         // KISO | HATTEN
  displayName?: string;
  avatarUrl?: string;
  iat: number;
  exp: number;
  [key: string]: unknown;   // hono/jwt の JWTPayload 制約を満たす
}

function assertSecret(): string {
  if (!SESSION_SECRET) {
    throw new Error('SESSION_SECRET が設定されていません（セッション署名に必須）');
  }
  return SESSION_SECRET;
}

/** セッション JWT を署名して発行する */
export async function signSession(
  data: { sub: string; role: MemberRole; displayName?: string; avatarUrl?: string }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: data.sub,
    role: data.role,
    displayName: data.displayName,
    avatarUrl: data.avatarUrl,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  return sign(payload, assertSecret(), 'HS256');
}

/** JWT を検証して payload を返す。無効なら null */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    return (await verify(token, assertSecret(), 'HS256')) as SessionPayload;
  } catch {
    return null;
  }
}

const isProd = NODE_ENV === 'production';

/** httpOnly Cookie にセッションを設定する */
export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,                       // 本番(HTTPS)のみ Secure
    sameSite: isProd ? 'None' : 'Lax',    // クロスオリジン運用は None、開発は Lax
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    domain: COOKIE_DOMAIN,
  });
}

/** セッション Cookie を破棄する */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/', domain: COOKIE_DOMAIN });
}

/**
 * リクエストからセッションを解決する。
 * Web UI / ダッシュボードは httpOnly Cookie、
 * OpenAI互換API（AIエディタ）は Authorization: Bearer <JWT> を利用可。
 */
export async function readSession(c: Context): Promise<SessionPayload | null> {
  const cookieToken = getCookie(c, SESSION_COOKIE);
  if (cookieToken) {
    const payload = await verifySession(cookieToken);
    if (payload) return payload;
  }

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const bearer = authHeader.slice('Bearer '.length).trim();
    if (bearer) return verifySession(bearer);
  }

  return null;
}
