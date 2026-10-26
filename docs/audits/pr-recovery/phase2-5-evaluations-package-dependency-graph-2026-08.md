# Phase 2.5 — Evaluations Package Dependency Graph

```mermaid
flowchart LR
  E1["E1 Foundation & Contracts"]
  E2["E2 Money & Finance Correctness"]
  E3["E3 Analytics Backend"]
  E4["E4 Data Quality & Security"]
  E5["E5 Core UI"]
  E6["E6 Recommendations & Actions"]
  E7["E7 Predictive Backend"]
  E8["E8 Forecast UI & Final Acceptance"]
  E1 --> E2
  E1 --> E3
  E2 --> E3
  E1 --> E4
  E3 --> E4
  E1 --> E5
  E2 --> E5
  E3 --> E5
  E4 --> E5
  E3 --> E6
  E4 --> E6
  E5 --> E6
  E1 --> E7
  E3 --> E7
  E4 --> E7
  E5 --> E8
  E7 --> E8
```

All edges are hard ordering dependencies. The graph is acyclic. Packages are not developed as a PR stack; each successor starts only after its predecessors are merged to current main.
