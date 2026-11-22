/**
 * 画像を書き出す幅の候補を、元の画像の幅に合わせて決める。
 * 元の画像より大きくは拡大せず、元の画像が小さくても最低1つ（元の幅）は残す。
 */
export function responsiveWidths(candidates: readonly number[], imageWidth: number): number[] {
  const max = Math.max(...candidates);
  const widths = candidates.filter((w) => w < imageWidth);
  widths.push(Math.min(imageWidth, max));
  return [...new Set(widths)].sort((a, b) => a - b);
}
