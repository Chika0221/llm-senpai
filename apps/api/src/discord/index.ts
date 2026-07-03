import { Client, GatewayIntentBits, Message, Partials, Events, EmbedBuilder } from 'discord.js';
import "../env.js"

export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // 重要: メッセージの内容を読み取るために必要
  ],
  partials: [Partials.Message, Partials.Channel],
});

discordClient.on(Events.ClientReady, () => {
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
  // TODO: ここ変える
  // console.log(`[Discord] Received message from ${message.author.username} in session ${session.id}`);

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
        data: { status: 'COMPLETED' }
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

// メッセージを整形する関数
const formatQuestion = (text: string): string => {
  let formatted = text;

  // 不要なブロックを削除
  formatted = formatted.replace(/<context>[\s\S]*?<\/context>/g, '');
  formatted = formatted.replace(/<reminderInstructions>[\s\S]*?<\/reminderInstructions>/g, '');

  // アタッチメントを整形
  formatted = formatted.replace(/<attachment id="([^"]+)">([\s\S]*?)<\/attachment>/g, '\n**[添付: $1]**\n$2\n');
  formatted = formatted.replace(/<\/?attachments>/g, '');

  // エディタコンテキストを整形
  formatted = formatted.replace(/<editorContext>([\s\S]*?)<\/editorContext>/g, '\n**[エディタコンテキスト]**\n$1\n');

  // userRequestを整形
  formatted = formatted.replace(/<userRequest>([\s\S]*?)<\/userRequest>/g, '\n**[質問]**\n$1\n');

  // USER_REQUESTタグを削除
  formatted = formatted.replace(/<\/?USER_REQUEST>/g, '');

  // その他の残ったタグを削除
  formatted = formatted.replace(/<[^>]+>/g, '');

  // 連続する空行を削減
  return formatted.replace(/\n{3,}/g, '\n\n').trim();
};

// 先輩へ質問を送信する関数（APIルートから呼ばれる）
export const askSenpai = async (rawQuestion: string, sessionId: string) => {
  const channelId = DISCORD_CHANNEL_ID;
  if (!channelId) {
    console.error('❌ DISCORD_CHANNEL_ID is not set in .env');
    return null;
  }

  const question = formatQuestion(rawQuestion);

  try {
    const channel = await discordClient.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      console.error('❌ Invalid Discord Channel ID');
      return null;
    }

    let message;
    if (question.length > 4000) {
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🔔 後輩からの新しい質問です！')
        .setDescription('*(内容が長いためファイルとして添付します)*')
        .setFooter({ text: `SessionID: ${sessionId}` })
        .setTimestamp();

      message = await channel.send({
        embeds: [embed],
        files: [{ attachment: Buffer.from(question, 'utf-8'), name: 'question.txt' }]
      });
    } else {
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🔔 後輩からの新しい質問です！')
        .setDescription(`\`\`\`\n${question}\n\`\`\``)
        .setFooter({ text: `SessionID: ${sessionId}` })
        .setTimestamp();

      message = await channel.send({
        embeds: [embed]
      });
    }

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
