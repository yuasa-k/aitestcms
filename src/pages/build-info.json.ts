// /build-info.json：このビルドに含めた号の一覧。
// 定時実行（予約公開）で、本番に出ている号と「今出すべき号」を比べるのに使う。
import type { APIRoute } from 'astro';
import { getBuildMode } from '../lib/build-mode';
import { getBuildTime, getIncludedIssues } from '../lib/content';

export const GET: APIRoute = async () => {
  const issues = await getIncludedIssues();
  const body = {
    mode: getBuildMode(),
    builtAt: getBuildTime().toISOString(),
    issues: issues.map((i) => i.id).sort(),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
