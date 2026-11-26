"use client";

import Image from "next/image";
import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { useAuth } from "@/lib/auth-context";

function RoleChip({ role }: { role: "KISO" | "HATTEN" }) {
  const isSenpai = role === "HATTEN";
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold tracking-wide ${
        isSenpai
          ? "bg-secondary-container text-on-secondary-container"
          : "bg-primary/10 text-primary"
      }`}
    >
      {isSenpai ? "発展班（先輩）" : "基礎班（後輩）"}
    </span>
  );
}

function Home() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const isSenpai = user.role === "HATTEN";

  return (
    <div className="flex flex-1 flex-col">
      {/* ヘッダー: ログインユーザーとログアウト */}
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="text-lg font-extrabold tracking-tight text-on-surface">
          LLMSenpai
        </span>
        <div className="flex items-center gap-3">
          {user.avatarUrl && (
            <Image
              src={user.avatarUrl}
              alt=""
              width={36}
              height={36}
              className="rounded-full"
              unoptimized
            />
          )}
          <span className="hidden text-sm font-semibold text-on-surface sm:inline">
            {user.displayName ?? "メンバー"}
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-full border-2 border-outline-variant px-4 py-1.5 text-sm font-bold text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl rounded-xl bg-surface-container-lowest p-8 shadow-[var(--shadow-raised)] sm:p-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <RoleChip role={user.role} />
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
              ようこそ、{user.displayName ?? "メンバー"}さん
            </h1>
            <p className="max-w-md text-base leading-7 text-on-surface-variant">
              {isSenpai
                ? "先輩用のダッシュボードから、後輩の質問に回答できます。"
                : "わからないことは気軽に質問してみましょう。"}
            </p>
          </div>

          <div className="mt-10">
            {isSenpai ? (
              <Link
                href="/dashboard"
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-lg font-bold text-on-primary shadow-[var(--shadow-raised)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-container hover:shadow-[var(--shadow-active)]"
              >
                先輩ダッシュボードへ
              </Link>
            ) : (
              <a
                href="/chat"
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-lg font-bold text-on-primary shadow-[var(--shadow-raised)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-container hover:shadow-[var(--shadow-active)]"
              >
                質問をはじめる
              </a>
            )}
            {!isSenpai && (
              <p className="mt-4 text-center text-xs leading-5 text-on-surface-variant">
                ※ 質問フォーム画面は次の Issue で実装予定です。
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <AuthGate>
      <Home />
    </AuthGate>
  );
}
