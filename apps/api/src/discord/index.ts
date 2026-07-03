import { discordClient, initDiscordBot } from './client.js';
import { handleMessageCreate } from './handlers/messageCreate.js';
import { askSenpai } from './services/senpaiService.js';

// イベントの登録
discordClient.on('messageCreate', handleMessageCreate);

export {
  discordClient,
  initDiscordBot,
  askSenpai
};
