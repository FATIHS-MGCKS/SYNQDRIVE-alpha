# One Auto provider P1 — change record

- **Date:** 2026-10-31
- **Scope:** Backend-only Master Admin provider foundation (`backend/src/modules/oneauto-provider/`).
- **Non-effects:** Manual vehicle specifications, Fetch AI Specs, AI empty-field merge, ZB-I upload, vehicle identity, service history, brake/tire/battery intelligence, ConnectedVehiclesHub navigation.
- **Evidence:** `backend/src/modules/oneauto-provider/evidence/VERIFIED_PROVIDER_CONTRACTS.md`

## P2.5B — OpenAPI evidence alignment (2026-11-01)

- **Evidence file:** `docs/provider-evidence/oneauto-six-sku-openapi-evidence.json` (OpenAPI 3.0.3).
- **Documented path corrections:** `/v2` suffix on four `oneauto/*` SKUs; trailing slash on `ezyvin/vinlookup/`; Recall Check → `oneauto/recallcheckfromvin/v2` with `SYNC_ONLY` documented async.
- **Non-effects:** `ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS` remains empty; no outbound API calls; no production activation.
- **Tests:** `oneauto-p25b-openapi-contract-alignment.spec.ts` (offline regression against committed OpenAPI JSON).
