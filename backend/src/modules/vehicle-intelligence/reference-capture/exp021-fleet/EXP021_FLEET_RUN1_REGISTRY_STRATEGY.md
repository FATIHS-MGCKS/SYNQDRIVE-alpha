# EXP-021 Run 1 registry strategy (PR-C)

**Strategy:** `EXPLICIT_FUTURE_IMPORT`

Run 1 (KS MX 2024 physical 90→60, frozen evidence PR #1645 / #1659) predates the
relational fleet study registry introduced in PR-C.

- `RUN1_AUTOMATICALLY_BACKFILLED=NO`
- Run 1 remains repository/VPS forensic evidence outside `exp021_study_runs`.
- Schema supports future human-authorized import; PR-C performs no backfill or synthesis.
