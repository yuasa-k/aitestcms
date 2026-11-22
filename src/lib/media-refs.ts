// 内容ファイルのブロックから、参照している素材のファイル名を集める。
// Astro のビルド（integration）と、Node で直接動かすスクリプト（scripts/）の両方から使うため、
// 何も import せず、型注釈以外の TypeScript 固有の構文も使わない（Node の型除去で動かせるように）。

export interface MediaRefs {
  images: string[];
  videos: string[];
}

interface LooseBlock {
  type?: string;
  poster?: string;
  video?: string;
  src?: string;
  items?: { src?: string }[];
  background?: { kind?: string; src?: string; poster?: string };
  children?: LooseBlock[];
}

export function collectMediaRefs(blocks: readonly LooseBlock[] | undefined): MediaRefs {
  const images = new Set<string>();
  const videos = new Set<string>();

  const walk = (list: readonly LooseBlock[] | undefined) => {
    for (const b of list ?? []) {
      if (b.type === 'hero') {
        if (b.poster) images.add(b.poster);
        if (b.video) videos.add(b.video);
      }
      if (b.type === 'image' && b.src) images.add(b.src);
      if (b.type === 'carousel') b.items?.forEach((i) => i.src && images.add(i.src));
      if (b.type === 'section' && b.background) {
        if (b.background.kind === 'image' && b.background.src) images.add(b.background.src);
        if (b.background.kind === 'video') {
          if (b.background.src) videos.add(b.background.src);
          if (b.background.poster) images.add(b.background.poster);
        }
      }
      walk(b.children);
    }
  };

  walk(blocks);
  return { images: [...images].sort(), videos: [...videos].sort() };
}
