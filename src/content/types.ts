export interface ContentLink {
  label: string;
  href: string;
}

export interface ContentItem {
  /** File name without extension, used in URLs: #grove/proteinlens */
  id: string;
  island: string;
  title: string;
  eyebrow: string;
  summary: string;
  links: ContentLink[];
  order: number;
  /** Markdown body for the Read note panel and /resume. */
  body: string;
}

export interface PropSpec {
  type: string;
  /** Local [x, z] on the island's top, in voxels from its center. */
  at: [number, number];
  [key: string]: unknown;
}

export interface IslandSpec {
  id: string;
  name: string;
  resumeSection: string;
  /** World [x, y, z] of the island's top center. */
  position: [number, number, number];
  footprint: number;
  /** Label anchor offset from the top center. */
  label: [number, number, number];
  props: PropSpec[];
}

export interface BridgeSpec {
  from: string;
  to: string;
  weight: 1 | 2 | 3;
}

export interface WorldSpec {
  islands: IslandSpec[];
  bridges: BridgeSpec[];
  /** Where the character starts: an island and a local [x, z] offset from its center. */
  spawn?: { island: string; at: [number, number] };
}

export interface SiteSpec {
  name: string;
  fullName: string;
  tagline: string;
  description: string;
}
