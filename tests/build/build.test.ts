// 実際に astro build を実行して、出力（dist）を確かめるテスト。
// テスト用の号：past-a（2000-01-01公開）、past-b（2000-02-01公開）、future（2099-01-01 10:00 JST公開予定）
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFixtureProject,
  filesContaining,
  listFiles,
  readDist,
  runBuild,
  writeDummyImage,
  type FixtureProject,
} from './helpers';

let project: FixtureProject;

beforeAll(async () => {
  project = await createFixtureProject();
});

afterAll(() => {
  project?.cleanup();
});

describe('本番ビルド（BUILD_MODE の指定なし）', () => {
  let dist: string;

  beforeAll(() => {
    const r = runBuild(project);
    expect(r.code, r.output).toBe(0);
    dist = project.dist;
  });

  it('`/` に公開済みの最新号（past-b）が出る', () => {
    const html = readDist(dist, 'index.html');
    expect(html).toContain('data-issue-id="past-b"');
    expect(html).toContain('MARKER-PAST-B');
  });

  it('過去の号のページがある', () => {
    expect(readDist(dist, 'issues/past-a/index.html')).toContain('MARKER-PAST-A');
    expect(readDist(dist, 'issues/past-b/index.html')).toContain('MARKER-PAST-B');
  });

  it('公開日時前の号のページがない', () => {
    expect(existsSync(path.join(dist, 'issues/future'))).toBe(false);
  });

  it('公開日時前の号の文言が、どのファイルにも含まれない', () => {
    expect(filesContaining(dist, 'MARKER-FUTURE')).toEqual([]);
    expect(filesContaining(dist, 'テスト用・未公開')).toEqual([]);
  });

  it('公開日時前の号の画像・動画が出力されない', () => {
    const files = listFiles(dist);
    expect(files.filter((f) => path.basename(f).startsWith('future-'))).toEqual([]);
    expect(existsSync(path.join(dist, 'media/future'))).toBe(false);
  });

  it('公開済みの号の動画は出力される', () => {
    expect(existsSync(path.join(dist, 'media/past-a/hero.mp4'))).toBe(true);
  });

  it('build-info.json に公開済みの号だけが載る', () => {
    const info = JSON.parse(readDist(dist, 'build-info.json'));
    expect(info.mode).toBe('production');
    expect(info.issues).toEqual(['past-a', 'past-b']);
  });

  it('プレビューの帯と noindex が付かない', () => {
    const html = readDist(dist, 'index.html');
    expect(html).not.toContain('noindex');
    expect(html).not.toContain('class="preview-banner"');
  });

  it('元の画像が小さくても srcset が空にならない', () => {
    const html = readDist(dist, 'issues/past-b/index.html');
    expect(html).not.toMatch(/srcset(?:="")?[\s>]/);
  });
});

describe('プレビュービルド（BUILD_MODE=preview）', () => {
  let dist: string;

  beforeAll(() => {
    const r = runBuild(project, { BUILD_MODE: 'preview' });
    expect(r.code, r.output).toBe(0);
    dist = project.dist;
  });

  it('公開日時前の号も出る。`/` はそれを含めた最新号', () => {
    expect(readDist(dist, 'issues/future/index.html')).toContain('MARKER-FUTURE');
    expect(readDist(dist, 'index.html')).toContain('data-issue-id="future"');
    expect(existsSync(path.join(dist, 'media/future/future-hero.mp4'))).toBe(true);
  });

  it('全ページに noindex とプレビューの帯が付く', () => {
    for (const f of ['index.html', 'issues/past-a/index.html', 'issues/future/index.html']) {
      const html = readDist(dist, f);
      expect(html, f).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(html, f).toContain('class="preview-banner"');
    }
  });
});

describe('環境変数 NODE_ENV に左右されない', () => {
  // 以前、ページ側の判定が NODE_ENV に引きずられ、本番ビルドでもプレビュー扱いになる不具合があった
  it.each(['development', 'test'])('NODE_ENV=%s でも、本番ビルドに公開日時前の号が含まれない', (nodeEnv) => {
    const r = runBuild(project, { NODE_ENV: nodeEnv });
    expect(r.code, r.output).toBe(0);
    expect(existsSync(path.join(project.dist, 'issues/future'))).toBe(false);
    expect(filesContaining(project.dist, 'MARKER-FUTURE')).toEqual([]);
    expect(JSON.parse(readDist(project.dist, 'build-info.json')).mode).toBe('production');
  });
});

describe('公開日時の境目（BUILD_TIME で時刻を固定）', () => {
  it('公開日時の1秒前は含まれない', () => {
    const r = runBuild(project, { BUILD_TIME: '2099-01-01T09:59:59+09:00' });
    expect(r.code, r.output).toBe(0);
    expect(JSON.parse(readDist(project.dist, 'build-info.json')).issues).toEqual(['past-a', 'past-b']);
  });

  it('公開日時ちょうどで含まれ、`/` が切り替わる', () => {
    const r = runBuild(project, { BUILD_TIME: '2099-01-01T10:00:00+09:00' });
    expect(r.code, r.output).toBe(0);
    expect(JSON.parse(readDist(project.dist, 'build-info.json')).issues).toEqual(['future', 'past-a', 'past-b']);
    expect(readDist(project.dist, 'index.html')).toContain('data-issue-id="future"');
  });

  it('公開済みの号が1つもなければ「準備中」を出す', () => {
    const r = runBuild(project, { BUILD_TIME: '1999-01-01T00:00:00+09:00' });
    expect(r.code, r.output).toBe(0);
    expect(readDist(project.dist, 'index.html')).toContain('公開中の号はまだありません');
    expect(listFiles(project.dist).filter((f) => f.startsWith('issues/'))).toEqual([]);
  });
});

describe('ビルドが失敗するケース', () => {
  const issuesDir = () => path.join(project.dir, 'src/content/issues');

  it('内容ファイルがスキーマに合わない', () => {
    const bad = path.join(issuesDir(), 'broken.json');
    writeFileSync(
      bad,
      JSON.stringify({
        id: 'broken',
        title: '<b>太字</b>',
        description: 'x',
        publishAt: '2000-03-01T10:00:00',
        blocks: [{ type: 'button', label: 'x', href: 'javascript:alert(1)' }],
      }),
    );
    try {
      const r = runBuild(project);
      expect(r.code).not.toBe(0);
      expect(r.output).toContain('HTMLのタグは書けません');
      expect(r.output).toContain('タイムゾーン付き');
      expect(r.output).toContain('リンク先は');
    } finally {
      rmSync(bad);
    }
  });

  it('ファイル名と号IDが一致しない', () => {
    const bad = path.join(issuesDir(), 'mismatch.json');
    writeFileSync(
      bad,
      JSON.stringify({
        id: 'other-id',
        title: 'x',
        description: 'x',
        publishAt: '2000-03-01T10:00:00+09:00',
        blocks: [{ type: 'heading', text: 'x' }],
      }),
    );
    try {
      const r = runBuild(project);
      expect(r.code).not.toBe(0);
      expect(r.output).toContain('一致していません');
    } finally {
      rmSync(bad);
    }
  });

  it('公開済みの号が参照している画像がない', async () => {
    const img = path.join(project.dir, 'media/past-b/past-b.jpg');
    rmSync(img);
    try {
      const r = runBuild(project);
      expect(r.code).not.toBe(0);
      expect(r.output).toContain('画像が見つかりません：media/past-b/past-b.jpg');
    } finally {
      await writeDummyImage(img);
    }
  });

  it('公開済みの号が参照している動画がない', () => {
    const video = path.join(project.dir, 'media/past-a/hero.mp4');
    rmSync(video);
    try {
      const r = runBuild(project);
      expect(r.code).not.toBe(0);
      expect(r.output).toContain('動画が見つかりません：media/past-a/hero.mp4');
    } finally {
      writeFileSync(video, 'dummy-video');
    }
  });
});
