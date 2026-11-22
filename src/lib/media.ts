// media/<号ID>/ に置いた素材を、内容ファイルに書いたファイル名から探す。
// 見つからないときはビルドを失敗させる。
// 読み込み対象は integration（src/integrations/issue-media.ts）がビルド条件に合わせて絞っている。
import type { ImageMetadata } from 'astro';
import { images } from 'virtual:issue-media';

export { responsiveWidths } from './image-widths';

/** 動画のURL。ファイルの出力と存在確認は integration（issue-media）が行う */
export function issueVideoUrl(issueId: string, file: string): string {
  return `/media/${issueId}/${file}`;
}

export async function loadIssueImage(issueId: string, file: string): Promise<ImageMetadata> {
  const key = `/media/${issueId}/${file}`;
  const loader = images[key];
  if (!loader) {
    throw new Error(
      `画像が見つかりません：media/${issueId}/${file}\n` +
        `内容ファイル（src/content/issues/${issueId}.json）のファイル名と、media/${issueId}/ に置いたファイルを確認してください。`,
    );
  }
  return (await loader()).default;
}
