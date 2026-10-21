# DTC / Error Codes — audit manifest

| Field | Value |
|-------|-------|
| Registry module | DTC / Error Codes |
| Registry coverage | `AUDIT_IN_PROGRESS` (from `NOT_STARTED`, 2026-10-15) |
| Authority path | `architecture/dtc-error-codes/` |
| Production baseline SHA (verified read-only) | `3a7cc0cc34ab5e79781ae667b8b6c68637a70c8f` |
| Production audit | `VERIFIED_READ_ONLY` — VPS `srv1374778.hstgr.cloud`, 2026-10-15 |

## Entry documents

- [`CURRENT_STATE.md`](CURRENT_STATE.md)
- [`evidence/PRODUCTION_BASELINE_2026-10-15.md`](evidence/PRODUCTION_BASELINE_2026-10-15.md)
- [`research/CHANGE_LEDGER.md`](research/CHANGE_LEDGER.md)
- Supporting contract: [`docs/dtc-01a-safety-contract.md`](../../docs/dtc-01a-safety-contract.md)

## Boundaries (owner modules)

| Concern | Owner |
|---------|--------|
| DTC episode lifecycle, clears, occurrence semantics (01A+) | **DTC** |
| Signal capability profiles | **VSI** |
| Connectivity / poll cadence | **VDC** |
| APDS polling decisions | **APDS** |

## Promotion gate

`AUTHORITY_ACTIVE` **not** claimed — Production read-only baseline captured; 01F cohort/downstream work in draft PR pending owner pilot authorization.
