# VDC — WOB L 7503 long-stand UNPLUG → parked REPLUG → wake-associated PLUG recovery (isolated PLUG canary)

**Evidence ID:** `VDC-EVID-PLUG-WEBHOOK-WOB-LONG-STAND-WAKE-GT-001`  
**Epistemic:** `PRODUCTION_OBSERVATION` (read-only forensics)  
**Vehicle:** WOB L 7503 — Volkswagen Tiguan — LTE_R1 — DIMO `tokenId=192922` — vehicle `19fedd4b-c4e8-4de8-a125-dab293326e7e`  
**Observation window:** `2026-09-23T07:41:20Z` → forensic closure UTC `2026-09-23`  
**Mode:** No runtime change; no provider mutation; no deploy; no canary teardown; no P2.5 T0 reset; PR #1697 untouched.

---

## Executive summary (what this GT proves — and what it does not)

This controlled experiment separates **parked device/provider silence** from **post-activation provider visibility** and **SynqDrive acquisition** once evidence exists.

| # | Proposition | Result |
|---|-------------|--------|
| 1 | After operator physical replug, WOB remained parked **6,982 s** with **no** fresh provider PLUG evidence | **PROVEN** |
| 2 | **21** successful snapshot polls in the parked window did **not** force fresh OBD PLUG evidence | **PROVEN** |
| 3 | After **vehicle activation** (canonical trip `start_time`), fresh OBD PLUG provider evidence appeared within **56 s** | **PROVEN** (association; **not** universal causation) |
| 4 | Once provider evidence existed, isolated temp PLUG **webhook** reached physical authority **first** and **APPLIED** the effective PLUG transition | **PROVEN** |
| 5 | Snapshot path arrived later and converged via **PROVENANCE_REFRESH** only | **PROVEN** |

**Forbidden causal claims (this single vehicle):**

- `IGNITION_CAUSED_PLUG_REFRESH` — **NO** (exact ignition timestamp **NOT_RETAINED_IN_POSTGRES**)
- `TRIP_START_UNIVERSALLY_CAUSES_PLUG_REFRESH` — **NO_NOT_PROVEN**
- Large operator→effective latencies (**~7046 s**) are **NOT** SynqDrive processing delay — they are dominated by **parked device/provider silence** (~6982 s) plus post-wake provider visibility (~56 s)

```
VEHICLE_ACTIVATION_WAKE_ASSOCIATED_WITH_FRESH_OBD_RECOVERY=YES
IGNITION_CAUSALITY_CLAIMED=NO
PARKED_REPLUG_RECOVERY_OCCURRED=NO
SNAPSHOT_POLL_SUCCESS_FORCED_FRESH_OBD=NO
```

---

## Authoritative operator ground truth

| Event | UTC (retained) | Notes |
|-------|----------------|--------|
| Physical OBD **UNPLUG** | `2026-09-23T07:41:20.000Z` | Operator GT |
| Physical OBD **REPLUG** | `2026-09-23T08:05:38.000Z` | Operator GT |
| Physical unplug duration | **1458 s** | Between unplug and replug |
| Pre-test standing | **47752 s** | `LONG_STAND_CLEAN` |
| Operator **drive start** (local) | `2026-09-23 12:02 CEST` | Minute resolution → **`2026-09-23T10:02:00.000Z`** trip anchor in Production |

---

## Live canary / provider posture (unchanged by this documentation)

| Control | Value |
|---------|--------|
| **WOB L 7503** temp PLUG | **enabled** — webhook `872d878e-ec0f-4a2a-a5ae-183e8ddc9c9f` — subscriber **192922** only |
| **WOB_PLUG_CANARY_ACTIVATED_AT** | `2026-09-21T15:21:48.565Z` |
| **KS MX 2024** temp PLUG | **enabled** — webhook `03213b1b-7335-4565-bd5c-6f158c671b60` — subscriber **187336** only |
| **Legacy global PLUG** | **disabled** (`7a0562d3-369a-45eb-b5ed-8d35258091dd`) |
| **Legacy UNPLUG** | **enabled** (`49438f51-3ca5-4808-81d5-3598336c53a3`) |

---

## UNPLUG leg

| Field | Value |
|-------|--------|
| Provider first UNPLUG observed | `2026-09-23T07:41:53.000Z` |
| **UNPLUG webhook received** | `2026-09-23T07:41:57.309Z` |
| **UNPLUG physical applied** | `2026-09-23T07:41:57.359Z` |
| **UNPLUG_TRANSITION_SOURCE** | `WEBHOOK` |
| **UNPLUG_EFFECTIVE_TRANSITION_COUNT** | `1` |

---

## Pre-unplug spurious PLUG event (provider timing vs operator physical truth)

| Field | Value |
|-------|--------|
| Temp PLUG provider observation | `2026-09-23T07:41:49.000Z` |
| Delta after operator physical unplug (`07:41:20Z`) | **29 s** |
| Inbox disposition | `IGNORED_BY_POLICY` |
| Physical transition | `PROVENANCE_REFRESH` — **effective state unchanged** |
| Interpretation | Provider event time can **lag** operator physical GT; validates separation of **operator physical truth**, **provider observation time**, and **effective physical authority** |

---

## Phase A — Parked replug (`08:05:38Z` → before `10:02:00Z`)

| Field | Value |
|-------|--------|
| **PARKED_PHASE_END_AT** | `2026-09-23T10:02:00.000Z` (earliest authoritative wake anchor: canonical trip `start_time`) |
| **PARKED_REPLUG_OBSERVATION_DURATION_MS** | `6982000` (= **6982 s** = **1h 56m 22s**) |

### Parked-phase evidence (strictly before `10:02:00Z`, after replug)

| Channel | Observed? |
|---------|-----------|
| Provider PLUG evidence | **NO** |
| PLUG webhook | **NO** |
| Snapshot OBD true (fresh) | **NO** |
| Physical PLUG transition | **NO** |

### Snapshot polling (parked continuation)

| Field | Value |
|-------|--------|
| Successful snapshot polls (replug → wake) | **21** |
| Polls with fresh OBD PLUG | **0** |
| Trip / wake in parked window | **NO** |

**Conclusion:** `PARKED_REPLUG_RECOVERY_OCCURRED=NO` · `SNAPSHOT_POLL_SUCCESS_FORCED_FRESH_OBD=NO`

---

## Phase B — Vehicle activation / wake-associated recovery (`≥ 10:02:00Z`)

Use **cautious** wording: activation/trip start is **associated** with fresh OBD recovery in this GT only.

| Field | Value |
|-------|--------|
| **FIRST_TRIP_START_AT** | `2026-09-23T10:02:00.000Z` |
| **FIRST_TOP_LEVEL_SOURCE_ADVANCE_AT** (OBD plug `source_timestamp` past unplug) | `2026-09-23T10:02:56.000Z` |
| **FIRST_POST_WAKE_PROVIDER_PLUG_EVIDENCE_AT** | `2026-09-23T10:02:56.000Z` |
| **FIRST_POSITION_ADVANCE_AT** | `2026-09-23T10:02:59.000Z` (waypoint lat/lon change) |
| **FIRST_SPEED_GT_ZERO_AT** | `2026-09-23T10:06:08.000Z` |
| **FIRST_IGNITION_TRUE_AT** | `NOT_RETAINED_IN_POSTGRES` |
| **WOB_POST_WAKE_PROVIDER_VISIBILITY_MS** | `56000` (trip start → first provider PLUG) |

Ordering note: provider PLUG (**10:02:56Z**) precedes first speed > 0 (**10:06:08Z**) — recovery in this GT is **wake/trip-start associated**, not **movement-dependent**.

---

## Webhook / snapshot ordering (post-wake)

| Field | Value |
|-------|--------|
| **PLUG webhook received** | `2026-09-23T10:03:03.790Z` (`PROCESSED`) |
| **PLUG webhook physical reconciliation** | `2026-09-23T10:03:03.936Z` (`APPLIED` UNPLUGGED→PLUGGED, v543) |
| **Snapshot fresh OBD=true** (`evidence_observed_at`) | `2026-09-23T10:06:06.000Z` |
| **Snapshot reconciliation** | `2026-09-23T10:06:12.499Z` (`PROVENANCE_REFRESH`) |
| **FIRST_CHANNEL_TO_RECONCILIATION** | `WEBHOOK` |
| **FIRST_EFFECTIVE_TRANSITION_CHANNEL** | `WEBHOOK` |
| **SECOND_CHANNEL** | `SNAPSHOT_OBD` |
| **SECOND_CHANNEL_DECISION** | `PROVENANCE_REFRESH` |
| **SECOND_CHANNEL_CHANGED_EFFECTIVE_STATE** | `NO` |
| **WEBHOOK_HTTP_TO_PHYSICAL_APPLY_MS** | `146` |
| **WEBHOOK_LEAD_OVER_SNAPSHOT_RECONCILIATION_MS** | `188563` |
| **REPLUG_EFFECTIVE_TRANSITION_COUNT** | `1` |
| **DUPLICATE_REPLUG_EFFECTIVE_TRANSITION_COUNT** | `0` |
| **ONE_REAL_EVENT_ONE_EFFECTIVE_TRANSITION** | `YES` |
| **LEGACY_EPISODE_RESOLVED_AT** | `2026-09-23T10:02:56.000Z` (`EXPLICIT_PLUG_WEBHOOK`; `resolution_evidence_at`) |

---

## Total latency decomposition (do not attribute to SynqDrive alone)

| Metric | ms | Interpretation |
|--------|-----|----------------|
| **OPERATOR_REPLUG_TO_VEHICLE_ACTIVATION_MS** | `6982000` | Parked silence / no fresh provider PLUG |
| **OPERATOR_REPLUG_TO_PROVIDER_EVIDENCE_MS** | `7038000` | Dominated by parked silence + 56 s post-wake visibility |
| **OPERATOR_REPLUG_TO_EFFECTIVE_TRANSITION_MS** | `7045936` | Same + ~146 ms SynqDrive webhook apply |
| **PARKED_DEVICE_PROVIDER_SILENCE** | **≈ 6982 s** | Lower bound while parked after replug |
| **POST_WAKE_PROVIDER_VISIBILITY** | **56 s** | Trip start → provider PLUG observation |
| **SYNQDRIVE_WEBHOOK_HTTP_TO_PHYSICAL** | **146 ms** | Ingress → physical `APPLIED` |

---

## KS MX 2024 vs WOB L 7503 (cross-vehicle parked replug)

| Vehicle | Parked fresh PLUG provider visibility | Wake/trip before detection? |
|---------|----------------------------------------|------------------------------|
| **KS MX 2024** (2026-09-22 GT) | **191000 ms** | **NO** (clean parked sleep) |
| **WOB L 7503** (this GT) | **NOT OBSERVED** for **≥ 6982000 ms** | **YES** — fresh OBD **56 s** after trip start |

```
CROSS_VEHICLE_PARKED_REPLUG_BEHAVIOR=HETEROGENEOUS
PHYSICAL_REPLUG_ALWAYS_PRODUCES_PROMPT_FRESH_LTE_R1_OBD=NO_NOT_PROVEN
WOB_REPLUG_REQUIRED_VEHICLE_WAKE_IN_THIS_GT=YES
```

| Architectural implication | Answer |
|----------------------------|--------|
| **PLUG_WEBHOOK_FAST_PATH_VALID_WHEN_PROVIDER_EVIDENCE_EXISTS** | **YES** |
| **PLUG_WEBHOOK_GUARANTEES_BOUNDED_PARKED_REPLUG_LATENCY** | **NO** |
| **SNAPSHOT_POLLING_GUARANTEES_PARKED_REPLUG_RECOVERY** | **NO** |
| **PARKED_REPLUG_RECOVERY_REMAINS_DEVICE_PROVIDER_VISIBILITY_BOUND** | **YES** |

---

## P2.5 shadow (controlled cycle — do not reclassify)

| Classification | Count (this GT window) |
|----------------|------------------------|
| **MATCH** | `1` |
| **EXPECTED_FIX** | `1` |
| **UNEXPLAINED** | `1` |

**UNEXPLAINED row:** `2026-09-23T07:43:50.386Z` · `SNAPSHOT_OBD` · same UNPLUG `evidenceObservedAt` `07:41:53Z` · **PROVENANCE_REFRESH** shape — documented **known PR #1697** post-bootstrap semantic gap. **Do not retroactively reclassify.**

| Integrity | Value |
|-----------|--------|
| **ACTUAL_STATE_REGRESSIONS** | `0` |
| **STALE_EVIDENCE_AUTHORITY_LEAK** | `0` |
| **OUT_OF_ORDER_AUTHORITY_LEAK** | `0` |
| **STATE_VERSION_REGRESSION** | `0` |

**P2.5 epoch:** `P25_T0=2026-09-18T09:33:25.000Z` (**unchanged**) · `T7=2026-09-25T09:33:25.000Z` — acquisition-channel segmentation for canary activations remains required for cutover review. **Current UNEXPLAINED remains formally blocking for cutover** (unchanged).

---

## Rollout status (documentation only)

| Field | Value |
|-------|--------|
| **WOB_LONG_STAND_GT** | `PARKED_RECOVERY_NOT_OBSERVED_WAKE_ASSOCIATED_RECOVERY_PROVEN` |
| **KS_MX_PARKED_GT** | `PARKED_RECOVERY_PROVEN` |
| **GLOBAL_PLUG_ROLLOUT** | `DEFERRED_TO_T7_REVIEW` |

Do **not** globally enable legacy PLUG from this evidence alone.

---

## VDC-DEC-010 review

**VDC_DEC_010_REMAINS_VALID=YES**

- PLUG webhook is an **optional low-latency acquisition fast-path** once **fresh provider/device evidence exists**.
- It is **NOT** a guarantee of fresh device evidence generation while parked.
- Fresh snapshot evidence remains an **independent recovery/reconciliation** path; **poll SUCCESS ≠ OBD freshness**.
- This GT **complements** KS MX parked GT: webhook fast-path proven in **both** parked (KS MX) and post-wake (WOB) **after** provider emission; WOB additionally proves **parked silence** can exceed **~1.9 h** on LTE_R1 despite successful polling.

---

## Related evidence

- [PLUG_WEBHOOK_KS_MX_PARKED_GT_2026-09-22.md](./PLUG_WEBHOOK_KS_MX_PARKED_GT_2026-09-22.md) (parked recovery without wake)
- [PLUG_WEBHOOK_RESTORATION_FORENSICS_2026-09-21.md](./PLUG_WEBHOOK_RESTORATION_FORENSICS_2026-09-21.md)

---

## Final documentation gate

```
VDC_WOB_WAKE_GT_DOCUMENTATION_GATE=PASS
EVIDENCE_FILE=architecture/vehicle-device-connectivity/evidence/PLUG_WEBHOOK_WOB_LONG_STAND_WAKE_GT_2026-09-23.md
KNOWN_PR1697_SHADOW_GAP_DOCUMENTED=YES
```
