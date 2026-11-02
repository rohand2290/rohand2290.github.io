// Tiny front-matter parser for the subset of YAML the content files use:
//   key: value
//   key: "quoted value"
//   links:
//     - { label: Repo, href: "[REPO URL]" }
// Shared by the browser bundle and the build-time /resume generator, so it has no dependencies.

import type { ContentLink, ContentItem } from './types.ts';

function unquote(v: string): string {
  const s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** Parses `{ a: b, c: "d, e" }` into an object, respecting quotes. */
function parseFlowMap(src: string): Record<string, string> {
  const body = src.trim().replace(/^\{/, '').replace(/\}$/, '');
  const out: Record<string, string> = {};
  const parts: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (const ch of body) {
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ',') {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  for (const p of parts) {
    const i = p.indexOf(':');
    if (i < 0) continue;
    out[p.slice(0, i).trim()] = unquote(p.slice(i + 1));
  }
  return out;
}

export function parseMarkdownFile(raw: string, id: string): ContentItem {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const meta: Record<string, string> = {};
  const links: ContentLink[] = [];
  let body = raw;
  if (m) {
    body = m[2];
    let inLinks = false;
    for (const line of m[1].split(/\r?\n/)) {
      if (!line.trim()) continue;
      const listItem = line.match(/^\s+-\s+(.*)$/);
      if (inLinks && listItem) {
        const map = parseFlowMap(listItem[1]);
        if (map.label && map.href !== undefined) links.push({ label: map.label, href: map.href });
        continue;
      }
      inLinks = false;
      const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (!kv) continue;
      if (kv[1] === 'links' && kv[2].trim() === '') {
        inLinks = true;
        continue;
      }
      meta[kv[1]] = unquote(kv[2]);
    }
  }
  return {
    id,
    island: meta.island ?? '',
    title: meta.title ?? '[TITLE]',
    eyebrow: meta.eyebrow ?? '',
    summary: meta.summary ?? '[ONE-LINE DESCRIPTION]',
    links,
    order: Number(meta.order ?? 99),
    body: body.trim(),
  };
}

/** A link whose href is still a `[PLACEHOLDER]` is shown, but not clickable. */
export function isPlaceholder(href: string): boolean {
  return /^\[.*\]$/.test(href.trim());
}

/** Turns `[EMAIL]`-style placeholders into mailto: once they become real addresses. */
export function resolveHref(href: string): string {
  if (/^[^\s/:@]+@[^\s/:@]+\.[^\s/:@]+$/.test(href)) return `mailto:${href}`;
  return href;
}

/** Shifts heading levels so Markdown `##` sits under the page's own headings. */
export function shiftHeadings(html: string, by: number): string {
  return html.replace(/<(\/?)h([1-6])(\s|>)/g, (_, slash, n, tail) => {
    const level = Math.min(6, Number(n) + by);
    return `<${slash}h${level}${tail}`;
  });
}

export function sortItems(items: ContentItem[]): ContentItem[] {
  return [...items].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}
