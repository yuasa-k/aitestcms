// 内容ファイル（src/content/issues/<号ID>.json）のスキーマ。
// 見た目はブロック部品とデザイントークンで固定するため、ここでは「何を載せるか」だけを受け付ける。
// HTML・CSS・任意のクラス名は書けない。
import { z } from 'astro/zod';

// ---- 共通の部品 ----

/** 号ID：英小文字・数字・ハイフン。ファイル名と一致させる */
export const issueIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: '号IDは英小文字・数字・ハイフンだけにしてください（例：2026-12）' });

/** 1行・複数行の文。HTMLのタグは書けない */
const plainText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, { error: `${label}が空です` })
    .max(max, { error: `${label}は${max}文字以内にしてください` })
    .refine((s) => !/<\/?[a-z!][^>]*>/i.test(s), { error: `${label}にHTMLのタグは書けません` });

/** media/<号ID>/ に置いた画像のファイル名 */
export const imageFileSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]*\.(?:jpg|jpeg|png|webp|avif)$/, {
    error: '画像はファイル名だけを書いてください（英小文字・数字・_・-、拡張子は jpg/jpeg/png/webp/avif）',
  });

/** media/<号ID>/ に置いた動画のファイル名 */
export const videoFileSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]*\.(?:mp4|webm)$/, {
    error: '動画はファイル名だけを書いてください（英小文字・数字・_・-、拡張子は mp4/webm）',
  });

/** リンク先：https:// か、サイト内の / 始まりのパスだけ */
export const hrefSchema = z
  .string()
  .trim()
  .refine((s) => /^https:\/\/[^\s]+$/.test(s) || /^\/(?!\/)[^\s]*$/.test(s), {
    error: 'リンク先は https:// で始まるURLか、/ で始まるサイト内のパスにしてください',
  });

/** 公開日時：タイムゾーン付きのISO 8601（例：2026-12-01T10:00:00+09:00） */
export const publishAtSchema = z
  .string()
  .pipe(
    z.iso.datetime({
      offset: true,
      error: '公開日時は 2026-12-01T10:00:00+09:00 の形（タイムゾーン付き）で書いてください',
    }),
  )
  .transform((s) => new Date(s));

// ---- ブロック ----

const headingBlock = z.strictObject({
  type: z.literal('heading'),
  text: plainText('見出し', 80),
  level: z.union([z.literal(2), z.literal(3)]).default(2),
});

const textBlock = z.strictObject({
  type: z.literal('text'),
  paragraphs: z.array(plainText('本文', 1000)).min(1, { error: '本文の段落が1つもありません' }),
});

const imageBlock = z.strictObject({
  type: z.literal('image'),
  src: imageFileSchema,
  alt: plainText('画像の代替テキスト（alt）', 200),
  caption: plainText('キャプション', 200).optional(),
  width: z.enum(['full', 'contained']).default('contained'),
});

const carouselItem = z.strictObject({
  src: imageFileSchema,
  alt: plainText('画像の代替テキスト（alt）', 200),
  caption: plainText('キャプション', 200).optional(),
});

const carouselBlock = z.strictObject({
  type: z.literal('carousel'),
  items: z
    .array(carouselItem)
    .min(2, { error: 'カルーセルには画像を2枚以上入れてください' })
    .max(12, { error: 'カルーセルの画像は12枚までにしてください' }),
});

const buttonBlock = z.strictObject({
  type: z.literal('button'),
  label: plainText('ボタンの文言', 40),
  href: hrefSchema,
  variant: z.enum(['primary', 'secondary']).default('primary'),
});

const heroBlock = z.strictObject({
  type: z.literal('hero'),
  video: videoFileSchema.optional(),
  poster: imageFileSchema,
  posterAlt: plainText('ヒーロー画像の代替テキスト（alt）', 200),
  title: plainText('ヒーローの見出し', 60),
  subtitle: plainText('ヒーローの小見出し', 120).optional(),
});

/** section・reveal の中に入れられるブロック（入れ子は1段まで） */
const sectionChild = z.discriminatedUnion('type', [headingBlock, textBlock, buttonBlock]);
const revealChild = z.discriminatedUnion('type', [headingBlock, textBlock, imageBlock, buttonBlock]);

const sectionBlock = z.strictObject({
  type: z.literal('section'),
  background: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('image'), src: imageFileSchema }),
    z.strictObject({ kind: z.literal('video'), src: videoFileSchema, poster: imageFileSchema }),
  ]),
  parallax: z.boolean().default(false),
  children: z.array(sectionChild).min(1, { error: '背景セクションの中身が空です' }),
});

const revealBlock = z.strictObject({
  type: z.literal('reveal'),
  effect: z.enum(['fade-up', 'fade-in', 'slide-left', 'slide-right']).default('fade-up'),
  children: z.array(revealChild).min(1, { error: 'アニメーション領域の中身が空です' }),
});

export const blockSchema = z.discriminatedUnion('type', [
  heroBlock,
  headingBlock,
  textBlock,
  imageBlock,
  carouselBlock,
  buttonBlock,
  sectionBlock,
  revealBlock,
]);

// ---- 号 ----

export const issueSchema = z.strictObject({
  id: issueIdSchema,
  title: plainText('タイトル', 80),
  description: plainText('説明文', 160),
  publishAt: publishAtSchema,
  blocks: z
    .array(blockSchema)
    .min(1, { error: 'ブロックが1つもありません' })
    .refine((blocks) => blocks.filter((b) => b.type === 'hero').length <= 1, {
      error: 'ヒーローは1号に1つまでです',
    })
    .refine((blocks) => !blocks.some((b, i) => b.type === 'hero' && i !== 0), {
      error: 'ヒーローは先頭のブロックにしてください',
    }),
});

export type IssueData = z.output<typeof issueSchema>;
export type Block = z.output<typeof blockSchema>;
export type BlockType = Block['type'];
