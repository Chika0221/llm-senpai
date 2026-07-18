"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  assignSession,
  type CommandShell,
  fetchSessionDetail,
  formatElapsed,
  QueueConflictError,
  QueueForbiddenError,
  QueueNotFoundError,
  QueueUnauthorizedError,
  releaseSession,
  replySession,
  sendCommand,
  type SessionDetail,
  type SessionMessage,
} from "@/lib/dashboard";

// 会話履歴を最新に保つためのポーリング間隔（後輩の追質問の取り込み用）
const POLL_INTERVAL = 5_000;

type LoadState = "loading" | "ready" | "error";

// コマンドの承認状態バッジ（§5.4）
function ApprovalBadge({
  status,
}: {
  status: SessionMessage["approvalStatus"];
}) {
  if (!status) return null;
  const style: Record<
    NonNullable<SessionMessage["approvalStatus"]>,
    { label: string; cls: string }
  > = {
    PENDING: {
      label: "承認待ち",
      cls: "bg-secondary-container text-on-secondary-container",
    },
    APPROVED: { label: "承認済み", cls: "bg-tertiary/10 text-tertiary" },
    REJECTED: { label: "拒否", cls: "bg-error-container text-on-error-container" },
  };
  const { label, cls } = style[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>
      {label}
    </span>
  );
}

// 1件の会話メッセージを表示する。役割ごとに左右・配色を分ける。
function MessageBubble({ message }: { message: SessionMessage }) {
  const isUser = message.role === "USER";
  const isTool = message.role === "TOOL";

  if (isTool) {
    // コマンド実行結果（role=TOOL）はターミナル風に中央寄せで表示
    return (
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-1 text-center text-xs font-bold text-on-surface-variant">
          実行結果
        </div>
        <pre className="overflow-x-auto rounded-md bg-on-surface/90 px-4 py-3 text-xs leading-5 text-surface-container-lowest">
          {message.content}
        </pre>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[80%] ${isUser ? "" : "items-end"}`}>
        <div
          className={`mb-1 flex items-center gap-2 text-xs font-bold ${isUser ? "text-on-surface-variant" : "text-primary"}`}
        >
          <span>
            {isUser ? "後輩" : message.commandName ? "先輩（コマンド）" : "先輩"}
          </span>
          {message.commandName && (
            <ApprovalBadge status={message.approvalStatus} />
          )}
        </div>
        {message.commandName ? (
          <div>
            {/* 危険コマンドの警告（§5.4） */}
            {message.danger?.isDangerous && (
              <div className="mb-1 rounded-md bg-error-container px-3 py-2 text-[11px] font-bold leading-4 text-on-error-container">
                ⚠️ 危険なコマンドの可能性
                <ul className="mt-1 list-disc pl-4 font-semibold">
                  {message.danger.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            <pre className="overflow-x-auto rounded-md bg-on-surface/90 px-4 py-3 text-xs leading-5 text-surface-container-lowest">
              {message.content}
            </pre>
          </div>
        ) : (
          <div
            className={`whitespace-pre-wrap break-words rounded-md px-4 py-3 text-sm leading-6 shadow-[var(--shadow-raised)] ${
              isUser
                ? "bg-surface-container-lowest text-on-surface"
                : "bg-primary text-on-primary"
            }`}
          >
            {message.content}
          </div>
        )}
        <div
          className={`mt-1 text-[11px] text-on-surface-variant ${isUser ? "text-left" : "text-right"}`}
        >
          {formatElapsed(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

export function AnswerView({ sessionId }: { sessionId: string }) {
  const { user } = useAuth();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 回答フォームの下書き（ポーリングによる再取得で消えないよう独立管理）
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // 入力モード（テキスト回答 / コマンド送信）と、コマンド入力の状態（§5.4）
  const [mode, setMode] = useState<"reply" | "command">("reply");
  const [shell, setShell] = useState<CommandShell>("bash");
  const [commandDraft, setCommandDraft] = useState("");

  // 認可・不存在など回復しないエラーはポーリングを止める
  const stoppedRef = useRef(false);

  const applyError = useCallback((err: unknown): void => {
    if (
      err instanceof QueueForbiddenError ||
      err instanceof QueueUnauthorizedError ||
      err instanceof QueueNotFoundError
    ) {
      stoppedRef.current = true;
      setState("error");
      setErrorMessage(err.message);
      return;
    }
    setState((prev) => (prev === "loading" ? "error" : prev));
    setErrorMessage("最新の状態を取得できませんでした。再試行します…");
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const detail = await fetchSessionDetail(sessionId, signal);
        if (signal?.aborted) return;
        setSession(detail);
        setState("ready");
        setErrorMessage(null);
      } catch (err) {
        if (signal?.aborted) return;
        applyError(err);
      }
    },
    [sessionId, applyError],
  );

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

  const isMine = !!session?.assigneeId && session.assigneeId === user?.discordUserId;
  const isLockedByOther = !!session?.assigneeId && !isMine;

  const handleAssign = useCallback(async () => {
    setActionError(null);
    try {
      const updated = await assignSession(sessionId);
      setSession(updated);
    } catch (err) {
      if (err instanceof QueueConflictError) {
        setActionError(err.message);
        // 競合時は最新状態を取り直して担当者を反映
        void load();
      } else {
        setActionError(err instanceof Error ? err.message : "担当の取得に失敗しました");
      }
    }
  }, [sessionId, load]);

  const handleRelease = useCallback(async () => {
    setActionError(null);
    try {
      const updated = await releaseSession(sessionId);
      setSession(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "担当の解除に失敗しました");
    }
  }, [sessionId]);

  const handleSubmit = useCallback(async () => {
    const content = draft.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const updated = await replySession(sessionId, content);
      setSession(updated);
      setDraft("");
    } catch (err) {
      if (err instanceof QueueConflictError) {
        setActionError(err.message);
        void load();
      } else {
        setActionError(err instanceof Error ? err.message : "回答の送信に失敗しました");
      }
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitting, sessionId, load]);

  const handleSendCommand = useCallback(async () => {
    const command = commandDraft.trim();
    if (!command || submitting) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const { session: updated, danger } = await sendCommand(
        sessionId,
        command,
        shell,
      );
      setSession(updated);
      setCommandDraft("");
      // 危険コマンドは送信できるが、送信後に警告を明示（後輩の承認前提・§5.4）
      if (danger.isDangerous) {
        setActionError(
          `⚠️ 危険なコマンドとして後輩に警告表示されます: ${danger.reasons.join(" / ")}`,
        );
      }
    } catch (err) {
      if (err instanceof QueueConflictError) {
        setActionError(err.message);
        void load();
      } else {
        setActionError(
          err instanceof Error ? err.message : "コマンドの送信に失敗しました",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }, [commandDraft, shell, submitting, sessionId, load]);

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

  if (state === "error" && !session) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-xl bg-surface-container-lowest p-8 text-center shadow-[var(--shadow-raised)]">
        <p className="text-base font-semibold text-on-surface">
          セッションを表示できませんでした
        </p>
        <p className="mt-2 text-sm text-on-surface-variant">{errorMessage}</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-full bg-primary px-5 py-2 text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
        >
          キューへ戻る
        </Link>
      </div>
    );
  }

  if (!session) return null;

  const isCompleted =
    session.status === "COMPLETED" || session.status === "ERROR";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-8 sm:px-10">
      {/* 見出し ＋ 担当状況 */}
      <div className="py-6">
        <Link
          href="/dashboard"
          className="text-sm font-bold text-on-surface-variant transition-colors hover:text-primary"
        >
          ← 質問キューへ戻る
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold leading-8 tracking-tight text-on-surface">
              {session.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface-variant">
              <span className="font-semibold">{session.source}</span>
              <span aria-hidden>·</span>
              <span>{formatElapsed(session.createdAt)}に受信</span>
              {session.topic && (
                <span className="rounded-full bg-surface-container px-2 py-0.5 font-semibold text-on-surface">
                  {session.topic}
                </span>
              )}
            </div>
          </div>

          {/* 担当ロック操作（§5.2 / Issue #4） */}
          <div className="flex shrink-0 flex-col items-end gap-1">
            {session.assigneeName ? (
              <span className="rounded-full bg-secondary-container px-3 py-1 text-xs font-bold text-on-secondary-container">
                担当: {session.assigneeName}
                {isMine && "（あなた）"}
              </span>
            ) : (
              <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-bold text-on-surface-variant">
                未担当
              </span>
            )}
            {isMine ? (
              <button
                type="button"
                onClick={() => void handleRelease()}
                className="text-xs font-bold text-on-surface-variant underline-offset-2 hover:text-primary hover:underline"
              >
                担当を外す
              </button>
            ) : (
              !isLockedByOther && (
                <button
                  type="button"
                  onClick={() => void handleAssign()}
                  className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-on-primary transition-opacity hover:opacity-90"
                >
                  担当する
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* 会話履歴 */}
      <div className="flex flex-1 flex-col gap-4 rounded-md bg-surface-container-low p-5">
        {session.messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-on-surface-variant">
            メッセージがありません
          </p>
        ) : (
          session.messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      {/* 他の先輩が対応中の場合の警告（重複回答防止） */}
      {isLockedByOther && (
        <div
          role="status"
          className="mt-4 rounded-md border border-outline-variant/60 bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface-variant"
        >
          このセッションは {session.assigneeName ?? "他の先輩"}{" "}
          が対応中です。重複回答を防ぐため、回答フォームは無効化されています。
        </div>
      )}

      {/* 完了済みの通知（追加回答は可能） */}
      {isCompleted && !isLockedByOther && (
        <div
          role="status"
          className="mt-4 rounded-md border border-tertiary/30 bg-tertiary/5 px-4 py-3 text-sm font-semibold text-tertiary"
        >
          このセッションは対応済みです。必要であれば追加の回答を送れます。
        </div>
      )}

      {/* 回答／コマンド送信フォーム（§5.2 回答フォーム＆コマンド送信 / Issue #3・§5.4） */}
      <div className="mt-4">
        {actionError && (
          <div
            role="alert"
            className="mb-2 rounded-md bg-error-container px-4 py-2 text-xs font-bold text-on-error-container"
          >
            {actionError}
          </div>
        )}

        {/* モード切り替え: テキスト回答 / コマンド */}
        <div className="mb-2 flex gap-1">
          {(
            [
              { key: "reply", label: "回答" },
              { key: "command", label: "コマンド" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setMode(t.key)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                mode === t.key
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {mode === "reply" ? (
          <div className="rounded-md bg-surface-container-lowest p-3 shadow-[var(--shadow-raised)]">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Ctrl/Cmd + Enter で送信
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              disabled={isLockedByOther || submitting}
              rows={3}
              placeholder={
                isLockedByOther
                  ? "他の先輩が対応中です"
                  : "後輩への回答を入力…（Ctrl/⌘ + Enter で送信）"
              }
              className="w-full resize-y bg-transparent px-2 py-1 text-sm leading-6 text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none disabled:opacity-50"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-on-surface-variant">
                送信すると後輩の画面／エディタへ自動で届きます
              </span>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isLockedByOther || submitting || !draft.trim()}
                className="rounded-full bg-primary px-6 py-2 text-sm font-bold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "送信中…" : "回答を送信"}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-md bg-surface-container-lowest p-3 shadow-[var(--shadow-raised)]">
            <div className="mb-2 flex items-center gap-2">
              <label className="text-xs font-bold text-on-surface-variant">
                シェル
              </label>
              <select
                value={shell}
                onChange={(e) => setShell(e.target.value as CommandShell)}
                disabled={isLockedByOther || submitting}
                className="rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1 text-xs font-semibold text-on-surface focus:outline-none disabled:opacity-50"
              >
                <option value="bash">bash</option>
                <option value="powershell">PowerShell</option>
              </select>
            </div>
            <textarea
              value={commandDraft}
              onChange={(e) => setCommandDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void handleSendCommand();
                }
              }}
              disabled={isLockedByOther || submitting}
              rows={3}
              spellCheck={false}
              placeholder={
                isLockedByOther
                  ? "他の先輩が対応中です"
                  : "後輩のシェルで実行させるコマンド…（Ctrl/⌘ + Enter で送信）"
              }
              className="w-full resize-y bg-transparent px-2 py-1 font-mono text-sm leading-6 text-on-surface placeholder:font-sans placeholder:text-on-surface-variant/60 focus:outline-none disabled:opacity-50"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-on-surface-variant">
                後輩は実行前に承認を求められます（§5.4 安全設計）
              </span>
              <button
                type="button"
                onClick={() => void handleSendCommand()}
                disabled={isLockedByOther || submitting || !commandDraft.trim()}
                className="shrink-0 rounded-full bg-primary px-6 py-2 text-sm font-bold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "送信中…" : "コマンドを送信"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
