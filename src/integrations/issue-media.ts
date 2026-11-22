// 素材（media/）をビルド条件に合わせて扱う integration。
//
// 画像：import.meta.glob は一致したファイルをすべて出力してしまうため、本番ビルドでそのまま使うと
//   公開日時前の号の画像まで dist に出てしまう。そこで仮想モジュール virtual:issue-media を用意し、
//   - プレビュー（dev を含む）：media/ のすべての画像
//   - 本番：公開日時を過ぎた号の media/<号ID>/ の画像だけ
//   を読み込み対象にする。
// 動画：Astro は動画を変換しないので、ビルドの最後に「このビルドに含めた号が参照している動画」だけを
//   dist/media/<号ID>/ にコピーする。開発サーバーでは media/ から直接返す。
import type { AstroIntegration, AstroIntegrationLogger } from 'astro';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBuildMode, type BuildMode } from '../lib/build-mode';
import { getBuildTime } from '../lib/build-time';
import { selectIssues } from '../lib/issues';
import { collectMediaRefs } from '../lib/media-refs';
import { issueSchema, type IssueData } from '../lib/schema';

const VIRTUAL_ID = 'virtual:issue-media';
const RESOLVED_ID = '\0' + VIRTUAL_ID;
const IMAGE_EXT = /\.(?:jpg|jpeg|png|webp|avif)$/i;

/** Cloudflare Workers Static Assets の1ファイルの上限（25 MiB、2026-11-19確認） */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** 背景動画として大きすぎると判断する目安 */
const WARN_VIDEO_BYTES = 5 * 1024 * 1024;

/** 内容ファイルを読み、このビルドに含める号を返す（スキーマ違反の号は除く。エラーは content collection 側で出る） */
export function includedIssues(root: string, mode: BuildMode, now: Date): IssueData[] {
  const dir = path.join(root, 'src/content/issues');
  const issues = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      const parsed = issueSchema.safeParse(JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
      return parsed.success ? [parsed.data] : [];
    });
  return selectIssues(issues, { mode, now });
}

/** 画像の読み込み対象を返す仮想モジュールのコード */
function imageModuleCode(root: string, mode: BuildMode): string {
  if (mode === 'preview') {
    return `export const images = import.meta.glob('/media/*/*.{jpg,jpeg,png,webp,avif}');`;
  }
  const entries: string[] = [];
  for (const issue of includedIssues(root, mode, getBuildTime())) {
    const dir = path.join(root, 'media', issue.id);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => IMAGE_EXT.test(f)).sort()) {
      const key = `/media/${issue.id}/${f}`;
      entries.push(`  ${JSON.stringify(key)}: () => import(${JSON.stringify(key)}),`);
    }
  }
  return `export const images = {\n${entries.join('\n')}\n};`;
}

/** このビルドに含めた号が参照している動画を dist にコピーする。足りない・大きすぎるときは失敗させる */
async function copyVideos(root: string, outDir: string, mode: BuildMode, logger: AstroIntegrationLogger) {
  const errors: string[] = [];
  let copied = 0;
  for (const issue of includedIssues(root, mode, getBuildTime())) {
    for (const file of collectMediaRefs(issue.blocks).videos) {
      const rel = `media/${issue.id}/${file}`;
      const src = path.join(root, rel);
      if (!existsSync(src)) {
        errors.push(`動画が見つかりません：${rel}（src/content/issues/${issue.id}.json から参照）`);
        continue;
      }
      const { size } = statSync(src);
      const mb = (size / 1024 / 1024).toFixed(1);
      if (size > MAX_FILE_BYTES) {
        errors.push(`動画が大きすぎます：${rel}（${mb}MB。1ファイル25MiBまで）`);
        continue;
      }
      if (size > WARN_VIDEO_BYTES) {
        logger.warn(`背景動画としては大きめです：${rel}（${mb}MB）。READMEの手順で圧縮してください`);
      }
      const dest = path.join(outDir, rel);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(src, dest);
      copied++;
    }
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
  logger.info(`動画を ${copied} 件コピーしました（${mode}）`);
}

/** 開発サーバー用：/media/<号ID>/<動画> を media/ から返す（Range リクエストに対応） */
function serveVideo(root: string) {
  const pattern = /^\/media\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9][a-z0-9_-]*\.(mp4|webm))$/;
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const m = pattern.exec((req.url ?? '').split('?')[0]);
    if (!m) return next();
    const file = path.join(root, 'media', m[1], m[2]);
    if (!existsSync(file)) {
      res.statusCode = 404;
      return res.end(`not found: media/${m[1]}/${m[2]}`);
    }
    const { size } = statSync(file);
    const type = m[3] === 'webm' ? 'video/webm' : 'video/mp4';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', type);
    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${size}`);
        return res.end();
      }
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      return createReadStream(file, { start, end }).pipe(res);
    }
    res.setHeader('Content-Length', String(size));
    createReadStream(file).pipe(res);
  };
}

export default function issueMedia(): AstroIntegration {
  let mode: BuildMode = 'production';
  let root = process.cwd();

  return {
    name: 'issue-media',
    hooks: {
      'astro:config:setup': ({ command, config, updateConfig }) => {
        // パスに日本語や記号を含んでも正しく扱えるよう fileURLToPath を使う
        root = fileURLToPath(config.root);
        // モードとビルドの基準時刻をここで1回だけ決め、ページ側も同じ値を読む
        mode = resolveBuildMode(process.env.BUILD_MODE, command === 'dev');
        process.env.BUILD_MODE = mode;
        process.env.BUILD_TIME ??= new Date().toISOString();

        updateConfig({
          vite: {
            plugins: [
              {
                name: 'issue-media',
                resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : undefined),
                load: (id) => (id === RESOLVED_ID ? imageModuleCode(root, mode) : undefined),
              },
            ],
          },
        });
      },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use(serveVideo(root));
      },
      'astro:build:done': async ({ dir, logger }) => {
        await copyVideos(root, fileURLToPath(dir), mode, logger);
      },
    },
  };
}
