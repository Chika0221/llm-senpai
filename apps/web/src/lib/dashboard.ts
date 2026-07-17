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
