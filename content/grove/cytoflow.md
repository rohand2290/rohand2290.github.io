---
island: grove
title: CytoFlow
eyebrow: Grove · Project
summary: Automated Cytoscape data pipeline for network figures.
links:
  - { label: Repo, href: "https://github.com/rohand2290/cytoscape-data-pipeline" }
order: 4
---
Turning Cytoscape networks into finished SVG figures was slow, manual work. CytoFlow automates it: py4cytoscape drives Cytoscape, and a FastAPI service wraps the whole process. Labeling mistakes in a figure are easy to miss by eye, which is why every commit has to pass Git hooks and a pytest suite that inspect the SVGs first. I packaged the service in Docker and validated incoming requests with Pydantic, so one server can handle several requests at once without bad input getting through.

Stack: FastAPI, Python, Java, py4cytoscape, Pydantic, Docker
