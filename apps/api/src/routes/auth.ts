import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { WEB_ORIGIN, NODE_ENV, DEV_AUTH_BYPASS } from '../env.js';
import type { MemberRole } from '../auth/discordRoles.js';
import {
  getAuthorizeUrl,
  exchangeCodeForToken,
  fetchDiscordUser,
  buildAvatarUrl,
} from '../auth/oauth.js';
import { resolveGuildMembership } from '../auth/discordRoles.js';
import {
  signSession,
  setSessionCookie,
  clearSessionCookie,
  readSession,
} from '../auth/session.js';
import { requireMember } from '../middleware/auth.js';
import type { AuthVariables } from '../middleware/auth.js';
import { db } from '../lib/db.js';

const OAUTH_STATE_COOKIE = 'senpai_oauth_state';
const isProd = NODE_ENV === 'production';

export const authRouter = new Hono<{ Variables: AuthVariables }>();

// フロント向けの認証設定。開発用バイパスが有効かをログイン画面が判定するのに使う。
authRouter.get('/config', (c) => {
  return c.json({ devBypass: DEV_AUTH_BYPASS });
});

// 開発用: Discord を介さずに役割を選んでログインする（DEV_AUTH_BYPASS 有効時のみ）。
// 本番では env 側で DEV_AUTH_BYPASS が必ず false になるため、この経路は機能しない。
authRouter.get('/dev/login', async (c) => {
  if (!DEV_AUTH_BYPASS) {
    return c.json(
      { error: { message: '開発用ログインは無効です', type: 'not_found' } },
      404
    );
  }

  const roleParam = (c.req.query('role') || 'KISO').toUpperCase();
  const role: MemberRole = roleParam === 'HATTEN' ? 'HATTEN' : 'KISO';

  // 役割ごとに固定のダミーユーザー（DBには依存しない自己完結の JWT）
  const displayName = role === 'HATTEN' ? '開発先輩（発展班）' : '開発後輩（基礎班）';
  const token = await signSession({
    sub: `dev-${role.toLowerCase()}`,
    role,
    displayName,
  });
  setSessionCookie(c, token);

  console.warn(`⚠️ [DEV] Discord 認証をバイパスして ${role} でログインしました`);
  return c.redirect(WEB_ORIGIN);
});

// ログイン開始: state を発行し Discord 認可画面へリダイレクト
authRouter.get('/discord', (c) => {
  const state = crypto.randomUUID();
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'Lax', // トップレベルGETのコールバックで送出させる
    path: '/',
    maxAge: 600, // 10分
  });
  return c.redirect(getAuthorizeUrl(state));
});

// コールバック: code 交換 → identify 取得 → Bot でロール照会 → セッション発行
authRouter.get('/discord/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const savedState = getCookie(c, OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: '/' });

  // CSRF 対策: state 一致を確認
  if (!code || !state || !savedState || state !== savedState) {
    return c.redirect(`${WEB_ORIGIN}/login?error=invalid_state`);
  }

  try {
    const accessToken = await exchangeCodeForToken(code);
    const discordUser = await fetchDiscordUser(accessToken);

    // 部員判定・役割判定は Bot 照会で行う（§5.7 主案）
    const membership = await resolveGuildMembership(discordUser.id);
    if (!membership.isMember || !membership.role) {
      // ギルド非所属 = 部外者はログイン拒否
      return c.redirect(`${WEB_ORIGIN}/login?error=not_member`);
    }

    const displayName = discordUser.global_name || discordUser.username;
    const avatarUrl = buildAvatarUrl(discordUser);

    // User を upsert（ログイン時に役割スナップショットを更新）
    await db.user.upsert({
      where: { discordUserId: discordUser.id },
      create: {
        discordUserId: discordUser.id,
        displayName,
        avatarUrl,
        role: membership.role,
        lastLoginAt: new Date(),
      },
      update: {
        displayName,
        avatarUrl,
        role: membership.role,
        lastLoginAt: new Date(),
      },
    });

    const token = await signSession({
      sub: discordUser.id,
      role: membership.role,
      displayName,
      avatarUrl: avatarUrl ?? undefined,
    });
    setSessionCookie(c, token);

    return c.redirect(WEB_ORIGIN);
  } catch (err) {
    console.error('[Auth] OAuth callback error:', err);
    return c.redirect(`${WEB_ORIGIN}/login?error=server_error`);
  }
});

// 現在のログイン状態を返す（フロントの認証状態ハンドリング用）
authRouter.get('/me', async (c) => {
  const user = await readSession(c);
  if (!user) {
    return c.json({ authenticated: false }, 401);
  }
  return c.json({
    authenticated: true,
    user: {
      discordUserId: user.sub,
      role: user.role,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
    },
  });
});

// ログアウト: セッション Cookie を破棄
authRouter.post('/logout', (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

// AIエディタ向け API トークン発行（ログイン済みの部員が Bearer 用に取得）
authRouter.get('/token', requireMember, async (c) => {
  const user = c.get('user');
  const token = await signSession({
    sub: user.sub,
    role: user.role,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  });
  return c.json({ token, tokenType: 'Bearer' });
});
