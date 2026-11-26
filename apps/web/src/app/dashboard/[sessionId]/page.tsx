"use client";

import { useParams } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { AppHeader } from "@/components/AppHeader";
import { AnswerView } from "@/components/dashboard/AnswerView";

// 先輩ダッシュボード: 回答画面（§5.2 / §8。Issue #3・#4）。
// 会話履歴の表示・担当ロック・テキスト回答の送信を行う。発展班（先輩）のみアクセス可。
function AnswerPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="flex flex-1 flex-col">
        <AnswerView sessionId={sessionId} />
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <AuthGate requireRole="HATTEN">
      <AnswerPage />
    </AuthGate>
  );
}
