# Battery V2 — Timestamp Semantics (Bootstrap)

**Epistemic status:** PARTIAL

## Confirmed

| Timestamp | Authority | Usage |
|-----------|-----------|-------|
| `trip.endTime` | Authoritative trip finalization | LV REST anchor when known |
| Observation `observedAt` / `source_timestamp` | Per-signal observation time | REST window evidence eligibility |
| Target `scheduledFor` | Derived from anchor + delay (60m / 6h) | Metadata scheduling |

## Provenance rules (from architecture memos, partially code-verified)

- Rest-window anchor authority = `trip.endTime`, **not** `receivedAt` / `provider_fetched_at`
- Promotion uses observations where `source_timestamp >= anchor`; frozen pre-anchor observation → CANDIDATE without promotion

## Unknown / needs reconstruction

- Full fallback chain in LV live voltage ingestion when multiple timestamps disagree
- Cross-signal age mixing policies beyond REST opening gate
- HV signal timestamp canonicalization

**Gap:** `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` (not yet added to graph — listed in OPEN_QUESTIONS)
