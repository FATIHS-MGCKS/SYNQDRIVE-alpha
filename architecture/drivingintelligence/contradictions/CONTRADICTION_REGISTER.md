# Driving Intelligence — Contradiction Register

Record disagreements between sources. **Do not resolve by guessing.**

## DI-CONTRA-HF-1HZ-001 — HF 1 Hz assumption vs observed sparse cadence

| Side | Claim | Source |
|------|-------|--------|
| A | HF is ~1 Hz; `HF_WINDOW_EXPECTED_INTERVAL_MS = 1000` | `hf-window-producer.ts`, detector comments |
| B (RD003) | HF_HISTORICAL median new physical samples **~2.00s** | RD003 signal quality (`signal-quality-summary.json`) |
| B (RD002) | Sealed HF_HISTORICAL aggregate-bucket Δt P50 **13.489s** | RD002 capture report (DI-EV-0023–0025) |
| **Status** | Active semantic debt | Production path unchanged by intent |
| **Mitigation** | V2 canonical design proposes 2.0s max-gap anchor (RD003 only); assessability reports sparse HF |
| **Note** | **Do not merge RD002 and RD003 into one median** | See `CADENCE_DENSITY.md` |
| **Graph** | DI-CONTRA-HF-1HZ-001, DI-GAP-HF-CADENCE-001 |

## DI-CONTRA-DRIVER-SCORE-NAME-001 — DriverScore vs vehicle stress semantics

| Side | Claim | Source |
|------|-------|--------|
| A | `DriverScoreService` implies driver quality scoring | Class name, API routes |
| B | Aggregates `drivingStressScore` = vehicle operational load | `driver-score.service.ts` header comment |
| **Status** | Naming debt | Behavior documented in code |
| **Mitigation** | UI copy discipline; future rename considered |
| **Graph** | DI-GAP-DRIVER-SCORE-NAMING-001 |

## DI-CONTRA-RD003-RD004-MEDIAN-001 — Apparent cadence disagreement

| Side | Claim | Source |
|------|-------|--------|
| A | RD003: median ~1–2s provider aggregate resolution | RD003 signal quality |
| B | RD004 sealed: median ~10.6s spacing | RD004-B capture completeness |
| **Resolution** | **Compatible, not contradictory** | RD004 reflects capture/watermark gaps, not DIMO physics |
| **Evidence** | Exact-window replay: 157 vs 104 buckets same windows | `rd004-b-hf-exact-window-replay.json` |
| **Graph** | Documented in CHANGE_LEDGER |

## DI-CONTRA-EVIDENCE-REGISTRY-LAG-001 — Registry vs block-polling doc

| Side | Claim | Source |
|------|-------|--------|
| A | Evidence registry ends at DI-EV-0035C.1c | `driving-intelligence-evidence-registry.md` |
| B | C.1d and C.1e documented in block-polling audit | `driving-intelligence-hf-block-polling-scalability-2026-09.md` |
| **Status** | Documentation lag | This authority includes C.1d/e |
| **Mitigation** | Update registry in future workstream |

## DI-CONTRA-V2-DOCS-001 — Two V2 architecture documents

| Side | Claim | Source |
|------|-------|--------|
| A | July `driving-intelligence-v2.md` — UX/API 13-layer contract | `docs/architecture/driving-intelligence-v2.md` |
| B | Sep `driving-intelligence-v2-canonical-design-2026-09.md` — episode reconstruction | DI-EV-0034F |
| **Resolution** | **Layered, not contradictory** | Different concerns: presentation vs reconstruction |
| **Authority** | Reconstruction: 0034F; UX contract: July doc until merged |
