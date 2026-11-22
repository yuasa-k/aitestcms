import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { issueSchema } from './lib/schema';

const issues = defineCollection({
  loader: glob({
    pattern: '*.json',
    base: './src/content/issues',
    // ファイル名（拡張子なし）をそのまま号IDとして扱う。中の "id" との一致は lib/content.ts で検査する
    generateId: ({ entry }) => entry.replace(/\.json$/, ''),
  }),
  schema: issueSchema,
});

export const collections = { issues };
