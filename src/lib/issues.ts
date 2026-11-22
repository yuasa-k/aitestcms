// 公開判定のロジック。astro:content に依存しない純粋な関数にして、テストしやすくする。
import type { BuildMode } from './build-mode';

export interface IssueLike {
  id: string;
  publishAt: Date;
}

/** 公開日時を過ぎているか（ちょうどの時刻は公開済みとみなす） */
export function isPublished(issue: IssueLike, now: Date): boolean {
  return issue.publishAt.getTime() <= now.getTime();
}

/** 新しい順（公開日時の降順、同じ日時なら号IDの降順）に並べる */
export function sortNewestFirst<T extends IssueLike>(issues: readonly T[]): T[] {
  return [...issues].sort(
    (a, b) => b.publishAt.getTime() - a.publishAt.getTime() || b.id.localeCompare(a.id),
  );
}

/**
 * そのビルドに含める号を返す（新しい順）。
 * - production：公開日時を過ぎた号だけ
 * - preview：すべての号（公開日時前の号も確認できる）
 */
export function selectIssues<T extends IssueLike>(
  issues: readonly T[],
  opts: { mode: BuildMode; now: Date },
): T[] {
  const included = opts.mode === 'production' ? issues.filter((i) => isPublished(i, opts.now)) : issues;
  return sortNewestFirst(included);
}

/** `/` に出す号。ビルドに含めた号のうち最新のもの（なければ undefined） */
export function pickLatest<T extends IssueLike>(selected: readonly T[]): T | undefined {
  return sortNewestFirst(selected)[0];
}

/** 号IDの重複と、ファイル名と号IDの不一致を検出する */
export function assertIssueIds(entries: readonly { fileId: string; id: string }[]): void {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.fileId !== e.id) {
      errors.push(`ファイル名「${e.fileId}.json」と号ID「${e.id}」が一致していません`);
    }
    if (seen.has(e.id)) errors.push(`号ID「${e.id}」が重複しています`);
    seen.add(e.id);
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
}
