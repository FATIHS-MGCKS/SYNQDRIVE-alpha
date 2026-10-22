# DTC / Error Codes — current state

**Epistemic:** `CONFIRMED` for deployed SHA and migration ledger; `INFERRED` for pilot activation until owner enables flags.

## DTC-02 P1 (repository — not deployed)

- Observability-only PR: Prometheus `synqdrive_dtc02_*` metrics on existing DTC ingress (no cadence / semantics changes).
- Evidence: [`evidence/DTC02_P1_OBSERVABILITY.md`](evidence/DTC02_P1_OBSERVABILITY.md)
- occurrenceCount documentation: [`docs/dtc-02-occurrence-count-semantics.md`](../../docs/dtc-02-occurrence-count-semantics.md)

## DTC-02 P4 (repository — certification, deferral NOT enabled)

- Safety/fallback certification tests + source-trust reconciliation classifier; future deferral policy stub (default OFF).
- Evidence: [`evidence/DTC02_P4_SAFETY_CERTIFICATION.md`](evidence/DTC02_P4_SAFETY_CERTIFICATION.md)

## DTC-02 P3 (repository — default OFF, not deployed)

- Adaptive poll planner (pure) + shadow batch on existing `dtc-poll` fan-out; **no** enqueue/cadence/DIMO changes.
- Evidence: [`evidence/DTC02_P3_ADAPTIVE_SHADOW.md`](evidence/DTC02_P3_ADAPTIVE_SHADOW.md)

## DTC-02 P6 (repository — shadow wiring, default OFF)

- Trip FSM (`vehicle_trip_detection_state` + `vehicle_trips` interval) and VSI `diagnostic_trouble_code` freshness wired into adaptive shadow planner overlay; **no** enqueue, 3h scheduler, episode, or webhook changes.
- Evidence: [`evidence/DTC02_P6_VSI_TRIP_FSM_SHADOW.md`](evidence/DTC02_P6_VSI_TRIP_FSM_SHADOW.md)

## DTC-02 P2 (repository — default OFF, not deployed)

- Webhook capability classification + gated ingress (`DTC_02_*` env); reuses 01A snapshot apply and source-head watermarks.
- Evidence: [`evidence/DTC02_P2_WEBHOOK_CAPABILITY.md`](evidence/DTC02_P2_WEBHOOK_CAPABILITY.md)
- **No production activation** in this workstream; no live webhook reliability claim.

## DTC-02 P5A mixed-mode routing (repository — default OFF)

- Opt-in `DTC_01F_COHORT_MIXED_MODE_ENABLED`: pilot allowlist → `safety01a`; other ACTIVE → `legacy`; strict cohort unchanged when OFF.
- Evidence: [`evidence/DTC02_P5A_MIXED_MODE_ROUTING.md`](evidence/DTC02_P5A_MIXED_MODE_ROUTING.md)
- **No production activation** in this workstream.

## Runtime (Production @ `3a7cc0cc`)

| Control | State |
|---------|--------|
| `DTC_01A_SAFETY_FOUNDATION_ENABLED` | **Unset** on shared `.env` and replica processes → **OFF** |
| `DTC_01F_COHORT_GATE_ENABLED` | Not deployed (01F2 draft on PR #2042) |
| DTC poll path | **Legacy** `DimoDtcProcessor.pollVehicleDtcLegacy` (fan-out uses `evaluateDtcPollJobAdmission` when draft merges) |
| `vehicle_dtc_source_heads` rows | **0** (expected while flag OFF) |
| Outbox pending | **0** |

## Schema

Migrations applied on Production:

- `20261015180000_vehicle_dtc_source_head_01b`
- `20261015193000_vehicle_dtc_source_head_01c_partial`

Tables present: `vehicle_dtc_source_heads`, `vehicle_dtc_snapshot_outbox`.

## Fleet snapshot (2026-10-15)

- DIMO-linked vehicles: **6**; offboarded/archived with DIMO link: **2**
- Active DIMO `vehicle_data_source_links`: **4**
- Active DTC events: **1** (P0675 on vehicle `c10351f8-b6a2-4258-947f-631aeaa6d359`, `occurrenceCount` **966** — legacy poll semantics)

## Code anchors

- Snapshot apply: `backend/src/modules/vehicle-intelligence/dtc/snapshot/dtc-snapshot-apply.service.ts`
- Ingress: `dimo-dtc.processor.ts`, `dimo-webhook.controller.ts`
- Decision engine: `dtc-snapshot-decision.ts` (`needsEpisodeReconciliation`, channel watermarks, defer-clear vs refresh)
- Cohort / poll admission: `dtc-01f-cohort-gate.ts`

## Open questions

- Owner-selected pilot vehicle UUID(s) for first cohort allowlist.
- Whether branch protection requires `i18n-governance-authority-change` before merging 01F workflow-touching PRs.
