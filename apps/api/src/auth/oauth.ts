import {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_OAUTH_REDIRECT_URI,
} from '../env.js';

const DISCORD_API = 'https://discord.com/api';
// OAuth スコープは identify のみに最小化（§5.7）。ロールは Bot 照会で取得する
const OAUTH_SCOPE = 'identify';

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

/** Discord の認可URLを生成する */
export function getAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope: OAUTH_SCOPE,
    state,
  });
  return `${DISCORD_API}/oauth2/authorize?${params.toString()}`;
}

/** 認可コードをアクセストークンに交換する */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: DISCORD_OAUTH_REDIRECT_URI,
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord トークン交換に失敗しました (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error('Discord レスポンスに access_token がありません');
  }
  return json.access_token;
}

/** アクセストークンでログインユーザー情報（identify）を取得する */
export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord ユーザー取得に失敗しました (${res.status}): ${text}`);
  }
  return (await res.json()) as DiscordUser;
}

/** アバターURLを組み立てる（未設定時は null） */
export function buildAvatarUrl(user: DiscordUser): string | null {
  if (!user.avatar) return null;
  const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}`;
}
