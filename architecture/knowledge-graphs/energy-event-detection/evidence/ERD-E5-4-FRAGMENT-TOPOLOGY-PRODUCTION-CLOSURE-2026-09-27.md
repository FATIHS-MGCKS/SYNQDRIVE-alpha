# ERD E5.4 — Fragment topology + energy semantic Production closure (read-only)

**Status:** ARCHITECTURE_EVIDENCE (read-only audit; no Production mutation)  
**Production SHA:** `1b5a7f6cd91d175e82f9ee0df111d4df015b3555`  
**Release:** `20260926234014_v4994`  
**Graph IDs:** EED-EV-0091 (closure audit), EED-EV-0092 (dual ADR acceptance)  
**Workstream:** `ERD_E5_4_FRAGMENT_AND_ENERGY_SEMANTIC_CLOSURE` → ADR `ERD_E5_4_COMPARATOR_TOPOLOGY_AND_RECHARGE_ENERGY_CONTRACT_ADR`

## Scope

Read-only Production shadow dry-run and row-level forensics on audited recharge windows for org `faa710c9-6d91-4079-a7d5-91fdccdec14a`, vehicle `68868291-5478-42cd-b0c4-cc77b2a78e21` (same cohort as prior E5.4 gates).

## Topology closure result

**ERD_E5_4_FRAGMENT_AND_ENERGY_SEMANTIC_CLOSURE_RESULT=PASS**

| Finding | Value |
|---------|-------|
| Canonical native sessions | 6 |
| Exact `EXACT_NATIVE_DIMO_ID` pairs | 6 |
| Authority-critical mismatches | 0 |
| SOC mismatches | 0 |
| Location mismatches | 0 |
| Energy mismatches (primary pairs) | 6 (stored vs added semantic gap — not mapping defect) |
| Unique legacy rows (audited windows) | 70 |
| Exact-anchor legacy rows | 6 |
| Contained historical fragments | 64 |
| Topology | `ONE_CANONICAL_MULTI_LEGACY_FRAGMENTS` |
| True orphan legacy physical clusters | 0 |

## Comparator gap (pre-ADR implementation)

After `EXACT_NATIVE_DIMO_ID` consumes the canonical session’s primary legacy anchor, **64** contained siblings are emitted as **`LEGACY_ONLY`**, inflating `SETTLED_PARITY_DENOMINATOR` to **70** and forcing **`SETTLED_PARITY_RATE=0`**.

Pure-function repro: 1 canonical + exact legacy + overlapping contained sibling → paired primary + sibling **`LEGACY_ONLY`** (`MULTIPLICITY_INFORMATION_LOST_AFTER_EXACT_PAIRING=YES`).

## Energy semantic closure (six sessions)

| Metric | kWh |
|--------|-----|
| `ENERGY_ADDED_TOTAL_6` | 64.3599985614419 |
| `ENERGY_STORED_DELTA_TOTAL_6` | 48.75999891012907 |
| `SEMANTIC_GAP_TOTAL` | 15.599999651312828 |

All six energy mismatches align with **Option C** (stored delta vs charging-added delta).

## Corrected physical counts (reporting contract)

| Field | Value |
|-------|-------|
| `legacyRowCount` | 70 |
| `legacyPhysicalClusterCount` | 6 |
| `canonicalPhysicalEpisodeCount` | 6 |
| `pairedPhysicalEpisodeCount` | 6 |
| `legacyFragmentRowCount` | 64 |
| `trueLegacyOnlyPhysicalClusterCount` | 0 |

## Does NOT prove

- Comparator topology fix is implemented (ADR only)
- Canonical mapper stored-energy alignment is deployed
- Shadow parity persistence enabled
- Canonical write cutover readiness

## ADR outputs

- `decisions/ERD-E5-4A-SHADOW-PARITY-PHYSICAL-EPISODE-TOPOLOGY-2026-09-27.md` (`EED-DEC-ERD-002`)
- `decisions/ERD-RECHARGE-ENERGY-PRODUCT-SEMANTICS-2026-09-27.md` (`EED-DEC-ERD-003`)
