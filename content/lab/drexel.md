---
island: lab
title: Drexel University
eyebrow: The Lab · Research
summary: Bioinformatics tooling for protein-interaction research.
links:
  - { label: Visit, href: "https://drexel.edu" }
order: 3
---
**Software Engineering Intern** · July 2025 – Sep 2025 · Philadelphia, PA

At Drexel I built software for a lab that studies how proteins interact. Exploring their own data meant writing SQL, which isn't what biologists should be spending their time on. I gave them a Next.js and PostgreSQL web app, hosted on a VPS, where they could browse it directly. Generating interaction graphs was slow. Because the data is a network, I moved it into Neo4j behind a FastAPI service instead of forcing it into tables, and graphs started coming back much faster. Part of the dataset couldn't be analyzed until it was cleaned up, so I turned it into Cytoscape-ready CSVs along with a Jupyter notebook the team could work from.

Stack: Next.js, PostgreSQL, FastAPI, Neo4j, Cytoscape, Jupyter
