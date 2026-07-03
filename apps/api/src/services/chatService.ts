import { db } from '../lib/db.js';
import { askSenpai } from '../discord/index.js';

export interface ChatChunk {
  type: 'chunk' | 'done';
  data?: any;
}

/**
 * チャット補完のリクエストを処理し、非同期ジェネレータを介して結果（チャンク）をストリーミング配信します。
 * Hono等のWebフレームワークに依存しないため、ビジネスロジックのテストや移植が容易になります。
 */
export async function* handleChatCompletion(
  latestMessage: string,
  bodyModel: string = 'senpai-model'
): AsyncGenerator<ChatChunk, void, unknown> {
  const streamId = `chatcmpl-${Date.now()}`;
  const createdTime = Math.floor(Date.now() / 1000);

  // 1. 最初に応答開始を通知（「考え中...」を出力）
  yield {
    type: 'chunk',
    data: {
      id: streamId,
      object: 'chat.completion.chunk',
      created: createdTime,
      model: bodyModel,
      choices: [{ index: 0, delta: { role: 'assistant', content: '考え中...\n' }, finish_reason: null }],
    }
  };

  // 2. DBにセッションを作成
  const session = await db.session.create({
    data: {
      source: 'API',
      status: 'WAITING',
      messages: {
        create: {
          role: 'USER',
          content: latestMessage,
        }
      }
    }
  });
  console.log(`[ChatService] Created DB session: ${session.id}`);

  // 3. Discordの先輩へ質問を送信
  const discordInfo = await askSenpai(latestMessage, session.id);
  if (discordInfo) {
    // Discordへ送信できたらメッセージID等を保存
    await db.session.update({
      where: { id: session.id },
      data: { discordThreadId: discordInfo.threadId }
    });
  }

  // 4. データベースをポーリングして先輩の返信を待機するループ
  let isAnswered = false;
  let waitCount = 0;
  const MAX_WAIT_SECONDS = 300; // 5分待機
  const POLL_INTERVAL = 2000;   // 2秒に1回DBを確認

  while (!isAnswered && waitCount < (MAX_WAIT_SECONDS * 1000) / POLL_INTERVAL) {
    // タイムアウト防止のためのKeep-Alive（空のチャンク）
    yield {
      type: 'chunk',
      data: {
        id: streamId,
        object: 'chat.completion.chunk',
        created: createdTime,
        model: bodyModel,
        choices: [{ index: 0, delta: {}, finish_reason: null }], 
      }
    };

    // DBから現在の状態を取得
    const currentSession = await db.session.findUnique({
      where: { id: session.id },
      include: { 
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        } 
      }
    });

    if (currentSession && currentSession.status !== 'WAITING' && currentSession.status !== 'OPEN') {
      const latestMsg = currentSession.messages[0];
      
      if (latestMsg && latestMsg.role !== 'USER') {
        console.log('[ChatService] Detected Senpai reply!');
        
        if (currentSession.status === 'EXECUTING' && latestMsg.commandName) {
          // Tool Call（コマンド実行指示）の場合
          yield {
            type: 'chunk',
            data: {
              id: streamId,
              object: 'chat.completion.chunk',
              created: createdTime,
              model: bodyModel,
              choices: [{
                index: 0,
                delta: {
                  tool_calls: [{
                    index: 0,
                    id: latestMsg.toolCallId || `call_${Date.now()}`,
                    type: "function",
                    function: {
                      name: latestMsg.commandName,
                      arguments: JSON.stringify({ command: latestMsg.content })
                    }
                  }]
                },
                finish_reason: "tool_calls"
              }],
            }
          };
        } else {
          // 通常のテキスト回答の場合
          yield {
            type: 'chunk',
            data: {
              id: streamId,
              object: 'chat.completion.chunk',
              created: createdTime,
              model: bodyModel,
              choices: [{ index: 0, delta: { content: latestMsg.content }, finish_reason: "stop" }],
            }
          };
        }
        isAnswered = true;
      }
    }

    if (!isAnswered) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
      waitCount++;
    }
  }

  // タイムアウトした場合の処理
  if (!isAnswered) {
    yield {
      type: 'chunk',
      data: {
        id: streamId,
        object: 'chat.completion.chunk',
        created: createdTime,
        model: bodyModel,
        choices: [{ index: 0, delta: { content: '\n[タイムアウトしました]' }, finish_reason: "stop" }],
      }
    };
  }

  // 5. 終了を通知
  yield {
    type: 'done'
  };
}
