/**
 * フォーマット用ユーティリティ
 * HTMLライクなタグ（<userRequest> など）をDiscord表示用に整形する純粋関数
 */
export const formatQuestion = (text: string): string => {
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
