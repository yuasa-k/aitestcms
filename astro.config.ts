import { defineConfig } from 'astro/config';
import issueMedia from './src/integrations/issue-media';

export default defineConfig({
  output: 'static',
  // /issues/<号ID>/ の形にそろえる
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [issueMedia()],
});
