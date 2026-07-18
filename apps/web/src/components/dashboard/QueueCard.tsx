"use client";

import Link from "next/link";
import { formatElapsed, type QueueSession } from "@/lib/dashboard";

// ステータス別のチップ表示（ラベルと配色）
function StatusChip({ session }: { session: QueueSession }) {
  if (session.status === "ERROR") {
    return (
      <span className="rounded-full bg-error-container px-2.5 py-0.5 text-xs font-bold text-on-error-container">
        エラー
      </span>
    );
  }

  const style: Record<QueueSession["queueStatus"], { label: string; cls: string }> =
    {
      WAITING: { label: "未対応", cls: "bg-primary/10 text-primary" },
      IN_PROGRESS: {
        label: "対応中",
        cls: "bg-secondary-container text-on-secondary-container",
      },
      COMPLETED: { label: "完了", cls: "bg-tertiary/10 text-tertiary" },
    };
  const { label, cls } = style[session.queueStatus];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>
      {label}
    </span>
  );
}

export function QueueCard({
  session,
  now,
}: {
  session: QueueSession;
  // ポーリングごとに更新される現在時刻（経過時間・新着判定を安定させる）
  now: number;
}) {
  const isNew =
    session.queueStatus === "WAITING" &&
    now - new Date(session.createdAt).getTime() < 20_000;

  const body = session.preview?.trim() || session.title;

  return (
    <Link
      href={`/dashboard/${session.id}`}
      className={`block rounded-md bg-surface-container-lowest p-5 shadow-[var(--shadow-raised)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[var(--shadow-active)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        isNew ? "ring-2 ring-primary/40" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusChip session={session} />
          {isNew && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-on-primary">
              新着
            </span>
          )}
        </div>
        <time
          className="shrink-0 text-xs font-semibold text-on-surface-variant"
          dateTime={session.createdAt}
        >
          {formatElapsed(session.createdAt, now)}
        </time>
      </div>

      <p className="mt-3 line-clamp-2 text-base font-bold leading-6 text-on-surface">
        {body}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface-variant">
        {session.topic ? (
          <span className="rounded-full bg-surface-container px-2 py-0.5 font-semibold text-on-surface">
            {session.topic}
          </span>
        ) : (
          <span className="rounded-full bg-surface-container px-2 py-0.5 font-semibold text-on-surface-variant">
            未分類
          </span>
        )}
        <span className="font-semibold">{session.source}</span>
        <span aria-hidden>·</span>
        <span>{session.messageCount}件のやり取り</span>
      </div>

      <div className="mt-3 border-t border-outline-variant/40 pt-2 text-xs font-semibold">
        {session.assigneeName ? (
          <span className="text-on-surface">担当: {session.assigneeName}</span>
        ) : session.queueStatus === "COMPLETED" ? (
          <span className="text-on-surface-variant">対応済み</span>
        ) : (
          <span className="text-on-surface-variant">未担当</span>
        )}
      </div>
    </Link>
  );
}
