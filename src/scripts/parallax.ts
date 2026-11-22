// パララックス（背景をスクロールより少し遅く動かす）。
// [data-parallax] の要素に CSS変数 --parallax-y を設定し、背景の層がそれを使って動く。
// 画面に入っている要素だけを計算する。視差効果を減らす設定のときは何もしない。
import { onReducedMotionChange, prefersReducedMotion } from './motion';

/** 動く量（背景の層の高さに対する割合、%） */
const STRENGTH = 10;

export function setupParallax(): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
  if (els.length === 0 || prefersReducedMotion()) return;

  const visible = new Set<HTMLElement>();
  let ticking = false;

  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    for (const el of visible) {
      const r = el.getBoundingClientRect();
      // 要素の中心が画面の中心にあるとき0、画面の上端・下端を出るとき±1
      const progress = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2);
      const clamped = Math.max(-1, Math.min(1, progress));
      el.style.setProperty('--parallax-y', `${(clamped * STRENGTH).toFixed(2)}%`);
    }
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) visible.add(e.target as HTMLElement);
      else visible.delete(e.target as HTMLElement);
    }
    onScroll();
  });
  els.forEach((el) => io.observe(el));
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  onReducedMotionChange((reduce) => {
    if (!reduce) return;
    io.disconnect();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    els.forEach((el) => el.style.removeProperty('--parallax-y'));
  });
}
