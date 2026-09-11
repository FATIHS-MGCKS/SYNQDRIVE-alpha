# EXP-021 KS MS 661 — UPPER_BOUND_V2 evidence freeze (2026-09-11)

**CURRENT_RUN_EVIDENCE_FROZEN = YES**

| Field | Value |
|-------|-------|
| Vehicle | KS MS 661 |
| vehicleId | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| tokenId | `187361` |
| RC session | `26a8554c-8476-4264-a58f-d739b48fb489` |
| calibration series | `9decba1f-54d8-4d3d-9a48-365019287f00` |
| settlement experiment | `exp-021-26a8554c-90566f4c` |
| production SHA | `51394e16184f46365994ca4b90cebb930f6e4dbc` |
| PHYSICAL_T0 | `2026-09-11T04:37:26.000Z` |
| PHYSICAL_END (RC PDI authority) | `2026-09-11T05:03:38.000Z` |
| PHYSICAL_DURATION | ~26.2 min |

## Phase summaries (frozen)

| Phase | Wall | Native buckets | max gap | P95 Δt | scientific status |
|-------|------|----------------|---------|--------|-------------------|
| 180s / 15m | sealed | 77 | ~39.0s | ~21.0s | DEGRADED_INSUFFICIENT_REQUESTS |
| 120s / 10m | sealed | 29 | ~32.59s | ~26.0s | DEGRADED_INSUFFICIENT_REQUESTS |
| 60s / 5m | wall reached, vehicle stopped | 0 | — | — | invalid/degraded |
| 30s CONTROL | entered, never sealed at freeze | 0 | — | — | invalid |

HF issued requests (phase summaries): 180≈4, 120≈3.

## Settlement FIXED_INTERVAL (frozen)

- expected/completed: **48 / 48**
- failed: **0**
- ZERO_RESULT probes: **24** (SP-60 + SP-30 ages)
- ages: +30 … +600 executed

## Gap → settlement join (frozen)

| Metric | Count |
|--------|------:|
| native gaps ≥10s | 44 |
| settlement-assessable | 4 |
| NOT_ASSESSABLE | 40 |
| native-absent interior buckets | 781 |
| exact recovered later | 0 |
| never seen by +600 (assessable windows) | 91 |
| not assessable / no probe overlap | 690 |

## Value maturation (successful 180/120 probes)

- late-added buckets: **0**
- value-revised buckets: **0**
- bucket identity stable from first successful +30 observation

## Attached evidence artifacts

- `EXP_021_KS_MS_661_GAP_LEDGER_180_2026-09-11.json`
- `EXP_021_KS_MS_661_GAP_LEDGER_120_2026-09-11.json`
- `EXP_021_KS_MS_661_GAP_SETTLEMENT_MATRIX_2026-09-11.json`
- `EXP_021_KS_MS_661_PHASE_SUMMARIES_2026-09-11.json`

## CONFIRMED

- 180 native max gap ~39s; 120 native max gap ~32.59s
- No early-EXP019-scale 80–170s gap in 180/120
- 48/48 FIXED_INTERVAL settlement observations executed
- Successful 180/120 probes: no late bucket additions; no value revisions
- 4 assessable gaps had no settlement recovery through +600
- 40/44 gaps NOT_ASSESSABLE under legacy A/B probe geometry
- Operator physically ended run before full 33-minute plan

## UNKNOWN

- Production-optimal cadence
- Whether 180/120 gap difference is cadence-causal
- 60/30 behavior under valid movement (not observed this run)
- Settlement behavior of the 40 unassessable gaps
- Whether absent one-second timestamps imply provider data loss

## CONTRADICTED (motivated hardening)

- Current A/B probe geometry is sufficient for gap science
- UPPER_BOUND_V2 guarantees intended HF request-slot execution without T0 poll reset
- Final phase terminalizes reliably under stale telemetry alone
