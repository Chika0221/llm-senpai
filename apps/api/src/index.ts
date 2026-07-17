import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { initDiscordBot } from './discord/index.js'
import { chatRouter } from './routes/chat.js'
import { authRouter } from './routes/auth.js'
import { dashboardRouter } from './routes/dashboard.js'
import { requireMember } from './middleware/auth.js'
import type { AuthVariables } from './middleware/auth.js'
import { WEB_ORIGIN, DEV_AUTH_BYPASS } from './env.js'

if (DEV_AUTH_BYPASS) {
  console.warn('⚠️⚠️ DEV_AUTH_BYPASS 有効: Discord 認証をバイパスしています（開発用・本番では無効）')
}

import { cors } from 'hono/cors'

const app = new Hono<{ Variables: AuthVariables }>()

// Cookie セッションを跨いで送受信するため credentials を許可し、オリジンを限定する
app.use('*', cors({
  origin: WEB_ORIGIN,
  credentials: true,
}))

app.get('/', (c) => {
  return c.text('Hello Hono! (llm_senpai api)')
})

// 認証・認可（§5.7）
app.route('/auth', authRouter)

// 先輩ダッシュボード配下API（§5.2）。ルーター内で発展班のみに認可制限する
app.route('/dashboard', dashboardRouter)

// 質問受付API（OpenAI互換）は部員全員に許可（Cookie or Bearer JWT）
app.use('/v1/*', requireMember)

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
