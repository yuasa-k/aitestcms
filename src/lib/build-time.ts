// ビルドの基準時刻。公開判定はすべてこの時刻で行う。
// astro.config の integration（issue-media）がビルド開始時に BUILD_TIME を1回だけ決め、
// ページの描画と素材の選別で同じ値を使う。テストでは BUILD_TIME を指定して時刻を固定できる。
export function parseBuildTime(raw: string | undefined): Date {
  if (raw === undefined || raw === '') return new Date();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error(`BUILD_TIME が不正です: "${raw}"（ISO 8601 で指定）`);
  return d;
}

export function getBuildTime(): Date {
  return parseBuildTime(process.env.BUILD_TIME);
}
