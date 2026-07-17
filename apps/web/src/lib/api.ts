// バックエンド（Hono）のオリジン。CookieセッションはAPIオリジンに載るため、
// 認証状態の取得やログアウトは常にこのオリジンへ credentials 付きで問い合わせる。
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:7070";

// ギルド内ロール（§5.7）。HATTEN=発展班=先輩 / KISO=基礎班=後輩。
export type Role = "KISO" | "HATTEN";

export type AuthUser = {
  discordUserId: string;
  role: Role;
  displayName: string | null;
  avatarUrl: string | null;
};

// Discord OAuth2 ログイン開始URL（フルページ遷移で叩く。/auth/discord が認可画面へリダイレクト）
export const loginUrl = () => `${API_BASE_URL}/auth/discord`;

// ログイン状態の取得。未ログイン時は API が 401 を返すため null を返す。
export async function fetchMe(signal?: AbortSignal): Promise<AuthUser | null> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "GET",
    credentials: "include",
    signal,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    authenticated: boolean;
    user?: AuthUser;
  };
  return data.authenticated && data.user ? data.user : null;
}

// ログアウト（セッションCookieを破棄）
export async function logout(): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}
