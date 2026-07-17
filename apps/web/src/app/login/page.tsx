"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

// コールバックで付与されるエラーコード（apps/api/src/routes/auth.ts）に対応する文言。
const ERROR_MESSAGES: Record<string, string> = {
  not_member:
    "このシステムは部員専用です。対象の Discord サーバーに参加しているアカウントでログインしてください。",
  invalid_state:
    "ログインの有効期限が切れました。お手数ですが、もう一度お試しください。",
  server_error:
    "サーバーでエラーが発生しました。時間をおいて再度お試しください。",
};

function DiscordIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-6 w-6"
      fill="currentColor"
    >
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3.2a.074.074 0 0 0-.079.037c-.34.6-.719 1.386-.984 2.001a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.997-2.001.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C1.533 7.36.943 10.28 1.246 13.157a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127c-.598.35-1.22.645-1.873.893a.076.076 0 0 0-.041.105c.36.699.772 1.364 1.225 1.994a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-3.325-.838-6.22-2.549-8.761a.061.061 0 0 0-.031-.028ZM8.02 12.66c-.789 0-1.438-.724-1.438-1.612 0-.889.637-1.613 1.438-1.613.807 0 1.451.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612Zm5.313 0c-.788 0-1.438-.724-1.438-1.612 0-.889.637-1.613 1.438-1.613.808 0 1.451.73 1.438 1.613 0 .888-.63 1.612-1.438 1.612Z" />
    </svg>
  );
}

function LoginCard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status } = useAuth();
  const errorCode = searchParams.get("error");
  const errorMessage = errorCode
    ? (ERROR_MESSAGES[errorCode] ?? "ログインに失敗しました。もう一度お試しください。")
    : null;

  // 既にログイン済みならホームへ戻す
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-xl bg-surface-container-lowest p-8 shadow-[var(--shadow-raised)] sm:p-10">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-3xl">
            🎓
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
            LLMSenpai
          </h1>
          <p className="mt-3 text-base leading-7 text-on-surface-variant">
            部活動のメンバー専用ツールです。
            <br />
            Discord アカウントでログインしてください。
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mt-6 rounded-md border border-error/20 bg-error-container px-4 py-3 text-sm leading-6 text-on-error-container"
          >
            {errorMessage}
          </div>
        )}

        <a
          href={loginUrl()}
          className="mt-8 flex h-14 w-full items-center justify-center gap-3 rounded-full bg-primary px-6 text-lg font-bold text-on-primary shadow-[var(--shadow-raised)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-container hover:shadow-[var(--shadow-active)]"
        >
          <DiscordIcon />
          Discord でログイン
        </a>

        <p className="mt-6 text-center text-xs leading-5 text-on-surface-variant">
          取得するのは Discord のユーザー情報（identify）のみです。
          <br />
          対象サーバーの所属とロールで、後輩／先輩を判定します。
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginCard />
    </Suspense>
  );
}
