// ビルドのテスト用の道具。
// 一時フォルダにプロジェクトをコピーし、内容ファイルと素材をテスト用（tests/fixtures）に差し替えて astro build する。
// 実際の号（src/content/issues）に左右されず、本物の設定・integration・ページでビルドを確かめられる。
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { collectMediaRefs } from '../../src/lib/media-refs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FIXTURE_ISSUES = path.join(ROOT, 'tests/fixtures/issues');

/** テスト用の小さな単色の画像を書き出す */
export async function writeDummyImage(file: string): Promise<void> {
  await sharp({ create: { width: 64, height: 40, channels: 3, background: '#888888' } })
    .jpeg()
    .toFile(file);
}

export interface FixtureProject {
  dir: string;
  dist: string;
  cleanup: () => void;
}

/** テスト用のプロジェクトを一時フォルダに作る */
export async function createFixtureProject(): Promise<FixtureProject> {
  const dir = mkdtempSync(path.join(tmpdir(), 'ai-cms-test-build-'));

  for (const f of ['package.json', 'astro.config.ts', 'tsconfig.json']) {
    cpSync(path.join(ROOT, f), path.join(dir, f));
  }
  cpSync(path.join(ROOT, 'src'), path.join(dir, 'src'), {
    recursive: true,
    filter: (src) => !src.startsWith(path.join(ROOT, 'src/content/issues')),
  });
  cpSync(FIXTURE_ISSUES, path.join(dir, 'src/content/issues'), { recursive: true });

  // node_modules はパッケージごとにリンクする（node_modules/.astro などのキャッシュを本物と共有しないため）
  const nm = path.join(dir, 'node_modules');
  mkdirSync(nm);
  for (const entry of readdirSync(path.join(ROOT, 'node_modules'))) {
    if (entry === '.astro' || entry === '.vite' || entry === '.cache') continue;
    symlinkSync(path.join(ROOT, 'node_modules', entry), path.join(nm, entry));
  }

  // テスト用の素材（画像は小さな単色、動画は中身のないダミー。動画はコピーの有無だけを確かめる）
  for (const f of readdirSync(FIXTURE_ISSUES).filter((f) => f.endsWith('.json'))) {
    const issueId = f.replace(/\.json$/, '');
    const data = JSON.parse(readFileSync(path.join(FIXTURE_ISSUES, f), 'utf8'));
    const refs = collectMediaRefs(data.blocks);
    const mediaDir = path.join(dir, 'media', issueId);
    mkdirSync(mediaDir, { recursive: true });
    for (const img of refs.images) await writeDummyImage(path.join(mediaDir, img));
    for (const video of refs.videos) writeFileSync(path.join(mediaDir, video), 'dummy-video');
  }

  return {
    dir,
    dist: path.join(dir, 'dist'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export interface BuildResult {
  code: number | null;
  output: string;
}

/** astro build を実行する。BUILD_MODE・BUILD_TIME は env で渡したものだけを使う */
export function runBuild(project: FixtureProject, env: Record<string, string> = {}): BuildResult {
  rmSync(project.dist, { recursive: true, force: true });
  const baseEnv = { ...process.env };
  delete baseEnv.BUILD_MODE;
  delete baseEnv.BUILD_TIME;
  const r = spawnSync(process.execPath, [path.join(project.dir, 'node_modules/astro/bin/astro.mjs'), 'build'], {
    cwd: project.dir,
    env: { ...baseEnv, ...env, NO_COLOR: '1' },
    encoding: 'utf8',
  });
  return { code: r.status, output: `${r.stdout}\n${r.stderr}` };
}

/** dist の中のファイルを再帰的に列挙する（dist からの相対パス） */
export function listFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p, base) : [path.relative(base, p)];
  });
}

/** dist の中のテキストファイル（隠しフォルダの中も含む）に、指定の文字列を含むものがあれば返す */
export function filesContaining(dist: string, needle: string): string[] {
  return listFiles(dist)
    .filter((f) => /\.(html|json|js|mjs|cjs|css|xml|txt|map)$/.test(f))
    .filter((f) => readFileSync(path.join(dist, f), 'utf8').includes(needle));
}

export const readDist = (dist: string, rel: string) => readFileSync(path.join(dist, rel), 'utf8');
