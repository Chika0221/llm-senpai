"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/lib/api";

// 認証・認可ガード（§5.7）。
// - 未ログイン: /login へリダイレクト
// - requireRole 指定時: 権限不足ならホームへ戻す（例: ダッシュボードは HATTEN 限定）
export function AuthGate({
  children,
  requireRole,
}: {
  children: ReactNode;
  requireRole?: Role;
}) {
  const { status, user } = useAuth();
  const router = useRouter();

  const authorized =
    status === "authenticated" &&
    (!requireRole || user?.role === requireRole);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (
      status === "authenticated" &&
      requireRole &&
      user?.role !== requireRole
    ) {
      router.replace("/");
    }
  }, [status, user, requireRole, router]);

  if (!authorized) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div
          role="status"
          aria-label="読み込み中"
          className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary"
        />
      </div>
    );
  }

  return <>{children}</>;
}
