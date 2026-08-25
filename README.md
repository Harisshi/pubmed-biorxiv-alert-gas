# NewArticleAlertWithGAS

PubMed と bioRxiv / medRxiv の新着論文を毎日自動で検索し、
インパクトファクターで絞り込んで LINE・Slack・メールに通知する Google Apps Script です。
要旨は Gemini API で日本語に要約できます。

> **English summary**
> A Google Apps Script that searches PubMed and bioRxiv / medRxiv for new papers matching your
> keywords, filters them by journal impact factor, optionally summarizes abstracts in Japanese with
> the Gemini API, records everything in a Google Sheet, and pushes notifications to LINE, Slack, or
> email. Configuration lives in `src/UserConfig.js`; secrets live in Apps Script properties.
> Documentation below is in Japanese.

---

## 目次

- [できること](#できること)
- [仕組み](#仕組み)
- [必要なもの](#必要なもの)
- [セットアップ](#セットアップ)
- [使い方](#使い方)
- [設定項目](#設定項目)
- [スプレッドシートの構成](#スプレッドシートの構成)
- [制限と注意点](#制限と注意点)
- [開発](#開発)
- [ライセンス](#ライセンス)

---

## できること

- **PubMed の新着検索** — E-utilities で、指定キーワード・指定期間の論文を取得します。
- **プレプリントの新着検索** — bioRxiv（設定により medRxiv も）の投稿を取得し、キーワードで絞り込みます。
- **インパクトファクターによる絞り込み** — 自分で用意した CSV を参照し、基準未満の論文は通知しません。
  JIF と 5 年 JIF のどちらかが基準を満たせば通知対象になります。
- **要約の生成** — Gemini API で日本語要約と短い英語要約を作れます。
- **通知** — LINE（Messaging API のブロードキャスト）、Slack（Incoming Webhook）、メールに対応。
  通知先ごとの文字数上限に合わせて自動で分割します。
- **記録** — 検索結果と通知状況を Google スプレッドシートに残します。同じ論文を二度通知しません。
- **使用量の管理** — Gemini API・トリガー・通知回数を日ごとに集計し、上限に達したら止まります。

## 仕組み

```
トリガー (毎日)
   └─ runDailySearch()
        ├─ PubMed 検索      … esearch で PMID → efetch でまとめて書誌情報と要旨を取得
        ├─ プレプリント検索  … 期間内の全件を取得（cursor で全ページ）→ キーワードで絞り込み
        ├─ 重複の除去        … 記録済みの URL と、同じ実行内の重複を除く
        ├─ IF 照合           … CSV を 1 度だけ読み込んで索引化し、完全一致 → 略称 → 近似の順に照合
        ├─ 要約の生成        … Gemini API（通知対象になる論文のみ）
        ├─ スプレッドシートへ記録
        └─ 通知              … キーワードごとにメッセージを組み立て、LINE / Slack / メールへ送信
```

## 必要なもの

| 用途 | 必要なもの | 必須 |
|---|---|---|
| 実行環境 | Google アカウント（Apps Script とスプレッドシート） | ○ |
| 記録先 | Google スプレッドシート 1 つ | ○ |
| LINE 通知 | LINE Messaging API のチャネルアクセストークン | 通知先に LINE を使う場合 |
| Slack 通知 | Slack の Incoming Webhook URL | 通知先に Slack を使う場合 |
| 要約 | Gemini API キー | 要約機能を使う場合 |
| IF 絞り込み | インパクトファクターの CSV（Google ドライブに配置） | IF で絞り込む場合 |
| PubMed | NCBI API キー | 任意（レート上限が緩和されます） |
| 開発 | Node.js 20 以上、[clasp](https://github.com/google/clasp) | ローカルで編集する場合 |

## セットアップ

### 1. リポジトリを取得する

```bash
git clone https://github.com/Harisshi/NewArticleAlertWithGAS.git
cd NewArticleAlertWithGAS
```

### 2. 設定ファイルを作る

```bash
cp src/UserConfig.example.js src/UserConfig.js
```

`src/UserConfig.js` を開き、検索キーワードや通知先を自分の用途に合わせて編集します。
このファイルは `.gitignore` で除外されているため、リポジトリには入りません。

> **重要**: API キーやアクセストークンをこのファイルに書かないでください。
> 秘密情報は手順 5 のスクリプトプロパティに保存します。

### 3. Apps Script プロジェクトを用意する

```bash
npm install -g @google/clasp
clasp login
clasp create --type standalone --title "NewArticleAlertWithGAS" --rootDir src
```

`clasp create` が作った `.clasp.json` はそのまま使えます
（このリポジトリでは `.gitignore` により追跡されません）。
既存のプロジェクトに反映する場合は `.clasp.json.example` をコピーして `scriptId` を書き換えてください。

```bash
clasp push
```

### 4. 記録先のスプレッドシートを用意する

Google スプレッドシートを新規作成し、URL からスプレッドシート ID を控えます。

```
https://docs.google.com/spreadsheets/d/<ここがスプレッドシート ID>/edit
```

### 5. スクリプトプロパティに秘密情報を設定する

Apps Script のエディタで **プロジェクトの設定 → スクリプト プロパティ** を開き、
使う機能に応じて次のプロパティを追加します。

| プロパティ名 | 内容 | 必須 |
|---|---|---|
| `SPREADSHEET_ID` | 記録先スプレッドシートの ID | ○ |
| `GEMINI_API_KEY` | Gemini API キー | 要約を使う場合 |
| `IMPACT_FACTOR_CSV_ID` | インパクトファクター CSV の Google ドライブ ファイル ID | IF で絞り込む場合 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API のチャネルアクセストークン | LINE 通知を使う場合 |
| `SLACK_WEBHOOK_URL` | Slack の Incoming Webhook URL | Slack 通知を使う場合 |
| `NOTIFICATION_EMAIL` | 通知先メールアドレス | メール通知を使う場合 |
| `NCBI_API_KEY` | NCBI API キー | 任意 |
| `NCBI_TOOL_EMAIL` | NCBI に伝える連絡先メールアドレス | 任意（NCBI が推奨） |

設定できたら、エディタから `showConfigurationStatus()` を実行してください。
設定状況と不足している項目が実行ログに表示されます（値そのものは表示されません）。

### 6. インパクトファクターの CSV を用意する

CSV を Google ドライブにアップロードし、そのファイル ID を `IMPACT_FACTOR_CSV_ID` に設定します。
次の列が必要です。

| 列名 | 内容 | 必須 |
|---|---|---|
| `Name` | ジャーナルの正式名称 | ○ |
| `Abbr Name` | ジャーナルの略称 | 推奨 |
| `JIF` | インパクトファクター | ○ |
| `JIF5Years` | 5 年インパクトファクター | 推奨 |

列名は表記ゆれにもある程度対応しています
（`Name` の代わりに `Journal name`、`JIF` の代わりに `Impact Factor` なども認識します）。

> **データの取り扱いについて**
> インパクトファクターの値は Clarivate の Journal Citation Reports に由来するものが一般的で、
> 再配布はライセンス上認められていません。**CSV をこのリポジトリに含めないでください。**
> `.gitignore` で `*.csv` を除外していますが、各自が正規の手段で入手したデータを
> 自分の Google ドライブに置いて参照する形をとってください。
>
> IF による絞り込みが不要であれば、`minImpactFactor: 0` にすれば CSV は不要です。

### 7. 初期化して動作を確認する

Apps Script のエディタから順に実行します。初回は権限の承認を求められます。

1. `initializeSpreadsheets()` — 必要なシートとヘッダー行を作ります。
2. `previewNotification()` — 通知の書式をログで確認します（送信はしません）。
3. `sendTestNotification()` — 実際に 1 通送って疎通を確認します。

### 8. 定期実行を設定する

エディタから `createDailyTrigger(9)` を実行すると、毎日 9 時台に `runDailySearch()` を
実行するトリガーが作られます（引数は 0〜23 の時刻）。
Apps Script の「トリガー」画面から手動で設定しても構いません。

---

## 使い方

エディタから手動で実行できる関数です。

| 関数 | 内容 |
|---|---|
| `runDailySearch()` | 設定した期間の新着論文を検索して通知します。定期実行の入口です。 |
| `runSearchForPeriod('2024-06-01', '2024-06-07')` | 期間を指定して検索します。過去分の取り込みに使います。 |
| `showConfigurationStatus()` | 設定内容と不足しているスクリプトプロパティを表示します。 |
| `previewNotification()` | 送信せずに通知の内容をログに出します。 |
| `sendTestNotification()` | テストメッセージを 1 通送ります。 |
| `initializeSpreadsheets()` | シートとヘッダー行を用意します（既存データは消しません）。 |
| `createDailyTrigger(hour)` | 定期実行トリガーを作ります。 |
| `deleteDailyTrigger()` | 定期実行トリガーを削除します。 |

### 通知先ごとの準備

**LINE** — LINE Developers で Messaging API チャネルを作り、チャネルアクセストークン（長期）を発行します。
このスクリプトは友だち全員への**ブロードキャスト**で送信します。

**Slack** — Slack App を作成して Incoming Webhook を有効にし、
`https://hooks.slack.com/services/...` の URL を取得します。

**メール** — `NOTIFICATION_EMAIL` に宛先を設定します。Gmail の送信数上限（無料アカウントで 1 日 100 通）が適用されます。

---

## 設定項目

`src/UserConfig.js` で指定します。指定しなかった項目は `src/Config.js` の `DEFAULT_CONFIG` の値になります。

### 検索

| 項目 | 既定値 | 内容 |
|---|---|---|
| `searchKeywords` | `[]` | 検索キーワードの配列。PubMed の検索式をそのまま書けます。 |
| `searchPeriod` | `'1d'` | `1d` / `3d` / `7d` / `30d` / `1y` / `custom` |
| `customStartDate`, `customEndDate` | `''` | `searchPeriod` が `custom` のときの期間（`YYYY-MM-DD`） |
| `maxResultsPerKeyword` | `100` | キーワードごとに PubMed から取得する最大件数 |
| `pubmedDateType` | `'edat'` | `edat`（PubMed への登録日）または `pdat`（出版日） |
| `bioRxivServers` | `['biorxiv']` | `biorxiv` / `medrxiv` |
| `maxBioRxivRecords` | `2000` | プレプリントを取得する最大件数 |

### 要約

| 項目 | 既定値 | 内容 |
|---|---|---|
| `useGenerativeAI` | `false` | Gemini による要約を使うか |
| `geminiModel` | `'gemini-2.5-flash'` | 使用するモデル |
| `maxAbstractLength` | `300` | 日本語要約の最大文字数 |

### 通知

| 項目 | 既定値 | 内容 |
|---|---|---|
| `notificationMethods` | `[]` | `line` / `slack` / `email` の配列 |
| `notifyOnNoResults` | `false` | 新着 0 件でも通知するか |
| `deduplicateAcrossKeywords` | `true` | 複数キーワードにヒットした論文を 1 回だけ通知するか |
| `notificationFormat.includeImpactFactor` | `true` | IF を載せるか |
| `notificationFormat.includeJapaneseAbstract` | `true` | 日本語要約を載せるか |
| `notificationFormat.includeSummarizedAbstract` | `false` | 英語要約を載せるか |
| `notificationFormat.includeAbstract` | `false` | 原文の要旨を載せるか |
| `notificationFormat.maxPapersPerKeyword` | `30` | 1 キーワードあたりの掲載上限 |
| `notificationFormat.abstractPreviewLength` | `300` | 通知に載せる要約の最大文字数 |

### インパクトファクター

| 項目 | 既定値 | 内容 |
|---|---|---|
| `minImpactFactor` | `0` | この値未満は通知しない。`0` で絞り込みなし |
| `skipPapersWithUnknownImpactFactor` | `false` | CSV に無い雑誌を通知するか |
| `impactFactorMatchThreshold` | `0.9` | 近似照合の厳しさ（0〜1、高いほど厳格） |

### 使用量の上限（1 日あたり）

| 項目 | 既定値 |
|---|---|
| `maxGeminiRequestsPerDay` | `1500` |
| `maxGasTriggersPerDay` | `45` |
| `maxLineNotificationsPerDay` | `20` |
| `maxSlackNotificationsPerDay` | `20` |

---

## スプレッドシートの構成

3 つのシートが自動で作られます。列が足りない場合は実行時に追加されるので、
既存のシートをそのまま使い続けられます。

### `PubMed` / `BioRxiv`

| 列 | 内容 |
|---|---|
| `SearchDate` | 検索して記録した日時 |
| `NotifyDate` | 通知した日時 |
| `NotifyStatus` | `notified`（通知済み） / `skipped_low_impact_factor`（IF 基準未満で対象外） |
| `MatchedKeywords` | ヒットしたキーワード（`;` 区切り） |
| `Title`, `Authors`, `Abstract` | 書誌情報と原文要旨 |
| `SummarizedAbstract`, `JapaneseAbstract` | Gemini が生成した要約 |
| `Journal` | 掲載誌（プレプリントは `bioRxiv` / `medRxiv`） |
| `ImpactFactor`, `ImpactFactor(5years)` | 照合結果（PubMed シートのみ） |
| `MatchedJournal` | CSV 上で一致したジャーナル名（PubMed シートのみ） |
| `URL`, `Category`, `ScriptVersion` | リンク・出典・記録時のスクリプトバージョン |

`NotifyStatus` が `skipped_low_impact_factor` の行は「通知対象外」として記録され、再通知されません。
基準を下げて改めて通知したい場合は、その行の `NotifyDate` と `NotifyStatus` を空にしてください。

### `Usage_Tracker`

日ごとの Gemini API 呼び出し回数、トリガー実行回数、LINE / Slack の送信通数を記録します。

---

## 制限と注意点

- **Apps Script の実行時間** — 1 回の実行は 6 分までです。
  本スクリプトは 5 分を超えた時点で論文の処理を打ち切り、残りを次回に回します。
  取りこぼしが続く場合は `maxResultsPerKeyword` や `searchPeriod` を小さくしてください。
- **PubMed のレート制限** — API キーなしで 3 リクエスト/秒、ありで 10 リクエスト/秒です。
  `NCBI_API_KEY` を設定すると余裕ができます。
- **LINE Messaging API** — ブロードキャストの通数はプランごとの無料枠が適用されます。
- **Gemini API** — 無料枠の上限はモデルやプランによって変わります。`maxGeminiRequestsPerDay` で調整してください。
- **秘密情報** — API キーやトークンをコードに書かないでください。
  誤ってコミットしてしまった場合は、ファイルから消すだけでは不十分です
  （git の履歴に残ります）。**必ずキーを失効させて再発行してください。**

---

## 開発

依存パッケージはありません。Node.js 20 以上があれば動きます。

```bash
npm run lint   # src/ の構文チェック
npm test       # ユニットテスト
```

テストは `test/gas-project.js` が `src/` の全ファイルを Node の `vm` に読み込み、
GAS 固有の API をスタブに差し替えて実行します。
外部 API に依存しない純粋関数（期間の計算、重複の除去、IF の照合、メッセージの組み立てなど）が対象です。

反映は clasp で行います。

```bash
clasp push
```

`push` の前に `npm run lint && npm test` を実行してください。GitHub Actions でも同じ検査が走ります。

---

## ライセンス

[MIT License](LICENSE)

このリポジトリのコードは MIT ライセンスで公開しています。
ただし、**インパクトファクターのデータは含まれておらず、その再配布も認められていません**。
各自で正規の手段により入手してください。
