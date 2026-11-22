// デプロイ直前の dist の検査。問題があれば終了コード1で止める。
//
//   node scripts/verify-dist.mjs production   … 本番用の dist か
//   node scripts/verify-dist.mjs preview      … プレビュー用の dist か
//
// 本番では、公開日時前の号のページ・素材・号IDが含まれていないことを、ビルド時刻（build-info.json）で確かめる。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ISSUES_DIR = path.join(ROOT, 'src/content/issues');
const expected = process.argv[2];
const errors = [];

if (expected !== 'production' && expected !== 'preview') {
  console.error('使い方: node scripts/verify-dist.mjs production|preview');
  process.exit(2);
}
if (!existsSync(path.join(DIST, 'build-info.json'))) {
  console.error('dist/build-info.json がありません。先に npm run build を実行してください');
  process.exit(1);
}

const info = JSON.parse(readFileSync(path.join(DIST, 'build-info.json'), 'utf8'));
const builtAt = new Date(info.builtAt);

// 1. ビルドのモード
if (info.mode !== expected) errors.push(`ビルドのモードが ${info.mode} です（期待：${expected}）`);

// 2. 隠しファイル・隠しフォルダ（ビルドの途中のファイルなど）を公開しない
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? [p, ...walk(p)] : [p];
  });
for (const p of walk(DIST)) {
  if (path.basename(p).startsWith('.')) errors.push(`隠しファイルが含まれています：${path.relative(ROOT, p)}`);
}

// 3. 本番：公開日時前の号が含まれていない
if (expected === 'production') {
  for (const f of readdirSync(ISSUES_DIR).filter((f) => f.endsWith('.json'))) {
    const id = f.replace(/\.json$/, '');
    const publishAt = new Date(JSON.parse(readFileSync(path.join(ISSUES_DIR, f), 'utf8')).publishAt);
    if (!(publishAt.getTime() > builtAt.getTime())) continue; // 公開済み
    if (info.issues.includes(id)) errors.push(`公開日時前の号が build-info.json に含まれています：${id}`);
    if (existsSync(path.join(DIST, 'issues', id))) errors.push(`公開日時前の号のページがあります：dist/issues/${id}/`);
    if (existsSync(path.join(DIST, 'media', id))) errors.push(`公開日時前の号の動画があります：dist/media/${id}/`);
  }
}

if (errors.length > 0) {
  console.error(`dist の検査で問題が見つかりました（${expected}）：\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`dist の検査：OK（${info.mode}、号：${info.issues.join(', ') || 'なし'}、ビルド時刻：${info.builtAt}）`);
