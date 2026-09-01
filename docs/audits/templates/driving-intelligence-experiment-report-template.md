# Driving Intelligence — Experiment Report Template

**Copy this file** to `docs/audits/<topic>-YYYY-MM-DD.md` and fill all applicable sections.  
**Governance:** `docs/audits/driving-intelligence-evidence-governance-2026-09-01.md`  
**Registry:** Add row to `docs/audits/driving-intelligence-evidence-registry.md` with new `DI-EV-xxxx`.

---

## Metadata

| Field | Value |
|-------|-------|
| **Evidence ID** | DI-EV-____ |
| **Date** | YYYY-MM-DD |
| **Phase** | e.g. Phase 3A / Reference Drive 001 |
| **Status** | IN_PROGRESS / DONE / BLOCKED |
| **Author** | Agent or human |
| **Software SHA** | `________` |
| **Manifest version** | e.g. 1.1.0 |
| **Model version** | If applicable |

---

## Question

What specific question does this experiment answer?

---

## Hypothesis

What outcome was expected? (Nullable — exploratory experiments may have none.)

---

## Authority

- Master Plan section: ___
- Phase gate: ___
- Governance sections applicable: ___

---

## Vehicle / Profile / Powertrain

| Field | Value |
|-------|-------|
| Vehicle ID | |
| Label (internal) | |
| Provider | |
| Connection profile | |
| Powertrain profile | |
| DIMO token reference | |

---

## Session / Dataset

| Field | Value |
|-------|-------|
| Capture session ID | |
| Dataset ID | |
| Time range (UTC) | |
| Raw evidence state | LIVE_DB / SEALED_EXPORT_AVAILABLE / … |
| Storage location | |
| Checksum | |

---

## Software / Manifest / Model Versions

| Component | Version |
|-----------|---------|
| Repository SHA | |
| Manifest | |
| Recorder / module | |
| Algorithm / detector | |

---

## Method

Describe procedure, acquisition surfaces, filters, exclusions, and controls.

---

## Raw Evidence

Link to session rows, export location, or companion machine-readable files. Do not paste secrets.

---

## Metrics

Summarize key numbers. Prefer companion JSON/CSV at:

`docs/audits/data/<topic>-metrics-YYYY-MM-DD.json`

---

## Results

**Facts only** — what was observed. Tag evidence maturity per claim.

---

## Contradictions

Record any results that conflict with prior assumptions or other evidence IDs.

---

## Interpretation

Separate inference from confirmed facts.

---

## Limitations

What was not tested, not measured, or scoped out?

---

## Open Questions

Explicit follow-up items.

---

## Decision

| Outcome | Selected |
|---------|----------|
| Accept | ☐ |
| Reject | ☐ |
| Defer | ☐ |
| Requires new experiment | ☐ |

**Rationale:**

---

## Follow-up

Next actions, registry updates, Master Plan updates.

---

## Reproduction

Step-by-step path for a future agent to reproduce or re-analyze.

---

## Evidence Maturity Summary

| Claim | Maturity class |
|-------|----------------|
| | CONFIRMED_FROM_RUNTIME / INFERENCE / … |

---

## Checklist (Definition of Done)

- [ ] Verification completed
- [ ] Evidence stored or durably referenced
- [ ] Evidence class assigned
- [ ] Provenance recorded
- [ ] Limitations recorded
- [ ] Contradictions recorded
- [ ] Open questions recorded
- [ ] Machine-readable metrics where appropriate
- [ ] Reproduction path documented
- [ ] Master Plan updated
- [ ] Registry updated
