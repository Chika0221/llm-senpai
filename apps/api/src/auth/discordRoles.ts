import { discordClient } from '../discord/client.js';
import { DISCORD_GUILD_ID, ROLE_ID_KISO, ROLE_ID_HATTEN } from '../env.js';

// ギルドロールから判定するユーザー役割（Prisma の UserRole と対応）
export type MemberRole = 'KISO' | 'HATTEN';

export interface GuildMembership {
  isMember: boolean;          // 対象ギルドに所属しているか（＝部員か）
  role: MemberRole | null;    // 所属している場合の役割。非所属は null
}

/**
 * ロールIDの一覧から役割を決定する純粋関数（テスト容易性のため分離）。
 * - 発展班ロールを持てば HATTEN（両ロール保持時も HATTEN 優先）
 * - それ以外（基礎班のみ / 未割り当て）は KISO（最小権限）
 */
export function decideRole(roleIds: string[]): MemberRole {
  if (ROLE_ID_HATTEN && roleIds.includes(ROLE_ID_HATTEN)) return 'HATTEN';
  return 'KISO';
}

// Discord API のエラーコード（UnknownMember / UnknownUser）
const NOT_A_MEMBER_CODES = new Set([10007, 10013]);

/**
 * Bot（Botトークン）が対象ギルドのメンバー情報を照会し、
 * 部員判定（所属可否）と役割判定（KISO/HATTEN）を行う。§5.7 の主案。
 * OAuth スコープは `identify` のみで済むよう、ロールはこの Bot 照会で取得する。
 */
export async function resolveGuildMembership(discordUserId: string): Promise<GuildMembership> {
  if (!DISCORD_GUILD_ID) {
    throw new Error('DISCORD_GUILD_ID が設定されていません（部員判定に必須）');
  }

  const guild = await discordClient.guilds.fetch(DISCORD_GUILD_ID);

  try {
    // 単一メンバーの REST 照会。特権 GuildMembers intent は不要
    const member = await guild.members.fetch(discordUserId);
    const roleIds = [...member.roles.cache.keys()];
    return { isMember: true, role: decideRole(roleIds) };
  } catch (err: any) {
    if (err && NOT_A_MEMBER_CODES.has(err.code)) {
      // ギルド非所属 = 部外者。ログイン拒否対象
      return { isMember: false, role: null };
    }
    // それ以外（Botの権限不足・ネットワーク等）は上位で 500 扱い
    throw err;
  }
}
