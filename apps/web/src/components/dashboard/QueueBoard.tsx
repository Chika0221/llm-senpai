"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchQueue,
  QueueForbiddenError,
  QueueUnauthorizedError,
  type QueueCounts,
  type QueueSession,
  type QueueStatus,
} from "@/lib/dashboard";
import { QueueCard } from "./QueueCard";

// 短間隔ポーリングでリアルタイム反映（§5.2。SSE/WebSocketは将来の選択肢）
const POLL_INTERVAL = 5_000;

type LoadState = "loading" | "ready" | "error";

// キューの取得・定期ポーリングを担うフック
function useQueue() {
  const [sessions, setSessions] = useState<QueueSession[]>([]);
  const [counts, setCounts] = useState<QueueCounts>({
    waiting: 0,
    inProgress: 0,
    completed: 0,
  });
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  // 経過時間・新着判定に使う現在時刻。ポーリングごとに更新して表示を安定させる
  const [now, setNow] = useState<number>(() => Date.now());

  // 認可エラー等は再試行しても回復しないため、ポーリングを止めるフラグ
  const stoppedRef = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetchQueue(signal);
      if (signal?.aborted) return;
      setSessions(res.sessions);
      setCounts(res.counts);
      setState("ready");
      setErrorMessage(null);
      setLastUpdated(Date.now());
      setNow(Date.now());
    } catch (err) {
      if (signal?.aborted) return;
      if (
        err instanceof QueueForbiddenError ||
        err instanceof QueueUnauthorizedError
      ) {
        // 権限不足・未認証は自動回復しないのでポーリング停止
        stoppedRef.current = true;
        setState("error");
        setErrorMessage(err.message);
        return;
      }
      // 一時的な通信エラーは、既存データを保持したまま次回ポーリングで回復を試みる
      setErrorMessage("最新の状態を取得できませんでした。再試行します…");
      // 初回ロードに失敗したときだけエラー画面へ（既にデータがあれば維持）
      setState((prev) => (prev === "loading" ? "error" : prev));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // 外部システム（API）からの取得。setState は await 後に走るため
    // 同期的なカスケード更新ではない（fetch-on-mount / ポーリングの正当な用途）。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);

    const timer = setInterval(() => {
      if (stoppedRef.current) return;
      void load(controller.signal);
    }, POLL_INTERVAL);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);

  return { sessions, counts, state, errorMessage, lastUpdated, now };
}

// 稼働中インジケータ（更新の鼓動を可視化して「リアルタイム感」を出す）
function LiveIndicator({ lastUpdated }: { lastUpdated: number | null }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tertiary opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-tertiary" />
      </span>
      <span>
        リアルタイム更新中
        {lastUpdated && (
          <span className="ml-1 text-on-surface-variant/70">
            （
            {new Date(lastUpdated).toLocaleTimeString("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
            ）
          </span>
        )}
      </span>
    </div>
  );
}

const COLUMNS: {
  key: QueueStatus;
  title: string;
  countKey: keyof QueueCounts;
  accent: string; // 件数バッジの配色
}[] = [
  {
    key: "WAITING",
    title: "未対応",
    countKey: "waiting",
    accent: "bg-primary/10 text-primary",
  },
  {
    key: "IN_PROGRESS",
    title: "対応中",
    countKey: "inProgress",
    accent: "bg-secondary-container text-on-secondary-container",
  },
  {
    key: "COMPLETED",
    title: "完了",
    countKey: "completed",
    accent: "bg-tertiary/10 text-tertiary",
  },
];

export function QueueBoard() {
  const { sessions, counts, state, errorMessage, lastUpdated, now } = useQueue();

  if (state === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div
          role="status"
          aria-label="読み込み中"
          className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary"
        />
      </div>
    );
  }

  // 認可・未認証エラーで停止した場合の全画面メッセージ
  if (state === "error" && sessions.length === 0) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-xl bg-surface-container-lowest p-8 text-center shadow-[var(--shadow-raised)]">
        <p className="text-base font-semibold text-on-surface">
          キューを表示できませんでした
        </p>
        <p className="mt-2 text-sm text-on-surface-variant">{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-16 sm:px-10">
      {/* 見出し ＋ 稼働インジケータ */}
      <div className="flex flex-wrap items-end justify-between gap-3 py-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
            質問キュー
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            後輩からの質問がリアルタイムに届きます。カードを選んで回答しましょう。
          </p>
        </div>
        <LiveIndicator lastUpdated={lastUpdated} />
      </div>

      {/* 一時的な通信エラーは既存データを残したまま控えめに通知 */}
      {errorMessage && sessions.length > 0 && (
        <div
          role="status"
          className="mb-4 rounded-md border border-outline-variant/50 bg-surface-container-low px-4 py-2 text-xs font-semibold text-on-surface-variant"
        >
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = sessions.filter((s) => s.queueStatus === col.key);
          return (
            <section key={col.key} className="flex flex-col">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-base font-extrabold text-on-surface">
                  {col.title}
                </h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${col.accent}`}
                >
                  {counts[col.countKey]}
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {items.length === 0 ? (
                  <div className="rounded-md border-2 border-dashed border-outline-variant/50 px-4 py-10 text-center text-sm text-on-surface-variant">
                    {col.key === "WAITING"
                      ? "未対応の質問はありません"
                      : col.key === "IN_PROGRESS"
                        ? "対応中の質問はありません"
                        : "完了した質問はありません"}
                  </div>
                ) : (
                  items.map((s) => (
                    <QueueCard key={s.id} session={s} now={now} />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
