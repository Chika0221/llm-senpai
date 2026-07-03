import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';
import { DISCORD_TOKEN } from '../env.js';

export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // メッセージの内容を読み取るために必要
  ],
  partials: [Partials.Message, Partials.Channel],
});

discordClient.on(Events.ClientReady, () => {
  console.log(`🤖 Discord Bot is ready! Logged in as ${discordClient.user?.tag}`);
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
