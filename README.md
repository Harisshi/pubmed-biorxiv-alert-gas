# NewArticleAlertWithGAS

PubMed と bioRxiv / medRxiv の新着論文を毎日自動で検索し、
インパクトファクターで絞り込んで LINE・Slack・メールに通知する Google Apps Script です。
要旨は Gemini API で日本語に要約できます。

> **English summary**
> A Google Apps Script that searches PubMed and bioRxiv / medRxiv for new papers matching your
> keywords, filters them by journal impact factor, optionally summarizes abstracts in Japanese with
> the Gemini API, records everything in a Google Sheet, and pushes notifications to LINE, Slack, or
> email. Secrets are stored in Apps Script properties, never in the code.
> Documentation below is in Japanese.

---

## 目次

- [できること](#できること)
- [仕組み](#仕組み)
- [必要なもの](#必要なもの)
- [必要な情報の取得方法](#必要な情報の取得方法)
- [セットアップ A: かんたん（コピペ方式）](#セットアップ-a-かんたんコピペ方式)
- [セットアップ B: clasp を使う方式](#セットアップ-b-clasp-を使う方式)
- [使い方](#使い方)
- [設定項目](#設定項目)
- [スプレッドシートの構成](#スプレッドシートの構成)
- [制限と注意点](#制限と注意点)
- [困ったときは](#困ったときは)
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
| 実行環境 | Google アカウント | ○ |
| 記録先 | Google スプレッドシート 1 つ | ○ |
| LINE 通知 | LINE Messaging API のチャネルアクセストークン | 通知先に LINE を使う場合 |
| Slack 通知 | Slack の Incoming Webhook URL | 通知先に Slack を使う場合 |
| 要約 | Gemini API キー | 要約機能を使う場合 |
| IF 絞り込み | インパクトファクターの CSV（Google ドライブに配置） | IF で絞り込む場合 |
| PubMed | NCBI API キー | 任意（レート上限が緩和されます） |

セットアップ方法は 2 通りあります。どちらでも動作は同じです。

| | **A. かんたん（コピペ方式）** | **B. clasp を使う方式** |
|---|---|---|
| 向いている人 | コマンドライン操作に不慣れな方 | git / npm を普段使う方 |
| 必要なもの | ブラウザだけ | Node.js 20 以上、clasp |
| コードの入れ方 | 1 ファイルをコピーして貼り付け | `clasp push` |
| 更新のしかた | 新しいコードを貼り直す | `git pull` して `clasp push` |

---

## 必要な情報の取得方法

スクリプトプロパティに登録する値の取り方です。使う機能に応じて必要なものだけ用意すれば構いません。

> 各サービスの画面は更新されることがあります。ボタンの名前が少し違っていても、
> 同じ場所に相当する項目があるはずです。

### `SPREADSHEET_ID` — 記録先スプレッドシートの ID（必須）

1. [Google スプレッドシート](https://sheets.new) で新しいシートを作成します（名前は何でも構いません）。
2. ブラウザのアドレスバーを見ます。

```
https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0
                                      └───────── これが ID ─────────┘
```

`/d/` と `/edit` の間の文字列をコピーします。

### `GEMINI_API_KEY` — Gemini API キー（要約を使う場合）

1. [Google AI Studio](https://aistudio.google.com/apikey) にアクセスし、Google アカウントでログインします。
2. API キーを作成する項目を選びます。Google Cloud のプロジェクトを選ぶか、新規作成します。
3. 表示されたキー（`AIza` で始まる文字列）をコピーします。

無料枠の範囲でも利用できますが、モデルやプランによって 1 分あたり・1 日あたりの上限が異なります。
上限に達すると要約が空欄になります（論文の記録と通知自体は続きます）。

> キーは一度しか表示されないことがあります。控えておくか、必要になったら再発行してください。

### `LINE_CHANNEL_ACCESS_TOKEN` — LINE のチャネルアクセストークン（LINE 通知を使う場合）

このスクリプトは LINE 公式アカウント（Messaging API）から、
**そのアカウントを友だち追加している人全員へブロードキャスト**します。自分だけが友だちなら自分だけに届きます。

1. [LINE Developers コンソール](https://developers.line.biz/console/) に LINE アカウントでログインします。
2. **プロバイダー**を作成します（初回のみ。個人利用なら自分の名前などで構いません）。
3. そのプロバイダーの中に**新しいチャネルを作成**し、種類は **Messaging API** を選びます。
4. チャネル名・説明・業種などを入力して作成します。
5. 作成したチャネルの **「Messaging API設定」** タブを開きます。
6. ページ下部の **「チャネルアクセストークン（長期）」** で発行し、表示された文字列をコピーします。
7. 同じページにある **QR コード**を自分のスマートフォンの LINE で読み取り、
   この公式アカウントを**友だち追加**します。これをしないと通知が届きません。

あわせて設定しておくと快適です。

- 自動応答メッセージが不要な場合は、[LINE Official Account Manager](https://manager.line.biz/)
  の応答設定で「応答メッセージ」をオフにします。
- 「あいさつメッセージ」も同様にオフにできます。

> 送信できる通数はプランごとの無料枠に従います。1 日 1 回の通知であれば通常は無料枠に収まります。

### `SLACK_WEBHOOK_URL` — Slack の Incoming Webhook URL（Slack 通知を使う場合）

1. [Slack API のアプリ管理画面](https://api.slack.com/apps) を開き、**Create New App** を選びます。
2. **From scratch** を選び、アプリ名と、通知を送りたいワークスペースを指定します。
3. 左メニューの **Incoming Webhooks** を開き、機能を **On** にします。
4. **Add New Webhook to Workspace** を押し、投稿先のチャンネルを選んで許可します。
5. 生成された `https://hooks.slack.com/services/...` という URL をコピーします。

### `IMPACT_FACTOR_CSV_ID` — インパクトファクター CSV のファイル ID（IF で絞り込む場合）

まず、次の列を持つ CSV を用意します。

| 列名 | 内容 | 必須 |
|---|---|---|
| `Name` | ジャーナルの正式名称 | ○ |
| `Abbr Name` | ジャーナルの略称 | 推奨 |
| `JIF` | インパクトファクター | ○ |
| `JIF5Years` | 5 年インパクトファクター | 推奨 |

```csv
Name,Abbr Name,JIF,JIF5Years
JOURNAL OF CELL BIOLOGY,J CELL BIOL,7.4,8.1
Nature Cell Biology,NAT CELL BIOL,21.3,24.0
```

列名の表記ゆれにもある程度対応しています
（`Name` の代わりに `Journal name`、`JIF` の代わりに `Impact Factor` なども認識します）。

用意した CSV を Google ドライブにアップロードし、ファイルを開いたときの URL から ID を取ります。

```
https://drive.google.com/file/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa987654321/view
                                └───────── これが ID ─────────┘
```

> **⚠ データの取り扱いについて**
> インパクトファクターの値は Clarivate 社の Journal Citation Reports に由来するものが一般的で、
> **再配布はライセンス上認められていません。CSV をリポジトリに含めたり、公開したりしないでください。**
> 所属機関の契約などを通じて、各自が正規の手段で入手したデータをご自分の Google ドライブに置いてください。
>
> IF による絞り込みが不要であれば、`minImpactFactor: 0` にすれば CSV は不要です。

### `NCBI_API_KEY` / `NCBI_TOOL_EMAIL` — NCBI の設定（任意）

指定しなくても動作しますが、設定すると PubMed へのリクエスト上限が
3 リクエスト/秒から 10 リクエスト/秒に緩和されます。

1. [NCBI アカウント](https://account.ncbi.nlm.nih.gov/) を作成またはログインします。
2. アカウント設定の **API Key Management** で API キーを作成します。
3. `NCBI_TOOL_EMAIL` には自分の連絡先メールアドレスを設定します
   （NCBI は利用者の連絡先を明示することを推奨しています）。

### `NOTIFICATION_EMAIL` — 通知先メールアドレス（メール通知を使う場合）

通知を受け取りたいメールアドレスをそのまま設定します。

---

## セットアップ A: かんたん（コピペ方式）

**ブラウザだけで完結します。** git も Node.js も不要です。

### 1. スプレッドシートを用意する

[sheets.new](https://sheets.new) で新しいスプレッドシートを作り、
URL から ID を控えます（→ [取得方法](#必要な情報の取得方法)）。

### 2. Apps Script プロジェクトを作る

[script.google.com](https://script.google.com/home/projects/create) を開き、新しいプロジェクトを作成します。
プロジェクト名は「新着論文通知」など分かりやすいものにしてください。

### 3. コードを貼り付ける

1. このリポジトリの **[`dist/Code.js`](dist/Code.js)** を開きます。
2. 右上の **Raw**（生ファイル表示）ボタンを押します。
3. `Ctrl + A`（Mac は `Cmd + A`）で全選択し、`Ctrl + C` でコピーします。
4. Apps Script エディタに戻り、最初から入っている `コード.gs` の中身を**すべて削除**してから貼り付けます。
5. フロッピーディスクのアイコン、または `Ctrl + S` で保存します。

> `dist/Code.js` は `src/` 内の全ファイルを 1 つにまとめた自動生成ファイルです。
> 分割版とまったく同じ動作をします。

### 4. 検索条件を編集する

貼り付けたコードの先頭近くに `const USER_CONFIG = {` という箇所があります。
ここを自分の用途に合わせて書き換えます。

```javascript
const USER_CONFIG = {
  searchKeywords: [
    'Golgi',              // ← 自分の興味のあるキーワードに変える
    'Microtubule',
  ],
  searchPeriod: '1d',              // 何日前までを検索するか
  notificationMethods: ['line'],   // 'line' / 'slack' / 'email'
  minImpactFactor: 4.0,            // これ未満の論文は通知しない（0 で絞り込みなし）
  useGenerativeAI: true,           // Gemini で要約する
  // ...
};
```

**API キーやトークンはここに書きません。** 次の手順で設定します。

### 5. API キーなどをスクリプトプロパティに設定する

1. Apps Script エディタの左メニューから **⚙ プロジェクトの設定** を開きます。
2. 下の方の **スクリプト プロパティ** で **スクリプト プロパティを追加** を押します。
3. 使う機能に応じて、次のものを 1 つずつ追加します（→ [取得方法](#必要な情報の取得方法)）。

| プロパティ | 値 | 必須 |
|---|---|---|
| `SPREADSHEET_ID` | 手順 1 で控えた ID | ○ |
| `GEMINI_API_KEY` | Gemini API キー | 要約を使う場合 |
| `IMPACT_FACTOR_CSV_ID` | CSV のファイル ID | IF で絞り込む場合 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE のトークン | LINE 通知を使う場合 |
| `SLACK_WEBHOOK_URL` | Slack の Webhook URL | Slack 通知を使う場合 |
| `NOTIFICATION_EMAIL` | 通知先メールアドレス | メール通知を使う場合 |
| `NCBI_API_KEY` | NCBI API キー | 任意 |
| `NCBI_TOOL_EMAIL` | 自分のメールアドレス | 任意 |

4. **スクリプト プロパティを保存** を押します。

> ここに入れた値は Google のサーバー側に保存され、コードには一切現れません。
> コードを誰かに共有しても、キーが漏れることはありません。

### 6. 初期化して権限を承認する

エディタ上部の関数選択メニューから関数を選び、**実行**を押します。

1. **`initializeSpreadsheets`** を実行します。
   - 初回は「承認が必要です」と表示されます。**権限を確認** → 自分のアカウントを選択 →
     「このアプリは Google で確認されていません」と出たら **詳細** → **（プロジェクト名）に移動** →
     内容を確認して **許可** と進みます。
   - 自分で作ったスクリプトなので、この警告が出るのは正常です。
   - スプレッドシートに `PubMed` / `BioRxiv` / `Usage_Tracker` の 3 シートができれば成功です。
2. **`showConfigurationStatus`** を実行し、下部の**実行ログ**を確認します。
   設定漏れがあればここに表示されます（キーの値そのものは表示されません）。
3. **`sendTestNotification`** を実行し、LINE や Slack にテストメッセージが届くか確認します。

### 7. 毎日自動で動くようにする

関数選択メニューから **`createDailyTrigger`** を選んで実行すると、
毎日 9 時台に自動実行されるようになります。

時刻を変えたい場合は、左メニューの **⏰ トリガー** から作成済みのトリガーを編集してください。

以上で完了です。翌日から通知が届きます。

### 更新のしかた

新しいバージョンが出たら、手順 3 をもう一度行って `dist/Code.js` を貼り直します。
その際、**`USER_CONFIG` の中身は自分の設定で書き換え直してください**
（スクリプトプロパティは貼り直しても消えません）。

---

## セットアップ B: clasp を使う方式

git と Node.js を使う方法です。ファイルが役割ごとに分かれているため、改造や貢献をする場合はこちらが便利です。

### 1. リポジトリを取得する

```bash
git clone https://github.com/Harisshi/pubmed-biorxiv-alert-gas.git
cd pubmed-biorxiv-alert-gas
```

### 2. 設定ファイルを作る

```bash
cp src/UserConfig.example.js src/UserConfig.js
```

`src/UserConfig.js` を編集します。このファイルは `.gitignore` で除外されているため、
誤ってコミットされることはありません。

> API キーやアクセストークンはこのファイルに書かないでください。手順 4 のスクリプトプロパティに保存します。

### 3. Apps Script へ反映する

```bash
npm install -g @google/clasp
clasp login
clasp create --type standalone --title "NewArticleAlertWithGAS" --rootDir src
clasp push
```

既存のプロジェクトへ反映する場合は、`.clasp.json.example` をコピーして
`scriptId` を自分のプロジェクトのものに書き換えてください。

### 4. スプレッドシートとスクリプトプロパティを設定する

[セットアップ A](#セットアップ-a-かんたんコピペ方式) の手順 1 と 5 と同じです。

### 5. 初期化・動作確認・トリガー設定

[セットアップ A](#セットアップ-a-かんたんコピペ方式) の手順 6・7 と同じです。
`clasp run` を設定していればコマンドラインからも実行できます。

---

## 使い方

Apps Script エディタから手動で実行できる関数です。

| 関数 | 内容 |
|---|---|
| `runDailySearch()` | 設定した期間の新着論文を検索して通知します。定期実行の入口です。 |
| `runSearchForPeriod('2024-06-01', '2024-06-07')` | 期間を指定して検索します。過去分の取り込みに使います。 |
| `showConfigurationStatus()` | 設定内容と不足しているスクリプトプロパティを表示します。 |
| `previewNotification()` | 送信せずに通知の内容をログに出します。書式の確認に使います。 |
| `sendTestNotification()` | テストメッセージを 1 通送ります。 |
| `initializeSpreadsheets()` | シートとヘッダー行を用意します（既存データは消しません）。 |
| `createDailyTrigger(hour)` | 定期実行トリガーを作ります。引数は 0〜23 の時刻（省略時は 9）。 |
| `deleteDailyTrigger()` | 定期実行トリガーを削除します。 |

---

## 設定項目

コピペ方式ではコード先頭の `USER_CONFIG`、clasp 方式では `src/UserConfig.js` で指定します。
指定しなかった項目は既定値が使われます。

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
- **LINE Messaging API** — ブロードキャストの通数はプランごとの無料枠が適用されます。
- **Gemini API** — 無料枠の上限はモデルやプランによって変わります。`maxGeminiRequestsPerDay` で調整してください。
- **秘密情報** — API キーやトークンをコードに書かないでください。
  誤ってコミットしてしまった場合、ファイルから消すだけでは不十分です（git の履歴に残ります）。
  **必ずキーを失効させて再発行してください。**

---

## 困ったときは

まず **`showConfigurationStatus()`** を実行して、設定漏れがないか確認してください。

| 症状 | 確認すること |
|---|---|
| 通知が届かない（LINE） | 公式アカウントを**友だち追加**しているか。トークンが正しいか。 |
| 通知が届かない（Slack） | Webhook URL が `https://hooks.slack.com/services/` で始まっているか。 |
| 「UserConfig.js が見つかりません」 | clasp 方式で `src/UserConfig.js` を作り忘れています。手順 2 を実行してください。 |
| インパクトファクターが全部 0 | CSV の列名が `Name` / `JIF` になっているか。ファイル ID が正しいか。 |
| 要約が空欄 | Gemini API キーが正しいか。実行ログにエラーが出ていないか。上限に達していないか。 |
| 新着が 0 件のまま | キーワードが絞り込みすぎていないか。`minImpactFactor` が高すぎないか。 |
| 途中で止まる | 実行時間の上限です。`maxResultsPerKeyword` を減らしてください。 |

実行ログは、Apps Script エディタの左メニュー **実行数** から各実行の詳細で確認できます。

---

## 開発

依存パッケージはありません。Node.js 20 以上があれば動きます。

```bash
npm run lint    # src/ の構文チェック
npm test        # ユニットテスト
npm run build   # dist/Code.js（コピペ用の 1 ファイル版）を再生成
```

`src/` を変更したら、必ず `npm run build` を実行して `dist/Code.js` も更新してください。
CI で両者が一致しているか検証しています。

テストは `test/gas-project.js` が `src/` の全ファイルを Node の `vm` に読み込み、
GAS 固有の API をスタブに差し替えて実行します。
外部 API に依存しない純粋関数（期間の計算、重複の除去、IF の照合、メッセージの組み立てなど）が対象です。

---

## ライセンス

[MIT License](LICENSE)

このリポジトリのコードは MIT ライセンスで公開しています。
ただし、**インパクトファクターのデータは含まれておらず、その再配布も認められていません**。
各自で正規の手段により入手してください。
