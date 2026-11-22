// 本番（production）とプレビュー（preview）のビルド条件を分ける。
// - astro build の既定は production（未公開の号を出さない安全側）
// - astro dev の既定は preview（未公開の号も確認できる）
//
// モードは integration（src/integrations/issue-media.ts）が Astro のコマンドから1回だけ決め、
// process.env.BUILD_MODE に書き込む。ページ側はそれを読むだけにする。
// ※ import.meta.env.DEV は NODE_ENV に左右される（NODE_ENV=test などで build でも true になる）ため使わない。
export type BuildMode = 'production' | 'preview';

export function resolveBuildMode(raw: string | undefined, isDev: boolean): BuildMode {
  if (raw === undefined || raw === '') return isDev ? 'preview' : 'production';
  if (raw === 'production' || raw === 'preview') return raw;
  throw new Error(`BUILD_MODE が不正です: "${raw}"（production か preview を指定）`);
}

/** ページ側から使う。BUILD_MODE がなければ本番として扱う（安全側） */
export function getBuildMode(): BuildMode {
  return resolveBuildMode(process.env.BUILD_MODE, false);
}

export const isPreview = () => getBuildMode() === 'preview';
