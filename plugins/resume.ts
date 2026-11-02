// Generates /resume/index.html from the same content files the world uses,
// so the two views can never drift apart. The page needs no JavaScript.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { marked } from 'marked';
import type { Plugin } from 'vite';
import {
  isPlaceholder,
  parseMarkdownFile,
  resolveHref,
  shiftHeadings,
  sortItems,
} from '../src/content/frontmatter.ts';
import type { ContentItem, SiteSpec, WorldSpec } from '../src/content/types.ts';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function loadContent(root: string) {
  const contentDir = join(root, 'content');
  const world = JSON.parse(readFileSync(join(contentDir, 'islands.json'), 'utf8')) as WorldSpec;
  const site = JSON.parse(readFileSync(join(contentDir, 'site.json'), 'utf8')) as SiteSpec;
  const items: ContentItem[] = walk(contentDir)
    .filter((p) => p.endsWith('.md'))
    .map((p) => {
      const rel = relative(contentDir, p).split(sep);
      const item = parseMarkdownFile(readFileSync(p, 'utf8'), rel[rel.length - 1].replace(/\.md$/, ''));
      if (!item.island) item.island = rel[0];
      return item;
    });
  return { world, site, items };
}

function linkHtml(l: { label: string; href: string }): string {
  if (isPlaceholder(l.href)) return `<span class="ph">${esc(l.label)}: ${esc(l.href)}</span>`;
  return `<a href="${esc(resolveHref(l.href))}">${esc(l.label)}</a>`;
}

export function buildResumeHtml(root: string): string {
  const { world, site, items } = loadContent(root);
  const hasPdf = existsSync(join(root, 'public', 'resume.pdf'));

  // Group islands by resume section, keeping the order islands appear in islands.json.
  const sections = new Map<string, ContentItem[]>();
  for (const island of world.islands) {
    const list = sections.get(island.resumeSection) ?? [];
    list.push(...sortItems(items.filter((i) => i.island === island.id)));
    sections.set(island.resumeSection, list);
  }

  const body = [...sections.entries()]
    .map(
      ([title, list]) => `
    <section>
      <h2>${esc(title)}</h2>
      ${list
        .map(
          (item) => `
      <article id="${esc(item.island)}-${esc(item.id)}">
        <h3>${esc(item.title)}</h3>
        <p class="eyebrow">${esc(item.eyebrow)}</p>
        <p class="summary">${esc(item.summary)}</p>
        ${shiftHeadings(marked.parse(item.body, { async: false }) as string, 2)}
        ${item.links.length ? `<p class="links">${item.links.map(linkHtml).join(' · ')}</p>` : ''}
      </article>`,
        )
        .join('')}
    </section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(site.fullName)} · Resume</title>
<meta name="description" content="${esc(site.fullName)}: ${esc(site.tagline)}. Plain, printable resume.">
<meta name="theme-color" content="#f3ead8">
<style>
  :root { --paper:#f3ead8; --ink:#26221f; --muted:#5a4f46; --frame:#5a3f36; --plate:#2f2a26; --accent:#e4c88f; }
  * { box-sizing: border-box; }
  html { background: var(--paper); color: var(--ink); }
  body { margin: 0 auto; max-width: 46rem; padding: 2.5rem 1rem 4rem;
    font: 15px/1.55 "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  a { color: var(--frame); text-underline-offset: 2px; }
  a:focus-visible { outline: 3px solid var(--plate); outline-offset: 2px; }
  header { border-bottom: 3px solid var(--ink); padding-bottom: 1rem; margin-bottom: 1.5rem; }
  h1 { font-size: 2rem; line-height: 1.1; margin: 0 0 .25rem; letter-spacing: -0.01em; }
  .tagline { margin: 0; color: var(--muted); }
  .actions { margin-top: .9rem; display: flex; flex-wrap: wrap; gap: .5rem; }
  .actions a { display: inline-block; padding: .4rem .8rem; border: 2px solid var(--ink); color: var(--ink);
    text-decoration: none; background: #fff8ea; }
  .actions a.primary { background: var(--accent); }
  h2 { font-size: .8rem; letter-spacing: .12em; text-transform: uppercase; margin: 2rem 0 .75rem;
    padding-bottom: .3rem; border-bottom: 1px solid var(--muted); }
  article { margin-bottom: 1.4rem; break-inside: avoid; }
  h3 { font-size: 1.05rem; margin: 0; }
  h4 { font-size: .9rem; margin: .9rem 0 .2rem; }
  .eyebrow { margin: 0; font-size: .75rem; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .summary { margin: .3rem 0; }
  article p, article ul { margin: .35rem 0; }
  ul { padding-left: 1.2rem; }
  .links { font-size: .85rem; }
  .ph { color: var(--muted); }
  .notice { display: none; background: var(--plate); color: var(--paper); padding: .75rem 1rem; margin-bottom: 1.5rem; }
  #no-webgl:target { display: block; }
  @media print {
    html { background: #fff; }
    body { padding: 0; max-width: none; font-size: 11pt; }
    .actions, .notice { display: none !important; }
    a { color: inherit; }
    .links a[href^="http"]::after { content: " (" attr(href) ")"; }
  }
</style>
</head>
<body>
  <p class="notice" id="no-webgl" role="status">Your browser can't show the 3D world (WebGL is unavailable), so here's the plain version. Nothing is missing.</p>
  <header>
    <h1>${esc(site.fullName)}</h1>
    <p class="tagline">${esc(site.tagline)}</p>
    <nav class="actions" aria-label="Resume actions">
      ${hasPdf ? '<a class="primary" href="../resume.pdf" download>Download PDF</a>' : ''}
      <a href="../">Back to the islands</a>
    </nav>
  </header>
  <main>${body}
  </main>
</body>
</html>
`;
}

export function resumePlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'resume-page',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.watcher.add(join(root, 'content'));
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0].split('#')[0];
        if (url === '/resume' || url === '/resume/' || url === '/resume/index.html') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(buildResumeHtml(root));
          return;
        }
        next();
      });
    },
    transformIndexHtml(html) {
      const { site } = loadContent(root);
      return html
        .replaceAll('%SITE_NAME%', esc(site.name))
        .replaceAll('%SITE_FULL_NAME%', esc(site.fullName))
        .replaceAll('%SITE_TAGLINE%', esc(site.tagline))
        .replaceAll('%SITE_DESCRIPTION%', esc(site.description));
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'resume/index.html', source: buildResumeHtml(root) });
    },
  };
}
