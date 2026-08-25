/**
 * ユーザー設定ファイル（テンプレート）
 *
 * 使い方:
 *   1. このファイルを同じディレクトリに `UserConfig.js` という名前でコピーする
 *        cp src/UserConfig.example.js src/UserConfig.js
 *   2. コピーした `UserConfig.js` を自分の用途に合わせて編集する
 *   3. `clasp push` で Google Apps Script に反映する
 *
 * `UserConfig.js` は .gitignore で除外されているため、リポジトリには入りません。
 *
 * ⚠ API キー・アクセストークン・スプレッドシート ID などの秘密情報は
 *    このファイルには書かないでください。スクリプトプロパティに保存します。
 *    設定方法は README の「セットアップ」を参照してください。
 *
 * ここで指定しなかった項目は Config.js の DEFAULT_CONFIG の値が使われます。
 */
const USER_CONFIG = {
  // ── 検索設定 ───────────────────────────────────────────────
  /** 検索キーワード。PubMed の検索式をそのまま書けます。 */
  searchKeywords: [
    'Golgi',
    'Microtubule',
    'Cellular senescence',
  ],

  /** 検索期間: '1d' | '3d' | '7d' | '30d' | '1y' | 'custom' */
  searchPeriod: '1d',

  /** searchPeriod が 'custom' のときのみ使用（YYYY-MM-DD） */
  customStartDate: '2024-06-19',
  customEndDate: '2024-06-26',

  /** キーワードごとに PubMed から取得する最大件数 */
  maxResultsPerKeyword: 100,

  /**
   * PubMed の日付の解釈。
   *   'edat' … PubMed に登録された日（新着通知にはこちらが適しています）
   *   'pdat' … 出版日（掲載号の日付。実際の登録より前後することがあります）
   */
  pubmedDateType: 'edat',

  /** 検索対象のプレプリントサーバー: 'biorxiv' / 'medrxiv' */
  bioRxivServers: ['biorxiv'],

  /**
   * プレプリントサーバーから 1 回の実行で取得する最大件数。
   * 期間を長くする場合は増やしてください（GAS の実行時間上限に注意）。
   */
  maxBioRxivRecords: 2000,

  // ── 要約（生成 AI）設定 ────────────────────────────────────
  /** Gemini による要約を使うかどうか（false なら要約列は空になります） */
  useGenerativeAI: true,

  /** 使用する Gemini モデル */
  geminiModel: 'gemini-2.5-flash',

  /** 日本語要約の最大文字数 */
  maxAbstractLength: 300,

  // ── 通知設定 ───────────────────────────────────────────────
  /** 通知先: 'line' | 'slack' | 'email' の配列。複数指定できます。 */
  notificationMethods: ['line'],

  /** 新着が 0 件のときも通知するか */
  notifyOnNoResults: false,

  /**
   * 複数のキーワードにヒットした論文を 1 回だけ通知するか。
   * false にすると、ヒットしたキーワードの数だけ通知に載ります。
   */
  deduplicateAcrossKeywords: true,

  /** 通知メッセージの内容 */
  notificationFormat: {
    includeImpactFactor: true,       // インパクトファクターを載せる
    includeJapaneseAbstract: true,   // 日本語要約を載せる
    includeSummarizedAbstract: false,// 英語要約（短縮版）を載せる
    includeAbstract: false,          // 原文要旨をそのまま載せる
    maxPapersPerKeyword: 30,         // 1 キーワードあたりの掲載上限
    abstractPreviewLength: 300,      // 通知に載せる要約の最大文字数
  },

  // ── インパクトファクター設定 ───────────────────────────────
  /** この値未満の論文は通知しない（JIF と JIF5Years のどちらかが上回れば通知） */
  minImpactFactor: 4.0,

  /**
   * インパクトファクターが CSV に見つからない論文の扱い。
   *   true  … 通知しない（IF 不明の雑誌を切り捨てる）
   *   false … 通知する（新しい雑誌などを取りこぼさない）
   */
  skipPapersWithUnknownImpactFactor: false,

  /**
   * ジャーナル名が完全一致しなかったときの近似照合の厳しさ（0〜1）。
   * 高いほど厳格になり、別の雑誌に誤って一致する可能性が下がります。
   */
  impactFactorMatchThreshold: 0.9,

  // ── 使用量の上限（1 日あたり） ─────────────────────────────
  maxGeminiRequestsPerDay: 1500,
  maxGasTriggersPerDay: 45,
  maxLineNotificationsPerDay: 20,
  maxSlackNotificationsPerDay: 20,
};
