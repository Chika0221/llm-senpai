import { Client, GatewayIntentBits, Message, Partials } from 'discord.js';

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

// メッセージを受信したときの処理
discordClient.on('messageCreate', async (message: Message) => {
  // Bot自身のメッセージは無視する
  if (message.author.bot) return;

  console.log(`[Discord] Received message from ${message.author.username}: ${message.content}`);

  // TODO: リプライ元のメッセージからSessionIDを特定する処理（後で実装）
  
  // PowerShellのコードブロックが含まれているかチェック
  // 例: ```powershell\nGet-ChildItem\n``` または ```pwsh\n...
  const pwshMatch = message.content.match(/```(?:powershell|pwsh)\n([\s\S]*?)```/i);
  
  if (pwshMatch) {
    const command = pwshMatch[1].trim();
    console.log(`[Discord] 🔧 Detected PowerShell Tool Call: ${command}`);
    
    // TODO: ここでDBのSessionステータスをEXECUTINGに更新し、
    // API側（SSE待機ループ）へ「Tool Callとして返却する」通知を送る
    
    // 返信例（実際にはAPIを通じてCursor等に返されるため不要ですが、デバッグ用に残します）
    // await message.reply(`⏳ コマンドを実行します: \`${command}\``);
  } else {
    console.log(`[Discord] 💬 Detected normal text reply`);
    
    // TODO: 通常のテキスト回答としてAPI側へ返し、ステータスをREPLIEDに更新する処理
  }
});

// 初期化関数
export const initDiscordBot = async () => {
  const token = process.env.DISCORD_TOKEN;
  if (!token || token === 'YOUR_DISCORD_BOT_TOKEN_HERE') {
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
  const channelId = process.env.DISCORD_CHANNEL_ID;
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
