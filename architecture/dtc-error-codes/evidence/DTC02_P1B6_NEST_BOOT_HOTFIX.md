# DTC-02 P1B.6 — Nest DI boot hotfix (deploy recovery)

## Incident (production)

| Field | Value |
|-------|--------|
| Requested deploy SHA | `e9524c5b9c2ce6288b4b729fe224e4551996c4e6` |
| Production remained | `d43ff450a0831be4072f6b1b5c687b5ac88f0a7b` |
| Promotion | **Not promoted** — `SYNQDRIVE_BOOT_CHECK=1` failed on release candidate |
| DB / replicas | Unchanged; healthy on prior SHA |

## Root cause

`VehicleIntelligenceModule` imported `Dtc02ObservabilityModule` (DTC-02 P2) but **exported** `Dtc02ObservabilityService` directly without registering the service in `VehicleIntelligenceModule.providers`. Nest rejects that export at full `AppModule` bootstrap (same gate as VPS `vps-deploy-release.sh`).

## Correction

- Remove invalid `Dtc02ObservabilityService` from `VehicleIntelligenceModule.exports`.
- Re-export `Dtc02ObservabilityModule` so `DimoWebhookController` and in-module consumers resolve the single provider from the owning module.
- No duplicate `providers` registration; no new module cycles.

## CI gap (why critical gates passed)

GitHub **CI gate (all critical jobs)** on vehicle-detail / legal-documents workflows did not run compiled `SYNQDRIVE_BOOT_CHECK=1`. Typecheck and unit tests do not validate Nest export topology for imported submodules.

## CI protection added

- `backend/scripts/test/synqdrive-nest-boot-check-ci.sh` — metadata regressions + `npm run build` + `SYNQDRIVE_BOOT_CHECK=1 node dist/src/main.js` against ephemeral PostgreSQL/Redis.
- Job `nest-boot-check` wired into both critical CI gates.
- `dtc02-observability.nest-di.spec.ts` — ownership metadata + anti-pattern compile rejection.

## Validation commands

```bash
cd backend && npx prisma generate
npx jest --runTestsByPath src/modules/vehicle-intelligence/dtc/observability/dtc02-observability.nest-di.spec.ts
JWT_SECRET=ci-boot-check-only SYNQDRIVE_BOOT_CHECK=1 node dist/src/main.js
npm run test:nest:boot-check:ci   # requires CI-local postgres + redis
```
