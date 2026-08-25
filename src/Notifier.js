/**
 * 通知の送信（LINE / Slack / メール）。
 *
 * 通知先ごとに 1 メッセージあたりの文字数上限が異なるため、
 * 分割は送信直前に通知先ごとに行います。
 */

/** 通知先ごとの 1 メッセージあたりの文字数上限（余裕を持たせた値）。 */
const CHANNEL_MESSAGE_LIMITS = {
  line: 4500,   // LINE Messaging API のテキストは 5000 文字まで
  slack: 3500,  // Slack の表示上の実用的な上限
  email: 100000,
};

const LINE_BROADCAST_URL = 'https://api.line.me/v2/bot/message/broadcast';

/**
 * 組み立て済みの通知を、設定されたすべての通知先へ送ります。
 *
 * @param {{header: string, blocks: !Array<string>}} parts
 * @param {string} subject メールの件名
 * @param {!Object} config
 */
function sendNotification(parts, subject, config) {
  config.notificationMethods.forEach(function (method) {
    const limit = CHANNEL_MESSAGE_LIMITS[method] || CHANNEL_MESSAGE_LIMITS.email;
    const messages = splitIntoMessages(parts.header, parts.blocks, limit);
    sendMessages_(method, messages, subject, config);
  });
}

/**
 * 1 通のテキストを、設定されたすべての通知先へ送ります。
 * エラー通知や「新着なし」の通知に使います。
 *
 * @param {string} text
 * @param {string} subject メールの件名
 * @param {!Object} config
 */
function sendPlainNotification(text, subject, config) {
  config.notificationMethods.forEach(function (method) {
    const limit = CHANNEL_MESSAGE_LIMITS[method] || CHANNEL_MESSAGE_LIMITS.email;
    sendMessages_(method, splitIntoMessages(text, [], limit), subject, config);
  });
}

/**
 * 指定の通知先へメッセージ群を送ります。
 *
 * @param {string} method
 * @param {!Array<string>} messages
 * @param {string} subject
 * @param {!Object} config
 */
function sendMessages_(method, messages, subject, config) {
  if (messages.length === 0) return;

  if (method === 'email') {
    sendEmail_(messages.join('\n'), subject);
    return;
  }

  let sentCount = 0;
  for (let i = 0; i < messages.length; i++) {
    if (!canSendNotification(method, config)) {
      logInfo(method + ' の 1 日あたりの通知上限に達したため、残り ' +
        (messages.length - i) + ' 通の送信を取りやめました');
      break;
    }

    const succeeded = method === 'line'
      ? sendLineMessage_(messages[i])
      : sendSlackMessage_(messages[i]);

    if (!succeeded) break;

    // 送信できた分だけを記録します。
    recordNotification(method, 1);
    sentCount++;
  }

  if (sentCount > 0) logInfo(method + ' へ ' + sentCount + ' 通を送信しました');
}

/**
 * LINE へ 1 通送信します。
 * @param {string} text
 * @return {boolean} 送信できたかどうか
 */
function sendLineMessage_(text) {
  try {
    const response = fetchWithRetry(LINE_BROADCAST_URL, {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      headers: { Authorization: 'Bearer ' + requireSecret('LINE_CHANNEL_ACCESS_TOKEN') },
      payload: JSON.stringify({
        messages: [{ type: 'text', text: String(text) }],
        notificationDisabled: false,
      }),
    });

    if (isSuccessResponse(response)) return true;

    logError('LINE への送信に失敗しました (HTTP ' + response.getResponseCode() + '): ' +
      truncateForLog_(response.getContentText()));
    return false;
  } catch (e) {
    logError('LINE への送信でエラーが発生しました', e);
    return false;
  }
}

/**
 * Slack へ 1 通送信します。
 * @param {string} text
 * @return {boolean} 送信できたかどうか
 */
function sendSlackMessage_(text) {
  try {
    const webhookUrl = requireSecret('SLACK_WEBHOOK_URL');
    if (!isValidSlackWebhookUrl(webhookUrl)) {
      logError('SLACK_WEBHOOK_URL が Slack の Webhook URL の形式ではありません');
      return false;
    }

    const response = fetchWithRetry(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: formatForSlack(text) }),
    });

    if (isSuccessResponse(response)) return true;

    logError('Slack への送信に失敗しました (HTTP ' + response.getResponseCode() + '): ' +
      truncateForLog_(response.getContentText()));
    return false;
  } catch (e) {
    logError('Slack への送信でエラーが発生しました', e);
    return false;
  }
}

/**
 * メールを送信します。
 * @param {string} body
 * @param {string} subject
 */
function sendEmail_(body, subject) {
  try {
    MailApp.sendEmail({
      to: requireSecret('NOTIFICATION_EMAIL'),
      subject: subject,
      body: body,
    });
    logInfo('メールを送信しました');
  } catch (e) {
    logError('メールの送信でエラーが発生しました', e);
  }
}

/**
 * Slack の Incoming Webhook URL の形式かどうかを判定します。
 * GAS API に依存しない純粋関数です。
 *
 * @param {string} url
 * @return {boolean}
 */
function isValidSlackWebhookUrl(url) {
  return /^https:\/\/hooks\.slack\.com\/services\/.+/.test(String(url || '').trim());
}

/**
 * テキストを Slack の mrkdwn 用に整えます。
 *
 * Slack は &, <, > を制御文字として解釈するため、要旨に含まれていても
 * 表示が壊れないようエスケープします。
 * GAS API に依存しない純粋関数です。
 *
 * @param {string} text
 * @return {string}
 */
function formatForSlack(text) {
  const escaped = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 見出し行を太字にします。
  return escaped.replace(/^(■ .+)$/gm, '*$1*');
}
