# Evaluation: VW Tiguan video reference (2026-10-22)

Offline, reproducible comparison of **DS4 (S4 shadow L3)** and **DS4 Motion** against the tachometer video reference package.

| Artifact | Path |
| --- | --- |
| Reference (unchanged) | `reference/` |
| Frozen production snapshots | `snapshots/` |
| Rules (fixed before metrics) | `EVALUATION_RULES.md` |
| Architecture mapping | `ARCHITECTURE_MAPPING.md` |
| Human report (DE) | `REPORT.md` |
| 1 464-row comparison CSV | `outputs/comparison_primary.csv` |
| Metrics | `outputs/metrics_primary.json`, `outputs/metrics_sensitivity.json` |
| Events | `outputs/event_window_comparison.json` |
| Charts | `charts/` |
| Provenance | `PROVENANCE_MANIFEST.json` |

## Reproduce

```bash
./scripts/run_evaluation.sh
```

Requires only files under this directory (no production DB). First run creates `.venv/` from `requirements.txt`.

## Re-export snapshots (operators only)

Production read-only export was performed once for trip `98d2a8e0-8b7d-4529-bf76-acee44d61fbe`; steps are documented in `snapshots/EXPORT_NOTES.md`.
