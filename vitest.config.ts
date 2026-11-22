import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'build',
          include: ['tests/build/**/*.test.ts'],
          // 実際に astro build を何度か実行するので長めにする
          testTimeout: 180_000,
          hookTimeout: 180_000,
          // ビルドは重いので1ファイルずつ順に動かす
          fileParallelism: false,
        },
      },
    ],
  },
});
