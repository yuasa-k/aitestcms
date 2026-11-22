// 演出の可否を判定する共通の関数
const reduceQuery = () => window.matchMedia('(prefers-reduced-motion: reduce)');

/** 「視差効果を減らす」設定がオンか */
export function prefersReducedMotion(): boolean {
  return reduceQuery().matches;
}

/** 設定が途中で変わったときに呼ぶ */
export function onReducedMotionChange(cb: (reduce: boolean) => void): void {
  reduceQuery().addEventListener('change', (e) => cb(e.matches));
}

/** データセーバー（通信量を抑える設定）がオンか */
export function prefersSaveData(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return conn?.saveData === true;
}
