# Driving Intelligence — Evidence Registry

**Purpose:** Discoverable index for independent agents continuing the Driving Intelligence Reconstruction workstream.  
**Governance:** `docs/audits/driving-intelligence-evidence-governance-2026-09-01.md`  
**Master Plan:** `docs/audits/driving-intelligence-reconstruction-master-plan-2026-08-30.md`

**Scope:** Driving Intelligence Reconstruction phases and major artifacts only. Does not index every unrelated repository audit.

**Last updated:** 2026-09-03 (RD003 signal quality interpretation DI-EV-0034E)

---

## How to use

1. Read Master Plan + Governance first.
2. Find relevant Evidence ID below.
3. Open the linked artifact path.
4. Verify claims independently where maturity is not `CONFIRMED_*`.
5. Add new rows for new material work; never reuse Evidence IDs.

---

## Registry

| Evidence ID | Phase | Type | Path | Date | Status | Provider | Connection profile | Powertrain | Vehicle / session | Maturity | Supersedes | Superseded by | Purpose |
|-------------|-------|------|------|------|--------|----------|-------------------|------------|-------------------|----------|------------|---------------|---------|
| DI-EV-0001 | Program | G — Master Plan | `docs/audits/driving-intelligence-reconstruction-master-plan-2026-08-30.md` | 2026-08-30 | CURRENT | — | — | — | — | CONFIRMED_FROM_CODE | — | — | Canonical progress, gates, and architectural decisions for the workstream |
| DI-EV-0002 | Phase 1 | A — Phase report | `docs/audits/driving-intelligence-phase-1-current-state-forensic-audit-2026-08-30.md` | 2026-08-30 | CURRENT | DIMO + HM (inventory) | Mixed | Mixed | Fleet (code audit) | CONFIRMED_FROM_CODE | — | — | Forensic reconstruction of current score/consumer/data-flow chain; `drivingStressScore` = vehicle load not driver quality |
| DI-EV-0003 | Phase 2A | A — Phase report | `docs/audits/dimo-phase-2a-current-query-surface-audit-2026-08-31.md` | 2026-08-31 | CURRENT | DIMO | — | — | — | CONFIRMED_FROM_CODE | — | — | Complete DIMO GraphQL query registry (Q001–Q027); 41 unique signal fields in driving acquisition |
| DI-EV-0004 | Phase 2B | A — Phase report | `docs/audits/dimo-phase-2b-four-vehicle-capability-gap-matrix-2026-08-31.md` | 2026-08-31 | CURRENT | DIMO | DIMO_LTE_R1 | ICE (4 vehicles) | Tiguan, C63, A4, Arteon | CONFIRMED_FROM_VEHICLE_OBSERVATION | — | — | Four-vehicle capability matrix; union 33 signals; 15 available-but-unused vs Phase-2A queries |
| DI-EV-0005 | Phase 2C | A — Phase report | `docs/audits/dimo-phase-2c-current-schema-signal-expansion-audit-2026-08-31.md` | 2026-08-31 | CURRENT | DIMO | — | — | Schema-level | CONFIRMED_FROM_PROVIDER_SCHEMA | — | — | Global provider schema 117 fields; three-layer separation (schema vs query vs vehicle) |
| DI-EV-0006 | Phase 2D | A — Phase report | `docs/audits/dimo-phase-2d-signal-value-physics-matrix-2026-08-31.md` | 2026-08-31 | CURRENT | DIMO | — | Mixed | — | INFERENCE + CONFIRMED_FROM_CODE | — | — | Signal value/physics ranking; 30 candidates; Tier A = 8; cadence/latency-critical counts |
| DI-EV-0007 | Phase 2E | A — Phase report | `docs/audits/dimo-phase-2e-redundancy-canonicalization-2026-08-31.md` | 2026-08-31 | CURRENT | DIMO (provider-neutral design) | — | — | — | PROPOSAL + CONFIRMED_FROM_CODE | — | — | 33 canonical keys; 16 redundancy groups; episode identity taxonomy |
| DI-EV-0008 | Phase 2F | A — Phase report | `docs/audits/dimo-phase-2f-capability-first-acquisition-strategy-2026-08-31.md` | 2026-08-31 | CURRENT | DIMO | DIMO_LTE_R1 (primary) | — | — | PROPOSAL | — | — | Capability-first acquisition architecture; VCM; T0–T7 tiers; query planner design |
| DI-EV-0009 | Phase 2F.1 | A — Phase report | `docs/audits/dimo-phase-2f1-lte-r1-reference-manifest-2026-08-31.md` | 2026-08-31 | CURRENT | DIMO | DIMO_LTE_R1 | — | — | PROPOSAL | — | — | Frozen LTE_R1 reference manifest contract v1.1.0; broad-capture two-layer model |
| DI-EV-0010 | Phase 2F.1 | B — Machine-readable | `docs/audits/manifests/dimo-lte-r1-reference-manifest-v1.json` | 2026-08-31 | CURRENT | DIMO | DIMO_LTE_R1 | — | — | PROPOSAL | — | — | Normative manifest v1.1.0 JSON for Flight Recorder / reference capture |
| DI-EV-0011 | Phase 3A.1 | A + D | `docs/audits/dimo-phase-3a1-flight-recorder-foundation-2026-08-31.md` | 2026-08-31 | CURRENT | DIMO | DIMO_LTE_R1 | — | — | CONFIRMED_FROM_CODE | — | — | Flight Recorder foundation implementation audit; reference-capture module; envelope v1.0.0 |
| DI-EV-0012 | Phase 3A.1 | D — Architecture | `architecture/DIMO_LTE_R1_FLIGHT_RECORDER_REFERENCE_CAPTURE_2026-08-31.md` | 2026-08-31 | CURRENT | DIMO | DIMO_LTE_R1 | — | — | CONFIRMED_FROM_CODE | — | — | Architecture record for reference-capture subsystem |
| DI-EV-0013 | Phase 3A.2 | A + D | `docs/audits/dimo-phase-3a2-production-preflight-canary-2026-08-31.md` | 2026-08-31 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | VW Tiguan `19fedd4b-…` · session `e8613cc7-…` | CONFIRMED_FROM_RUNTIME | — | — | Production deploy + stationary canary; 5 cycles; 52 observations; REFERENCE_DRIVE_READY=YES |
| DI-EV-0014 | Phase 3A.2 | D — Architecture | `architecture/DIMO_LTE_R1_PHASE_3A2_PRODUCTION_CANARY_2026-08-31.md` | 2026-08-31 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | Session `e8613cc7-…` | CONFIRMED_FROM_RUNTIME | — | — | Architecture summary of production canary |
| DI-EV-0015 | Governance | G — Governance | `docs/audits/driving-intelligence-evidence-governance-2026-09-01.md` | 2026-09-01 | CURRENT | — | — | — | — | PROPOSAL | — | — | Normative evidence governance for all future DI work |
| DI-EV-0016 | Phase 3A.3 | A — Reference drive report | `docs/audits/dimo-lte-r1-reference-drive-001-capture-report-2026-09-01.md` | 2026-09-01 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | VW Tiguan `19fedd4b-…` · session `06638509-…` · `DIMO_LTE_R1_REFERENCE_DRIVE_001` | CONFIRMED_FROM_RUNTIME | — | — | Real-motion STOP + telemetry audit; HF aggregation semantics + normalized exact-window replay + watermark causality; differential: `dimo-lte-r1-reference-drive-001-hf-late-arrival-differential.json` (SHA `9ca28ab3…`); sealed export SHA `f8e3097e…`; video GT NOT_AVAILABLE |
| DI-EV-0017 | Phase 3A.3 | B — Machine-readable | `docs/audits/data/dimo-lte-r1-reference-drive-001-session-summary.json` | 2026-09-01 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | Session `06638509-…` | CONFIRMED_FROM_RUNTIME | — | — | Session inventory, capture windows, aggregation semantics maturity, compact acquisition-state summaries |
| DI-EV-0018 | Phase 3A.3 | B — Machine-readable | `docs/audits/data/dimo-lte-r1-reference-drive-001-signal-quality-metrics.json` (+ CSV) | 2026-09-01 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | Session `06638509-…` | CONFIRMED_FROM_VEHICLE_OBSERVATION | — | — | Per-field/surface metrics; nonempty bucket cadence; 151s PROVIDER_DATA_GAP; dynamics PROVISIONAL |
| DI-EV-0019 | Phase 3A.3 | C — Ground Truth index | `docs/audits/dimo-lte-r1-reference-drive-001-ground-truth-evidence-index-2026-09-01.md` | 2026-09-01 | CURRENT | — | DIMO_LTE_R1 | ICE_GASOLINE | `DIMO_LTE_R1_REFERENCE_DRIVE_001` | REJECTED | — | — | Negative evidence: VIDEO_NOT_CAPTURED; GT alignment impossible for #001 |
| DI-EV-0020 | Phase 3A.3.1 | A + D | `docs/audits/dimo-phase-3a31-fast-prearm-go-remediation-2026-09-02.md` | 2026-09-02 | CURRENT | DIMO | DIMO_LTE_R1 | — | — | CONFIRMED_FROM_CODE | — | — | FAST PRE-ARM/GO split; PRE-ARM→READY; FAST GO via production HTTP; 15s cap (max 15s); ambiguous-START reconciliation; SIGNAL_POINT-only gate |
| DI-EV-0021 | Phase 3A.3.2 | A + D | `docs/audits/dimo-phase-3a32-hf-watermark-aggregate-identity-remediation-2026-09-02.md` | 2026-09-02 | CURRENT | DIMO | DIMO_LTE_R1 | — | RD001 | CONFIRMED_FROM_CODE + CONFIRMED_FROM_RUNTIME | — | — | Per-field HF data watermark + query coverage; DB durable idempotency; V2 aggregate bucket fingerprint; provider revision policy; RD001 39-exclusion remediated |
| DI-EV-0022 | Phase 3A.3 | A — Production canary | `docs/audits/dimo-phase-3a3-production-canary-2026-09-02.md` | 2026-09-02 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | WOB L 7503 · sessions `ed06ea20-…`, `cc30f049-…` | CONFIRMED_FROM_PRODUCTION_RUNTIME | — | — | Combined cutover + canonical redeploy `f00a49394` + post-deploy smoke PASS; 3A.3.1 validated; 3A.3.2 motion validated in RD002 (DI-EV-0023) |
| DI-EV-0023 | Phase 3A.3 | A — Reference drive report | `docs/audits/dimo-lte-r1-reference-drive-002-capture-report-2026-09-02.md` | 2026-09-02 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | KS MX 2024 `a60c0749-…` · session `e095d273-…` · `DIMO_LTE_R1_REFERENCE_DRIVE_002` | CONFIRMED_FROM_PRODUCTION_RUNTIME | — | — | Motion HF canary STOP + forensic audit; 351 cycles; 355 HF_HISTORICAL V2; 0 duplicate fingerprints; FAST GO 1949ms; VIDEO_GROUND_TRUTH NOT_PLANNED_BY_PROTOCOL |
| DI-EV-0024 | Phase 3A.3 | B — Machine-readable | `docs/audits/data/dimo-lte-r1-reference-drive-002-session-summary.json` | 2026-09-02 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | Session `e095d273-…` | CONFIRMED_FROM_PRODUCTION_RUNTIME | — | — | Session inventory, capture windows, HF watermark/coverage, FAST GO metrics, C63 field parity |
| DI-EV-0025 | Phase 3A.3 | B — Machine-readable | `docs/audits/data/dimo-lte-r1-reference-drive-002-signal-quality-metrics.json` (+ CSV) | 2026-09-02 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | Session `e095d273-…` | CONFIRMED_FROM_VEHICLE_OBSERVATION | — | — | Per-field/surface metrics; HF cadence under motion; dynamics PROVISIONAL |
| DI-EV-0026 | Phase 3A.3 | B — Vehicle differential | `docs/audits/dimo-lte-r1-reference-drive-002-c63-signal-differential-2026-09-02.md` | 2026-09-02 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | KS MX 2024 · RD002 session `e095d273-…` | CONFIRMED_FROM_VEHICLE_OBSERVATION | — | — | C63 signal inventory + Aug/RD002/RD001 differential; HF 1s≠1Hz finding; physics assessability; native events NOT_OBSERVED |
| DI-EV-0027 | Phase 3A.3 | A — Reference drive report | `docs/audits/dimo-lte-r1-reference-drive-003-capture-report-2026-09-02.md` | 2026-09-02 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | VW Tiguan `19fedd4b-…` · session `0fa040aa-…` · `DIMO_LTE_R1_REFERENCE_DRIVE_003` | CONFIRMED_FROM_PRODUCTION_RUNTIME | — | — | Segmented video GT STOP + telemetry forensics v2; HF_IDEMPOTENCY_RUNTIME_VALIDATED=NOT_EXERCISED; NO_DUPLICATE_AGGREGATE_BUCKET_IDENTITIES_OBSERVED=YES |
| DI-EV-0028 | Phase 3A.3 | B — Machine-readable | `docs/audits/data/dimo-lte-r1-reference-drive-003-session-summary.json` | 2026-09-02 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | Session `0fa040aa-…` | CONFIRMED_FROM_PRODUCTION_RUNTIME | — | — | Distinct timing metrics; segmented video GT model; idempotency evidence semantics corrected |
| DI-EV-0029 | Phase 3A.3 | B — Machine-readable | `docs/audits/data/dimo-lte-r1-reference-drive-003-signal-quality-metrics.json` (+ CSV) | 2026-09-02 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | Session `0fa040aa-…` | CONFIRMED_FROM_VEHICLE_OBSERVATION | — | — | Per-field/surface metrics; HF 1s≠1Hz; idempotency NOT_EXERCISED; acquisition-order runtime validation |
| DI-EV-0030 | Phase 3A.3 | B — Vehicle differential | `docs/audits/dimo-lte-r1-reference-drive-003-vs-rd001-tiguan-differential-2026-09-02.md` | 2026-09-02 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | WOB L 7503 · RD001 vs RD003 | CONFIRMED_FROM_VEHICLE_OBSERVATION | — | — | Same Tiguan: ARM gap eliminated; distinct timing metric terminology |
| DI-EV-0031 | Phase 3A.3 | B — Cross-vehicle differential | `docs/audits/dimo-lte-r1-reference-drive-002-vs-rd003-tiguan-cross-vehicle-differential-2026-09-02.md` | 2026-09-02 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | C63 vs Tiguan | CONFIRMED_FROM_VEHICLE_OBSERVATION | — | — | C63 29 vs Tiguan 31 fields; shared HF set; vehicle-specific gear signals |
| DI-EV-0032 | Phase 3A.3 | C — Ground Truth index | `docs/audits/dimo-lte-r1-reference-drive-003-ground-truth-evidence-index-2026-09-02.md` | 2026-09-02 | CURRENT | — | DIMO_LTE_R1 | ICE_GASOLINE | `DIMO_LTE_R1_REFERENCE_DRIVE_003` | PENDING_SEGMENTED_VIDEO | — | — | Partial/segmented video GT clip schema; TELEMETRY_ONLY unrecorded windows; continuous video assumption removed |
| DI-EV-0033 | Phase 3A.3 | B — Machine-readable | `docs/audits/data/dimo-lte-r1-reference-drive-003-video-gt-correlation-source.jsonl` (+ CSV, summary, per-field CSVs) | 2026-09-03 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | Session `0fa040aa-…` · `DIMO_LTE_R1_REFERENCE_DRIVE_003` | PENDING_CORRELATION | — | — | Full-session lossless telemetry correlation source for external video alignment; 5010 rows; NOT Ground Truth itself |
| DI-EV-0034A | Phase 3A.3 | B — Method/Tooling | `docs/audits/data/rd003-video-ground-truth-observations.json` + `docs/audits/data/rd003-video-gt-alignment/` | 2026-09-03 | CURRENT | — | DIMO_LTE_R1 | ICE_GASOLINE | `DIMO_LTE_R1_REFERENCE_DRIVE_003` | WORKBENCH_READY | — | — | External video/telemetry alignment workbench v1.2; multi-clock model; NOT validated Ground Truth |
| DI-EV-0034B | Phase 3A.3 | B — External Ground Truth + C — Candidate alignment | `docs/audits/data/rd003-video-ground-truth-observations.json` + `docs/audits/data/rd003-video-gt-alignment/` | 2026-09-03 | CURRENT | — | DIMO_LTE_R1 | ICE_GASOLINE | `DIMO_LTE_R1_REFERENCE_DRIVE_003` | REAL_CANDIDATE_ALIGNMENTS | — | — | First real externally reviewed sparse video GT (9 clips, 198 obs); first real alignment run; GROUND_TRUTH_VALIDATED=NO |
| DI-EV-0034C | Phase 3A.3 | B — Method diagnostic + C — Discovery alignment | `docs/audits/data/rd003-video-gt-alignment/global-fingerprint-discovery/` + `hard-clock-prior-run/` | 2026-09-03 | SUPERSEDED (method) | — | DIMO_LTE_R1 | ICE_GASOLINE | `DIMO_LTE_R1_REFERENCE_DRIVE_003` | GLOBAL_FINGERPRINT_DISCOVERY | — | DI-EV-0034D | Clock-prior falsification; full-session speed fingerprint search; preserves DI-EV-0034B hard-prior run; methodological defects corrected in DI-EV-0034D |
| DI-EV-0034D | Phase 3A.3 | B — Method correction + C — Joint alignment discovery | `docs/audits/data/rd003-video-gt-alignment/global-fingerprint-discovery-v2/` + preserved `hard-clock-prior-run/` + `global-fingerprint-discovery/` | 2026-09-03 | CURRENT | — | DIMO_LTE_R1 | ICE_GASOLINE | `DIMO_LTE_R1_REFERENCE_DRIVE_003` | GLOBAL_FINGERPRINT_DISCOVERY_V2 | DI-EV-0034C (method only) | — | V2 seed selection; ambiguous CLOCK_CANDIDATE_SET preservation; corrected static-minute geometry (D.2); joint DP intervals; artifact/runtime parity; GROUND_TRUTH_VALIDATED=NO |
| DI-EV-0034D.1 | Phase 3A.3 | B — Method correction (partial) | `global-fingerprint-discovery-v2/` (pre-D.2 static/joint slice) | 2026-09-03 | SUPERSEDED (static/joint) | — | DIMO_LTE_R1 | ICE_GASOLINE | `DIMO_LTE_R1_REFERENCE_DRIVE_003` | GLOBAL_FINGERPRINT_DISCOVERY_V2 | — | DI-EV-0034D.2 | D.1 joint/static-minute results superseded by D.2 geometry correction; independent speed basins preserved |
| DI-EV-0034E | Phase 3A.3 | E — Signal quality + foundation | `docs/audits/data/rd003-signal-quality/` + `docs/audits/driving-intelligence-rd003-signal-quality-interpretation-2026-09.md` | 2026-09-03 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | `DIMO_LTE_R1_REFERENCE_DRIVE_003` | SIGNAL_QUALITY_INTERPRETATION | DI-EV-0034D.2 (alignment) | — | Per-signal usability matrix; Tier A/B/C evidence; no Driving Score changes; GROUND_TRUTH_VALIDATED=NO |

---

## Entry count

**39** registry entries through DI-EV-0034E (RD003 signal quality interpretation added 2026-09-03).

---

## Planned entries (not yet created)

| Planned ID | Phase | Artifact | Status |
|------------|-------|----------|--------|
| DI-EV-0034F | Driving Intelligence Design | Score architecture from signal-quality foundation | NOT_STARTED |

---

## Vehicle inventory cross-references (Phase 2B inputs)

These support DI-EV-0004 but are not separate registry entries:

- `docs/audits/dimo-wob-l-7503-signal-inventory-gap-analysis-2026-08-30.md`
- `docs/audits/dimo-ks-mx-2024-signal-inventory-gap-analysis-2026-08-30.md`
- `docs/audits/dimo-ks-ms-661-signal-inventory-gap-analysis-2026-08-30.md`
- `docs/audits/dimo-hmue-c-215-signal-inventory-gap-analysis-2026-08-30.md`
