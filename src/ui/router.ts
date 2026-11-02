// Hash routes:
//   #grove              the Grove note is open
//   #grove/proteinlens  the ProteinLens write-up is open (Read note); Back closes it

export interface Route {
  island: string | null;
  item: string | null;
}

export function parseHash(hash = location.hash): Route {
  const [island, item] = hash.replace(/^#\/?/, '').split('/').map((s) => decodeURIComponent(s || ''));
  return { island: island || null, item: item || null };
}

const base = () => location.pathname + location.search;

export function replaceRoute(island: string | null, item: string | null = null) {
  const hash = island ? `#${island}${item ? `/${item}` : ''}` : '';
  if (location.hash === hash || (!hash && !location.hash)) return;
  history.replaceState(history.state, '', base() + hash);
}

export function pushRoute(island: string, item: string) {
  history.pushState({ panel: true }, '', `${base()}#${island}/${item}`);
}
