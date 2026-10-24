# Tires Health — Decision Register

Scientific record for canonical decisions. Graph nodes: `TIRE-DEC-*` (decisions) and `TIRE-REJECT-*` (rejected approaches). Field semantics per [AGENT_CONTRACT.md](../AGENT_CONTRACT.md). Statuses here must match `graph/nodes.yaml` (validated by `scripts/validate-graph.sh`).

All decisions in this bootstrap are **owner decisions recorded 2026-10-24** for the Tire Intelligence P1 workstream. None is implemented in code by this PR; therefore none is above `PROPOSED`.

---

## TIRE-DEC-PRESERVE-EXISTING-STACK-001 — Preserve existing tire management, lifecycle, ledger, API, UI and safety mechanisms

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | Tire module productive since July 2026 remediation; no architecture authority; registry `NOT_STARTED` |
| **WHY** | Production behaviour is stable (hourly recalculation, ledger attribution, alerts, rental policy); the owner wants a controlled evolution, not a rebuild |
| **CHANGE** | Governance only: authority bootstrap under `architecture/tires/`; no runtime change |
| **EXPECTED_EFFECT** | Future agents treat lifecycle, ledger, API, UI and rental policy as frozen boundaries |
| **VALIDATION** | `validate-graph.sh`, `validate-module-registry.sh`; no code diff in PR |
| **OBSERVED_EFFECT** | UNKNOWN (documentation only) |
| **NON_EFFECTS** | Does not fix sparse ground truth; does not change any V2 output |
| **TRADEOFFS** | Known V2 weaknesses persist until replacement |
| **REMAINING_GAPS** | TIRE-GAP-V2-GROUND-TRUTH-SPARSE-001, TIRE-GAP-ACTIVE-SETUP-COUNT-RECONCILE-001 |
| **EVIDENCE** | TIRE-EVID-PROD-BASELINE-2026-10-24-001, TIRE-EVID-CODE-WEAR-MODEL-V2-001 |

---

## TIRE-DEC-V2-FROZEN-TO-BE-SUPERSEDED-001 — Tire Wear Model V2 is obsolete as future calculation basis but remains unchanged until controlled replacement

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | `tire-wear-v2` multiplicative factor model fed by Driving-Impact aggregates (HF-derived stress scores, road shares) |
| **WHY** | Behaviour inputs are coarse 0–100 aggregates over a rolling window derived from a different evidence chain than the new DS4 motion engine; the owner designates DS4 as the future driving-load basis |
| **CHANGE** | Decision recorded; V2 formula, config (`tire-health.config.ts`) and version constant stay untouched; V2 is **not** marked SUPERSEDED |
| **EXPECTED_EFFECT** | No agent modifies V2 weights or inputs; successor enters via shadow comparison only |
| **VALIDATION** | Regression matrix spec continues to guard V2 semantics (TIRE-TEST-REGRESSION-MATRIX-001) |
| **OBSERVED_EFFECT** | UNKNOWN |
| **NON_EFFECTS** | Does not define the successor formula |
| **TRADEOFFS** | Two models will coexist for a period (shadow + productive) |
| **REMAINING_GAPS** | Successor design, replacement gate criteria |
| **EVIDENCE** | TIRE-EVID-CODE-WEAR-MODEL-V2-001, TIRE-EVID-CODE-DI-IMPACT-FOR-TIRE-001 |

---

## TIRE-DEC-DS4-FUTURE-LOAD-BASIS-SHADOW-ONLY-001 — DS4 Motion Events are the future driving-load basis — shadow only, no productive influence

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | No tire consumer of DS4 motion events exists; DS4 runs as EXP-021 shadow for allowlisted vehicles |
| **WHY** | Per-manoeuvre acceleration/deceleration events with quality labels are closer to physical tire load than per-100 km counts; owner decision |
| **CHANGE** | Target architecture documented in [`integration/DS4_MOTION_INTEGRATION_AUDIT.md`](../integration/DS4_MOTION_INTEGRATION_AUDIT.md); no implementation |
| **EXPECTED_EFFECT** | First implementation PR builds a read-only, org-scoped shadow adapter + shadow store; productive status/alerts/snapshots/rental gate remain unaffected |
| **VALIDATION** | Future: tests proving productive path reads no shadow table (TIRE-INV-SHADOW-NO-PRODUCTIVE-INFLUENCE-001) |
| **OBSERVED_EFFECT** | UNKNOWN |
| **NON_EFFECTS** | Does not validate DS4 intensities physically; does not change DS4 flags or allowlists |
| **TRADEOFFS** | Shadow coverage limited to allowlisted vehicles (4 of 6) |
| **REMAINING_GAPS** | TIRE-GAP-DS4-PERSISTED-INTENSITY-FIELDS-001, TIRE-GAP-DS4-COVERAGE-ALLOWLIST-001, TIRE-GAP-DS4-OUT-OF-SAMPLE-VALIDITY-001 |
| **EVIDENCE** | TIRE-EVID-PROD-DS4-SHADOW-RUNS-2026-10-24-001, TIRE-EVID-DS4-FABLE-REVIEW-2026-10-24-001 |

---

## TIRE-DEC-DS4-CONSERVATIVE-ADMISSION-POLICY-001 — Conservative DS4 event admission policy for tire inputs (proposed, not implemented)

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | DS4 payload contract excludes only `ARTEFACT_SUSPECT` from accepted counts; no downstream consumer policy |
| **WHY** | Fable B3: numeric intensities are attenuated and not physically validated; B7: quality not visible downstream; OK/DEGRADED/LIMITED/ARTEFACT_SUSPECT must be treated separately |
| **CHANGE** | Policy text: OK → admissible; DEGRADED → counts/durations only, intensity UNRATED; LIMITED → coverage reporting only; ARTEFACT_SUSPECT → excluded. Intensity only from Δv/duration mean; never `peakAccel1sMps2`. Mixed/missing speed authority or payload → neutral fallback |
| **EXPECTED_EFFECT** | Shadow inputs are reproducible and conservative; no over-penalisation from artefacts |
| **VALIDATION** | Future unit tests on the adapter; not in this PR |
| **OBSERVED_EFFECT** | UNKNOWN |
| **NON_EFFECTS** | Does not change detector thresholds or P1/P2 behaviour |
| **TRADEOFFS** | Lower effective event volume (OK only for intensity: 394 of 449 in production sample) |
| **REMAINING_GAPS** | Class boundaries for ordinal intensity are undefined (no speculative weights) |
| **EVIDENCE** | TIRE-EVID-DS4-FABLE-REVIEW-2026-10-24-001, TIRE-EVID-CODE-DS4-EVENT-TYPES-001 |

---

## TIRE-DEC-DS4-ASYNC-RETRY-CONSUMER-001 — DS4 → tire shadow via async retryable consumer (not synchronous with trip finalization)

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | P1 draft text suggested invoking the adapter immediately after `attributeTireUsageOnCanonicalFinalization` |
| **WHY** | DS4 is post-trip retrospective with outbox retries; trip finalization and ledger write must not block on shadow latency; missing or in-flight DS4 runs must be retried, not dropped |
| **CHANGE** | Target architecture: ledger existence enqueues a tire-side BullMQ job; processor calls `readForTrip`; `PENDING` / no `SUCCEEDED` yet → backoff requeue; persist only on `SUCCEEDED`/`SUCCEEDED_EMPTY` with DS4 run/input identity (§4.1 in `integration/DS4_MOTION_INTEGRATION_AUDIT.md`) |
| **EXPECTED_EFFECT** | No synchronous DS4 dependency on the trip FSM; tire shadow rows appear after DS4 succeeds; replays produce additional versioned rows |
| **VALIDATION** | Future: processor tests for PENDING→retry, SUCCEEDED persist, idempotent upsert on `(ledgerId, runId, adapterVersion)`; finalization path has no `readForTrip` call |
| **OBSERVED_EFFECT** | UNKNOWN |
| **NON_EFFECTS** | Does not change DS4 worker/outbox; does not change ledger attribution timing |
| **TRADEOFFS** | Extra queue operational surface; catch-up scan may be needed for historical trips |
| **REMAINING_GAPS** | Exact give-up policy after max attempts (document in implementation PR) |
| **EVIDENCE** | TIRE-EVID-CODE-DS4-PERSISTED-EVENT-ROW-001 |

---

## TIRE-DEC-NO-DOUBLE-COUNTING-001 — One acceleration/braking evidence source per factor — no double counting

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | V2 behaviour factor, heat stress and interaction penalty all consume HF-derived DI stress scores; ledger copies deprecated harsh counters from the same chain |
| **WHY** | Adding DS4 events to any existing factor would count the same manoeuvres twice through two pipelines |
| **CHANGE** | Rule: a factor is fed by exactly one source; shadow comparison presents DI and DS4 side by side with `source` + `version` columns |
| **EXPECTED_EFFECT** | Comparable, attributable shadow outputs |
| **VALIDATION** | Future: adapter output schema includes source/version; review checklist in AGENT_CONTRACT |
| **OBSERVED_EFFECT** | UNKNOWN |
| **NON_EFFECTS** | Does not remove harsh counters from the ledger |
| **TRADEOFFS** | Shadow model cannot reuse V2 behaviour factor as a baseline component |
| **REMAINING_GAPS** | TIRE-CONTRA-TWO-ACCEL-BRAKE-SOURCES-001 |
| **EVIDENCE** | TIRE-EVID-CODE-DI-IMPACT-FOR-TIRE-001, TIRE-EVID-CODE-DS4-EVENT-TYPES-001 |

---

## TIRE-REJECT-IMMEDIATE-V2-REPLACEMENT-001 — Replace V2 immediately with a DS4-based wear formula

| Field | Value |
|-------|-------|
| **STATUS** | REJECTED |
| **BEFORE** | Option considered during P1 scoping |
| **WHY** | Owner: no new wear formula in this PR; DS4 intensities not physically validated (B3); 4 of 6 vehicles covered; ground truth sparse |
| **CHANGE** | None |
| **EXPECTED_EFFECT** | — |
| **VALIDATION** | — |
| **OBSERVED_EFFECT** | — |
| **NON_EFFECTS** | — |
| **TRADEOFFS** | Slower path to a better model |
| **REMAINING_GAPS** | — |
| **EVIDENCE** | TIRE-EVID-DS4-FABLE-REVIEW-2026-10-24-001 |

---

## TIRE-REJECT-DS4-INTO-V2-BEHAVIOR-FACTOR-001 — Feed DS4 events into the existing V2 behavior factor

| Field | Value |
|-------|-------|
| **STATUS** | REJECTED |
| **BEFORE** | Smallest-looking integration: map DS4 events into `computeBehaviorFactor` |
| **WHY** | Modifies a frozen productive formula; double counts with HF-derived scores already in behaviour factor, heat stress and interaction penalty |
| **CHANGE** | None |
| **EXPECTED_EFFECT** | — |
| **VALIDATION** | — |
| **OBSERVED_EFFECT** | — |
| **NON_EFFECTS** | — |
| **TRADEOFFS** | — |
| **REMAINING_GAPS** | — |
| **EVIDENCE** | TIRE-EVID-CODE-WEAR-MODEL-V2-001, TIRE-EVID-CODE-DI-IMPACT-FOR-TIRE-001 |
