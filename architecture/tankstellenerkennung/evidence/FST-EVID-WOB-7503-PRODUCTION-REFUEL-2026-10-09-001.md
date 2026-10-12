# FST-EVID-WOB-7503-PRODUCTION-REFUEL-2026-10-09-001

**Type:** PRODUCTION_OBSERVATION  
**Date:** 2026-10-10 (evidence recorded)  
**Related EED:** **EED-EV-0110** (PR #1964 product time UX)  
**Production SHA:** `7f47c9f5b5e35c425deb3c2b6bdaed9df73e5c7c`

## Summary

First **natural** WOB L 7503 post-cutover REFUEL with **MATCHED** fuel-station enrichment on the canonical product row, observed on **2026-10-09** (Europe/Berlin). Confirms Phase E/F read path can surface a trusted-enough station label for a real refuel when resolver returns **MEDIUM** confidence.

## Upstream REFUEL (out of Tankstellenerkennung domain)

| Field | Value |
|-------|-------|
| Vehicle | WOB L 7503 (`19fedd4b-c4e8-4de8-a125-dab293326e7e`) |
| Canonical energy event | `412f17f7-7380-4dd0-8e24-6939be4809d6` |
| Sibling row (suppressed in product read) | `5ba5a03c-8713-47c2-9373-a744e1bce30e` |
| Reconciliation | `SAME_PHYSICAL_REFUEL` / **FINAL_CANONICAL** |

## Enrichment (read-only Production Postgres)

| Field | Canonical row | Sibling row |
|-------|---------------|-------------|
| `station_name` | WK Tank | WK Tank |
| `address` | Eisenschmiede, 34127 Kassel | Eisenschmiede, 34127 Kassel |
| `match_confidence` | MEDIUM | MEDIUM |
| `resolution_status` | MATCHED | MATCHED |

## UI attestation

Operator authenticated screenshot (external): station **WK Tank, Eisenschmiede, Kassel** visible on trips timeline card — aligns with persisted enrichment.

## Ground truth limits

- **No** independent pump receipt archived in Tankstellenerkennung authority.
- OSM **MATCHED MEDIUM** ≠ legal or metrological proof of purchase location.

## Non-effects

- Does not close G2.2 fleet-wide positive-path statistics (single vehicle / single event).
- Does not change resolver constants or enrichment cutover.
