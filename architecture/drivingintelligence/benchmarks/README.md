# Driving Intelligence — Benchmark Registry

Versioned, documentation-only catalog of **reference drives** and **reproducible benchmark packages** for EXP021 / LDI-10D / DI V0 research.

**Governance:** No raw video, full-route traces, or private mobility dumps in git — **hashes + paths + NOT_IN_REPO** markers only.

| Artifact | Role |
|----------|------|
| [BENCHMARK_REGISTRY.md](./BENCHMARK_REGISTRY.md) | Human-readable register + identity deduplication |
| [benchmark_manifest.v1.json](./benchmark_manifest.v1.json) | Machine-readable manifests |
| [PHYSICAL_DRIVE_INDEX.md](./PHYSICAL_DRIVE_INDEX.md) | Physical drive identity graph (no double-count) |
| [RESULTS_OVERVIEW.md](./RESULTS_OVERVIEW.md) | Measured outcomes (no invented accuracy) |
| [suites/](./suites/) | Suite specifications SPEED / STOP_GO / ROAD / ROUTING / GAP / CAUSALITY |

**Relation to master-review:** [`../master-review/REFERENCE_TRIP_REGISTRY.md`](../master-review/REFERENCE_TRIP_REGISTRY.md) (REF-*) maps to `BMK-*` IDs here. **Twelve REF rows ≠ twelve physical drives** — see [PHYSICAL_DRIVE_INDEX.md](./PHYSICAL_DRIVE_INDEX.md).

**Pin:** Documentation on branch `cursor/di-master-architecture-research-20261021`; code/data pin `origin/main` @ `0a16ffb5b0add0bec30fefc4e55a41973428677b` unless a benchmark row states otherwise.
