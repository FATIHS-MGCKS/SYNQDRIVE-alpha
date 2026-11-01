# Driving Intelligence — Open Questions

Explicit **UNKNOWN** items. Absence of an answer here is not a documentation failure.

## HF acquisition and cadence

| ID | Question | Why it matters |
|----|----------|----------------|
| DI-OQ-HF-001 | What is fleet-wide DIMO HF request cost at current enrichment rate? | Scalability planning |
| DI-OQ-HF-002 | Does 30s block polling preserve bucket density on all vehicle types? | **Partial data** — EXP-019 N=1; settlement replay shows max gap 117s **persisted**; **video GT: gap interiors empty at all cadences incl. 10s**; **not validated** |
| DI-OQ-HF-003 | Does ascending 10→60 phase order confound cadence vs route/time? | EXP-019 used ascending order; video GT confirms dynamics inside gaps regardless of cadence | **OPEN** — counterbalanced 60→10 recommended |
| DI-OQ-HF-004 | Can native DIMO events backfill HF gap interiors on KS MX 2024? | EXP-019 event register: 1 native event in session; **0/5** in GT windows | **OPEN** — multi-authority capture proposed |
| DI-OQ-HF-005 | Can boundary-only HF speeds reconstruct video-confirmed trajectories? | EXP-019: start/end sometimes align; interior always void; end often mismatches (e.g. GT-20 111 vs 36) | **OPEN** |
| DI-OQ-HF-006 | Does gap-conditioned HF void generalize to non-gap control windows? | EXP-019 bias-control: **CLEAR_DIFFERENCE** (5/5 gap NONE vs 0/8 control NONE); N=1 ascending drive | **PARTIALLY_ANSWERED** — counterbalanced drive still required |
| DI-OQ-HF-007 | Does larger HF query window geometry improve settled bucket recovery? | EXP-020: W060–W300 **identical union**; whole-trip P1 optimal | **ANSWERED (N=1)** — window size alone does not |
| DI-OQ-HF-008 | What settlement delay before HF buckets are first observable? | EXP-020: P50 first-observation age **~27s** vs 8s live delay | **PARTIAL** — EXP-021 shadow settlement test required |
| DI-OQ-HF-009 | What post-trip delay maximizes whole-trip HF completeness? | Production queries at enrichment time with no explicit delay | **OPEN** — EXP-021 post-trip shadow ages planned |
| DI-OQ-HF-010 | Is EXP020 446-bucket union a valid completeness denominator? | Preflight audit: **PARTIAL** — ms-key artifact across geometries | **ANSWERED** — use per-probe +600s reference in EXP-021 |
| DI-OQ-HF-003 | Optimal settlement delay and recovery overlap for production? | Currently 8s/6s provisional |
| DI-OQ-HF-004 | Cross-provider cadence variance beyond LTE_R1 reference drives? | Generalization risk |

## V2 pipeline

| ID | Question | Why it matters |
|----|----------|----------------|
| DI-OQ-V2-001 | Production SLO for stage completion latency? | Ops readiness |
| DI-OQ-V2-002 | Cutover criteria from legacy to V2-only path? | Migration planning |
| DI-OQ-V2-003 | Shadow detector false-positive rate in production? | Misuse case quality |

## Scoring and events

| ID | Question | Why it matters |
|----|----------|----------------|
| DI-OQ-SCORE-001 | Episode V2 score correlation with Impact V1 on same trips? | Cutover safety |
| DI-OQ-SCORE-002 | Should `DriverScoreService` be renamed? | Semantic clarity |
| DI-OQ-SCORE-003 | EV-specific stress dimension weights validated? | Powertrain parity |

## Persistence and replay

| ID | Question | Why it matters |
|----|----------|----------------|
| DI-OQ-PERSIST-001 | Should raw HF be persisted for replay? | Re-enrichment without DIMO re-fetch |
| DI-OQ-PERSIST-002 | ClickHouse mirror coverage in production? | Depends on HF_MIRROR_ENABLED deployment |

## Multi-tenancy and security

| ID | Question | Why it matters |
|----|----------|----------------|
| DI-OQ-SEC-001 | Full audit of nullable organizationId on legacy DI tables? | Tenant isolation proof |
| DI-OQ-SEC-002 | Worker job payload org scoping under all handlers? | Cross-tenant safety |

## Production validation

| ID | Question | Why it matters |
|----|----------|----------------|
| DI-OQ-PROD-001 | Has V2 full DAG run on production fleet with master flag on? | E2E proof |
| DI-OQ-PROD-002 | Live HF calibration operator runbook finalized? | C.1c–e execution |
| DI-OQ-PROD-003 | Reconciliation scheduler leader election enabled in prod? | Duplicate sweep risk |

## R1 temporal provenance (EXP-021 C0.3 containment)

| ID | Question | Why it matters |
|----|----------|----------------|
| DI-OQ-R1-001 | At which layer does R1 OBD record misdating originate (device buffer, DIMO ingest, storage)? C0.1 root layer = UNKNOWN | Determines whether a correction (vs containment) is possible |
| DI-OQ-R1-002 | What source-quality model (evidence-state contract, e.g. `OBD_TIME_UNCERTAIN`) should replace the C0.3 containment? | Containment is not the final architecture |
| DI-OQ-R1-003 | Should `hardwareType` gain an API-synthetic value or be replaced by device identity for routing? | DI-CONTRA-HARDWARE-TYPE-INTEGRATION-001 |
| DI-OQ-R1-004 | Should historical R1 misuse cases / trip counters / stress scores be reviewed or recomputed (authorized backfill)? | C0.3 contains reads only; persisted history unchanged |
| DI-OQ-R1-005 | Can SMART5 / UNKNOWN-family OBD records be shown to have reliable record time, or do they need the same containment? | Containment is R1-only by evidence scope |
| DI-OQ-R1-006 | Should context misuse rules stop reading persisted anchor-relative values (`coolantAtAnchor`, `preSpeed`) for R1? | Escalation capped, but candidate generation still uses them |
| DI-OQ-R1-007 | Should R1 **vehicle speed** ever influence DS4 L3 metadata, speed-QC verdicts, or motion-FSM sparse input after video-reference evidence? | **PARTIALLY_CLOSED (2026-10-23):** product boundary excludes speed from those paths; comparison series retained; fleet prevalence + #2134 C4 protections still open |

## DS4 motion events — acceleration / braking (video-reference evaluation 2026-10-23)

| ID | Question | Why it matters |
|----|----------|----------------|
| DI-OQ-DS4-EVT-001 | Should `eventQuality` (`OK / DEGRADED / LIMITED`) enter event acceptance (`eventAcceptedCount` currently = all except `ARTEFACT_SUSPECT`)? Offline K-A2 (reject DEGRADED) is regression-free in-sample but NOT_PROVEN under §10 | 7/8 non-OK events on the four references are problematic; a decision needs a hard false alarm on an independent EVAL drive, which the current sample lacks |
| DI-OQ-DS4-EVT-002 | How should pull-away onsets after standstill be represented when C4 has no usable support in the first 1–3 s and `postGapGuardS` delays entry (F1: 2 hard misses, +4/+5 s late starts)? | Threshold lowering would move the 12 borderline cases into hits and false alarms alike; a Standstill→Moving onset belongs to FSM / speed-QC level, not the manoeuvre detector |
| DI-OQ-DS4-EVT-003 | Should K3 `applySpikeReversionCheck` also compare the post-event level with the last usable **pre-event** sample (candidate K-B), so that artefacts whose start sample is itself the dip are caught? | TES16 03:50:20 (+35 km/h on flat reference) escapes K3; K-B flags it and changes nothing on TIG22/TES21, but is derived from TES16 only |
| DI-OQ-DS4-EVT-004 | Why does C4 deliver ≈ 2× OBD speed on the TIG22 trip tail (19:04:20–53; `SPARSE_SUPPORT`, `MIN_SUPPORT_3_POINTS`, `JITTER`), producing accepted events of 6.6 / 8.3 m/s²? | Speed-path question (not event-level); documented for the speed workstream — explicitly out of scope of the event evaluation |
| DI-OQ-DS4-EVT-005 | Should the motion-core-shadow `summary_json` carry per-quality and per-kind event counters so that non-OK-event share can be measured on production runs without behaviour change? | Precondition for ever proving or rejecting K-A2 / K-B on production data (21 `SUCCEEDED` runs exist, counters do not) |
