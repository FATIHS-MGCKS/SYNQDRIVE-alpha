# DTC-02 — occurrenceCount semantics (documentation only)

This document records **read-only** semantics for `vehicle_dtc_events.occurrence_count`.
P1 does **not** migrate data or change API behavior.

## LEGACY (`DTC_01A_SAFETY_FOUNDATION_ENABLED` off)

- **Meaning:** poll **observation** count (each successful `upsertDtc` on an already-active code increments).
- **Increment condition:** `DtcService.upsertDtc` with default options (`episodeOccurrenceSemantics` false) during legacy poll or legacy webhook ingress.
- **Unchanged code on poll:** still increments (e.g. production P0675 **970 → 971** on first post-rollback legacy tick while code unchanged).
- **`lastSeenAt`:** updated on every legacy upsert.

## DTC-01A (`episodeOccurrenceSemantics: true`)

- **Meaning:** **episode** count — increments only when a **new active row** is created (first activation or re-activation after clear).
- **Re-seen active code:** updates `lastSeenAt` only when `upsertDtc` runs inside snapshot apply; **no** increment on `NOOP_ALREADY_APPLIED` / `REFRESH_SOURCE_WATERMARK`.
- **Historical rows:** may still reflect pre-01A legacy increments; UI notes this in `DtcService.getDetail`.

## DTC-02 implication

Adaptive / webhook-first designs must preserve 01A episode semantics when safety path is enabled.
Do not reinterpret legacy counts as episodes without an explicit migration program.
