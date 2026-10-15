# Vehicle Signal Intelligence — Product governance (PR checklist)

| Field | Value |
|-------|-------|
| **Applies to** | All future VSI substantive PRs |
| **Established** | 2026-10-15 |

---

## Required PR identification

Every VSI implementation PR description (or linked architecture note) must include:

| Field | Requirement |
|-------|-------------|
| **Product objective** | One sentence tied to charter capability (1–9) |
| **Roadmap phase** | P0–P7 (one primary; secondary optional) |
| **Evidence reused** | Links to prior PRs, forensics, GT ids, Production read-only audits |
| **Measurable improvement** | Metric or test outcome (e.g. profiles materialized, UNKNOWN attribution fixed) |
| **New provider-call cost** | `NONE` or explicit DIMO HTTP / poll delta with mitigation |
| **Signal provenance** | Per-axis: catalog / VLS / poll / limitation |
| **Cross-workstream impact** | VO, VDC, DIMO, Battery, DI, APDS — or `NONE` |
| **Tests & acceptance** | Commands + disposable DB gates if schema touched |

---

## Prohibited drift patterns

- Treating `UNKNOWN` as `UNSUPPORTED` or `NOT_LISTED` without positive catalog proof.
- Attributing vehicle-scoped preflight to a specific link under multi active link ambiguity.
- Enabling VSI03 capture, strict-advance read, or APDS shadow flags inside unrelated feature PRs.
- Adding DIMO HTTP to snapshot materialization hot paths without ADR + rate governance.
- Using poll SUCCESS as proof of empirical observation or strict source advance.
- Claiming **DEPLOYED** or **PRODUCTION_VALIDATED** from merge alone.

---

## VSI-03 Capture stance

- P2C capture remains **optional forensic infrastructure**, default **OFF**.
- Capture PRs must state they are **not** the VSI product profile objective.
- Profile product loop = P0+P1+ (`vehicle_signal_capability_profiles`).

---

## Architecture updates (same PR)

When behavior or contracts change:

1. Update [`CURRENT_STATE.md`](CURRENT_STATE.md) and append [`research/CHANGE_LEDGER.md`](research/CHANGE_LEDGER.md).
2. Update [`VSI_MASTER_ROADMAP.md`](VSI_MASTER_ROADMAP.md) phase status if a gate is met.
3. Cross-module changes: update **owning** authorities (VO, VDC, Battery, DI, DIMO) in same workstream.
4. Run `bash architecture/scripts/validate-module-registry.sh`.

---

## Reviewer checklist

- [ ] Roadmap phase appropriate; non-goals respected
- [ ] Provenance explicit for declared and empirical axes
- [ ] No silent APDS / capture / production flag activation
- [ ] Postgres disposable CI updated if persistence changed
- [ ] MERGED vs DEPLOYED language correct in docs
