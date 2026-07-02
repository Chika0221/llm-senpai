import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { db } from '../lib/db.js';
import { askSenpai } from '../discord/index.js';

export const chatRouter = new Hono();

chatRouter.post('/completions', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  console.log('[API] Received chat completion request:', JSON.stringify(body, null, 2));

  // Extract the latest user message
  const messages = body.messages || [];
  const latestMessage = messages[messages.length - 1]?.content || 'No message provided';

  // 1. DBにセッションを作成
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
  console.log(`[API] Created DB session: ${session.id}`);

  // 2. Discordの先輩へ質問を送信
  const discordInfo = await askSenpai(latestMessage, session.id);
  if (discordInfo) {
    // Discordへ送信できたらメッセージID等を保存
    await db.session.update({
      where: { id: session.id },
      data: { discordThreadId: discordInfo.threadId }
    });
  }

  // 3. Server-Sent Events (SSE) でストリーム応答を開始し、待機ループへ
  return streamSSE(c, async (stream) => {
    console.log('[API] Started SSE stream...');

    // 1. Send an initial chunk indicating that processing has started
    await stream.writeSSE({
      data: JSON.stringify({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: body.model || 'senpai-model',
        choices: [{ index: 0, delta: { role: 'assistant', content: '' } }],
      }),
    });

    // 2. データベースをポーリングして先輩の返信を待機するループ
    let isAnswered = false;
    let waitCount = 0;
    const MAX_WAIT_SECONDS = 300; // 5分待機（本来はもっと長くて良い）
    const POLL_INTERVAL = 2000;   // 2秒に1回DBを確認

    while (!isAnswered && waitCount < (MAX_WAIT_SECONDS * 1000) / POLL_INTERVAL) {
      // タイムアウト防止のためのKeep-Alive（空のチャンク）
      await stream.writeSSE({
        data: JSON.stringify({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: body.model || 'senpai-model',
          choices: [{ index: 0, delta: {} }], 
        }),
      });

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
          console.log('[API] Detected Senpai reply!');
          
          if (currentSession.status === 'EXECUTING' && latestMsg.commandName) {
            // Tool Call（コマンド実行指示）の場合
            await stream.writeSSE({
              data: JSON.stringify({
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: body.model || 'senpai-model',
                choices: [{
                  index: 0,
                  delta: {
                    tool_calls: [{
                      id: latestMsg.toolCallId || `call_${Date.now()}`,
                      type: "function",
                      function: {
                        name: latestMsg.commandName,
                        arguments: JSON.stringify({ command: latestMsg.content })
                      }
                    }]
                  }
                }],
              }),
            });
          } else {
            // 通常のテキスト回答の場合
            await stream.writeSSE({
              data: JSON.stringify({
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: body.model || 'senpai-model',
                choices: [{ index: 0, delta: { content: latestMsg.content } }],
              }),
            });
          }
          isAnswered = true;
        }
      }

      if (!isAnswered) {
        await stream.sleep(POLL_INTERVAL);
        waitCount++;
      }
    }

    // 3. Close the stream properly following the OpenAI spec
    await stream.writeSSE({ data: '[DONE]' });
    console.log('[API] Stream finished.');
  });
});
