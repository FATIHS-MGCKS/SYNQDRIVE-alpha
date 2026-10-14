# EED Natural Charge Audit ledger (prospective)

**AUDIT_CUTOFF_UTC:** `2026-10-13T07:17:13Z`  
**Scope:** charging episodes **first detected at or after** cutoff on production (`1bc3a3a…` activation; runtime SHA may advance).  
**Rule:** one row per candidate **physical** episode; never sum kWh across overlapping incremental DIMO windows as independent sessions.

## Episode index

| Audit ID | Vehicle ID | First detection (UTC) | Outcome | GT |
|----------|------------|------------------------|---------|-----|
| EED-NCA-20261013-001 | `68868291-5478-42cd-b0c4-cc77b2a78e21` | `2026-10-13T13:20:31Z` | `TELEMETRY_CONSISTENT_GT_MISSING` + `TRANSIENT_FALSE_SPLIT` | partial (plug ~15:06 Berlin, SOC ~83–85%; end pending) |

**Detail:** `EED-NCA-20261013-001-TESLA-NATURAL-CHARGE-AUDIT-2.md`

## EED-NCA-20261013-001 (settled record)

```
AUDIT_ID: EED-NCA-20261013-001
IDENTITY
  vehicle_id: 68868291-5478-42cd-b0c4-cc77b2a78e21
  organization_id: (fleet org — see production vehicle row)
  dimo_token_id: 186946
  source_provenance: DIMO native RECHARGE segments → VEE; Battery V2 HvChargeSession
  first_detection_at: 2026-10-13T13:20:31.405Z
  latest_detection_at: 2026-10-13T18:02:32.540Z

GROUND_TRUTH
  physical_start_end: plug ~15:06 Europe/Berlin (owner); telemetry 13:06:30Z–16:12:09Z
  plug_unplug: plug ~15:06 Berlin confirmed; unplug UNKNOWN
  station_app_evidence: UNKNOWN
  soc_before_after: owner ~83–85% start; final SOC UNKNOWN
  measured_kwh: UNKNOWN
  gt_confidence: PARTIAL_OWNER_REPORT
  gt_source: owner (SynqDrive operator)

TELEMETRY
  raw_dimo_recharge_segment_ids: dimo-recharge-186946-1791896790194 … 1791906450194 (11)
  raw_segment_count: 11
  native_vee_ids: (11 UUIDs — see evidence doc)
  interval_start_end: 2026-10-13T13:06:30.194Z / 2026-10-13T16:12:09.193Z
  parent_child_containment: post-18:02Z primary VEE spans episode; fragments 2–11 strictly contained
  signal_quality_notes: sliding-window incremental coalesceFromCount=1 each; primary VEE stretch at 18:02:32Z

PRODUCT_HV
  product_recharge_card_count: 11 (transient, pre-convergence offline) → 1 (post-convergence offline)
  hv_charge_session_ids: [795c7dcb-4f71-4105-9868-5830ebc67597]
  primary_dimo_anchor: dimo-recharge-186946-1791896790194
  suppressed_fragment_ids: (10 siblings — post-convergence offline projection)
  suppressed_fragment_count: 10 (post-convergence)
  ambiguous_fragments_retained: []
  separate_episodes_retained: []

AUDIT_OUTCOME: TELEMETRY_CONSISTENT_GT_MISSING
OBSERVATION: TRANSIENT_FALSE_SPLIT (ERD flag ON; collapse lag until primary VEE envelope matched HV span)
PRODUCT_API: NOT_VERIFIED (HTTP 401 without auth; offline projection only)
```

## Daily operator procedure (manual — not a cron job)

1. **Cutoff guard:** only episodes with `hv_charge_sessions.created_at >= AUDIT_CUTOFF` **or** first post-cutoff `vehicle_energy_events` RECHARGE cluster for a new physical window (dedupe by `vehicle_id` + overlapping `start_time`/`end_time`).
2. **Bounded SQL** (read-only): new HV rows, new RECHARGE VEE rows, `updated_at` refreshes on legacy rows; paginate `LIMIT 50`.
3. **Per episode:** authenticated product `GET …/energy-events` (or equivalent `listCanonicalEnergyEvents` read-only probe) with a window that includes the **parent episode start**, not an interior-only slice; compare raw fragment count vs product count vs HV IDs; never treat telemetry-only agreement as PHYSICALLY_VERIFIED.
4. **Ledger:** append one template block per episode to this file in git; reference `AUDIT_ID` in EED-EV-0112 addendum if incident.
5. **Delayed DIMO:** re-run prior 24h window daily until provider quiesces; update `latest_detection_at` on the same `AUDIT_ID` when the same physical episode gains fragments — do not open duplicate audit records for one physical episode.

## Template (copy per episode)

```
AUDIT_ID: EED-NCA-YYYYMMDD-###
IDENTITY
  vehicle_id:
  organization_id:
  dimo_token_id:
  source_provenance:
  first_detection_at:
  latest_detection_at:

GROUND_TRUTH
  physical_start_end: UNKNOWN | <ISO range>
  plug_unplug: UNKNOWN
  station_app_evidence: UNKNOWN
  soc_before_after: UNKNOWN
  measured_kwh: UNKNOWN
  gt_confidence: UNKNOWN
  gt_source:

TELEMETRY
  raw_dimo_recharge_segment_ids: []
  raw_segment_count:
  native_vee_ids: []
  interval_start_end:
  parent_child_containment:
  signal_quality_notes:

PRODUCT_HV
  product_recharge_card_count:
  hv_charge_session_ids: []
  primary_dimo_anchor:
  suppressed_fragment_ids: []
  suppressed_fragment_count:
  ambiguous_fragments_retained: []
  separate_episodes_retained: []

AUDIT_OUTCOME: INSUFFICIENT_EVIDENCE | TELEMETRY_CONSISTENT_GT_MISSING | ...
```

## Operator cadence

- T+5m / T+15m / T+60m: health, scheduler leader, EXP021 leases, product API error rate, fragment counter deltas
- T+24h: retrospective review of new episodes; populate table above
