# Driving Intelligence — Evidence Registry

**Purpose:** Discoverable index for independent agents continuing the Driving Intelligence Reconstruction workstream.  
**Governance:** `docs/audits/driving-intelligence-evidence-governance-2026-09-01.md`  
**Master Plan:** `docs/audits/driving-intelligence-reconstruction-master-plan-2026-08-30.md`

**Scope:** Driving Intelligence Reconstruction phases and major artifacts only. Does not index every unrelated repository audit.

**Last updated:** 2026-09-01

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
| DI-EV-0016 | Phase 3A.3 | A — Reference drive report | `docs/audits/dimo-lte-r1-reference-drive-001-capture-report-2026-09-01.md` | 2026-09-01 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | VW Tiguan `19fedd4b-…` · session `06638509-…` · `DIMO_LTE_R1_REFERENCE_DRIVE_001` | CONFIRMED_FROM_RUNTIME | — | — | Real-motion reference drive STOP + telemetry audit + HF completeness forensic; capture COMPLETED; video GT NOT_AVAILABLE; HF watermark risk confirmed |
| DI-EV-0017 | Phase 3A.3 | B — Machine-readable | `docs/audits/data/dimo-lte-r1-reference-drive-001-session-summary.json` | 2026-09-01 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | Session `06638509-…` | CONFIRMED_FROM_RUNTIME | — | — | Frozen session inventory, capture windows, ARM incident, compact acquisition-state summaries (no raw fingerprint bloat) |
| DI-EV-0018 | Phase 3A.3 | B — Machine-readable | `docs/audits/data/dimo-lte-r1-reference-drive-001-signal-quality-metrics.json` (+ CSV) | 2026-09-01 | CURRENT | DIMO | DIMO_LTE_R1 | ICE_GASOLINE | Session `06638509-…` | CONFIRMED_FROM_VEHICLE_OBSERVATION | — | — | Per-field/surface signal quality, HF audit, 151s BOUNDARY_GAP reclassification, dynamics PROVISIONAL |
| DI-EV-0019 | Phase 3A.3 | C — Ground Truth index | `docs/audits/dimo-lte-r1-reference-drive-001-ground-truth-evidence-index-2026-09-01.md` | 2026-09-01 | CURRENT | — | DIMO_LTE_R1 | ICE_GASOLINE | `DIMO_LTE_R1_REFERENCE_DRIVE_001` | REJECTED | — | — | Negative evidence: VIDEO_NOT_CAPTURED; GT alignment impossible for #001 |

---

## Entry count

**19** registry entries (Phases 1, 2A–2F.1, 3A.1, 3A.2, 3A.3 RD001, governance).

---

## Planned entries (not yet created)

| Planned ID | Phase | Artifact | Status |
|------------|-------|----------|--------|
| DI-EV-0020+ | Reference Drive 002 | Capture report + GT-aligned metrics | NOT_STARTED |

---

## Vehicle inventory cross-references (Phase 2B inputs)

These support DI-EV-0004 but are not separate registry entries:

- `docs/audits/dimo-wob-l-7503-signal-inventory-gap-analysis-2026-08-30.md`
- `docs/audits/dimo-ks-mx-2024-signal-inventory-gap-analysis-2026-08-30.md`
- `docs/audits/dimo-ks-ms-661-signal-inventory-gap-analysis-2026-08-30.md`
- `docs/audits/dimo-hmue-c-215-signal-inventory-gap-analysis-2026-08-30.md`
