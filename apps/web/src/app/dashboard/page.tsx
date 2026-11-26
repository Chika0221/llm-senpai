"use client";

import { AuthGate } from "@/components/AuthGate";
import { AppHeader } from "@/components/AppHeader";
import { QueueBoard } from "@/components/dashboard/QueueBoard";

// 先輩ダッシュボード: 質問キュー画面（§5.2 / §8。Issue #3）。
// 発展班（先輩）のみアクセス可。AuthGate と配下APIの requireHatten で二重にガードする。
function Dashboard() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="flex flex-1 flex-col">
        <QueueBoard />
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <AuthGate requireRole="HATTEN">
      <Dashboard />
    </AuthGate>
  );
}
