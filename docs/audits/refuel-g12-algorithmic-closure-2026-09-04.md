# G1.2 Algorithmic closure — KS MX REFUEL 2026-09-04

**Supersedes design prototypes from G1.1 with specification-grade executable modules.**  
**No production runtime wiring (G2 deferred).**

---

## Readiness semantics (separated)

| Gate | Status |
|------|--------|
| **ALGORITHMIC_CLOSURE** | **YES** |
| **IMPLEMENTATION_READY** | **YES** |
| **PRODUCTION_DEPLOYMENT_READY** | **NO** |

`PRODUCTION_DEPLOYMENT_READY=NO` because: G2 runtime not implemented; no positive MATCHED persisted E2E; leader election gap on N=2; fleet-wide tolerance corpus limited.

---

## Part A — Coordinate selector

**Module:** `backend/src/modules/vehicle-intelligence/fuel-stations/enrichment/physical-refuel-coordinate.selector.ts`

**Policy:** `physical_refuel_forecourt_dwell_medoid_v2`

### Algorithm (no station ground truth in input)

1. Bounded lookback from `fuelRiseOnsetAt` (default 30 min, or `eventStartAt` if later).
2. Detect low-speed clusters (≤10 km/h per G1.1 forecourt evidence; null speed bridged when GPS drift ≤15 m).
3. Rank by **temporal adjacency to rise onset** (smallest `rise − clusterEnd`), not global longest dwell.
4. Reject clusters with spread >80 m or ending >15 min before rise.
5. Medoid coordinate + provenance contract (`SELECTED` / `NO_DWELL_FOUND` / `AMBIGUOUS` / `INSUFFICIENT_EVIDENCE`).

### Sept04 acceptance (test assertion only uses Esso ground truth)

| Metric | Value |
|--------|-------|
| Selector status | SELECTED |
| Coordinate | ~51.321263, 9.514558 (medoid) |
| Distance to Esso (test assertion) | ~11–15 m |
| Temporal offset to rise | ~15 s |
| Earlier 1.6 km dwell | Not selected (ranked lower) |

**Fixture:** `backend/src/modules/dimo/fixtures/ks-mx-2024-sept04-route-fuel.fixture.json` (207 route + 41 fuel samples, read-only VPS extract).

---

## Part B — Identity matcher hardening

**Module:** `backend/src/modules/vehicle-intelligence/energy-events/physical-refuel-identity.matcher.ts`

### Tri-state classification

- `SAME_PHYSICAL_REFUEL`
- `DISTINCT_PHYSICAL_REFUEL`
- `INSUFFICIENT_EVIDENCE` (fail-closed)

### Canonical precedence

1. Transition completeness score (most complete consistent superset)
2. Suffix-compatible transition containment
3. Longer detection envelope (`durationSeconds`)
4. Lexicographic `id` tie-break

**Sept04:** A (7→28 L) canonical over B (21→28 L); symmetric under argument reversal.

**Aug29 pair:** `INSUFFICIENT_EVIDENCE` (missing terminal fuel endpoints — no false positive merge).

### Tests

| Suite | Count |
|-------|-------|
| `physical-refuel-coordinate.selector.spec.ts` | 7 |
| `physical-refuel-identity.matcher.spec.ts` | 13 |
| `physical-refuel-reconciliation.design.spec.ts` | 6 |
| `refuel-sibling-reconciliation.sept04-2026.spec.ts` | 5 |
| **Total G1.2** | **31** |

---

## Part C — Arrival order / G2 boundary

**Module:** `physical-refuel-reconciliation.design.ts`

Pure functions prove A-first, B-first, and same-batch reconciliation yield identical canonical + enrichment eligibility.

**G2 transaction boundary (design only):**

```
BEGIN → advisory_xact_lock(scopeKey) → load siblings → classify → choose canonical → persist
COMMIT → enqueue_station_enrichment(canonical_only)
```

---

## Part D — Evidence integrity

`G11_HF_CLOSURE_KS_MX_2026-09-04.json` timing fields corrected to distinguish provider observation vs detector boundaries (see commit).

---

## Part G — Leader election

`SCHEDULER_LEADER_ELECTION_ENABLED=null` on production N=2 — **independent gap**, not Sept04 duplicate root cause.

---

## First G2 implementation task

Wire `derivePhysicalRefuelCoordinate` + `classifyPhysicalRefuelSibling` / `chooseCanonicalRefuel` into `energy-events.service.ts` **before** enrichment enqueue, using advisory transaction lock on `buildPhysicalRefuelScopeKey`, without mutating historical production rows.

---

## Validators

```bash
node architecture/tankstellenerkennung/scripts/validate-graph.mjs
node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs
```
