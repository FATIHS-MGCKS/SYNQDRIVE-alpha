# VDC RB-019 Phase 2 P2.2 — Shadow + Authority State-Machine Infrastructure

| Field | Value |
|-------|-------|
| **Date** | 2026-09-13 |
| **Authority** | Vehicle & Device Connectivity (`AUDIT_IN_PROGRESS`) |
| **Decision** | VDC-DEC-013 (Phase 2 scope) |
| **Backlog** | VDC-RB-019 Phase 2 — P2.2 |
| **Epistemic** | **P2_2_IMPLEMENTATION_PRESENT** — unit tests proven; **not** production validated |
| **Baseline main** | post PR #1632 merge |

## Explicit non-claims

- PRODUCTION_VALIDATED
- PHYSICAL authority cutover executed
- P2.3 STATEFUL_SHADOW sequence proof
- Live webhook/snapshot writer wiring
- Side-effect execution
- Schema migration (uses existing P2.1 latch)

## Implemented components

### Authority state machine (pure)

- `physical-state-authority.state-machine.ts`
- Canonical gates: `LEGACY` | `PHYSICAL`
- Forward-only transition validator (`LEGACY → PHYSICAL` allowed; `PHYSICAL → LEGACY` forbidden)
- Binding replacement inherits authority mode (no silent reset)

### Effective runtime policy resolver

- `connectivity-physical-state-runtime.config.ts`
- Master: `CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED`
- Sub-flags (master-gated, default OFF):
  - `CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED`
  - `CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED`
  - `CONNECTIVITY_PHYSICAL_STATE_AUTHORITY_CUTOVER_ENABLED`
  - `CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED`
- Flags control capabilities **around** latched `authorityMode` — they do **not** define authority mode

### Shadow comparator (compare-only)

- `physical-state-shadow-comparator.ts` — pure, no persistence side effects
- Canonical classification taxonomy per Phase-2 audit §14
- GT-R1 `EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT` requires `provenExpectedFix=true` (independent proof bit); legacy reason text is diagnostic metadata only
- Classification precedence: BOTH_ACCEPT state divergence before timestamp divergence; BOTH_REJECT differing reasons → MATCH
- Canonical physical effective state: `physicalDecision.effectiveState` only (no duplicate top-level input source)

### Observability

- Prometheus counters (low-cardinality labels only):
  - `synqdrive_connectivity_physical_state_shadow_evaluation_total`
  - `synqdrive_connectivity_physical_state_shadow_classification_total`
  - `synqdrive_connectivity_physical_state_shadow_correctness_blocker_total`
- `PhysicalStateShadowObservabilityService` — structured logs; per-event ids in logs only

## Wiring status

| Surface | Status |
|---------|--------|
| Live webhook writer | **NO** |
| Snapshot writer | **NO** |
| Projection mutation from new runtime call sites | **NO** |
| Authority cutover execution | **NO** |
| Feature flags enabled in production | **NO** (all default OFF) |

## Validation

- Unit tests A–V (authority machine, flag resolver, shadow taxonomy, observability label cardinality)
- P2.1 PG suites unchanged (no schema change)
- Module registry + VDC graph validators

## Next phase

P2.3: evidence writers + STATEFUL_SHADOW GT-R1 sequence proof (requires P2.2 exit).
