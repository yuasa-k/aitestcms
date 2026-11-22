// ダミー素材の生成。
// src/content/issues/*.json が参照している画像・動画のうち、media/<号ID>/ にないものだけを作る。
// 既存のファイルは上書きしない（--force を付けたときだけ作り直す）。
//
//   npm run media:dummy            … 足りないものだけ作る
//   npm run media:dummy -- --force … すべて作り直す
import { execFile } from 'node:child_process';
import { access, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import { collectMediaRefs } from '../src/lib/media-refs.ts';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const ISSUES_DIR = path.join(ROOT, 'src/content/issues');
const MEDIA_DIR = path.join(ROOT, 'media');
const force = process.argv.includes('--force');

// ---- 色 ----

// 号ごとの色（サンプル号以外は号IDから色相を決める）
const PALETTES = {
  '2026-10': ['#3b2414', '#c8873a', '#f0c27a'],
  '2026-11': ['#05070f', '#1b2547', '#c8a96a'],
  '2026-12': ['#5b6470', '#c9ced6', '#ffffff'],
};

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function paletteFor(issueId) {
  if (PALETTES[issueId]) return PALETTES[issueId];
  let h = 0;
  for (const c of issueId) h = (h * 31 + c.charCodeAt(0)) % 360;
  return [hslToHex(h, 40, 10), hslToHex(h, 45, 35), hslToHex((h + 30) % 360, 60, 70)];
}

// 同じ号の中で番号違いのファイル（item-01, item-02…）は色を変える
const VARIANTS = [
  (c2, c3) => [c2, c3],
  () => ['#0b0b0b', '#c0c4cc'],
  (_c2, c3) => ['#2a1838', c3],
];

function colorsFor(file, [c1, baseC2, baseC3]) {
  const n = Number(file.match(/(\d+)\.[a-z0-9]+$/)?.[1] ?? 1);
  const [c2, c3] = VARIANTS[(Math.max(n, 1) - 1) % VARIANTS.length](baseC2, baseC3);
  return [c1, c2, c3];
}

// ---- 画像 ----

/** ファイル名から大きさと模様を決める */
function shapeFor(file) {
  if (file.startsWith('item-')) return { width: 1200, height: 1500, orb: true };
  if (file === 'hero.jpg' || file.startsWith('bg') || /^(snow|night)\./.test(file)) {
    return { width: 1920, height: 1080, orb: false };
  }
  return { width: 1600, height: 1000, orb: false };
}

async function makeImage(file, palette, out) {
  const { width, height, orb } = shapeFor(file);
  const [c1, c2, c3] = colorsFor(file, palette);
  const r = Math.round(Math.min(width, height) * 0.22);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="0.6" stop-color="${c2}"/>
      <stop offset="1" stop-color="${c1}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.7" cy="0.3" r="0.6">
      <stop offset="0" stop-color="${c3}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${c3}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  ${orb ? `<circle cx="${width / 2}" cy="${height / 2}" r="${r}" fill="${c3}" fill-opacity="0.85"/>` : ''}
</svg>`;
  const ext = path.extname(file).slice(1).toLowerCase();
  let pipeline = sharp(Buffer.from(svg));
  if (ext === 'png') pipeline = pipeline.png();
  else if (ext === 'webp') pipeline = pipeline.webp({ quality: 85 });
  else if (ext === 'avif') pipeline = pipeline.avif({ quality: 60 });
  else pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
  await pipeline.toFile(out);
}

// ---- 動画 ----

// 背景動画として軽くするための設定：6秒・24fps・960x540・音声なし
const VIDEO = { width: 960, height: 540, fps: 24, seconds: 6 };

async function makeVideo(file, palette, out) {
  const [c1, c2, c3] = palette.map((c) => '0x' + c.replace('#', ''));
  // ファイル名ごとに模様を変える
  let seed = 7;
  for (const ch of file) seed = (seed * 31 + ch.charCodeAt(0)) % 100000;
  const src =
    `gradients=s=${VIDEO.width}x${VIDEO.height}:r=${VIDEO.fps}:d=${VIDEO.seconds}` +
    `:c0=${c1}:c1=${c2}:c2=${c3}:c3=${c1}:nb_colors=4:speed=0.02:seed=${seed}`;
  const common = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', src, '-vf', 'gblur=sigma=24', '-an'];
  const codec = file.endsWith('.webm')
    ? ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1']
    : ['-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  await run(ffmpegPath, [...common, ...codec, out]);
}

// ---- 実行 ----

const exists = (p) => access(p).then(() => true, () => false);
const files = (await readdir(ISSUES_DIR)).filter((f) => f.endsWith('.json'));
let created = 0;
let skipped = 0;

for (const f of files) {
  const issueId = f.replace(/\.json$/, '');
  const data = JSON.parse(await readFile(path.join(ISSUES_DIR, f), 'utf8'));
  const palette = paletteFor(issueId);
  const dir = path.join(MEDIA_DIR, issueId);
  await mkdir(dir, { recursive: true });
  const refs = collectMediaRefs(data.blocks);

  for (const [kind, list, make] of [
    ['画像', refs.images, makeImage],
    ['動画', refs.videos, makeVideo],
  ]) {
    for (const file of list) {
      const out = path.join(dir, file);
      if (!force && (await exists(out))) {
        skipped++;
        continue;
      }
      await make(file, palette, out);
      const kb = Math.round((await stat(out)).size / 1024);
      console.log(`作成（${kind}）: media/${issueId}/${file}（${kb}KB）`);
      created++;
    }
  }
}

console.log(`完了：作成 ${created} 件、既存のためスキップ ${skipped} 件`);
