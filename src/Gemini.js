/**
 * Gemini API による要約生成。
 *
 * 呼び出し回数の記録は callGemini_() に一本化しています。
 */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * 英文要旨から日本語の要約を生成します。
 * @param {string} text
 * @param {!Object} config
 * @return {string} 生成できなかった場合は空文字列
 */
function generateJapaneseAbstract(text, config) {
  if (!text) return '';
  const prompt = '以下の英文要旨を日本語で要約してください（最大' +
    config.maxAbstractLength + '字）。前置きや見出しは付けず、要約本文だけを出力してください。\n\n' + text;
  return callGemini_(prompt, config);
}

/**
 * 英文要旨から短い英語の要約を生成します。
 * @param {string} text
 * @param {!Object} config
 * @return {string} 生成できなかった場合は空文字列
 */
function generateEnglishSummary(text, config) {
  if (!text) return '';
  const prompt = 'Summarize the following abstract in English, keeping the key findings and ' +
    'making it concise (around 100 words). Output only the summary.\n\n' + text;
  return callGemini_(prompt, config);
}

/**
 * Gemini API を呼び出し、生成されたテキストを返します。
 * 失敗しても例外は投げず、空文字列を返して処理を続けます。
 *
 * @param {string} prompt
 * @param {!Object} config
 * @return {string}
 */
function callGemini_(prompt, config) {
  const endpoint = GEMINI_BASE_URL + '/' + config.geminiModel + ':generateContent';
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
  };

  try {
    recordGeminiRequest();

    const response = fetchWithRetry(endpoint, {
      method: 'post',
      contentType: 'application/json',
      // API キーはヘッダーで渡します。URL に含めるとログに残るおそれがあります。
      headers: { 'x-goog-api-key': requireSecret('GEMINI_API_KEY') },
      payload: JSON.stringify(payload),
    });

    if (!isSuccessResponse(response)) {
      logError('Gemini API がエラーを返しました (HTTP ' + response.getResponseCode() + '): ' +
        truncateForLog_(response.getContentText()));
      return '';
    }

    return extractGeminiText(JSON.parse(response.getContentText()));
  } catch (e) {
    logError('Gemini API の呼び出しに失敗しました', e);
    return '';
  }
}

/**
 * Gemini のレスポンスから本文テキストを取り出します。
 * GAS API に依存しない純粋関数です。
 *
 * @param {!Object} responseBody
 * @return {string}
 */
function extractGeminiText(responseBody) {
  if (!responseBody) return '';

  if (responseBody.promptFeedback && responseBody.promptFeedback.blockReason) {
    logError('Gemini がプロンプトを拒否しました: ' + responseBody.promptFeedback.blockReason);
    return '';
  }

  const candidates = responseBody.candidates;
  if (!candidates || candidates.length === 0) return '';

  const parts = candidates[0].content && candidates[0].content.parts;
  if (!parts || parts.length === 0) return '';

  return parts.map(function (part) { return part.text || ''; }).join('').trim();
}
