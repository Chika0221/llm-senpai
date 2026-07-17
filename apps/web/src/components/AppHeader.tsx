"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

// アプリ共通ヘッダー。ロゴ（ホームへ戻る）＋ログインユーザー＋ログアウト。
// ページ固有の補助UI（更新状況など）は right スロットで差し込む。
export function AppHeader({ right }: { right?: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between gap-3 px-6 py-5 sm:px-10">
      <Link
        href="/"
        className="text-lg font-extrabold tracking-tight text-on-surface transition-colors hover:text-primary"
      >
        LLMSenpai
      </Link>

      <div className="flex items-center gap-3">
        {right}
        {user?.avatarUrl && (
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
          {user?.displayName ?? "メンバー"}
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
  );
}
