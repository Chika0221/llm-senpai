import { Message } from 'discord.js';
import { db } from '../../lib/db.js';
import { assessCommand } from '../../lib/dangerousCommand.js';

export const handleMessageCreate = async (message: Message) => {
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

  // ターミナルコマンドのコードブロックが含まれているかチェック
  const cmdMatch = message.content.match(/```(powershell|pwsh|bash|sh|zsh)\n([\s\S]*?)```/i);
  
  if (cmdMatch) {
    const lang = cmdMatch[1].toLowerCase();
    const command = cmdMatch[2].trim();
    
    let commandName = 'run_powershell';
    if (['bash', 'sh', 'zsh'].includes(lang)) {
      commandName = 'run_bash';
    }

    console.log(`[Discord] 🔧 Detected Tool Call (${commandName}): ${command}`);

    // 危険コマンドの検知（§5.4）。ブロックはせず警告ログを残し、最終判断は後輩の承認に委ねる。
    const danger = assessCommand(command);
    if (danger.isDangerous) {
      console.warn(`[Discord] ⚠️ 危険なコマンドを検知: ${danger.reasons.join(' / ')}`);
    }

    // DBにTool CallとしてMessageを保存し、セッションをEXECUTINGに変更。
    // 後輩の実行前承認（§5.4）を必須にするため approvalStatus=PENDING で保存する。
    await db.$transaction([
      db.message.create({
        data: {
          sessionId: session.id,
          role: 'ASSISTANT',
          content: command,
          commandName: commandName,
          toolCallId: `call_${Date.now()}`,
          approvalStatus: 'PENDING',
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
    
    // DBに通常のテキスト回答としてMessageを保存し、セッションをCOMPLETEDに変更
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
};
