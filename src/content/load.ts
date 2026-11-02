import { marked } from 'marked';
import worldJson from '../../content/islands.json';
import siteJson from '../../content/site.json';
import { renderStack } from './stack';
import { parseMarkdownFile, shiftHeadings, sortItems } from './frontmatter';
import type { ContentItem, IslandSpec, SiteSpec, WorldSpec } from './types';

export type { ContentItem, IslandSpec, SiteSpec, WorldSpec } from './types';
export { isPlaceholder, resolveHref } from './frontmatter';

const rawFiles = import.meta.glob('../../content/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const world = worldJson as WorldSpec;
export const site = siteJson as SiteSpec;

const allItems: ContentItem[] = Object.entries(rawFiles).map(([path, raw]) => {
  const id = path.split('/').pop()!.replace(/\.md$/, '');
  const item = parseMarkdownFile(raw, id);
  if (!item.island) item.island = path.split('/').slice(-2, -1)[0];
  return item;
});

export const itemsByIsland = new Map<string, ContentItem[]>();
for (const island of world.islands) {
  itemsByIsland.set(island.id, sortItems(allItems.filter((i) => i.island === island.id)));
}

export function islandById(id: string): IslandSpec | undefined {
  return world.islands.find((i) => i.id === id);
}

export function findItem(islandId: string, itemId: string): ContentItem | undefined {
  return itemsByIsland.get(islandId)?.find((i) => i.id === itemId);
}

export function renderBody(item: ContentItem): string {
  return renderStack(shiftHeadings(marked.parse(item.body, { async: false }) as string, 1));
}
