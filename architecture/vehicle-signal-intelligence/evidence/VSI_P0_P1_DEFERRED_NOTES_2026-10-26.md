# VSI P0 — deferred P1 notes (document only)

| Field | Value |
|-------|-------|
| **Date** | 2026-10-26 |
| **PR** | #2174 |
| **Action** | Document for VSI Cadence V2 / consumer eligibility review — **not implemented in P0** |

## Stored quality and confidence tiers

`qualityClassification`, `confidenceLevel`, and bundle ledger metrics on the live profile row are computed at **semantic revision** time. Operational fetch-only refresh does not re-project them. Consumers must not treat these fields as current quality without **read-time re-evaluation** from `lastSourceTimestamp` and attribution context (as P4 `FRESH_AT_EVALUATION` already does).

## `declaredCatalogCheckedAt` and revisions

Advancing `declaredCatalogCheckedAt` (e.g. after DIMO preflight) is included in semantic identity and can create a new `profileRevision` even when per-signal `declaredSupport` is unchanged. This is bounded by existing capability preflight cadence (~7 days).

## `FRESHNESS_RULE` limitations

Limitation strings such as `FRESHNESS_RULE=classifyTelemetryFreshness;…` are emitted at **projection** time and may appear in semantic `limitations` arrays. They encode evaluation-clock context, not independent physical evidence.

## `contentFingerprint` semantics

`contentFingerprint` on `vehicle_signal_capability_profiles` is a **semantic hash** (see `fingerprintVsiProfileSemanticEvaluation`), not a byte-level hash of `signalsSnapshot` JSON.

## Live profile vs P5-H1 history

For the same `profileRevision`, the mutable live row may carry newer `evaluatedAt`, `lastMaterializedProviderFetchAt`, and per-signal `lastProviderFetchAt` than the immutable history row captured at the last semantic commit. As-of consumers must use **history rows**, not the live profile, for decision-time evidence.

## Operational CAS (P0 fix)

Concurrent operational-only writers use compare-and-swap on `profileRevision`, `updatedAt`, and `lastMaterializedProviderFetchAt` (including `null`) before applying monotonic fetch merge. See `buildOperationalProfileRefreshCasWhere`.
