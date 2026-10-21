# Qualified Stop Contract V1 — KS FH 660E production controls

| Case | Date | Qualified stop duration | Expected |
|------|------|-------------------------|----------|
| Same trip (parking) | 2026-09-23 | 217 s (217_000 ms) | SAME_TRIP |
| Split (post-split Trip 2) | 2026-09-24 | 349.586 s (349_586 ms) | SPLIT |

Policy: `durationMs <= 300_000` → same trip; `durationMs > 300_000` → split (after physical qualification).

Regression: `trip-qualified-stop-duration.policy.spec.ts`, `trip-qualified-stop-duration.runtime.spec.ts`.

PR #1750 post-split short-trip finalize quality remains independent (quality gate only).
