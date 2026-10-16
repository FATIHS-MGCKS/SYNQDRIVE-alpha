# LDI03 — Next decision

1. Review `LDI03_EVENT_OVERLAP.json` — native rows are **not** ground truth.
2. If multi-stream overlap < 15%, prefer a different manifest trip or extend pin with owner-approved DB export only.
3. LDI-04: draft fusion policy using overlap verdicts without changing production harsh thresholds.

Large snapshot: full per-second grid stored in `LDI03_COMBINED_SNAPSHOT.json` (git). Re-export via npm script if hash drifts.