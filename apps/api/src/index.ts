import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { initDiscordBot } from './discord/index.js'
import { chatRouter } from './routes/chat.js'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono! (llm_senpai api)')
})

// OpenAI互換APIのルーティング
app.route('/v1/chat', chatRouter)

// Discord Botの初期化
initDiscordBot();

serve({
  fetch: app.fetch,
  port: 7070
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
