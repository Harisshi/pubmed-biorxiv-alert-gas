/**
 * HTTP 通信の共通処理。
 *
 * 外部 API は一時的に 429 や 5xx を返すことがあるため、
 * 再試行と指数バックオフをここに集約しています。
 */

/** 既定の再試行回数（初回リクエストを除く）。 */
const HTTP_DEFAULT_RETRIES = 3;

/** 再試行までの初期待ち時間（ミリ秒）。 */
const HTTP_INITIAL_BACKOFF_MS = 1000;

/**
 * 再試行付きで HTTP リクエストを行います。
 *
 * 5xx と 429 は一時的な障害とみなして再試行します。
 * 4xx（429 を除く）は再試行しても結果が変わらないため、そのまま返します。
 *
 * @param {string} url
 * @param {!Object=} options UrlFetchApp.fetch のオプション
 * @param {number=} retries 再試行回数
 * @return {!Object} HTTPResponse
 * @throws {Error} すべての試行が失敗した場合
 */
function fetchWithRetry(url, options, retries) {
  const maxRetries = typeof retries === 'number' ? retries : HTTP_DEFAULT_RETRIES;
  const fetchOptions = {};
  Object.keys(options || {}).forEach(function (key) {
    fetchOptions[key] = options[key];
  });
  // ステータスコードを自分で判定するため、例外化は無効にします。
  fetchOptions.muteHttpExceptions = true;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      Utilities.sleep(HTTP_INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1));
    }

    try {
      const response = UrlFetchApp.fetch(url, fetchOptions);
      const status = response.getResponseCode();

      if (status >= 200 && status < 300) return response;

      if (status === 429 || status >= 500) {
        lastError = new Error('HTTP ' + status + ' が返されました: ' + url);
        continue;
      }

      // 4xx はリクエスト自体に問題があるため、呼び出し側に判断を委ねます。
      return response;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('リクエストに失敗しました: ' + url);
}

/**
 * レスポンスが成功ステータスかどうかを判定します。
 * @param {!Object} response HTTPResponse
 * @return {boolean}
 */
function isSuccessResponse(response) {
  const status = response.getResponseCode();
  return status >= 200 && status < 300;
}
