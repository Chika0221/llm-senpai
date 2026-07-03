import { EmbedBuilder } from 'discord.js';
import { discordClient } from '../client.js';
import { DISCORD_CHANNEL_ID } from '../../env.js';
import { formatQuestion } from '../utils/formatter.js';

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
