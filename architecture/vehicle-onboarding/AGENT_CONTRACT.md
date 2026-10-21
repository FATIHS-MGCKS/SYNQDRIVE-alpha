# Vehicle Onboarding — Agent Contract

## Before substantive work

1. Read [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md) — locate **Vehicle Onboarding / Vehicle Registry** row.
2. Read this authority’s [CURRENT_STATE.md](./CURRENT_STATE.md) and [governance/AUTHORITY_BOUNDARIES.md](./governance/AUTHORITY_BOUNDARIES.md).
3. Registry status is **`AUDIT_IN_PROGRESS`** — do not treat as complete authority.
4. Cross-read neighbors when touching provider links: [DIMO Integration](../dimo-integration/), [Vehicle & Device Connectivity](../vehicle-device-connectivity/).

## Rules

- **Do not** implement onboarding redesign without explicit VO-1+ authorization.
- **Do not** duplicate VDC-GAP-013 analysis — cross-reference VDC authority.
- **Preserve** REUSE-FIRST models listed in CHANGE_LEDGER VO-0B.
- **Record** contradictions and gaps in `contradictions/` — do not silently normalize conflicting lifecycles.
- **Separate** onboarding baseline facts from Vehicle Health / Battery Intelligence conclusions.
- Production changes to onboarding behavior require authority update in the **same PR**.

## Validation before merge

```bash
bash architecture/scripts/validate-module-registry.sh
bash architecture/vehicle-onboarding/scripts/validate-graph.sh
```
