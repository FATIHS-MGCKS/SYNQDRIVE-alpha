# KS MS 661 — Natural drive audit addendum (R9 start wake + blocked end)

> **Partial supersession:** Late-phase **`vls_row_absent`** claims in related docs are **incorrect** for this Production drive. Authoritative correction: [KS_MS_661_STOP_BOUNDARY_AUDIT_CORRECTION_2026-09-09.md](KS_MS_661_STOP_BOUNDARY_AUDIT_CORRECTION_2026-09-09.md) (TDL-EVID-KS-MS-661-002). Observations below remain valid unless marked **SUPERSEDED**.

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-KS-MS-661-001 |
| **Source type** | PRODUCTION_OBSERVATION + CODE |
| **Historical deployed SHA** | `68495041974135f7c6565fd5b836b3e2f9176fae` @ `20260908172927_v4994` |
| **First audit observedAt (UTC)** | `2026-09-08T20:41:28Z` |
| **Addendum observedAt (UTC)** | `2026-09-08T20:53:16Z` |
| **Vehicle** | KS MS 661 — plate reference; `vehicleId` `c10351f8-b6a2-4258-947f-631aeaa6d359`; DIMO `tokenId` **187361** (R9 cohort); hardware **LTE_R1** / ICE (profile **ICE** in FSM evidence) |
| **Trip ID** | `e324ee8c-8e17-4cfc-ac16-294dacef5d01` |
| **Operator ground truth (Europe/Berlin, ≈)** | Start ~21:36 / **19:36 UTC** · motor/ignition off 21:53:22 / **19:53:22 UTC** · resume 21:55:38 / **19:55:38 UTC** (pause **2m16s**) · end 21:59:22 / **19:59:22 UTC** |
| **Epistemic split** | See §Windows and §Classification |

## Windows (mandatory separation)

| Window | UTC bounds | Role |
|--------|------------|------|
| **A — Main** | `[2026-09-08T19:25:00Z, 2026-09-08T20:35:00Z)` | Primary historical reconstruction |
| **B — First-audit follow-up** | `[2026-09-08T20:35:00Z, 2026-09-08T20:41:28Z]` | Tail evaluated in first verbal audit |
| **C — Addendum follow-up** | observed `2026-09-08T20:53:16Z` | Current read-only re-check; **not** historical state |

## Classification

| Claim | Status |
|-------|--------|
| Single trip continuity across pause | **Historically observed** (one `tripId`, FSM never RESTING) |
| R9 natural start wake observed on Production | **Historically observed** (FSM `startWake` + 22 webhook log lines in window A on replica A) |
| Start wake reduced recognition latency vs polling-only | **NOT PROVEN** (no comparable polling-only baseline for this drive) |
| 19:53:24 webhook = motor-off / ignition-off | **NOT PROVEN** (generic `dimo.trigger` log only; no archived payload) |
| R10 motor-off pause / resume guards exercised | **NOT_EXERCISED** (FSM never entered `POSSIBLE_END`) |
| `no_core_data_keep_open` blocked end candidacy | **Historically observed + code-proven path** @ `684950419…` |
| Pre-pause core sample reuse after motor-off | **NOT_PROVEN** — core fetch non-empty @ 19:53:51/19:54:21 but provider timestamps not archived; worker-time `lastActivityAt` reset **code-proven** |
| “Stale VLS ACTIVE” @ reference run | **Corrected** — VLS @ 67 s is **fresh per 120 s rule**; semantically contradictory to operator motor-off **plausible**, not proven |
| LTE_R1 caused provider gap | **Hypothesis only** (hardware label observed; root cause **UNKNOWN**) |
| Trip auto-completed after addendum via FSM end detection | **Contradicted** — trip remained **ONGOING** @ window C; later completed via **`STALE_ONGOING` repair** @ `2026-09-08T21:40:38Z` (**not** regular FSM path) |

## Reference identifiers (re-verified)

| Field | Value | Method |
|-------|-------|--------|
| Plate | KS MS 661 | Operator ground truth + prior audit |
| `vehicleId` | `c10351f8-b6a2-4258-947f-631aeaa6d359` | Production `vehicle_trip_detection_states` |
| `tokenId` | 187361 | FSM evidence + PM2 webhook logs |
| `tripId` | `e324ee8c-8e17-4cfc-ac16-294dacef5d01` | Production `vehicle_trips` / FSM `active_trip_id` |
| Historical Production SHA | `68495041974135f7c6565fd5b836b3e2f9176fae` | SSH `readlink` + release HEAD @ window C |

---

## §R9 — Start latency and webhook forensics

### Timestamp semantics (do not merge into unproven causal chain)

| Timestamp | Value (UTC) | Source / field semantics |
|-----------|---------------|--------------------------|
| Operator ≈ drive start | ~**19:36:00** | User ground truth (**approximate**) |
| Persisted trip `start_time` / `effectiveStartAt` | **19:36:00.000** | `vehicle_trips.start_time`; `raw_detection_meta.lifecycleRecovery.startEpisode.effectiveStartAt` — **DIMO segment retrospective boundary**, not first worker recognition |
| `candidateStartAt` / `startCandidateObservedAt` | **19:40:31.000** | FSM `last_evidence_summary` — provider-event-time candidate |
| `startWake.providerObservedAt` | **19:40:31.000** | FSM `last_evidence_summary.startWake` — parsed provider payload timestamp |
| `startWake.receivedAt` | **19:40:36.432** | FSM `last_evidence_summary.startWake` — server `Date` at webhook intake (`dimo-webhook.controller.ts` assigns `receivedAt = new Date()` before `handleProviderWake`) |
| First belegter `DimoWebhookController` log | **19:40:43** | PM2 `synqdrive-out.log` line prefix; replica **synqdrive** pid **170515** only |
| `startCandidateEnteredAt` | **19:40:36.960** | FSM evidence — POSSIBLE_START phase entry |
| `startRecognizedAt` / trip row `created_at` | **19:41:08.699** / **19:41:08.704** | FSM + `vehicle_trips.created_at` — **ACTIVE_TRIP** recognition |
| `startBoundaryAdjustedMs` | **-271000** | Segment back-adjustment from candidate to effective start |

### Secured intervals (only where endpoints are independently sourced)

| Interval | Δ | Evidence quality |
|----------|---|------------------|
| Operator ≈ start → first belegter provider wake (`providerObservedAt`) | **~4m31s** | End anchor approximate |
| `providerObservedAt` → `receivedAt` | **~5.4s** | Same wake object in FSM; transport/processing plausible |
| `receivedAt` → first webhook **log line** | **~6.6s inverted** (log **after** persisted `receivedAt`) | **Same-event identity NOT PROVEN** — PM2 second bucketing, async handoff, or missing log line |
| Operator ≈ start → ACTIVE_TRIP recognition | **~5m09s** | End anchor approximate |

### Pre-wake activity (window A)

- **No** PM2 log lines referencing `c10351f8…` or `tokenId=187361` trip-start/snapshot/wake path before **19:40:43** webhook log (read-only grep @ window C).
- **No** evidence of polling-driven start recognition before first belegter R9 wake in available logs.

### Delay attribution (conservative)

| Layer | Assessment |
|-------|------------|
| Before provider event (~19:36 → 19:40:31) | **Dominant gap** — no SynqDrive recognition before first belegter wake; provider-side latency or missing trigger delivery **plausible**; user start time **approximate** |
| Transport / intake (19:40:31 → 19:40:36) | **Small, evidenced** |
| Snapshot + start validation (19:40:36 → 19:41:08) | **~32s evidenced** |
| Log vs `receivedAt` mismatch | **Evidenzlücke** — do not treat first log line as identical HTTP receipt without payload correlation |

### Webhook inventory (22 deliveries, window A)

| Metric | Value | Method |
|--------|-------|--------|
| Log lines `Received DIMO webhook: type=dimo.trigger, tokenId=187361` in window A | **22** | PM2 `synqdrive-out.log`; parsed prefix timestamps |
| First / last in A | **19:40:43** / **19:58:53** | Same |
| Replica **synqdrive-b** | **0** | PM2 `synqdrive-b-out.log` |
| Unique provider event IDs in logs | **Not available** | Logs omit trigger stableId / payload body |
| Archived payload for 19:53:24 entry | **Not available** | Log line only |

**Trigger configuration @ historical canary (NOT re-proven at drive time):** R9 speed `valueNumber > 3` (`9eeb7158afee`); ignition `valueNumber == 1` (`5d611d470eab`) — see TDL-EV-R9-CANARY-001 / DIM-EV-R9-CANARY-001 @ `2026-09-07`.

**19:53:24 webhook:** time-proximate to operator motor-off (**19:53:22**); classify as **generic trigger ingress**, **not** “motor-off webhook” without signal proof.

### R9 validation scope on this drive

| Aspect | Result |
|--------|--------|
| Natural start wake delivery | **PASS (observed)** — FSM `startWake.source=DIMO_TRIGGER`, `reason=IGNITION_ON` |
| In-trip wake processing | **Observed** — webhooks continue through 19:58:53 |
| Full R9 efficiency claim | **NOT PROVEN** — no control trip / polling-only comparison |
| API/polling savings | **NOT PROVEN** |

---

## §Redis / queue addendum (window C snapshot — not historical proof)

| Key / artifact | Observation @ window C | Limitation |
|----------------|------------------------|------------|
| `synqdrive:snapshot-wake:pending:{vehicleId}` | **absent** (EXISTS 0) | Empty now ≠ absent at 19:40 |
| `synqdrive:snapshot-wake:successor:{vehicleId}` | **absent** | Same |
| `bull:dimo.trip-tracking:trip-at-{vehicleId}-{tripId}` | **present**; name `trip-tracking`; payload trigger **ACTIVE_TICK** | Ongoing loop; no `FINALIZE` / `POSSIBLE_END_CHECK` job observed |
| BullMQ historical archive | **Not available** | Cannot reconstruct wake mailbox at 19:40 |

Code-derived namespace: `snapshot-wake.util.ts` → `synqdrive:snapshot-wake:pending:` / `successor:` prefixes.

---

## §Pause, `no_core_data_keep_open`, and first blocking decision

### Corrected phase counts (`no_core_data_keep_open` tracking runs)

| Phase | UTC bounds | Count | Notes |
|-------|------------|------:|-------|
| Before pause | `< 19:52:30` | **3** | |
| During actual pause | `[19:53:22, 19:55:38)` | **3** | Runs @ 19:54:38, 19:54:52, 19:55:22 |
| After resume → operator end | `[19:55:38, 19:59:22)` | **1** | Run @ **19:55:52** (**14s after** resume — **not** during pause) |
| After operator end (main A tail) | `[19:59:22, 20:35:00)` | **86** | Sustained block |
| First-audit follow-up B | `[20:35:00, 20:41:28]` | **15** | |
| After first audit | `> 20:41:28` | **31** | @ window C |

**Prior claim corrected:** “4 pause runs” incorrectly included **19:55:52** (post-resume).

### Decisive tracking-run sequence (window A excerpt)

| Run time (UTC) | FSM in → out | `result_summary.reason` | Forensics |
|----------------|--------------|---------------------------|-----------|
| 19:52:19 – 19:54:21 | ACTIVE_TRIP | `motion_detected` | Core stream present (`core_points_count` 1–3) — **includes runs after operator motor-off 19:53:22**; sample provider timestamps **NOT_PROVEN** |
| 19:54:38 – 19:55:22 | ACTIVE_TRIP | `no_core_data_keep_open` | `operationalInactiveMs=16896`; **`innerGateReason=operational_inactivity_below_threshold`** (reconstructed); VLS **ACTIVE fresh** @ obs 19:53:31 (67011 ms) |
| 19:55:52 | ACTIVE_TRIP | `no_core_data_keep_open` | VLS **UNKNOWN** (`vlsObservationAgeMs=141466` > 120000) |
| 19:56:23 | ACTIVE_TRIP | `stopped_stale_ignition_no_activity` | CH end assist path evaluated; **remained ACTIVE_TRIP** |
| 19:56:38+ | ACTIVE_TRIP | `motion_detected` | Resume consistent with operator 19:55:38 |
| 19:59:56 | ACTIVE_TRIP → **IDLE_WITHIN_TRIP** | `stopped_perf_active` | **Not** `POSSIBLE_END` |
| 20:00:26+ | IDLE_WITHIN_TRIP | `no_core_data_keep_open` | `vlsProviderObservedAt=19:59:22Z`; `vlsEvidenceState=ACTIVE` |

### Product pause behavior vs trip continuity

| Question | Answer |
|----------|--------|
| Same trip across pause? | **Yes** — continuity only; **not** correct pause segmentation |
| Pause recognized as separate stop? | **No** — no `POSSIBLE_END`, no mid-gap split applied |
| Old motion treated as current activity? | **SUSPECTED / NOT_PROVEN** for specific sample reuse; **code-proven** that `motion_detected` runs while core fetch non-empty and `lastActivityAt` updates on worker time |
| What triggers `no_core_data_keep_open`? | Empty core + `assessSuccessfulEmptyCoreEndEligibility` → `eligible=false` |
| First blocking end decision @ 19:54:38 | **`operational_inactivity_below_threshold`** (16896 ms < 120000 ms) **and** would also block on **fresh VLS ACTIVE** (67011 ms < 120000 ms) — see [REPRO-001](KS_MS_661_DECISION_REPRODUCTION_2026-09-08.md) |
| Why recovery did not apply | (1) Operational timer + fresh VLS ACTIVE during pause; (2) post-IDLE **engine load > 15** keeps VLS ACTIVE; (3) later VLS **UNKNOWN** keeps open by safety design |
| R10 guards | **NOT_EXERCISED** — require `POSSIBLE_END` cycle |

### Code path @ historical SHA (pre-R10 end-cycle guards irrelevant)

- `trip-detection-orchestration.service.ts` empty-core branch @ `684950419…` matches current `assessSuccessfulEmptyCoreEndEligibility` contract (R5A gate).
- R10 `resumeAfterAt` / finalize recycle guards apply to **`POSSIBLE_END` / finalize** — **not reached** on this drive.

### Data-gap root cause confidence

| Layer | Confidence |
|-------|------------|
| Blocking code decision (empty-core gate chain) | **HIGH** (DB forensics + reproduced helpers) |
| Sample-level reuse after motor-off | **NOT_PROVEN** (missing raw core timestamps) |
| Missing/stale core stream after stop | **MEDIUM** (observed empty core + frozen VLS timestamps) |
| Provider / LTE_R1 hardware causation | **LOW / hypothesis** — LTE_R1 is observed label, not proven technical cause |

---

## §Trip end state

### Historical verdict (windows A+B)

| Observation | Value |
|-------------|-------|
| Operator end | **≈19:59:22 UTC** |
| Last meaningful movement | **19:58:45.114** (FSM) |
| Last activity | **19:59:55.895** (FSM) |
| FSM @ end of B | **IDLE_WITHIN_TRIP** (first audit) |
| `POSSIBLE_END` / `END_VALIDATION` / `FINALIZE` runs | **0** for this `tripId` |
| End recognition | **FAILED in window A+B** — blocked before candidacy |

### Final outcome (after window C — OBSERVED)

| Field | Value |
|-------|-------|
| Trip completion mechanism | **`STALE_ONGOING` repair** @ `2026-09-08T21:40:38Z` |
| Regular FSM path | **None** — 0× `POSSIBLE_END` / `END_VALIDATION` / `FINALIZE` for this `tripId` @ `684950419…` |
| Implication | Open-trip symptom validated; repair completion **does not** validate empty-core fix on Production |

### Current state (window C only — `@ 2026-09-08T20:53:16Z`)

| Field | Value |
|-------|-------|
| `trip_status` | **ONGOING** |
| FSM | **IDLE_WITHIN_TRIP** |
| `possible_end_at` | **null** |
| `end_time` column | **19:59:55.895** (provisional column populated; lifecycle **not** finalized) |
| Finalize path | **None observed** |

A later automatic recovery would **not** retroactively validate historical end-detection failure in window A+B.

---

## §Corrected prior claims

| Prior claim | Correction |
|-------------|------------|
| Four `no_core_data_keep_open` runs during pause | **Three** during `[19:53:22, 19:55:38)`; **19:55:52** is post-resume |
| 19:53:24 webhook = ignition-off | **Not proven** — generic trigger log only |
| “Stale VLS ACTIVE” @ 19:54:38 | **Mislabelled** — VLS **fresh per 120 s rule** (67011 ms); primary inner blocker **`operational_inactivity_below_threshold`** |
| Pre-pause sample reuse YES | **Downgraded to NOT_PROVEN** |
| R10 would have prevented open trip | **Misleading** — R10 requires **`POSSIBLE_END`** first; **not exercised** |
| Start wake log time = HTTP receipt | **`receivedAt` precedes first log line** — same-event identity **not proven** |

---

## §Remaining evidence gaps

| Gap | Notes |
|-----|-------|
| Webhook payload archive (signal, value, provider event id) | Would prove 19:53:24 signal type |
| Trigger config at exact drive time | Only canary-time config documented |
| Historical Redis mailbox contents | Not recoverable |
| Polling-only latency baseline | Required for R9 efficiency claims |
| Raw PEC/core fetch samples @ 19:53:51 motion_detected | Would prove exact stale points |

---

## §Downstream dependencies (documented only)

| Module | Relationship @ this drive |
|--------|---------------------------|
| Battery V2 / ATE | **Dependency risk only** — ONGOING trip + `IDLE_WITHIN_TRIP` may affect shutdown/rest semantics; **not directly validated** in this addendum |

---

## §Validators / method

| Check | Command / method |
|-------|------------------|
| Production SHA | SSH read-only |
| PostgreSQL | `psql` read-only via `vehicle_*` tables |
| PM2 logs | read-only grep |
| Redis | `GET` / `EXISTS` / bounded `--scan` |
| Code | `trip-empty-core-end-gate.ts`, `trip-evidence.helpers.ts`, `trip-detection-orchestration.service.ts` @ `684950419…` |

**Mutations:** NONE (Production DB/Redis/DIMO/provider/runtime).

**Authority promotion:** NONE — remains `AUDIT_IN_PROGRESS`; TDL-DEC-R10-001/002 **not** set `PRODUCTION_VALIDATED`.

**NEXT_GATE (evidence-driven):** TDL-DEC-R11-001 **merged CI** @ `32526c95a` (#1584) — **authorized deploy** → natural Production revalidation (KS MS 661 class drives). Design contract + forensics: [KS_MS_661_EMPTY_CORE_SOLUTION_PROPOSAL_2026-09-08.md](KS_MS_661_EMPTY_CORE_SOLUTION_PROPOSAL_2026-09-08.md) · [TDL-DEC-R11-001_IMPLEMENTATION_2026-09-08.md](TDL-DEC-R11-001_IMPLEMENTATION_2026-09-08.md). Temporal flow: [KS_MS_661_TEMPORAL_FLOW_2026-09-08.md](KS_MS_661_TEMPORAL_FLOW_2026-09-08.md).

**Related:** [KS_MS_661_DECISION_REPRODUCTION_2026-09-08.md](KS_MS_661_DECISION_REPRODUCTION_2026-09-08.md) · [KS_MS_661_R11_SCENARIO_MATRIX_2026-09-08.md](KS_MS_661_R11_SCENARIO_MATRIX_2026-09-08.md)
