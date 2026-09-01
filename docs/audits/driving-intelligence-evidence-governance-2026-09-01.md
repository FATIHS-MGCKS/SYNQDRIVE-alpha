# Driving Intelligence — Evidence & Documentation Governance

**Date:** 2026-09-01  
**Status:** NORMATIVE — applies to all future Driving Intelligence Reconstruction work  
**Authority:** `docs/audits/driving-intelligence-reconstruction-master-plan-2026-08-30.md`  
**Registry:** `docs/audits/driving-intelligence-evidence-registry.md`

---

## 1. Purpose

This document establishes **permanent repository governance** for the SynqDrive Driving Intelligence Reconstruction workstream.

The objective is cumulative refinement:

**OBSERVE → MEASURE → DOCUMENT → CHALLENGE → IMPROVE → VALIDATE AGAIN**

Future agents, reviewers, and engineers must continue from existing evidence instead of restarting the problem from zero. Chat conversations, agent summaries, and temporary scratchpads are **not** canonical project authority.

---

## 2. Repository as Source of Truth

**REPOSITORY = CANONICAL KNOWLEDGE AND EVIDENCE AUTHORITY.**

| Source | Canonical? |
|--------|------------|
| Git-tracked Markdown / JSON / CSV in `docs/audits/` | **YES** |
| Master Plan + Evidence Registry | **YES** |
| Architecture records in `architecture/` | **YES** (when linked from registry) |
| Production DB rows for capture sessions | **YES** (runtime evidence; must be referenced from Git) |
| Chat transcripts / agent summaries | **NO** |
| Uncommitted local notes | **NO** |
| Memory of prior agents | **NO** |

Every **material** result — forensic finding, runtime measurement, model decision, failed hypothesis, validation verdict — must ultimately be represented in repository files with assigned evidence maturity.

---

## 3. Evidence Classes

Stable taxonomy for claim maturity. Assign the **highest** class supported by the evidence; never inflate.

| Class | Meaning |
|-------|---------|
| `CONFIRMED_FROM_CODE` | Verified by reading current repository source at a recorded SHA |
| `CONFIRMED_FROM_RUNTIME` | Verified by production/staging execution with recorded environment |
| `CONFIRMED_FROM_PROVIDER_DOCUMENTATION` | Verified against official provider docs at a recorded version/date |
| `CONFIRMED_FROM_PROVIDER_SCHEMA` | Verified by schema introspection or official schema artifact |
| `CONFIRMED_FROM_VEHICLE_OBSERVATION` | Observed on a specific vehicle/session without external Ground Truth |
| `GROUND_TRUTH_OBSERVED` | Compared against instrument-cluster video or other external reference |
| `GROUND_TRUTH_VALIDATED` | Ground Truth comparison passed defined acceptance criteria |
| `STATISTICALLY_VALIDATED` | Passed pre-registered statistical test on defined dataset |
| `INFERENCE` | Logical conclusion from confirmed facts; not directly observed |
| `HYPOTHESIS` | Untested or partially tested proposition |
| `PROPOSAL` | Design recommendation without validation |
| `UNKNOWN_REQUIRES_VALIDATION` | Gap explicitly acknowledged |
| `CONTRADICTED` | Later evidence disproves prior claim |
| `REJECTED` | Hypothesis tested and rejected; negative evidence retained |
| `SUPERSEDED` | Replaced by newer artifact; historical value preserved |

### Hard rules

- Never promote `INFERENCE` to `CONFIRMED_*` without new evidence.
- Never call **requested cadence** actual cadence.
- Never call provider-classified events **Ground Truth**.
- Never call reconstructed/proxy values **directly measured**.
- Never hide contradictory results.
- **Negative results are permanent evidence.**

---

## 4. Claim Maturity

When writing reports, tag conclusions explicitly:

```markdown
**Claim:** Yaw rate was not usable at required cadence on Reference Drive 001.
**Maturity:** CONFIRMED_FROM_VEHICLE_OBSERVATION
**Evidence:** DI-EV-0012 · signal-quality metrics §4.2
```

Orphan conclusions without evidence pointers are discouraged for material claims.

---

## 5. Required Artifact Types

Not every trivial code change requires all types. Apply **proportionally**. Every **major** phase, experiment, or model conclusion requires persistent repository evidence.

| Type | Code | Description |
|------|------|-------------|
| **A** | Phase / Experiment Report | Human-readable Markdown audit or report |
| **B** | Machine-Readable Result | JSON / CSV companion with exact numbers |
| **C** | Decision Record | Why a design, model, source, or threshold was accepted/rejected |
| **D** | Evidence / Provenance Record | Vehicle, provider, profile, session, SHA, manifest, timestamps |
| **E** | Open Questions / Limitations | Explicitly preserved unknowns |
| **F** | Independent Review | Separate review artifact when requested or appropriate |
| **G** | Master Plan Update | Status and material conclusions in Master Plan |
| **H** | Registry Entry | Row in `driving-intelligence-evidence-registry.md` |

---

## 6. Experiment / Runtime-Test Documentation

Every significant experiment or runtime test must document:

1. **Question** — what was being tested
2. **Hypothesis** — expected outcome (nullable)
3. **Authority** — governance + phase gate
4. **Vehicle / profile / powertrain** — scoped axes
5. **Session / dataset ID** — link to raw evidence
6. **Software / manifest / model versions** — reproducibility anchors
7. **Method** — procedure, surfaces, filters, exclusions
8. **Metrics** — quantitative results (prefer machine-readable companion)
9. **Results** — what was observed
10. **Contradictions** — conflicting observations
11. **Interpretation** — separated from facts
12. **Limitations** — what was not tested
13. **Open questions** — follow-up work
14. **Decision** — accept / reject / defer
15. **Reproduction path** — how to re-run or re-analyze

Use template: `docs/audits/templates/driving-intelligence-experiment-report-template.md`

---

## 7. Model / Algorithm Documentation

For future model families (Driver Quality V2, Vehicle Load V2, Brake Physics V2, Tire Dynamic Load V2, High-Timeframe V2), every **material** revision must document:

| Field | Required |
|-------|----------|
| `modelVersion` | Yes |
| `previousVersion` | If applicable |
| Reason for change | Yes |
| Training/calibration evidence | If any |
| Validation dataset IDs | Yes |
| Powertrain scope | Yes |
| Connection-profile scope | Yes |
| Known limitations | Yes |
| Sensitivity analysis | When material |
| Regression comparison | When replacing prior version |
| Expected semantic direction | Yes |
| Migration / replay impact | When production-affecting |

**Never overwrite model history.** Supersede prior versions; preserve prior artifacts.

---

## 8. Independent Agent Review

Independent reviewers must challenge prior work **without destroying history**.

### Review outcomes

| Verdict | Meaning |
|---------|---------|
| `AGREE` | Claims supported by independent check |
| `PARTIALLY_AGREE` | Some claims supported; others need qualification |
| `CHALLENGE` | Material claims disputed with evidence |
| `ALTERNATIVE_PROPOSAL` | Different model/approach suggested |
| `INSUFFICIENT_EVIDENCE` | Cannot verify from available artifacts |
| `REQUIRES_NEW_EXPERIMENT` | New measurement needed |
| `CONFIRMED_BY_INDEPENDENT_REVIEW` | Prior conclusion independently reproduced |

### Reviewer procedure

1. Read Master Plan first.
2. Read this Governance document.
3. Read relevant Evidence Registry entries.
4. Read original source artifact(s).
5. Verify code/runtime claims independently where possible.
6. Separate **fact** from **interpretation**.
7. Identify hidden assumptions.
8. Look for alternative models, double-counting, cadence bias, profile leakage, missing counterexamples.

### Artifact naming

Create a **separate** review file:

`docs/audits/<original-topic>-independent-review-YYYY-MM-DD.md`

Use template: `docs/audits/templates/driving-intelligence-independent-review-template.md`

**Do NOT silently rewrite the original audit.** If a conclusion changes, update Master Plan / decision record and mark the old conclusion `SUPERSEDED`.

---

## 9. Negative Evidence / Failed Hypotheses

**FAILED / NULL / UNSUPPORTED / CONTRADICTORY results are valuable evidence.**

Examples:

- Schema field exists but vehicle returns null
- 1s requested but real cadence is 8s
- Native event misses a physical maneuver
- Reconstructed detector produces false positive
- Proposed signal adds no predictive value
- Threshold fails on another powertrain

Record for each:

| Field | Content |
|-------|---------|
| What was expected | Pre-registered expectation |
| What was observed | Actual outcome |
| Why it failed / is unknown | Root cause if known |
| What decision followed | Accept / reject / defer |

This prevents future agents from repeating disproven approaches.

---

## 10. Supersession / Historical Preservation

**Do NOT delete** an old audit because a newer one contradicts it.

| Old artifact | Status |
|--------------|--------|
| Superseded conclusion | `SUPERSEDED` |
| New artifact | `CURRENT` |
| Registry | `supersedes = DI-EV-xxxx` |
| Master Plan | Current decision updated |

Research history is cumulative. Governance applies **prospectively**; do not retroactively fabricate missing historical evidence. Mark gaps as `NOT_MEASURED` / `NOT_AVAILABLE`.

---

## 11. Raw Data Preservation

### What belongs in Git

- Results, documentation, provenance, checksums, export procedures, analysis artifacts

### What does NOT belong in Git

- Gigabytes of telemetry
- Long videos
- Database dumps with sensitive data
- Secrets / tokens
- Huge binary artifacts

### Minimum durable record for raw telemetry

Every important reference dataset must have a Git-tracked evidence record containing:

| Field | Required |
|-------|----------|
| Dataset / session ID | Yes |
| Vehicle | Yes |
| Provider | Yes |
| Connection profile | Yes |
| Powertrain | Yes |
| Start / end | Yes |
| Manifest version | Yes |
| Recorder version | Yes |
| Row / sample count | Yes |
| Storage location | Yes |
| Export procedure | Yes |
| Content checksum (when exported) | Yes |
| Retention status | Yes |
| Schema / version | Yes |
| Related analysis artifacts | Yes |

### Canonical reference TTL protection

For designated Ground Truth / calibration reference sessions:

**RAW EVIDENCE MUST NOT BE LOST MERELY BECAUSE NORMAL RETENTION EXPIRES.**

Before production/reference-capture TTL can delete a designated canonical reference dataset, create a **durable immutable/sealed export** or other approved long-term archive. Storage backend may be decided later; this governance task does **not** implement object storage.

---

## 12. Video / External Ground Truth

Instrument-cluster video does **not** need to be committed to Git.

For every Ground Truth video, create a repository evidence index containing:

| Field | Required |
|-------|----------|
| `videoEvidenceId` | Stable ID |
| `associatedCaptureSessionId` | Link to capture session |
| Original filename or stable reference label | Yes |
| Recording start marker | Yes |
| Duration | Yes |
| Resolution / FPS | Yes |
| Whether original is preserved | Yes |
| Cryptographic checksum | When practical |
| Selected clip ranges used for analysis | Yes |
| Alignment anchors | Yes |
| Known limitations | Yes |
| Privacy notes | Yes |

Only selected short clips need to be shared with agents when required. The analysis report must be understandable even if the full video is not inside the repository.

---

## 13. Machine-Readable Evidence

For experiments with quantitative results, prefer companion JSON/CSV:

- Signal cadence metrics (P50/P95/P99 dt, max gap, jitter)
- Latency distributions
- Dropout statistics
- Event matching results
- MAE / RMSE / bias
- Sampling-invariance results
- Confusion matrices
- Feature distributions
- Sensitivity analysis
- Model comparison tables

Human Markdown explains interpretation. Machine-readable artifact preserves **exact numbers**.

---

## 14. Reproducibility Contract

A future agent must be able to answer:

| Question | Must be recorded if material |
|----------|------------------------------|
| Which raw session produced this conclusion? | Yes |
| Which vehicle? | Yes |
| Which provider? | Yes |
| Which connection profile? | Yes |
| Which powertrain? | Yes |
| Which software SHA? | Yes |
| Which manifest / model version? | Yes |
| Which algorithm version? | Yes |
| Which query / acquisition surface? | Yes |
| Which time range? | Yes |
| Which filters / exclusions? | Yes |
| Which Ground Truth evidence? | When applicable |
| Which calculation produced the metric? | Yes |
| Which assumptions were used? | Yes |

---

## 15. Definition of Done — Hard Rule

A Driving Intelligence phase, experiment, or validation milestone is **NOT DONE** merely because:

- code exists,
- an agent says it worked,
- a drive was completed,
- a test passed once,
- a result exists in chat.

For **material** work, DONE requires **all applicable** items:

- [ ] Implementation / experiment completed
- [ ] Verification completed
- [ ] Evidence stored or durably referenced
- [ ] Repository report created
- [ ] Evidence class assigned
- [ ] Source / provenance recorded
- [ ] Limitations recorded
- [ ] Contradictory observations recorded
- [ ] Open questions recorded
- [ ] Machine-readable metrics committed where appropriate
- [ ] Reproduction path documented
- [ ] Master Plan updated
- [ ] Evidence registry updated
- [ ] Independent-agent review possible without needing the original chat

**This rule is mandatory.**

---

## 16. Master Plan / Evidence Registry Update Rules

When a phase or experiment changes state:

1. Update `docs/audits/driving-intelligence-reconstruction-master-plan-2026-08-30.md` Progress Tracker.
2. Add or update row in `docs/audits/driving-intelligence-evidence-registry.md`.
3. Assign stable Evidence ID (`DI-EV-xxxx`); never reuse IDs.
4. Link new artifacts from Master Plan and registry.
5. Mark superseded artifacts; do not delete.
6. Update Agent Handoff "Immediate Next Actions" when gates change.

---

## 17. Security / Privacy / Secrets

**Never commit:**

- API tokens, credentials, authorization headers
- Private customer data beyond necessary internal IDs
- Unnecessary precise personal location history
- Full identifiable video unless explicitly approved
- Secret infrastructure data

Use internal IDs where necessary; redact secrets. Scientific reproducibility does **not** justify committing credentials.

---

## 18. Naming Conventions

### Audit reports

`docs/audits/<topic>-<phase-or-scope>-YYYY-MM-DD.md`

Examples:

- `dimo-phase-3a2-production-preflight-canary-2026-08-31.md`
- `dimo-lte-r1-reference-drive-001-capture-report-YYYY-MM-DD.md`

### Independent reviews

`docs/audits/<original-topic>-independent-review-YYYY-MM-DD.md`

### Machine-readable companions

`docs/audits/data/<topic>-<artifact>-YYYY-MM-DD.json`

or alongside manifest directory:

`docs/audits/manifests/`

### Evidence IDs

`DI-EV-0001`, `DI-EV-0002`, … — monotonic, never reused.

---

## 19. Reference Drive Requirements

The first instrumented `DIMO_LTE_R1` reference drive must produce persistent repository artifacts. Naming uses pattern below; replace `YYYY-MM-DD` with actual drive date.

### Required artifacts (minimum)

| ID | Artifact | When |
|----|----------|------|
| A | `dimo-lte-r1-reference-drive-001-capture-report-YYYY-MM-DD.md` | After capture |
| B | Machine-readable session summary JSON | After capture |
| C | Signal-quality metrics JSON/CSV | After post-capture analysis |
| D | Video / external Ground Truth evidence index | When video exists |
| E | Ground Truth alignment report | Later phase |
| F | Independent review artifact(s) | When requested |

### Capture report must include

- Session identity
- Exact vehicle
- Connection profile + powertrain
- Software SHA
- Manifest version
- Start / end
- Observation counts
- Signal inventory
- Acquisition surfaces executed
- Events captured
- Recorder errors / warnings
- Stop / freeze evidence

**Do NOT create fake result files before the drive occurs.**

---

## 20. Long-Term Model Governance

As Driving Intelligence models mature:

1. Every production model version is traceable to validation evidence IDs.
2. Shadow → production promotion requires documented gate satisfaction.
3. Profile-scoped validation gates (Master Plan §1.6) are enforced — no silent cross-powertrain transfer.
4. Replay / calibration governance (Phase 13) inherits this evidence contract.
5. UI/API semantic cutover (Phase 14) references model version + evidence ID in release notes.

Model history is append-only. Supersede; never erase.

---

## Raw Evidence Preservation States

| State | Meaning |
|-------|---------|
| `LIVE_DB` | Raw data only in operational database |
| `SEALED_EXPORT_PENDING` | Designated for archive; export not yet complete |
| `SEALED_EXPORT_AVAILABLE` | Immutable export exists with checksum |
| `ARCHIVED` | Long-term archive confirmed |
| `PURGE_ALLOWED` | Normal retention may delete |
| `PURGE_BLOCKED_REFERENCE_EVIDENCE` | Canonical reference — must reach `SEALED_EXPORT_AVAILABLE` or `ARCHIVED` before purge |

Canonical reference sessions must eventually reach `SEALED_EXPORT_AVAILABLE` or `ARCHIVED` before production DB retention destroys the only raw evidence.

---

## Related Documents

| Document | Path |
|----------|------|
| Master Plan | `docs/audits/driving-intelligence-reconstruction-master-plan-2026-08-30.md` |
| Evidence Registry | `docs/audits/driving-intelligence-evidence-registry.md` |
| Experiment template | `docs/audits/templates/driving-intelligence-experiment-report-template.md` |
| Independent review template | `docs/audits/templates/driving-intelligence-independent-review-template.md` |
