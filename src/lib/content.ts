// ページから使う入口。内容ファイルを読み、ビルド条件に合わせて号を選ぶ。
import { getCollection } from 'astro:content';
import { getBuildMode } from './build-mode';
import { getBuildTime } from './build-time';
import { assertIssueIds, pickLatest, selectIssues } from './issues';
import type { IssueData } from './schema';

export { getBuildTime };

/** このビルドに含める号（新しい順） */
export async function getIncludedIssues(): Promise<IssueData[]> {
  const entries = await getCollection('issues');
  assertIssueIds(entries.map((e) => ({ fileId: e.id, id: e.data.id })));
  return selectIssues(
    entries.map((e) => e.data),
    { mode: getBuildMode(), now: getBuildTime() },
  );
}

/** `/` に出す号 */
export async function getLatestIssue(): Promise<IssueData | undefined> {
  return pickLatest(await getIncludedIssues());
}
