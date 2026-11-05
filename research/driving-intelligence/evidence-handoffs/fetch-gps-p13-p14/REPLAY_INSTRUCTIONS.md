# Replay Instructions — Fetch GPS P13/P14

## Prerequisites

1. Sealed S4 container at path in `S4_FROZEN_REFERENCE.json` (already in monorepo).
2. **Tier-B Fetch payloads** — currently **missing**; see `EVIDENCE_GAPS.md`.
3. `P14_JOIN_SPEC.json` for methodology.
4. Owner-authorized DIMO credentials (not in git).

## Reproduce P14 aggregate statistics (not per-event without Tier B)

1. Execute **one** `cloudEvents` query exactly as `P14_JOIN_SPEC.fetch_query`.
2. Parse S4 POSITION rows for window `[18:40:00Z, 18:50:00Z)`.
3. Decode Fetch `data.pos` per join spec rules (preserve original JSON types in export).
4. For each event with GPS + `header.time`:
   - Compute `label = floor_utc_second(header.time + offset)` for each sensitivity offset.
   - Find S4 bucket key in `{label-2s .. label+2s}` first hit.
   - Haversine decoded Fetch vs S4 lat/lon (decimal degrees).
5. Aggregate mean/max and count within 75 m.

**Expected without Tier B:** You cannot verify the historical **1014 m** mean against original event identities — only re-run and compare class of result.

## Reproduce P13 boolean summary

1. `cloudEvents` limit **5**, same filter as `P13_EVENT_SCHEMA_AND_METADATA.json`.
2. Record presence flags only if Tier-B export forbidden; else persist full payloads.

## Answer checklist (downstream)

| Question | Where answered |
|----------|----------------|
| How were 30 events selected? | `P14_JOIN_SPEC.sampleSelection` — limit 30, filter, **late slice** |
| Original coordinates used? | **NOT_CAPTURED** — Tier B pending |
| Transformations? | `P14_JOIN_SPEC.fetch_position_decode` |
| S4 position assigned? | Bucket label neighbor match on **header.time** |
| Why that bucket? | First key in ±2s loop |
| Distance calculation? | Haversine R=6371008.8 m |
| Why ~1014 m mean? | **Aggregate from P14 report**; pairs not stored |
| Physical co-time evidence? | **Missing** — see P14.1 |
| Proven root cause? | **Methodological non-comparability** only |

## Full replay

Requires **Tier-B package** with persisted `cloudEvents` arrays + `P14_PAIRWISE` export generated at fetch time (new operation).
