// 背景動画を軽くする（H.264・音声なし・幅1280px以下・24fps・最大15秒）。
//
//   npm run media:video -- <入力ファイル> <出力ファイル（media/<号ID>/xxx.mp4）>
//
// 例：npm run media:video -- ~/Downloads/原本.mov media/2027-01/hero.mp4
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const run = promisify(execFile);
const [input, output] = process.argv.slice(2);

if (!input || !output) {
  console.error('使い方: npm run media:video -- <入力ファイル> <出力ファイル（media/<号ID>/xxx.mp4）>');
  process.exit(2);
}
if (!existsSync(input)) {
  console.error(`入力ファイルが見つかりません：${input}`);
  process.exit(1);
}
if (!/^media\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9][a-z0-9_-]*\.mp4$/.test(output)) {
  console.error('出力先は media/<号ID>/<英小文字・数字・_・->.mp4 の形にしてください');
  process.exit(1);
}
if (!ffmpegPath || !existsSync(ffmpegPath)) {
  console.error('ffmpeg が見つかりません。npm install をやり直してください（ffmpeg-static が本体をダウンロードします）');
  process.exit(1);
}

await run(ffmpegPath, [
  '-y',
  '-hide_banner',
  '-loglevel',
  'error',
  '-i',
  input,
  '-t',
  '15',
  '-vf',
  "scale='min(1280,iw)':-2,fps=24",
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '28',
  '-profile:v',
  'main',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  '-an',
  output,
]);

const mb = statSync(output).size / 1024 / 1024;
console.log(`作成：${output}（${mb.toFixed(1)}MB）`);
if (mb > 5) console.log('5MBを超えています。もっと短く切るか、エンジニアに相談してください');
