"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { fetchMe, logout as apiLogout, type AuthUser } from "./api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  // 認証状態を取り直す（ログイン直後やロール昇格の反映用）
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const me = await fetchMe(signal);
      if (signal?.aborted) return;
      setUser(me);
      setStatus(me ? "authenticated" : "unauthenticated");
    } catch {
      if (signal?.aborted) return;
      // ネットワーク障害等でも未ログイン扱いにフォールバックし、ガードを効かせる
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // 外部システム（API）への認証状態問い合わせ。setState は await 後に走るため
    // 同期的なカスケード更新ではない（fetch-on-mount の正当な用途）。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth は AuthProvider の内側で使用してください");
  }
  return ctx;
}
