import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { initDiscordBot } from './discord/index.js'
import { chatRouter } from './routes/chat.js'

import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors())

app.get('/', (c) => {
  return c.text('Hello Hono! (llm_senpai api)')
})

// OpenAI互換APIのルーティング
app.route('/v1/chat', chatRouter)

app.get('/v1/models', (c) => {
  return c.json({
    object: 'list',
    data: [
      {
        id: 'senpai-model',
        object: 'model',
        created: 1717200000,
        owned_by: 'system'
      }
    ]
  })
})

// Discord Botの初期化
initDiscordBot();

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT) || 7070,
  hostname: '0.0.0.0'
}, (info) => {
  console.log(`Server is running on ${info.address}:${info.port}`)
})
