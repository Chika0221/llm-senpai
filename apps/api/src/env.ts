export const DISCORD_TOKEN = process.env.DISCORD_TOKEN || ""
export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || ""
export const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || ""

export const DATABASE_URL = process.env.DATABASE_URL || ""

// --- 認証・認可（§5.7） ---
// Discord OAuth2
export const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || ""
export const DISCORD_OAUTH_REDIRECT_URI = process.env.DISCORD_OAUTH_REDIRECT_URI || ""

// 部員判定に使う対象ギルドと、役割判定に使うロールID
export const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || ""
export const ROLE_ID_KISO = process.env.ROLE_ID_KISO || ""     // 基礎班 = 後輩
export const ROLE_ID_HATTEN = process.env.ROLE_ID_HATTEN || "" // 発展班 = 先輩

// JWT セッション署名用シークレット
export const SESSION_SECRET = process.env.SESSION_SECRET || ""

// フロントエンド（Next.js）のオリジン。CORS 許可・ログイン後のリダイレクト先に使用
export const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:3000"

// Cookie の属性制御。クロスオリジン運用時は SameSite=None; Secure が必要
export const NODE_ENV = process.env.NODE_ENV || "development"
export const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined
