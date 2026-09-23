# VDC — KS MX 2024 parked UNPLUG→PLUG ground truth (isolated PLUG canary)

**Evidence ID:** `VDC-EVID-PLUG-WEBHOOK-KS-MX-PARKED-GT-001`  
**Epistemic:** `PRODUCTION_OBSERVATION` (read-only forensics)  
**Vehicle:** KS MX 2024 — Mercedes C63 — LTE_R1 — DIMO `tokenId=187336` — vehicle `a60c0749-a7cd-494e-b5b9-dea3c6b97d63`  
**Observation window:** `2026-09-22T17:45:00Z` → forensic closure UTC `2026-09-22`  
**Mode:** No provider mutation; no deploy; no canary teardown; no P2.5 T0 reset; PR #1697 untouched.

---

## Executive summary (two-layer attribution)

This experiment proves **separate** conclusions at two layers. They must not be collapsed into a single “webhook caused ~295× faster replug” claim.

| Layer | What changed vs previous KS MX parked GT | Causal claim allowed |
|-------|------------------------------------------|----------------------|
| **1 — Device / provider visibility** | Fresh OBD PLUG provider evidence (`obdIsPluggedIn=1`) appeared **~191 s** after operator physical replug. Previous controlled GT had **no** fresh PLUG evidence until **~15 h 52 m** (next vehicle wake / drive). | **DEVICE_PROVIDER_REPLUG_VISIBILITY_IMPROVED_VS_PREVIOUS_GT=YES** — conditions differ; **not** proven that webhook subscription caused DIMO to emit sooner. |
| **2 — SynqDrive acquisition** | With **same** provider signal timestamp (`18:27:15Z`), **webhook** reached physical reconciliation **first** and **APPLIED** `UNPLUGGED→PLUGGED`; snapshot arrived **~1.833 s** later as **PROVENANCE_REFRESH** only. HTTP ingress → physical apply **61 ms**. | **WEBHOOK_FAST_PATH_PROVEN=YES** for **physical authority ordering** while parked. **WEBHOOK_CAUSED_295X_IMPROVEMENT=NO_NOT_PROVEN**. |

```
CAUSAL_ATTRIBUTION_295X_TO_WEBHOOK_ALONE=NO
WEBHOOK_FAST_PATH_PROVEN=YES
DEVICE_PROVIDER_REPLUG_VISIBILITY_IMPROVED_VS_PREVIOUS_GT=YES
```

**Latency comparison (operator replug → first effective physical PLUG):**

| Experiment | Operator replug (UTC) | Physical PLUG applied (UTC) | Delay (s) |
|------------|----------------------|-----------------------------|-----------|
| Previous KS MX GT (2026-09-19) | `2026-09-19T17:45:00.000Z` | `2026-09-20T09:37:28.776Z` | **57148** (~15 h 52 m 28 s) |
| Current KS MX GT (2026-09-22) | `2026-09-22T18:24:04.000Z` | `2026-09-22T18:27:17.829Z` | **193.829** (~3 m 13.8 s) |

Ratio **57148 / 193.829 ≈ 295.1** reflects **dominant provider-visibility improvement** (fresh signal in minutes vs overnight), **not** SynqDrive webhook processing alone (~61 ms after HTTP).

---

## Authoritative operator ground truth

| Event | Operator time | UTC (retained) |
|-------|---------------|----------------|
| Physical OBD **UNPLUG** | 22.09.2026 20:01 CEST (minute resolution) | `2026-09-22T18:01:00Z` … `18:01:59Z` |
| Physical OBD **REPLUG** | 22.09.2026 20:24:04 CEST (second resolution) | `2026-09-22T18:24:04.000Z` |

---

## Live canary / provider posture (unchanged by this documentation)

| Control | Value |
|---------|--------|
| **WOB L 7503** temp PLUG | **enabled** — webhook `872d878e-ec0f-4a2a-a5ae-183e8ddc9c9f` — subscriber **192922** only |
| **WOB_PLUG_CANARY_ACTIVATED_AT** | `2026-09-21T15:21:48.565Z` |
| **KS MX 2024** temp PLUG | **enabled** — webhook `03213b1b-7335-4565-bd5c-6f158c671b60` — subscriber **187336** only |
| **KS_MX_PLUG_CANARY_ACTIVATED_AT** | `2026-09-22T09:11:02.437Z` |
| **Legacy global PLUG** | **disabled** (`7a0562d3-369a-45eb-b5ed-8d35258091dd`) |
| **Legacy UNPLUG** | **enabled** (`49438f51-3ca5-4808-81d5-3598336c53a3`) |

---

## UNPLUG leg

| Field | Value |
|-------|--------|
| **UNPLUG_TRANSITION_SOURCE** | `WEBHOOK` |
| **UNPLUG_PHYSICAL_APPLIED_AT** | `2026-09-22T18:02:03.897Z` |
| **UNPLUG_EFFECTIVE_TRANSITION_COUNT** | `1` |
| Provider first UNPLUG evidence | `2026-09-22T18:01:59Z` (inbox + domain event) |

---

## REPLUG leg — provider observation vs SynqDrive processing

### Provider / device visibility (Layer 1)

| Field | Value |
|-------|--------|
| **PROVIDER_OBD_EVIDENCE_OBSERVED_AT** | `2026-09-22T18:27:15.000Z` |
| **OPERATOR_TO_FIRST_PROVIDER_OBD_EVIDENCE_MS** | `191000` |

### Webhook path (Layer 2 — acquisition)

| Field | Value |
|-------|--------|
| **PLUG_WEBHOOK_PROVIDER_OBSERVED_AT** | `2026-09-22T18:27:15.000Z` (inbox `observed_at`; DIMO signal timestamp) |
| **PLUG_WEBHOOK_HTTP_RECEIVED_AT** | `2026-09-22T18:27:17.768Z` |
| **PLUG_INBOX_PERSISTED_AT** | `2026-09-22T18:27:17.773Z` (`created_at`) |
| **PLUG_WEBHOOK_PROCESSED_AT** | `2026-09-22T18:27:17.862Z` |
| **WEBHOOK_PHYSICAL_RECONCILIATION_ARRIVAL_AT** | `2026-09-22T18:27:17.829Z` (transition `919a7669-…`, **APPLIED**, v99→100) |
| **WEBHOOK_HTTP_TO_PHYSICAL_APPLY_MS** | `61` |
| **KS_MX_TEMP_PLUG_WEBHOOK_PROVEN_SOURCE** | **YES** — payload `webhookId=03213b1b-7335-4565-bd5c-6f158c671b60` |

### Snapshot path (Layer 2 — acquisition)

| Field | Value |
|-------|--------|
| **SNAPSHOT_OBD_EVIDENCE_OBSERVED_AT** | `2026-09-22T18:27:15.000Z` (provider signal; **not** poll start time) |
| **SNAPSHOT_POLL_STARTED_AT** | `2026-09-22T18:27:19.021Z` (poll `69c21171-…`) |
| **SNAPSHOT_PROVIDER_FETCHED_AT** (proxy) | `2026-09-22T18:27:19.613Z` (`device_connection_episode_resolution_audits.received_at` = snapshot `fetchedAt`) |
| **SNAPSHOT_JOB_COMPLETED_AT** | `2026-09-22T18:27:20.159Z` |
| **SNAPSHOT_PHYSICAL_RECONCILIATION_ARRIVAL_AT** | `2026-09-22T18:27:19.662Z` (transition `8fc6594e-…`, **PROVENANCE_REFRESH**, v100→101) |

### Physical authority winner

| Field | Value |
|-------|--------|
| **FIRST_CHANNEL_TO_RECONCILIATION** | `WEBHOOK` |
| **FIRST_EFFECTIVE_TRANSITION_CHANNEL** | `WEBHOOK` |
| **SECOND_CHANNEL** | `SNAPSHOT_OBD` |
| **SECOND_CHANNEL_DECISION** | `PROVENANCE_REFRESH` |
| **SECOND_CHANNEL_CHANGED_EFFECTIVE_STATE** | `NO` |
| **WEBHOOK_LEAD_OVER_SNAPSHOT_RECONCILIATION_MS** | `1833` (19.662 − 17.829) |
| **SNAPSHOT_PROVIDER_EVIDENCE_EARLIER_BUT_PROCESSING_LATER** | **YES** — shared provider timestamp `18:27:15` predates webhook HTTP by ~2.768 s, but snapshot **processing** began only after poll **18:27:19.021Z** |

**Scientific wording (dual-channel closure):**  
`B_SNAPSHOT_EVIDENCE_EXISTED_FIRST_BUT_WEBHOOK_REACHED_AUTHORITY_FIRST` — “evidence existed first” refers to **provider observation time** on the OBD signal, not SynqDrive snapshot ingest order.

### Semantic conclusions (required)

| Proposition | Value |
|-------------|--------|
| **WEBHOOK_FAST_PATH_PROVEN_WHILE_PARKED** | **YES** |
| **SNAPSHOT_RECONCILIATION_FALLBACK_PROVEN** | **YES** (same signal; confirmatory refresh; would have applied ~1.8 s later if webhook absent) |
| **WEBHOOK_AND_SNAPSHOT_CONVERGE_IDEMPOTENTLY** | **YES** |
| **WEBHOOK_REQUIRED_FOR_THIS_EFFECTIVE_TRANSITION** | **YES** (webhook reached physical authority first) |
| **SNAPSHOT_WOULD_HAVE_REACHED_RECONCILIATION_1833MS_LATER** | **YES** |
| **WEBHOOK_CAUSED_295X_IMPROVEMENT** | **NO_NOT_PROVEN** |

Do **not** state that enabling the isolated PLUG webhook **caused** the device/provider to emit OBD evidence. Only that, once emitted, webhook was the faster SynqDrive acquisition path to physical reconciliation.

---

## Park validity

| Field | Value |
|-------|--------|
| **PARKED_REPLUG_GT_VALIDITY** | `CLEAN_PARKED_SLEEP_GT` |
| **VEHICLE_WAKE_PRECEDED_REPLUG_DETECTION** | `NO` |
| **TRIP_START_PRECEDED_REPLUG_DETECTION** | `NO` |
| Trip FSM | `RESTING`; no `vehicle_trips` start in forensic window |

---

## Legacy episode vs physical authority (non-isomorphism)

| Field | Value |
|-------|--------|
| **LEGACY_EPISODE_RESOLVED_AT** | `2026-09-22T18:27:15.000Z` |
| **LEGACY_RESOLVED_AT_SEMANTIC** | `PROVIDER_OBSERVATION_TIMESTAMP_NOT_DB_PROCESSING_TIME` (code: `resolvedAt` = `providerObservedAt` in snapshot evaluator) |
| **LEGACY_RESOLUTION_DB_UPDATED_AT** | `2026-09-22T18:27:19.712Z` (`device_connection_episodes.updated_at`) |
| **LEGACY_RESOLUTION_TRIGGER_CHANNEL** | `SNAPSHOT` (`SNAPSHOT_PLUG_SIGNAL`; audit `received_at` `18:27:19.613Z`) |
| **Physical winner** | `WEBHOOK` (first **APPLIED** `UNPLUGGED→PLUGGED`) |

These propositions are **non-isomorphic** and both true: legacy episode closure used snapshot resolution semantics on provider time; physical effective state transitioned on webhook path first.

---

## P2.5 scientific continuity

| Field | Value |
|-------|--------|
| **P25_T0** | `2026-09-18T09:33:25.000Z` (**unchanged**) |
| **T7** | `2026-09-25T09:33:25.000Z` |
| **T7 segmentation** | Pre/post **WOB** and **KS MX** isolated PLUG canary activation must be analyzed separately; current epoch does **not** prove post-fix cutover readiness |

Shadow pilot (KS MX in scope): controlled-cycle shadow rows documented in forensics; **ACTUAL_STATE_REGRESSIONS=0** for this GT.

---

## Rollout status (documentation only)

| Field | Value |
|-------|--------|
| **KS_MX_PARKED_GT** | **PARKED_RECOVERY_PROVEN** |
| **WOB_LONG_STAND_GT** | **PARKED_RECOVERY_NOT_OBSERVED_WAKE_ASSOCIATED_RECOVERY_PROVEN** (see [PLUG_WEBHOOK_WOB_LONG_STAND_WAKE_GT_2026-09-23.md](./PLUG_WEBHOOK_WOB_LONG_STAND_WAKE_GT_2026-09-23.md)) |
| **GLOBAL_PLUG_ROLLOUT** | **DEFERRED_TO_T7_REVIEW** |

Do **not** authorize legacy global PLUG enable from this evidence alone.

---

## Integrity gates

| Gate | Result |
|------|--------|
| **ONE_REAL_EVENT_ONE_EFFECTIVE_TRANSITION** | **YES** |
| **ACTUAL_STATE_REGRESSIONS** | `0` |
| **STALE_EVIDENCE_AUTHORITY_LEAK** | `0` |
| **OUT_OF_ORDER_AUTHORITY_LEAK** | `0` |
| **STATE_VERSION_REGRESSION** | `0` |

---

## VDC-DEC-010 review

**VDC_DEC_010_REMAINS_VALID=YES**

- PLUG webhook remains an **optional fast-path** for physical acquisition; not mandatory for all recovery semantics.
- Snapshot OBD remains an **independent reconciliation / recovery** path.
- This GT **strengthens** dual-path vocabulary: webhook can win physical reconciliation while legacy episode resolution may still close on snapshot channel semantics.
- No change to DEC-010 decision text required.

---

## Related evidence

- Dual-channel ordering closure (same event): forensic turn `2026-09-22` (internal gate `VDC_KS_MX_DUAL_CHANNEL_ORDERING_CLOSURE=PASS`)
- [PLUG_WEBHOOK_RESTORATION_FORENSICS_2026-09-21.md](./PLUG_WEBHOOK_RESTORATION_FORENSICS_2026-09-21.md)
- [GT_R1_UNPLUG_EXECUTION_2026-09-12.md](./GT_R1_UNPLUG_EXECUTION_2026-09-12.md) (prior parked replug baseline)

---

## Final documentation gate

```
VDC_KS_MX_PLUG_GT_DOCUMENTATION_GATE=PASS
EVIDENCE_FILE=architecture/vehicle-device-connectivity/evidence/PLUG_WEBHOOK_KS_MX_PARKED_GT_2026-09-22.md
```
