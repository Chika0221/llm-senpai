/**
 * 危険コマンド検知（§5.4 安全要件）。
 *
 * 先輩が後輩のシェルで実行させるコマンドのうち、破壊的な操作
 * （削除・権限変更・外部送信・システム操作 等）を検知して警告する。
 *
 * 完全な安全性を保証するものではなく、後輩側の「実行前承認」を補助する
 * ための注意喚起。最終的な安全弁はあくまで後輩本人による承認（§5.4）。
 */

export type DangerLevel = 'none' | 'danger';

export interface DangerAssessment {
  level: DangerLevel;
  isDangerous: boolean;
  // 検知した危険の理由（日本語・複数可）。後輩の承認プロンプトに表示する。
  reasons: string[];
}

interface DangerRule {
  // コマンド文字列にマッチさせる正規表現
  pattern: RegExp;
  // ユーザーへ提示する警告理由
  reason: string;
}

// 破壊的・危険なコマンドのパターン集。過検知よりは取りこぼし防止を優先し、
// 迷ったら警告を出す方針（承認プロンプトで最終判断は後輩が行う）。
const DANGER_RULES: DangerRule[] = [
  // --- ファイル/ディレクトリの削除 ---
  {
    pattern: /\brm\s+(-[a-z]*\s+)*-?[a-z]*[rf]/i,
    reason: 'ファイル・ディレクトリを再帰的/強制的に削除します（rm -rf 等）',
  },
  { pattern: /\brmdir\b/i, reason: 'ディレクトリを削除します（rmdir）' },
  {
    pattern: /\bRemove-Item\b|(?<![\w-])\bri\b|(?<![\w-])\bdel\b|(?<![\w-])\berase\b/i,
    reason: 'ファイル・ディレクトリを削除します（Remove-Item / del 等）',
  },
  { pattern: /\brd\s+\/s/i, reason: 'ディレクトリを再帰的に削除します（rd /s）' },
  { pattern: /\bshred\b/i, reason: 'ファイルを復元不能に消去します（shred）' },
  { pattern: /\btruncate\b/i, reason: 'ファイルを切り詰めて内容を破棄します（truncate）' },

  // --- ディスク/フォーマット破壊 ---
  { pattern: /\bmkfs\b|\bformat\b/i, reason: 'ディスクをフォーマットします（データ全消去の恐れ）' },
  { pattern: /\bdd\b\s+.*\bof=/i, reason: 'dd による低レベル書き込み（ディスク破壊の恐れ）' },
  { pattern: />\s*\/dev\/(sd|nvme|disk|null|zero)/i, reason: 'デバイスファイルへの直接書き込み' },

  // --- 権限・所有者の変更 ---
  {
    pattern: /\bchmod\b|\bchown\b|\bchgrp\b|\bicacls\b|\btakeown\b|\battrib\b/i,
    reason: 'ファイルの権限・所有者を変更します（chmod / chown / icacls 等）',
  },

  // --- 外部からの取得をそのまま実行（リモートコード実行の典型） ---
  {
    pattern: /\b(curl|wget|iwr|Invoke-WebRequest|Invoke-RestMethod)\b[\s\S]*\|[\s\S]*\b(sh|bash|zsh|iex|Invoke-Expression|python|node|pwsh|powershell)\b/i,
    reason: '外部から取得した内容を直接実行します（curl … | sh 等の危険なパターン）',
  },
  {
    pattern: /\b(iex|Invoke-Expression)\b/i,
    reason: '文字列をコードとして評価・実行します（iex / Invoke-Expression）',
  },
  { pattern: /\beval\b/i, reason: '文字列をコードとして評価・実行します（eval）' },

  // --- システム操作 ---
  {
    pattern: /\bshutdown\b|\breboot\b|\bhalt\b|\bpoweroff\b/i,
    reason: 'システムを停止・再起動します',
  },
  {
    pattern: /\bkill(all)?\b|\bStop-Process\b|\btaskkill\b/i,
    reason: 'プロセスを強制終了します',
  },
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: 'フォークボム（システムを枯渇させます）' },

  // --- 権限昇格 ---
  { pattern: /\bsudo\b|\bsu\b\s|\brunas\b/i, reason: '管理者権限で実行します（sudo / runas 等）' },

  // --- バージョン管理の破壊的操作 ---
  {
    pattern: /\bgit\b[\s\S]*\b(push)\b[\s\S]*(--force|-f)\b|\bgit\b[\s\S]*\breset\b[\s\S]*--hard/i,
    reason: 'Git 履歴を破壊的に上書きします（force push / reset --hard）',
  },

  // --- データベースの破壊的操作 ---
  {
    pattern: /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b(?![\s\S]*\bWHERE\b)/i,
    reason: 'データベースを破壊的に操作します（DROP / TRUNCATE / WHERE無しDELETE）',
  },

  // --- 機密情報の外部送信 ---
  {
    pattern: /(\.env|id_rsa|id_ed25519|\.ssh|credentials|secrets?)\b[\s\S]*\b(curl|wget|nc|scp|Invoke-WebRequest)\b/i,
    reason: '機密情報を外部へ送信する恐れがあります',
  },
];

/**
 * コマンド文字列を評価し、危険度と理由を返す。
 * @param command 実行対象のコマンド（複数行可）
 */
export function assessCommand(command: string): DangerAssessment {
  const target = command ?? '';
  const reasons: string[] = [];

  for (const rule of DANGER_RULES) {
    if (rule.pattern.test(target)) {
      reasons.push(rule.reason);
    }
  }

  // 同一理由の重複を除去
  const uniqueReasons = [...new Set(reasons)];
  const isDangerous = uniqueReasons.length > 0;

  return {
    level: isDangerous ? 'danger' : 'none',
    isDangerous,
    reasons: uniqueReasons,
  };
}
