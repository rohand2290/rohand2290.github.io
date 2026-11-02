---
island: grove
title: SchemaLoom
eyebrow: Grove · Project
summary: Turns research and Wikipedia articles into DAG schemas with an LLM pipeline.
links:
  - { label: Repo, href: "https://github.com/schemaloom" }
order: 3
---
SchemaLoom reads a research paper or Wikipedia article and turns it into a DAG schema. Gemini, orchestrated through LangChain, does the extraction. Model output isn't guaranteed to be well-formed, so each schema has to pass Zod validation before it's accepted. Releases go out as Docker images built in GitHub Actions, which gives every environment an identical build. In CI, Jest tests exercise the API endpoints, catching failures before they ship.

Stack: TypeScript, Hono, Zod, LangChain, Gemini, Docker
