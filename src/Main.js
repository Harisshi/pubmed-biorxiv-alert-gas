/**
 * 実行の入口と全体の流れ。
 *
 * GAS のトリガーには runDailySearch を設定してください。
 */

/**
 * GAS の 1 回あたりの実行時間上限（6 分）に対する安全マージン。
 * これを超えたら論文の処理を打ち切り、記録と通知に時間を残します。
 */
const EXECUTION_SOFT_DEADLINE_MS = 300000;

/**
 * 設定された検索期間で新着論文を探して通知します。
 * 定期実行のトリガーにはこの関数を指定します。
 */
function runDailySearch() {
  runGuarded_(function (config, now) {
    processNewPapers(config, now);
  });
}

/**
 * 期間を指定して検索します。過去分をまとめて取り込みたいときに使います。
 *
 * @param {string} startDate 'YYYY-MM-DD'
 * @param {string} endDate 'YYYY-MM-DD'
 */
function runSearchForPeriod(startDate, endDate) {
  runGuarded_(function (config, now) {
    // 実行中のみ設定を上書きします（UserConfig.js は変更しません）。
    const periodConfig = mergeConfig_(config, {
      searchPeriod: 'custom',
      customStartDate: startDate,
      customEndDate: endDate,
    });
    logInfo('期間を指定して検索します: ' + startDate + ' 〜 ' + endDate);
    processNewPapers(periodConfig, now);
  });
}

/**
 * 設定の検証・使用量の管理・エラー通知をまとめて行い、渡された処理を実行します。
 *
 * @param {function(!Object, !Date)} task
 */
function runGuarded_(task) {
  const startTime = Date.now();
  let config;

  try {
    config = getConfig();
  } catch (e) {
    logError('設定を読み込めませんでした', e);
    return;
  }

  const validation = validateConfiguration();
  validation.warnings.forEach(function (message) { logInfo('警告: ' + message); });
  if (validation.errors.length > 0) {
    validation.errors.forEach(function (message) { logError(message); });
    notifyError_('設定に問題があります:\n' + validation.errors.join('\n'), config);
    return;
  }

  try {
    // 上限の判定は加算前の値で行い、そのうえで今回の実行分を記録します。
    if (getTodayUsage().triggers >= config.maxGasTriggersPerDay) {
      logError('1 日あたりの実行回数の上限に達しました');
      notifyError_('1 日あたりの実行回数の上限に達しました', config);
      return;
    }
    recordGasTrigger();

    task(config, new Date());
  } catch (e) {
    logError('処理中にエラーが発生しました', e);
    notifyError_('処理中にエラーが発生しました: ' + e, config);
  } finally {
    try {
      flushPendingUsage();
    } catch (e) {
      logError('使用量の記録に失敗しました', e);
    }
    logInfo('実行時間: ' + Math.round((Date.now() - startTime) / 1000) + ' 秒');
  }
}

/**
 * 新着論文を検索し、スプレッドシートに記録して通知します。
 *
 * @param {!Object} config
 * @param {!Date} now
 */
function processNewPapers(config, now) {
  const startTime = Date.now();
  const existingUrls = getExistingPaperUrls();
  logInfo('記録済みの論文: ' + Object.keys(existingUrls).length + ' 件');

  const collected = collectPapers(config, now);
  const newPapers = collected.filter(function (paper) {
    return paper.url && !existingUrls[paper.url];
  });
  logInfo('新規の論文: ' + newPapers.length + ' 件');

  if (newPapers.length === 0) {
    if (config.notifyOnNoResults) {
      sendPlainNotification(
        '新着論文はありませんでした。\nキーワード: ' + config.searchKeywords.join(' / '),
        '新着論文なし',
        config
      );
    }
    return;
  }

  const pubmedRecords = [];
  const preprintRecords = [];
  const searchDate = formatDateTimeForSheet(now);

  for (let i = 0; i < newPapers.length; i++) {
    if (Date.now() - startTime > EXECUTION_SOFT_DEADLINE_MS) {
      logInfo('実行時間の上限が近いため、残り ' + (newPapers.length - i) +
        ' 件は次回の実行に回します');
      break;
    }

    const paper = newPapers[i];
    try {
      const record = buildPaperRecord_(paper, config, searchDate);
      if (paper.category === PAPER_CATEGORY_PUBMED) {
        pubmedRecords.push(record);
      } else {
        preprintRecords.push(record);
      }
    } catch (e) {
      logError('論文の処理に失敗しました: ' + paper.url, e);
    }
  }

  appendRecords(SHEET_NAME_PUBMED, pubmedRecords, PUBMED_COLUMNS);
  appendRecords(SHEET_NAME_BIORXIV, preprintRecords, BIORXIV_COLUMNS);
  logInfo('スプレッドシートに記録しました: PubMed ' + pubmedRecords.length +
    ' 件 / プレプリント ' + preprintRecords.length + ' 件');

  notifyNewPapers(config, now);
}

/**
 * すべてのキーワードで検索し、重複を除いた論文の配列を返します。
 *
 * @param {!Object} config
 * @param {!Date} now
 * @return {!Array<!Object>}
 */
function collectPapers(config, now) {
  const papers = [];

  config.searchKeywords.forEach(function (keyword) {
    try {
      searchPubMed(keyword, config, now).forEach(function (paper) {
        paper.matchedKeywords = [keyword];
        papers.push(paper);
      });
    } catch (e) {
      logError('PubMed の検索に失敗しました: ' + keyword, e);
    }

    try {
      searchBioRxiv(keyword, config, now).forEach(function (paper) {
        paper.matchedKeywords = [keyword];
        papers.push(paper);
      });
    } catch (e) {
      logError('プレプリントの検索に失敗しました: ' + keyword, e);
    }
  });

  return dedupePapers(papers);
}

/**
 * URL が同じ論文を 1 件にまとめ、ヒットしたキーワードを統合します。
 *
 * 複数のキーワードにヒットした論文が同じ回の実行で二重に記録される不具合を防ぎます。
 * GAS API に依存しない純粋関数です。
 *
 * @param {!Array<!Object>} papers
 * @return {!Array<!Object>}
 */
function dedupePapers(papers) {
  const byUrl = {};
  const result = [];

  papers.forEach(function (paper) {
    if (!paper.url) return;

    const existing = byUrl[paper.url];
    if (!existing) {
      byUrl[paper.url] = paper;
      result.push(paper);
      return;
    }

    (paper.matchedKeywords || []).forEach(function (keyword) {
      if (existing.matchedKeywords.indexOf(keyword) < 0) {
        existing.matchedKeywords.push(keyword);
      }
    });
  });

  return result;
}

/**
 * 論文 1 件をスプレッドシートの 1 行分のレコードに変換します。
 * 必要に応じてインパクトファクターの照合と要約の生成を行います。
 *
 * @param {!Object} paper
 * @param {!Object} config
 * @param {string} searchDate
 * @return {!Object}
 */
function buildPaperRecord_(paper, config, searchDate) {
  const record = {
    SearchDate: searchDate,
    NotifyDate: '',
    NotifyStatus: '',
    MatchedKeywords: formatMatchedKeywords(paper.matchedKeywords),
    Title: paper.title,
    Authors: paper.authors,
    Abstract: paper.abstract,
    SummarizedAbstract: '',
    JapaneseAbstract: '',
    Journal: paper.journal,
    URL: paper.url,
    Category: paper.category,
    ScriptVersion: SCRIPT_VERSION,
  };

  if (paper.category === PAPER_CATEGORY_PUBMED) {
    const impact = lookupImpactFactor(paper.journal, config);
    record.ImpactFactor = impact.impactFactor;
    record['ImpactFactor(5years)'] = impact.impactFactor5Years;
    record.MatchedJournal = impact.matchedJournal;

    // インパクトファクターが基準に満たない論文は要約を作らず、API の消費を抑えます。
    const wouldNotify = meetsImpactFactorThreshold({
      category: paper.category,
      impactFactor: impact.impactFactor,
      impactFactor5Years: impact.impactFactor5Years,
    }, config);
    if (!wouldNotify) return record;
  }

  if (config.useGenerativeAI && paper.abstract) {
    const format = config.notificationFormat;
    if (format.includeJapaneseAbstract && canUseGeminiApi(config)) {
      record.JapaneseAbstract = generateJapaneseAbstract(paper.abstract, config);
    }
    if (format.includeSummarizedAbstract && canUseGeminiApi(config)) {
      record.SummarizedAbstract = generateEnglishSummary(paper.abstract, config);
    }
  }

  return record;
}

/**
 * 未通知の論文をキーワードごとにまとめて通知します。
 *
 * @param {!Object} config
 * @param {!Date} now
 */
function notifyNewPapers(config, now) {
  const papers = readUnnotifiedPapers(SHEET_NAME_PUBMED)
    .concat(readUnnotifiedPapers(SHEET_NAME_BIORXIV));
  if (papers.length === 0) return;

  const groups = {};
  const updates = {};
  updates[SHEET_NAME_PUBMED] = [];
  updates[SHEET_NAME_BIORXIV] = [];

  papers.forEach(function (paper) {
    if (!meetsImpactFactorThreshold(paper, config)) {
      updates[paper.sheetName].push({
        rowNumber: paper.rowNumber,
        status: NOTIFY_STATUS_SKIPPED_LOW_IF,
      });
      return;
    }

    const keywords = resolveNotificationKeywords(paper, config);
    if (keywords.length === 0) return;

    keywords.forEach(function (keyword) {
      if (!groups[keyword]) groups[keyword] = [];
      groups[keyword].push(paper);
    });

    updates[paper.sheetName].push({
      rowNumber: paper.rowNumber,
      status: NOTIFY_STATUS_NOTIFIED,
    });
  });

  const todayStr = Utilities.formatDate(now, TIMEZONE, 'yyyy/MM/dd');
  config.searchKeywords.forEach(function (keyword) {
    const parts = buildNotificationParts(keyword, groups[keyword] || [], config, todayStr);
    if (parts) sendNotification(parts, '新着論文通知: ' + keyword, config);
  });

  // 送信後に通知状態を書き込みます。送信に失敗した場合は次回の実行で再試行されます。
  markPapersNotified(SHEET_NAME_PUBMED, updates[SHEET_NAME_PUBMED]);
  markPapersNotified(SHEET_NAME_BIORXIV, updates[SHEET_NAME_BIORXIV]);
}

/**
 * 論文をどのキーワードの通知に載せるかを決めます。
 *
 * 記録時の MatchedKeywords を使い、無い場合（旧バージョンで記録された行）は
 * タイトルと要旨から判定します。
 * GAS API に依存しない純粋関数です。
 *
 * @param {!Object} paper
 * @param {!Object} config
 * @return {!Array<string>}
 */
function resolveNotificationKeywords(paper, config) {
  let keywords = (paper.matchedKeywords || []).filter(function (keyword) {
    return config.searchKeywords.indexOf(keyword) >= 0;
  });

  if (keywords.length === 0) {
    keywords = config.searchKeywords.filter(function (keyword) {
      return matchesKeyword(paper, keyword);
    });
  }

  return config.deduplicateAcrossKeywords ? keywords.slice(0, 1) : keywords;
}

/**
 * エラーを通知します。通知自体が失敗しても処理は続けます。
 *
 * @param {string} message
 * @param {!Object} config
 */
function notifyError_(message, config) {
  try {
    sendPlainNotification('[エラー] ' + message, 'GAS エラー通知', config);
  } catch (e) {
    logError('エラー通知の送信に失敗しました', e);
  }
}
