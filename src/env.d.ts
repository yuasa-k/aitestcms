declare module 'virtual:issue-media' {
  import type { ImageMetadata } from 'astro';
  export const images: Record<string, () => Promise<{ default: ImageMetadata }>>;
}
