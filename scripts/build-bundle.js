/**
 * src/ の全ファイルを 1 つのファイルにまとめ、dist/Code.js を生成します。
 *
 * clasp を使わず、Apps Script のエディタに直接貼り付けたい人向けの成果物です。
 * Apps Script では 1 プロジェクト内の全ファイルがグローバルスコープを共有するため、
 * 単純に連結するだけで分割版とまったく同じ動作になります。
 *
 *   npm run build         生成する
 *   npm run build -- --check  生成物が src/ と一致しているか確認する（CI 用）
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const OUT_FILE = path.join(ROOT, 'dist', 'Code.js');

/** 先頭に置くファイル。利用者が最初に編集する設定を上に持ってきます。 */
const FIRST_FILE = 'UserConfig.example.js';

/** 連結の対象外にするファイル。 */
const EXCLUDED = new Set(['UserConfig.js']);

function readSourceFiles() {
  const files = fs.readdirSync(SRC_DIR)
    .filter((file) => file.endsWith('.js') && !EXCLUDED.has(file))
    .sort();

  return [FIRST_FILE].concat(files.filter((file) => file !== FIRST_FILE));
}

function buildBundle() {
  const header = [
    '/**',
    ' * NewArticleAlertWithGAS — 1 ファイルにまとめた版',
    ' *',
    ' * このファイルは src/ の各ファイルから自動生成されています。直接編集しないでください。',
    ' * 変更する場合は src/ を編集し、`npm run build` で再生成します。',
    ' *',
    ' * 使い方（clasp を使わない場合）:',
    ' *   1. このファイルの内容をすべてコピーする',
    ' *   2. Apps Script エディタの コード.gs に貼り付ける',
    ' *   3. ファイル先頭の USER_CONFIG を自分の用途に合わせて編集する',
    ' *   4. API キーなどはコードに書かず、スクリプトプロパティに設定する',
    ' *',
    ' * 詳しい手順は README を参照してください。',
    ' */',
    '',
  ].join('\n');

  const sections = readSourceFiles().map((file) => {
    const code = fs.readFileSync(path.join(SRC_DIR, file), 'utf8').trimEnd();
    const banner = [
      '',
      '// '.padEnd(78, '='),
      '// ' + file,
      '// '.padEnd(78, '='),
      '',
    ].join('\n');
    return banner + code + '\n';
  });

  return header + sections.join('\n');
}

const bundle = buildBundle();
const isCheckMode = process.argv.indexOf('--check') >= 0;

if (isCheckMode) {
  const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
  if (current !== bundle) {
    console.error('dist/Code.js が src/ と一致していません。`npm run build` を実行してコミットしてください。');
    process.exit(1);
  }
  console.log('dist/Code.js は src/ と一致しています');
} else {
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, bundle);
  console.log('生成しました: dist/Code.js (' + bundle.split('\n').length + ' 行)');
}
