---
island: lab
title: Roche
eyebrow: The Lab · Industry
summary: Backend infrastructure for DNA sequencing pipelines.
links:
  - { label: Visit, href: "https://sequencing.roche.com" }
order: 1
---
**Software Engineering Intern** · June 2026 – Sep 2026 · Santa Clara, CA

I spent the summer on the backend behind Roche's DNA sequencing pipelines. A database cleanup the team did by hand every day was the clearest waste of engineering time, so I started there and turned it into a Spring Boot and Angular tool. Deployments came next. They relied on kubectl scripts, which I replaced with Helm charts run through GitHub Actions so that every cluster gets the same release the same way. Some scheduled jobs held database connections open for their whole run. Putting a Redis and RabbitMQ worker queue in front of the database fixed that: a job takes a connection, does its work, and releases it. I also packaged the frontend and backend into a single Podman pod, which left the team with one deployment to manage instead of two.

Stack: Spring Boot, Angular, Redis, RabbitMQ, Helm, GitHub Actions, Podman
