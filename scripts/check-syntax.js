/**
 * src/ の各ファイルの構文を検査します。
 * clasp push する前の簡易チェックとして使います。
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC_DIR = path.join(__dirname, '..', 'src');
let failed = 0;

fs.readdirSync(SRC_DIR)
  .filter((file) => file.endsWith('.js'))
  .sort()
  .forEach((file) => {
    const fullPath = path.join(SRC_DIR, file);
    try {
      new vm.Script(fs.readFileSync(fullPath, 'utf8'), { filename: file });
      console.log('ok   ' + file);
    } catch (error) {
      console.error('NG   ' + file + ': ' + error.message);
      failed++;
    }
  });

if (failed > 0) {
  console.error('\n構文エラーが ' + failed + ' 件あります');
  process.exit(1);
}
console.log('\nすべてのファイルの構文が正しく解析できました');
