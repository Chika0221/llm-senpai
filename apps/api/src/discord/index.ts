import { Client, GatewayIntentBits, Message, Partials } from 'discord.js';
import "../env.js"

export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // 重要: メッセージの内容を読み取るために必要
  ],
  partials: [Partials.Message, Partials.Channel],
});

discordClient.on('ready', () => {
  console.log(`🤖 Discord Bot is ready! Logged in as ${discordClient.user?.tag}`);
});

import { db } from '../lib/db.js';
import { DISCORD_CHANNEL_ID, DISCORD_TOKEN } from '../env.js';

// メッセージを受信したときの処理
discordClient.on('messageCreate', async (message: Message) => {
  // Bot自身のメッセージは無視する
  if (message.author.bot) return;

  // このメッセージがスレッド内で送信されたものか確認し、DBからセッションを探す
  const session = await db.session.findUnique({
    where: { discordThreadId: message.channel.id }
  });

  if (!session) {
    // セッションに紐付かないスレッドやチャンネルの会話は無視する
    return;
  }

  console.log(`[Discord] Received message from ${message.author.username} in session ${session.id}`);

  // PowerShellのコードブロックが含まれているかチェック
  const pwshMatch = message.content.match(/```(?:powershell|pwsh)\n([\s\S]*?)```/i);
  
  if (pwshMatch) {
    const command = pwshMatch[1].trim();
    console.log(`[Discord] 🔧 Detected PowerShell Tool Call: ${command}`);
    
    // DBにTool CallとしてMessageを保存し、セッションをEXECUTINGに変更
    await db.$transaction([
      db.message.create({
        data: {
          sessionId: session.id,
          role: 'ASSISTANT',
          content: command,
          commandName: 'run_powershell',
          toolCallId: `call_${Date.now()}`,
          discordMessageId: message.id,
        }
      }),
      db.session.update({
        where: { id: session.id },
        data: { status: 'EXECUTING' }
      })
    ]);
  } else {
    console.log(`[Discord] 💬 Detected normal text reply`);
    
    // DBに通常のテキスト回答としてMessageを保存し、セッションをREPLIEDに変更
    await db.$transaction([
      db.message.create({
        data: {
          sessionId: session.id,
          role: 'ASSISTANT',
          content: message.content,
          discordMessageId: message.id,
        }
      }),
      db.session.update({
        where: { id: session.id },
        data: { status: 'REPLIED' }
      })
    ]);
  }
});

// 初期化関数
export const initDiscordBot = async () => {
  const token = DISCORD_TOKEN;
  if (!token || String(token) === 'YOUR_DISCORD_BOT_TOKEN_HERE') {
    console.log('わわわ : ', token);
    console.warn('⚠️ DISCORD_TOKEN is not set or invalid. Skipping Discord Bot initialization.');
    return;
  }

  try {
    await discordClient.login(token);
  } catch (error) {
    console.error('❌ Failed to login to Discord:', error);
  }
};

// 先輩へ質問を送信する関数（APIルートから呼ばれる）
export const askSenpai = async (question: string, sessionId: string) => {
  const channelId = DISCORD_CHANNEL_ID;
  if (!channelId) {
    console.error('❌ DISCORD_CHANNEL_ID is not set in .env');
    return null;
  }

  try {
    const channel = await discordClient.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      console.error('❌ Invalid Discord Channel ID');
      return null;
    }

    // 質問を送信
    const message = await channel.send({
      content: `🔔 **後輩からの新しい質問です！**\n\n\`\`\`\n${question}\n\`\`\`\n*SessionID: ${sessionId}*`,
    });

    // スレッドを作成してやり取りをまとめる
    const thread = await message.startThread({
      name: `質問セッション: ${sessionId.substring(0, 8)}`,
      autoArchiveDuration: 60,
    });

    console.log(`[Discord] Posted question to channel ${channelId}, created thread ${thread.id}`);
    return { messageId: message.id, threadId: thread.id };
  } catch (error) {
    console.error('❌ Failed to ask Senpai:', error);
    return null;
  }
};
