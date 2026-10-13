# EED Natural Charge Audit ledger (prospective)

**AUDIT_CUTOFF_UTC:** `2026-10-13T07:17:13Z`  
**Scope:** charging episodes **first detected at or after** cutoff on production (`1bc3a3a…`).  
**Rule:** one row per candidate **physical** episode; never sum kWh across overlapping incremental DIMO windows as independent sessions.

## Episode index

| Audit ID | Vehicle ID | First detection (UTC) | Outcome | GT |
|----------|------------|------------------------|---------|-----|
| _(no prospective episodes @ 2026-10-13T07:40Z read-only scan)_ | — | — | — | — |

## Daily operator procedure (manual — not a cron job)

1. **Cutoff guard:** only episodes with `hv_charge_sessions.created_at >= AUDIT_CUTOFF` **or** first post-cutoff `vehicle_energy_events` RECHARGE cluster for a new physical window (dedupe by `vehicle_id` + overlapping `start_time`/`end_time`).
2. **Bounded SQL** (read-only): new HV rows, new RECHARGE VEE rows, `updated_at` refreshes on legacy rows; paginate `LIMIT 50`.
3. **Per episode:** product `listCanonicalEnergyEvents` window including parent start (ops script `erd-tesla-natural-test1-product-read-verify.mjs` pattern); compare raw fragment count vs product count vs HV IDs; never treat telemetry-only agreement as PHYSICALLY_VERIFIED.
4. **Ledger:** append one template block per episode to this file in git; reference `AUDIT_ID` in EED-EV-0112 addendum if incident.
5. **Delayed DIMO:** re-run prior 24h window daily until provider quiesces; use `latest_detection_at` updates without duplicating `AUDIT_ID` when the same physical episode gains fragments.

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
