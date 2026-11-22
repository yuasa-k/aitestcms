// 予約公開の判定（GitHub Actions の定時実行から使う）。
// 本番の /build-info.json に載っている号と、「今の時刻で本番に出すべき号」を比べ、
// 違っていれば再ビルド・デプロイが必要と判定する。npm install なしで動く（数秒で終わる）。
//
//   PRODUCTION_URL=https://<本番のURL> node scripts/check-schedule.mjs
//
// 結果は GITHUB_OUTPUT に deploy=true|false で書き出す（ローカルでは画面に出すだけ）。
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { selectIssues } from '../src/lib/issues.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const ISSUES_DIR = path.join(ROOT, 'src/content/issues');

function setOutput(deploy, reason) {
  console.log(`判定：${deploy ? '再ビルド・デプロイする' : '何もしない'}（${reason}）`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 予約公開の判定\n\n${deploy ? '再ビルド・デプロイする' : '何もしない'}：${reason}\n`);
  }
}

const base = process.env.PRODUCTION_URL;
if (!base) {
  // 初回デプロイ前（本番のURLが決まる前）は失敗させず、警告だけ出して何もしない
  console.log('::warning::PRODUCTION_URL が未設定のため、予約公開の判定をしませんでした（GitHub のリポジトリ変数に本番のURLを設定してください）');
  setOutput(false, 'PRODUCTION_URL が未設定');
  process.exit(0);
}

// 今の時刻で本番に出すべき号
const issues = readdirSync(ISSUES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(path.join(ISSUES_DIR, f), 'utf8')))
  .map((d) => ({ id: String(d.id), publishAt: new Date(d.publishAt) }))
  .filter((i) => !Number.isNaN(i.publishAt.getTime()));
const expected = selectIssues(issues, { mode: 'production', now: new Date() })
  .map((i) => i.id)
  .sort();

// 本番に出ている号
let deployed = null;
try {
  const url = new URL('/build-info.json', base);
  url.searchParams.set('t', String(Date.now())); // キャッシュを避ける
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const info = await res.json();
  if (!Array.isArray(info.issues)) throw new Error('issues がありません');
  deployed = info.issues.map(String).sort();
} catch (e) {
  setOutput(true, `本番の build-info.json を読めませんでした（${e.message}）。念のため再デプロイします`);
  process.exit(0);
}

const added = expected.filter((id) => !deployed.includes(id));
const removed = deployed.filter((id) => !expected.includes(id));
if (added.length === 0 && removed.length === 0) {
  setOutput(false, `本番の号は最新です（${deployed.join(', ') || 'なし'}）`);
} else {
  const parts = [];
  if (added.length) parts.push(`公開日時が来た号：${added.join(', ')}`);
  if (removed.length) parts.push(`本番にあるが出すべきでない号：${removed.join(', ')}`);
  setOutput(true, parts.join('／'));
}
