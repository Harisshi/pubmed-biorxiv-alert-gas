/**
 * インパクトファクターの照合。
 *
 * 以前は論文 1 件ごとに Google ドライブから CSV を読み直し、
 * 全行に対してレーベンシュタイン距離を計算していたため、
 * 論文数が増えると GAS の実行時間上限に達していました。
 *
 * 現在は 1 回の実行につき CSV を 1 度だけ読み込んで索引を作り、
 * 完全一致 → 略称一致 → 近似一致 の順に照合します。
 * 近似一致は先頭 2 文字と文字数で候補を絞ってから計算します。
 */

/** CSV の列名。表記ゆれに備えて候補を列挙しています。 */
const IMPACT_FACTOR_COLUMN_ALIASES = {
  name: ['Name', 'Journal name', 'Journal', 'Full Name'],
  abbreviation: ['Abbr Name', 'Abbreviation', 'JCR Abbreviation', 'ISO Abbreviation'],
  jif: ['JIF', '2023 JIF', 'Impact Factor', 'IF'],
  jif5Years: ['JIF5Years', 'JIF 5 Years', '5 Year JIF', 'IF5'],
};

/** 照合結果が無いことを表す値。 */
const EMPTY_IMPACT_FACTOR = {
  impactFactor: 0,
  impactFactor5Years: 0,
  matchedJournal: '',
  found: false,
};

/** 1 回の実行中だけ有効な索引のキャッシュ。 */
let __impactFactorIndex = null;

/**
 * ジャーナル名からインパクトファクターを引きます。
 *
 * @param {string} journalName
 * @param {!Object} config
 * @return {{impactFactor: number, impactFactor5Years: number, matchedJournal: string, found: boolean}}
 */
function lookupImpactFactor(journalName, config) {
  if (!journalName) return EMPTY_IMPACT_FACTOR;

  const index = getImpactFactorIndex_();
  if (!index) return EMPTY_IMPACT_FACTOR;

  const normalized = normalizeJournalName(journalName);
  if (!normalized) return EMPTY_IMPACT_FACTOR;

  const exact = index.byName[normalized] || index.byAbbreviation[normalized];
  if (exact) return toImpactFactorResult_(exact);

  const approximate = findApproximateMatch_(normalized, index, config.impactFactorMatchThreshold);
  return approximate ? toImpactFactorResult_(approximate) : EMPTY_IMPACT_FACTOR;
}

/**
 * 索引のエントリを戻り値の形に変換します。
 * @param {!Object} entry
 * @return {!Object}
 */
function toImpactFactorResult_(entry) {
  return {
    impactFactor: entry.jif,
    impactFactor5Years: entry.jif5Years,
    matchedJournal: entry.name,
    found: true,
  };
}

/**
 * CSV を読み込んで索引を作ります（実行中は 1 回だけ）。
 * @return {?Object} 読み込めなかった場合は null
 */
function getImpactFactorIndex_() {
  if (__impactFactorIndex !== null) {
    return __impactFactorIndex.entries.length > 0 ? __impactFactorIndex : null;
  }

  const csvFileId = getSecret('IMPACT_FACTOR_CSV_ID');
  if (!csvFileId) {
    logInfo('IMPACT_FACTOR_CSV_ID が未設定のため、インパクトファクターの照合は行いません');
    __impactFactorIndex = { entries: [], byName: {}, byAbbreviation: {}, buckets: {} };
    return null;
  }

  try {
    const csvContent = DriveApp.getFileById(csvFileId).getBlob().getDataAsString();
    __impactFactorIndex = buildImpactFactorIndex(Utilities.parseCsv(csvContent));
    logInfo('インパクトファクター CSV を読み込みました: ' + __impactFactorIndex.entries.length + ' 誌');
    return __impactFactorIndex.entries.length > 0 ? __impactFactorIndex : null;
  } catch (e) {
    logError('インパクトファクター CSV を読み込めませんでした', e);
    __impactFactorIndex = { entries: [], byName: {}, byAbbreviation: {}, buckets: {} };
    return null;
  }
}

/**
 * パース済み CSV から索引を作ります。GAS API に依存しない純粋関数です。
 *
 * @param {!Array<!Array<string>>} csvData 1 行目がヘッダー
 * @return {{entries: !Array<!Object>, byName: !Object, byAbbreviation: !Object, buckets: !Object}}
 */
function buildImpactFactorIndex(csvData) {
  const index = { entries: [], byName: {}, byAbbreviation: {}, buckets: {} };
  if (!csvData || csvData.length < 2) return index;

  const headers = csvData[0].map(function (header) { return String(header).trim(); });
  const nameColumn = findColumnIndex(headers, IMPACT_FACTOR_COLUMN_ALIASES.name);
  const abbreviationColumn = findColumnIndex(headers, IMPACT_FACTOR_COLUMN_ALIASES.abbreviation);
  const jifColumn = findColumnIndex(headers, IMPACT_FACTOR_COLUMN_ALIASES.jif);
  const jif5Column = findColumnIndex(headers, IMPACT_FACTOR_COLUMN_ALIASES.jif5Years);

  if (nameColumn < 0 || jifColumn < 0) {
    throw new Error(
      'CSV に必要な列が見つかりません（Name と JIF は必須です）。実際の列: ' + headers.join(', ')
    );
  }

  for (let i = 1; i < csvData.length; i++) {
    const row = csvData[i];
    const name = String(row[nameColumn] || '').trim();
    if (!name) continue;

    const entry = {
      name: name,
      normalizedName: normalizeJournalName(name),
      normalizedAbbreviation: abbreviationColumn >= 0
        ? normalizeJournalName(row[abbreviationColumn]) : '',
      jif: parseImpactFactorValue(row[jifColumn]),
      jif5Years: jif5Column >= 0 ? parseImpactFactorValue(row[jif5Column]) : 0,
    };

    index.entries.push(entry);

    // 先に登録された行を優先します（CSV の上位行ほど代表的な表記である想定）。
    if (entry.normalizedName && !index.byName[entry.normalizedName]) {
      index.byName[entry.normalizedName] = entry;
    }
    if (entry.normalizedAbbreviation && !index.byAbbreviation[entry.normalizedAbbreviation]) {
      index.byAbbreviation[entry.normalizedAbbreviation] = entry;
    }

    // 近似一致の候補を絞るため、先頭 2 文字でまとめておきます。
    const bucketKey = entry.normalizedName.substring(0, 2);
    if (!index.buckets[bucketKey]) index.buckets[bucketKey] = [];
    index.buckets[bucketKey].push(entry);
  }

  return index;
}

/**
 * ヘッダー配列から、候補名のいずれかに一致する列の位置を返します。
 * GAS API に依存しない純粋関数です。
 *
 * @param {!Array<string>} headers
 * @param {!Array<string>} candidates
 * @return {number} 見つからない場合は -1
 */
function findColumnIndex(headers, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const position = headers.indexOf(candidates[i]);
    if (position >= 0) return position;
  }
  return -1;
}

/**
 * CSV のインパクトファクター値を数値に変換します。
 * 'N/A' や '<0.1' のような値は 0 として扱います。
 * GAS API に依存しない純粋関数です。
 *
 * @param {*} value
 * @return {number}
 */
function parseImpactFactorValue(value) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (!text) return 0;
  const parsed = parseFloat(text.replace(/[,<>]/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * 近似一致する索引エントリを探します。
 *
 * @param {string} normalized 正規化済みのジャーナル名
 * @param {!Object} index
 * @param {number} threshold 類似度の下限（0〜1）
 * @return {?Object}
 */
function findApproximateMatch_(normalized, index, threshold) {
  const candidates = index.buckets[normalized.substring(0, 2)] || [];
  const maxDistance = Math.floor(normalized.length * (1 - threshold));
  if (maxDistance < 1) return null;

  let best = null;
  let bestScore = threshold;

  for (let i = 0; i < candidates.length; i++) {
    const entry = candidates[i];
    if (Math.abs(entry.normalizedName.length - normalized.length) > maxDistance) continue;

    const score = similarityRatio(normalized, entry.normalizedName, maxDistance);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return best;
}

/**
 * ジャーナル名を比較用に正規化します（小文字化し英数字だけを残す）。
 * GAS API に依存しない純粋関数です。
 *
 * @param {*} name
 * @return {string}
 */
function normalizeJournalName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * 2 つの文字列の類似度を 0〜1 で返します。
 * GAS API に依存しない純粋関数です。
 *
 * @param {string} a
 * @param {string} b
 * @param {number=} maxDistance これを超える距離は打ち切ります
 * @return {number}
 */
function similarityRatio(a, b, maxDistance) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const longest = Math.max(a.length, b.length);
  const limit = typeof maxDistance === 'number' ? maxDistance : longest;
  const distance = levenshteinDistance(a, b, limit);
  if (distance > limit) return 0;
  return 1 - distance / longest;
}

/**
 * レーベンシュタイン距離を計算します。
 * maxDistance を超えることが確定した時点で打ち切ります。
 * GAS API に依存しない純粋関数です。
 *
 * @param {string} a
 * @param {string} b
 * @param {number} maxDistance
 * @return {number} 打ち切った場合は maxDistance + 1
 */
function levenshteinDistance(a, b, maxDistance) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  let previousRow = [];
  for (let j = 0; j <= b.length; j++) previousRow[j] = j;

  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i];
    let rowMinimum = i;

    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      const value = Math.min(
        previousRow[j] + 1,
        currentRow[j - 1] + 1,
        previousRow[j - 1] + substitutionCost
      );
      currentRow[j] = value;
      if (value < rowMinimum) rowMinimum = value;
    }

    if (rowMinimum > maxDistance) return maxDistance + 1;
    previousRow = currentRow;
  }

  return previousRow[b.length];
}
