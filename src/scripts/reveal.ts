// スクロール連動のフェードイン。
// JSが動いて、かつ演出を止める設定でないときだけ、いったん隠して（data-reveal-armed）
// 画面に入ったら表示する（is-visible）。JSが動かない環境では最初から表示されたまま。
import { onReducedMotionChange, prefersReducedMotion } from './motion';

export function setupReveal(): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
  if (els.length === 0 || prefersReducedMotion()) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -10% 0px' },
  );

  els.forEach((el) => {
    // 中のブロックを順番に少しずつ遅らせて出す
    Array.from(el.children).forEach((child, i) => (child as HTMLElement).style.setProperty('--reveal-index', String(i)));
    el.dataset.revealArmed = 'true';
    io.observe(el);
  });

  onReducedMotionChange((reduce) => {
    if (!reduce) return;
    io.disconnect();
    els.forEach((el) => el.classList.add('is-visible'));
  });
}
