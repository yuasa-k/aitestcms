import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { issueSchema } from '../../src/lib/schema';

const ISSUES_DIR = path.resolve(import.meta.dirname, '../../src/content/issues');

/** 最小限の正しい号 */
function validIssue(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-issue',
    title: 'テスト',
    description: '説明',
    publishAt: '2026-12-01T10:00:00+09:00',
    blocks: [{ type: 'heading', text: '見出し' }],
    ...overrides,
  };
}

/** エラーメッセージを1つの文字列にまとめる */
function errorsOf(data: unknown): string {
  const r = issueSchema.safeParse(data);
  return r.success ? '' : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
}

describe('実際の内容ファイル', () => {
  const files = readdirSync(ISSUES_DIR).filter((f) => f.endsWith('.json'));

  it('1つ以上ある', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s がスキーマに合っている', (f) => {
    const data = JSON.parse(readFileSync(path.join(ISSUES_DIR, f), 'utf8'));
    expect(errorsOf(data)).toBe('');
    expect(data.id).toBe(f.replace(/\.json$/, ''));
  });
});

describe('スキーマ：受け付けるもの', () => {
  it('最小限の号', () => {
    expect(errorsOf(validIssue())).toBe('');
  });

  it('公開日時を Date に変換する（タイムゾーンを考慮）', () => {
    const r = issueSchema.parse(validIssue({ publishAt: '2026-12-01T10:00:00+09:00' }));
    expect(r.publishAt.toISOString()).toBe('2026-12-01T01:00:00.000Z');
  });

  it('既定値を補う（見出しのレベル、画像の幅、ボタンの種類）', () => {
    const r = issueSchema.parse(
      validIssue({
        blocks: [
          { type: 'heading', text: 'a' },
          { type: 'image', src: 'a.jpg', alt: 'a' },
          { type: 'button', label: 'a', href: '/' },
        ],
      }),
    );
    expect(r.blocks).toMatchObject([{ level: 2 }, { width: 'contained' }, { variant: 'primary' }]);
  });

  it('8種類のブロックをすべて使える', () => {
    const blocks = [
      { type: 'hero', poster: 'p.jpg', posterAlt: 'p', title: 't', video: 'v.mp4' },
      { type: 'heading', text: 'h', level: 3 },
      { type: 'text', paragraphs: ['p'] },
      { type: 'image', src: 'i.webp', alt: 'i', width: 'full' },
      { type: 'carousel', items: [{ src: 'a.jpg', alt: 'a' }, { src: 'b.png', alt: 'b' }] },
      { type: 'button', label: 'b', href: 'https://example.com/', variant: 'secondary' },
      {
        type: 'section',
        background: { kind: 'video', src: 'bg.webm', poster: 'bg.jpg' },
        parallax: true,
        children: [{ type: 'heading', text: 'x' }],
      },
      { type: 'reveal', effect: 'slide-right', children: [{ type: 'image', src: 'r.jpg', alt: 'r' }] },
    ];
    expect(errorsOf(validIssue({ blocks }))).toBe('');
  });
});

describe('スキーマ：拒否するもの', () => {
  const cases: [string, unknown, RegExp][] = [
    ['号IDに大文字', validIssue({ id: 'Test' }), /号IDは英小文字/],
    ['タイトルにHTMLのタグ', validIssue({ title: '<b>太字</b>' }), /HTMLのタグは書けません/],
    ['本文にHTMLのタグ', validIssue({ blocks: [{ type: 'text', paragraphs: ['<script>x</script>'] }] }), /HTMLのタグ/],
    ['タイムゾーンなしの公開日時', validIssue({ publishAt: '2026-12-01T10:00:00' }), /タイムゾーン付き/],
    ['日付だけの公開日時', validIssue({ publishAt: '2026-12-01' }), /タイムゾーン付き/],
    ['未知のブロック', validIssue({ blocks: [{ type: 'html', html: '<p>x</p>' }] }), /.+/],
    ['未知の項目（className など）', validIssue({ blocks: [{ type: 'heading', text: 'a', className: 'red' }] }), /.+/],
    ['号の未知の項目（style など）', validIssue({ style: 'color:red' }), /.+/],
    ['javascript: のリンク', validIssue({ blocks: [{ type: 'button', label: 'a', href: 'javascript:alert(1)' }] }), /リンク先は/],
    ['http: のリンク', validIssue({ blocks: [{ type: 'button', label: 'a', href: 'http://example.com/' }] }), /リンク先は/],
    ['// 始まりのリンク', validIssue({ blocks: [{ type: 'button', label: 'a', href: '//evil.example/' }] }), /リンク先は/],
    ['画像のパス指定（../）', validIssue({ blocks: [{ type: 'image', src: '../2026-10/a.jpg', alt: 'a' }] }), /ファイル名だけ/],
    ['画像の拡張子が違う', validIssue({ blocks: [{ type: 'image', src: 'a.gif', alt: 'a' }] }), /ファイル名だけ/],
    ['画像のaltがない', validIssue({ blocks: [{ type: 'image', src: 'a.jpg' }] }), /alt/],
    ['画像のaltが空', validIssue({ blocks: [{ type: 'image', src: 'a.jpg', alt: '  ' }] }), /空です/],
    ['カルーセルが1枚', validIssue({ blocks: [{ type: 'carousel', items: [{ src: 'a.jpg', alt: 'a' }] }] }), /2枚以上/],
    ['ブロックが空', validIssue({ blocks: [] }), /ブロックが1つもありません/],
    [
      'ヒーローが先頭にない',
      validIssue({
        blocks: [
          { type: 'heading', text: 'a' },
          { type: 'hero', poster: 'p.jpg', posterAlt: 'p', title: 't' },
        ],
      }),
      /先頭/,
    ],
    [
      'セクションの中にセクション（入れ子は1段まで）',
      validIssue({
        blocks: [
          {
            type: 'section',
            background: { kind: 'image', src: 'a.jpg' },
            children: [{ type: 'section', background: { kind: 'image', src: 'b.jpg' }, children: [] }],
          },
        ],
      }),
      /.+/,
    ],
    [
      '背景動画にポスター画像がない',
      validIssue({
        blocks: [{ type: 'section', background: { kind: 'video', src: 'a.mp4' }, children: [{ type: 'heading', text: 'a' }] }],
      }),
      /.+/,
    ],
  ];

  it.each(cases)('%s', (_label, data, message) => {
    expect(errorsOf(data)).toMatch(message);
  });
});
