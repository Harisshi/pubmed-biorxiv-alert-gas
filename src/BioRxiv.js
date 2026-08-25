/**
 * bioRxiv / medRxiv からのプレプリント取得。
 *
 * API は 1 回のリクエストにつき最大 100 件しか返さないため、
 * cursor を進めながら期間内のすべてのプレプリントを取得します。
 * 取得結果は 1 回の実行中キャッシュし、キーワードごとの再取得を避けます。
 */

const BIORXIV_BASE_URL = 'https://api.biorxiv.org/details';

/** API が 1 ページで返す件数。 */
const BIORXIV_PAGE_SIZE = 100;

/** 1 回の実行中だけ有効なプレプリントのキャッシュ。 */
let __bioRxivCache = {};

/**
 * 指定キーワードに合致するプレプリントを返します。
 *
 * @param {string} keyword
 * @param {!Object} config
 * @param {!Date} now
 * @return {!Array<!Object>}
 */
function searchBioRxiv(keyword, config, now) {
  const preprints = getBioRxivPreprints(config, now);
  const matched = preprints.filter(function (paper) {
    return matchesKeyword(paper, keyword);
  });
  logInfo('bioRxiv: "' + keyword + '" に ' + matched.length + ' 件が該当しました');
  return matched;
}

/**
 * 期間内のプレプリントをすべて取得します（実行中は 1 回だけ取得）。
 * @param {!Object} config
 * @param {!Date} now
 * @return {!Array<!Object>}
 */
function getBioRxivPreprints(config, now) {
  const range = resolveSearchRange(config, now);
  const startDateStr = formatDateForApi(range.startDate, '-');
  const endDateStr = formatDateForApi(range.endDate, '-');

  const papers = [];
  (config.bioRxivServers || []).forEach(function (server) {
    const cacheKey = server + ':' + startDateStr + ':' + endDateStr;
    if (!__bioRxivCache[cacheKey]) {
      __bioRxivCache[cacheKey] = fetchBioRxivRange_(server, startDateStr, endDateStr, config);
    }
    __bioRxivCache[cacheKey].forEach(function (paper) { papers.push(paper); });
  });

  return papers;
}

/**
 * 指定サーバーの指定期間のプレプリントをページングしながら取得します。
 * @param {string} server 'biorxiv' または 'medrxiv'
 * @param {string} startDateStr 'YYYY-MM-DD'
 * @param {string} endDateStr 'YYYY-MM-DD'
 * @param {!Object} config
 * @return {!Array<!Object>}
 */
function fetchBioRxivRange_(server, startDateStr, endDateStr, config) {
  const papers = [];
  const maxRecords = config.maxBioRxivRecords;
  let cursor = 0;
  let total = null;

  logInfo(server + ' 検索: ' + startDateStr + ' 〜 ' + endDateStr);

  while (cursor < maxRecords) {
    const url = BIORXIV_BASE_URL + '/' + server + '/' + startDateStr + '/' + endDateStr + '/' + cursor;

    let response;
    try {
      response = fetchWithRetry(url);
    } catch (e) {
      logError(server + ' の取得でエラーが発生しました', e);
      break;
    }

    if (!isSuccessResponse(response)) {
      logError(server + ' の取得に失敗しました (HTTP ' + response.getResponseCode() + ')');
      break;
    }

    let result;
    try {
      result = JSON.parse(response.getContentText());
    } catch (e) {
      logError(server + ' のレスポンスを解析できませんでした', e);
      break;
    }

    const collection = result.collection || [];
    collection.forEach(function (item) {
      papers.push(toBioRxivPaper_(item, server));
    });

    if (total === null) {
      total = readBioRxivTotal_(result);
      if (total !== null) logInfo(server + ': 期間内に ' + total + ' 件のプレプリントがあります');
    }

    if (collection.length < BIORXIV_PAGE_SIZE) break;

    cursor += BIORXIV_PAGE_SIZE;
    if (total !== null && cursor >= total) break;

    Utilities.sleep(200);
  }

  if (total !== null && papers.length < total) {
    logInfo(server + ': 上限 ' + maxRecords + ' 件に達したため ' + papers.length +
      ' 件で打ち切りました（maxBioRxivRecords で変更できます）');
  }

  return papers;
}

/**
 * API のレスポンスから総件数を読み取ります。
 * @param {!Object} result
 * @return {?number}
 */
function readBioRxivTotal_(result) {
  if (!result.messages || result.messages.length === 0) return null;
  const total = Number(result.messages[0].total);
  return isNaN(total) ? null : total;
}

/**
 * API のレコードを共通の論文オブジェクトに変換します。
 * @param {!Object} item
 * @param {string} server
 * @return {!Object}
 */
function toBioRxivPaper_(item, server) {
  return {
    title: String(item.title || '').trim(),
    url: item.doi ? 'https://doi.org/' + item.doi : '',
    authors: String(item.authors || '').trim(),
    journal: server === 'medrxiv' ? 'medRxiv' : 'bioRxiv',
    abstract: String(item.abstract || '').trim(),
    category: PAPER_CATEGORY_BIORXIV,
  };
}

/**
 * 論文のタイトルまたは要旨にキーワードが含まれるかを判定します。
 * GAS API に依存しない純粋関数です。
 *
 * @param {!Object} paper
 * @param {string} keyword
 * @return {boolean}
 */
function matchesKeyword(paper, keyword) {
  if (!keyword) return false;
  const needle = String(keyword).toLowerCase();
  const title = String(paper.title || '').toLowerCase();
  const abstract = String(paper.abstract || '').toLowerCase();
  return title.indexOf(needle) >= 0 || abstract.indexOf(needle) >= 0;
}
