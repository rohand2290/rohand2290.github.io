---
island: arcade
title: Spectrolith
eyebrow: Arcade · Systems
summary: A disk-backed dynamic graph store in Zig, built for spectral analysis on consistent snapshots.
links:
  - { label: Repo, href: "https://github.com/rohand2290/spectrolith" }
order: 3
---
Spectral methods like the Fiedler vector need to see the whole graph at once, but a graph that keeps taking new edges never holds still. Spectrolith is my attempt to support both in one storage engine. The design follows LSMGraph: writes land in an LSM tree for throughput, and each level stores its edges in CSR format so that reads stay local. Every batch is appended to a checksummed write-ahead log before it becomes visible, which means an acknowledged write survives a crash. To prove that, a crash test forks a writer, kills it with `SIGKILL` at a random moment, and checks that every acknowledged batch came back whole. Readers work from point-in-time snapshots, so a long computation sees one fixed version of the graph while writes carry on. The log, write batches, the in-memory graph, snapshots, and flushing to immutable on-disk segments are done. Compaction, the spectral engine, and benchmarks against RocksDB are next.

Stack: Zig, POSIX
