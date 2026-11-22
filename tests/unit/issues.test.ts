import { describe, expect, it } from 'vitest';
import { resolveBuildMode } from '../../src/lib/build-mode';
import { parseBuildTime } from '../../src/lib/build-time';
import { assertIssueIds, isPublished, pickLatest, selectIssues } from '../../src/lib/issues';
import { responsiveWidths } from '../../src/lib/image-widths';
import { collectMediaRefs } from '../../src/lib/media-refs';

const issue = (id: string, publishAt: string) => ({ id, publishAt: new Date(publishAt) });

const past1 = issue('2026-10', '2026-10-01T10:00:00+09:00');
const past2 = issue('2026-11', '2026-11-01T10:00:00+09:00');
const future = issue('2026-12', '2026-12-01T10:00:00+09:00');
const all = [future, past1, past2];
const now = new Date('2026-11-19T12:00:00+09:00');

describe('公開判定', () => {
  it('公開日時を過ぎた号は公開済み', () => {
    expect(isPublished(past2, now)).toBe(true);
    expect(isPublished(future, now)).toBe(false);
  });

  it('公開日時ちょうどは公開済み、1ミリ秒前は未公開', () => {
    const t = future.publishAt.getTime();
    expect(isPublished(future, new Date(t))).toBe(true);
    expect(isPublished(future, new Date(t - 1))).toBe(false);
  });

  it('本番：公開日時前の号を含めない', () => {
    const ids = selectIssues(all, { mode: 'production', now }).map((i) => i.id);
    expect(ids).toEqual(['2026-11', '2026-10']);
  });

  it('プレビュー：公開日時前の号も含める', () => {
    const ids = selectIssues(all, { mode: 'preview', now }).map((i) => i.id);
    expect(ids).toEqual(['2026-12', '2026-11', '2026-10']);
  });

  it('本番の `/` は公開済みの最新号', () => {
    expect(pickLatest(selectIssues(all, { mode: 'production', now }))?.id).toBe('2026-11');
  });

  it('プレビューの `/` は公開日時前の号も含めた最新号', () => {
    expect(pickLatest(selectIssues(all, { mode: 'preview', now }))?.id).toBe('2026-12');
  });

  it('公開日時を過ぎたら、本番の `/` が新しい号に切り替わる', () => {
    expect(pickLatest(selectIssues(all, { mode: 'production', now: future.publishAt }))?.id).toBe('2026-12');
  });

  it('公開済みの号がなければ `/` は undefined', () => {
    expect(pickLatest(selectIssues([future], { mode: 'production', now }))).toBeUndefined();
  });

  it('同じ公開日時なら号IDの降順', () => {
    const a = issue('a', '2026-01-01T00:00:00Z');
    const b = issue('b', '2026-01-01T00:00:00Z');
    expect(selectIssues([a, b], { mode: 'production', now }).map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('元の配列を書き換えない', () => {
    const input = [past1, past2];
    selectIssues(input, { mode: 'production', now });
    expect(input).toEqual([past1, past2]);
  });
});

describe('号IDの検査', () => {
  it('ファイル名と一致していれば通る', () => {
    expect(() => assertIssueIds([{ fileId: 'a', id: 'a' }])).not.toThrow();
  });

  it('ファイル名と一致しないと失敗', () => {
    expect(() => assertIssueIds([{ fileId: 'a', id: 'b' }])).toThrow(/一致していません/);
  });

  it('重複すると失敗', () => {
    expect(() =>
      assertIssueIds([
        { fileId: 'a', id: 'a' },
        { fileId: 'a', id: 'a' },
      ]),
    ).toThrow(/重複/);
  });
});

describe('ビルド条件', () => {
  it('BUILD_MODE がなければ、build は本番・dev はプレビュー', () => {
    expect(resolveBuildMode(undefined, false)).toBe('production');
    expect(resolveBuildMode('', false)).toBe('production');
    expect(resolveBuildMode(undefined, true)).toBe('preview');
  });

  it('BUILD_MODE を指定できる', () => {
    expect(resolveBuildMode('preview', false)).toBe('preview');
    expect(resolveBuildMode('production', true)).toBe('production');
  });

  it('BUILD_MODE が不正なら失敗', () => {
    expect(() => resolveBuildMode('prod', false)).toThrow(/BUILD_MODE が不正/);
  });

  it('BUILD_TIME を読める。不正なら失敗', () => {
    expect(parseBuildTime('2026-12-01T10:00:00+09:00').toISOString()).toBe('2026-12-01T01:00:00.000Z');
    expect(() => parseBuildTime('tomorrow')).toThrow(/BUILD_TIME が不正/);
  });
});

describe('画像を書き出す幅', () => {
  const c = [480, 800, 1200, 1600];
  it('元の画像が大きければ候補をそのまま使う', () => {
    expect(responsiveWidths(c, 3000)).toEqual([480, 800, 1200, 1600]);
  });
  it('元の画像より大きい幅は作らず、元の幅を加える', () => {
    expect(responsiveWidths(c, 1000)).toEqual([480, 800, 1000]);
  });
  it('元の画像が候補より小さくても空にならない', () => {
    expect(responsiveWidths(c, 64)).toEqual([64]);
  });
});

describe('素材の参照の収集', () => {
  it('入れ子のブロックも含めて、画像と動画を重複なく集める', () => {
    const refs = collectMediaRefs([
      { type: 'hero', poster: 'hero.jpg', video: 'hero.mp4' },
      { type: 'image', src: 'a.jpg' },
      { type: 'carousel', items: [{ src: 'b.jpg' }, { src: 'a.jpg' }] },
      { type: 'section', background: { kind: 'video', src: 'bg.mp4', poster: 'bg.jpg' }, children: [] },
      { type: 'reveal', children: [{ type: 'image', src: 'c.jpg' }] },
    ]);
    expect(refs).toEqual({
      images: ['a.jpg', 'b.jpg', 'bg.jpg', 'c.jpg', 'hero.jpg'],
      videos: ['bg.mp4', 'hero.mp4'],
    });
  });
});
