---
island: grove
title: ProteinLens
eyebrow: Grove · Project
summary: Spectral graph analysis of protein-protein interaction networks.
links:
  - { label: Repo, href: "https://github.com/rohand2290/proteinlens" }
order: 1
---
ProteinLens looks for structure in protein-protein interaction networks. Proteins that work together tend to form clusters in these graphs, and spectral methods can find groupings that aren't visible from the raw edges. I pulled interaction data from STRING DB, built a graph Laplacian with EJML, and used its eigenvectors to embed each protein before clustering. A cluster is only useful if it means something biologically, so I checked the results against known findings. Analysis runs as jobs on Spring workers in EKS, fed by a Kafka topic keyed by job ID. That key spreads the load across partitions while keeping each job's messages in order.

Stack: Spring Boot, Kafka, Neo4j, EJML, Docker, Kubernetes, AWS
