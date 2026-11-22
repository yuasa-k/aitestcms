// 背景動画の遅延読み込み。
// - 画面に近づくまで動画を読み込まない（最初はポスター画像だけ）
// - 画面外に出たら一時停止し、戻ったら再開する
// - 視差効果を減らす設定・データセーバーのときは読み込まない（ポスター画像のまま）
// - 再生が始まってから動画を表示する。読み込みに失敗したらポスター画像のまま
// - 一時停止ボタン（WCAG 2.2.2：5秒を超えて自動で動く表示には止める手段が必要）
import { onReducedMotionChange, prefersReducedMotion, prefersSaveData } from './motion';

const LABEL_PAUSE = '背景動画を一時停止';
const LABEL_PLAY = '背景動画を再生';

function loadSources(video: HTMLVideoElement) {
  if (video.dataset.loaded) return;
  video.dataset.loaded = 'true';
  video.querySelectorAll<HTMLSourceElement>('source[data-src]').forEach((s) => {
    s.src = s.dataset.src!;
  });
  video.load();
}

function setupOne(wrap: HTMLElement, io: IntersectionObserver) {
  const video = wrap.querySelector<HTMLVideoElement>('video');
  const toggle = wrap.querySelector<HTMLButtonElement>('[data-video-toggle]');
  if (!video) return;

  video.addEventListener('playing', () => {
    wrap.classList.add('is-playing');
    if (toggle) toggle.hidden = false;
  });
  video.addEventListener('error', () => wrap.classList.remove('is-playing'), true);

  toggle?.addEventListener('click', () => {
    const paused = wrap.dataset.userPaused === 'true';
    wrap.dataset.userPaused = String(!paused);
    toggle.setAttribute('aria-pressed', String(!paused));
    toggle.setAttribute('aria-label', paused ? LABEL_PAUSE : LABEL_PLAY);
    if (paused) video.play().catch(() => {});
    else video.pause();
  });

  io.observe(wrap);
}

export function setupLazyVideos(): void {
  const wraps = document.querySelectorAll<HTMLElement>('[data-lazy-video]:not([data-lazy-video-ready])');
  if (wraps.length === 0) return;
  wraps.forEach((w) => (w.dataset.lazyVideoReady = 'true'));
  if (prefersReducedMotion() || prefersSaveData()) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const wrap = entry.target as HTMLElement;
        const video = wrap.querySelector<HTMLVideoElement>('video');
        if (!video) continue;
        if (entry.isIntersecting) {
          loadSources(video);
          if (wrap.dataset.userPaused !== 'true') video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    },
    { rootMargin: '200px 0px' },
  );

  wraps.forEach((w) => setupOne(w, io));

  // 途中で「視差効果を減らす」がオンになったら止めてポスター画像に戻す
  onReducedMotionChange((reduce) => {
    if (!reduce) return;
    io.disconnect();
    wraps.forEach((w) => {
      w.querySelector('video')?.pause();
      w.classList.remove('is-playing');
      const t = w.querySelector<HTMLButtonElement>('[data-video-toggle]');
      if (t) t.hidden = true;
    });
  });
}
