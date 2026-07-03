import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { handleChatCompletion } from '../services/chatService.js';

export const chatRouter = new Hono();

chatRouter.post('/completions', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  console.log('[API] Received chat completion request:', JSON.stringify(body, null, 2));

  // 最新のユーザーメッセージを抽出
  const messages = body.messages || [];
  const latestMessage = messages[messages.length - 1]?.content || 'No message provided';
  const reqModel = body.model || 'senpai-model';

  // Server-Sent Events (SSE) でストリーム応答を開始
  return streamSSE(c, async (stream) => {
    console.log('[API] Started SSE stream via ChatService...');
    
    try {
      const generator = handleChatCompletion(latestMessage, reqModel);
      
      for await (const chunk of generator) {
        if (chunk.type === 'chunk') {
          await stream.writeSSE({
            data: JSON.stringify(chunk.data),
          });
        } else if (chunk.type === 'done') {
          await stream.writeSSE({ data: '[DONE]' });
        }
      }
    } catch (error) {
      console.error('[API] Error in chat completion stream:', error);
      // エラー発生時のストリーム内エラーハンドリング
      await stream.writeSSE({
        data: JSON.stringify({
          error: {
            message: 'Internal server error occurred during streaming.',
            type: 'internal_error',
          }
        })
      });
      await stream.writeSSE({ data: '[DONE]' });
    }
    
    console.log('[API] Stream finished.');
  });
});
