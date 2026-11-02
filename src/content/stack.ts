import {
  siAngular,
  siApachekafka,
  siDocker,
  siGooglegemini,
  siHono,
  siKubernetes,
  siLangchain,
  siOpenjdk,
  siPydantic,
  siPython,
  siTypescript,
  siZod,
  siFastapi,
  siGithubactions,
  siHaskell,
  siHelm,
  siJupyter,
  siNeo4j,
  siNextdotjs,
  siPodman,
  siPostgresql,
  siPrometheus,
  siRabbitmq,
  siRedis,
  siSpring,
  siSpringboot,
  siZig,
  type SimpleIcon,
} from 'simple-icons';

/** Tools with a logo in Simple Icons. Anything not listed renders as a text-only chip. */
const ICONS: Record<string, SimpleIcon> = {
  angular: siAngular,
  docker: siDocker,
  gemini: siGooglegemini,
  hono: siHono,
  java: siOpenjdk,
  kafka: siApachekafka,
  kubernetes: siKubernetes,
  langchain: siLangchain,
  pydantic: siPydantic,
  python: siPython,
  typescript: siTypescript,
  zig: siZig,
  zod: siZod,
  fastapi: siFastapi,
  'github actions': siGithubactions,
  haskell: siHaskell,
  helm: siHelm,
  jupyter: siJupyter,
  neo4j: siNeo4j,
  'next.js': siNextdotjs,
  podman: siPodman,
  postgresql: siPostgresql,
  prometheus: siPrometheus,
  rabbitmq: siRabbitmq,
  redis: siRedis,
  spring: siSpring,
  'spring boot': siSpringboot,
  'spring data': siSpring,
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function chip(name: string): string {
  const icon = ICONS[name.toLowerCase()];
  const svg = icon
    ? `<svg class="stack-logo" viewBox="0 0 24 24" aria-hidden="true" fill="#${icon.hex}"><path d="${icon.path}"/></svg>`
    : '';
  return `<li class="stack-chip">${svg}<span>${escapeHtml(name)}</span></li>`;
}

/** Turns a rendered `<p>Stack: A, B, C</p>` paragraph into a row of logo chips. */
export function renderStack(html: string): string {
  return html.replace(/<p>Stack:\s*([^<]+)<\/p>/g, (_, list: string) => {
    const names = list
      .split(',')
      .map((s) => s.trim().replace(/&amp;/g, '&'))
      .filter(Boolean);
    return `<div class="stack"><h4 class="stack-label">Stack</h4><ul class="stack-list">${names.map(chip).join('')}</ul></div>`;
  });
}
