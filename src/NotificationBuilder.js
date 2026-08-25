/**
 * 通知メッセージの組み立て。
 *
 * このファイルの関数はすべて GAS API に依存しない純粋関数で、
 * test/ のユニットテストで検証しています。
 */

/** 論文どうしの区切り線。 */
const PAPER_SEPARATOR = '----------------------------------------';

/** ページ番号 "(1/2)" を付けるために確保しておく文字数。 */
const PAGE_LABEL_RESERVE = 12;

/**
 * インパクトファクターが通知の条件を満たすかを判定します。
 *
 * JIF と 5 年 JIF のどちらかが閾値以上なら通知対象です。
 * 通知の可否と通知件数の表示で同じ基準を使うため、判定はこの関数に一本化しています。
 *
 * @param {!Object} paper
 * @param {!Object} config
 * @return {boolean}
 */
function meetsImpactFactorThreshold(paper, config) {
  if (paper.category !== PAPER_CATEGORY_PUBMED) return true;
  if (!config.minImpactFactor) return true;

  const jif = toNumber(paper.impactFactor);
  const jif5 = toNumber(paper.impactFactor5Years);

  // どちらも 0 の場合は「CSV に見つからなかった」とみなします。
  if (jif === 0 && jif5 === 0) return !config.skipPapersWithUnknownImpactFactor;

  return jif >= config.minImpactFactor || jif5 >= config.minImpactFactor;
}

/**
 * 1 キーワード分の通知メッセージを組み立てます。
 *
 * @param {string} keyword
 * @param {!Array<!Object>} papers 通知対象の論文（すでに閾値で絞り込み済み）
 * @param {!Object} config
 * @param {string} todayStr 'YYYY/MM/DD'
 * @return {?{header: string, blocks: !Array<string>}} 対象が無い場合は null
 */
function buildNotificationParts(keyword, papers, config, todayStr) {
  if (!papers || papers.length === 0) return null;

  const pubmedPapers = papers.filter(function (paper) {
    return paper.category === PAPER_CATEGORY_PUBMED;
  }).sort(function (a, b) {
    return highestImpactFactor_(b) - highestImpactFactor_(a);
  });

  const preprints = papers.filter(function (paper) {
    return paper.category === PAPER_CATEGORY_BIORXIV;
  });

  const limit = config.notificationFormat.maxPapersPerKeyword;
  const shownPubmed = pubmedPapers.slice(0, limit);
  const shownPreprints = preprints.slice(0, limit);
  const omitted = (pubmedPapers.length - shownPubmed.length) +
    (preprints.length - shownPreprints.length);

  let header = todayStr + ' の新着論文\n';
  header += 'キーワード: ' + keyword + '\n';
  header += '通知件数: PubMed ' + pubmedPapers.length + ' 件 / プレプリント ' +
    preprints.length + ' 件\n';
  if (omitted > 0) {
    header += '※ 掲載上限のため ' + omitted + ' 件を省略しました\n';
  }

  const blocks = [];
  shownPubmed.forEach(function (paper, index) {
    const prefix = index === 0 ? '\n■ PubMed\n' : '';
    blocks.push(prefix + buildPaperBlock(paper, index + 1, config));
  });
  shownPreprints.forEach(function (paper, index) {
    const prefix = index === 0 ? '\n■ プレプリント\n' : '';
    blocks.push(prefix + buildPaperBlock(paper, index + 1, config));
  });

  return { header: header, blocks: blocks };
}

/**
 * 論文 1 件分の本文を組み立てます。
 *
 * @param {!Object} paper
 * @param {number} index 通知内での通し番号
 * @param {!Object} config
 * @return {string}
 */
function buildPaperBlock(paper, index, config) {
  const format = config.notificationFormat;
  let block = '\n' + index + '. ' + paper.title + '\n';
  block += '著者: ' + formatAuthors(paper.authors) + '\n';
  block += 'ジャーナル: ' + (paper.journal || '不明') + '\n';

  if (paper.matchedJournal && paper.matchedJournal !== paper.journal) {
    block += '（IF 照合先: ' + paper.matchedJournal + '）\n';
  }

  if (format.includeImpactFactor && paper.category === PAPER_CATEGORY_PUBMED) {
    block += 'インパクトファクター: ' + formatImpactFactor(paper) + '\n';
  }

  if (format.includeSummarizedAbstract && paper.summarizedAbstract) {
    block += '要約: ' + truncateText(paper.summarizedAbstract, format.abstractPreviewLength) + '\n';
  }

  if (format.includeJapaneseAbstract && paper.japaneseAbstract) {
    block += '日本語要約: ' + truncateText(paper.japaneseAbstract, format.abstractPreviewLength) + '\n';
  }

  if (format.includeAbstract && paper.abstract) {
    block += '要旨: ' + truncateText(paper.abstract, format.abstractPreviewLength) + '\n';
  }

  block += 'URL: ' + paper.url + '\n';
  block += PAPER_SEPARATOR + '\n';
  return block;
}

/**
 * インパクトファクターの表示文字列を返します。
 * @param {!Object} paper
 * @return {string}
 */
function formatImpactFactor(paper) {
  const jif = toNumber(paper.impactFactor);
  const jif5 = toNumber(paper.impactFactor5Years);
  if (jif === 0 && jif5 === 0) return '不明';
  if (jif5 === 0) return String(jif);
  if (jif === 0) return '5年 ' + jif5;
  return jif + '（5年 ' + jif5 + '）';
}

/**
 * 著者名を「筆頭著者 et al.（最終著者: ...）」の形に短縮します。
 * @param {string} authors カンマ区切りの著者名
 * @return {string}
 */
function formatAuthors(authors) {
  const text = String(authors || '').trim();
  if (!text) return '不明';

  const names = text.split(',').map(function (name) { return name.trim(); })
    .filter(function (name) { return name !== ''; });

  if (names.length === 0) return '不明';
  if (names.length <= 2) return names.join(', ');
  return names[0] + ' et al.（最終著者: ' + names[names.length - 1] + '）';
}

/**
 * 文字列を指定の長さで切り詰めます。
 * @param {string} text
 * @param {number} maxLength
 * @return {string}
 */
function truncateText(text, maxLength) {
  const value = String(text || '').trim();
  if (!maxLength || value.length <= maxLength) return value;
  return value.substring(0, maxLength) + '…';
}

/**
 * ヘッダーと論文ブロックを、通知先の文字数上限に収まる複数のメッセージに分割します。
 *
 * 以前の実装は区切り線を取り除いてしまい、
 * 1 件だけで上限を超える論文があると分割できませんでした。
 *
 * @param {string} header
 * @param {!Array<string>} blocks
 * @param {number} maxLength
 * @return {!Array<string>}
 */
function splitIntoMessages(header, blocks, maxLength) {
  const limit = Math.max(1, maxLength - PAGE_LABEL_RESERVE);
  const units = [];
  if (header) units.push(header);
  (blocks || []).forEach(function (block) { units.push(block); });

  const messages = [];
  let current = '';

  units.forEach(function (unit) {
    // 1 単位で上限を超える場合は、そこだけ文字数で強制的に分割します。
    if (unit.length > limit) {
      if (current.trim() !== '') messages.push(current);
      current = '';
      hardSplit_(unit, limit).forEach(function (chunk) { messages.push(chunk); });
      return;
    }

    if (current.length + unit.length > limit) {
      if (current.trim() !== '') messages.push(current);
      current = unit;
      return;
    }

    current += unit;
  });

  if (current.trim() !== '') messages.push(current);
  if (messages.length <= 1) return messages;

  return messages.map(function (message, index) {
    return '(' + (index + 1) + '/' + messages.length + ')\n' + message;
  });
}

/**
 * 上限を超える 1 ブロックを、文字数で強制的に分割します。
 * @param {string} text
 * @param {number} limit
 * @return {!Array<string>}
 */
function hardSplit_(text, limit) {
  const chunks = [];
  for (let offset = 0; offset < text.length; offset += limit) {
    chunks.push(text.substring(offset, offset + limit));
  }
  return chunks;
}

/**
 * 並び替え用に、JIF と 5 年 JIF の大きい方を返します。
 * @param {!Object} paper
 * @return {number}
 */
function highestImpactFactor_(paper) {
  return Math.max(toNumber(paper.impactFactor), toNumber(paper.impactFactor5Years));
}
