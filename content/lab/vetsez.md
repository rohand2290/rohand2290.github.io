---
island: lab
title: VetsEZ
eyebrow: The Lab · Industry
summary: Healthcare data work with FHIR and VistA.
links:
  - { label: Visit, href: "https://vetsez.com" }
order: 2
---
**Software Engineering Intern** · Sep 2025 – June 2026 · San Diego, CA

My work at VetsEZ sat between VistA and FHIR. Users had no programmatic way into VistA, so I built Spring and OData endpoints, secured with OAuth, to open it up. Once people relied on those endpoints, speed became the priority. I redesigned the PostgreSQL schemas and added a caching layer with Spring Data. On the operations side, manual releases were where things tended to break, which is why I automated Helm deployments to EKS through GitHub Actions. To keep services responsive under load, I added KEDA autoscaling and Prometheus monitoring, letting them scale up before requests started timing out.

Stack: Spring, Spring Data, OData, OAuth2, PostgreSQL, AWS EKS, Helm, KEDA, Prometheus
