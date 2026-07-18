import { API_BASE_URL } from "./api";

// キュー画面の3分類（§8: 未対応 / 対応中 / 完了）
export type QueueStatus = "WAITING" | "IN_PROGRESS" | "COMPLETED";

// セッションの生ステータス（Prisma の SessionStatus と対応）
export type SessionStatus =
  | "OPEN"
  | "WAITING"
  | "EXECUTING"
  | "COMPLETED"
  | "ERROR";

// キューカード1件分（バックエンド GET /dashboard/sessions の DTO と一致）
export type QueueSession = {
  id: string;
  queueStatus: QueueStatus;
  status: SessionStatus;
  source: string;
  title: string;
  preview: string;
  topic: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  requesterId: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type QueueCounts = {
  waiting: number;
  inProgress: number;
  completed: number;
};

export type QueueResponse = {
  sessions: QueueSession[];
  counts: QueueCounts;
};

// 認可エラー（発展班以外 / 未ログイン）を呼び出し側で判別するための型
export class QueueForbiddenError extends Error {}
export class QueueUnauthorizedError extends Error {}

// キュー一覧を取得する。ダッシュボード配下APIは Cookie セッション（発展班のみ）で保護されている。
export async function fetchQueue(signal?: AbortSignal): Promise<QueueResponse> {
  const res = await fetch(`${API_BASE_URL}/dashboard/sessions`, {
    method: "GET",
    credentials: "include",
    signal,
  });

  if (res.status === 401) {
    throw new QueueUnauthorizedError("認証が必要です");
  }
  if (res.status === 403) {
    throw new QueueForbiddenError("発展班（先輩）のみ利用できます");
  }
  if (!res.ok) {
    throw new Error(`キューの取得に失敗しました (${res.status})`);
  }

  return (await res.json()) as QueueResponse;
}

// --- 回答画面（§5.2 / §8。Issue #3・#4） ---

// 会話履歴の1メッセージ分（バックエンド MessageDTO と一致）
export type SessionMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "TOOL";
  content: string;
  commandName: string | null;
  toolCallId: string | null;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
  createdAt: string;
};

// セッション詳細（キューカード＋全メッセージ履歴）
export type SessionDetail = QueueSession & {
  messages: SessionMessage[];
};

// 担当が他の先輩と競合したことを呼び出し側で判別するための型
export class QueueConflictError extends Error {}
export class QueueNotFoundError extends Error {}

// 共通のエラー処理（ステータスコードを型付きエラーへ変換）
async function throwForStatus(res: Response, fallback: string): Promise<never> {
  if (res.status === 401) throw new QueueUnauthorizedError("認証が必要です");
  if (res.status === 403) throw new QueueForbiddenError("発展班（先輩）のみ利用できます");
  if (res.status === 404) throw new QueueNotFoundError("セッションが見つかりません");
  // 競合など、サーバーのメッセージを尊重できる場合は拾う
  let message = fallback;
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    if (data?.error?.message) message = data.error.message;
  } catch {
    // JSON でなければ fallback のまま
  }
  if (res.status === 409) throw new QueueConflictError(message);
  throw new Error(message);
}

// セッション詳細（会話履歴込み）を取得する
export async function fetchSessionDetail(
  id: string,
  signal?: AbortSignal,
): Promise<SessionDetail> {
  const res = await fetch(`${API_BASE_URL}/dashboard/sessions/${id}`, {
    method: "GET",
    credentials: "include",
    signal,
  });
  if (!res.ok) await throwForStatus(res, `詳細の取得に失敗しました (${res.status})`);
  const data = (await res.json()) as { session: SessionDetail };
  return data.session;
}

// 担当ロックを取得する（重複回答防止・§5.2 / Issue #4）
export async function assignSession(id: string): Promise<SessionDetail> {
  const res = await fetch(`${API_BASE_URL}/dashboard/sessions/${id}/assign`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) await throwForStatus(res, "担当の取得に失敗しました");
  const data = (await res.json()) as { session: SessionDetail };
  return data.session;
}

// 担当ロックを解除する
export async function releaseSession(id: string): Promise<SessionDetail> {
  const res = await fetch(`${API_BASE_URL}/dashboard/sessions/${id}/assign`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) await throwForStatus(res, "担当の解除に失敗しました");
  const data = (await res.json()) as { session: SessionDetail };
  return data.session;
}

// テキスト回答を送信する（§5.2 回答フォーム＆ルーティング / Issue #3）
export async function replySession(
  id: string,
  content: string,
): Promise<SessionDetail> {
  const res = await fetch(`${API_BASE_URL}/dashboard/sessions/${id}/reply`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) await throwForStatus(res, "回答の送信に失敗しました");
  const data = (await res.json()) as { session: SessionDetail };
  return data.session;
}

// 経過時間を「たった今 / n分前 / n時間前 / n日前」の相対表記にする（新着の体感用）
export function formatElapsed(fromIso: string, now: number = Date.now()): string {
  const diffMs = now - new Date(fromIso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));

  if (sec < 60) return "たった今";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  const day = Math.floor(hour / 24);
  return `${day}日前`;
}
