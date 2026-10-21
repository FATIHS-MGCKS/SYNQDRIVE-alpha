# HV R22 P1 — Nest DI boot hotfix (main unblock)

## Incident (CI / deploy gate)

| Field | Value |
|-------|--------|
| Blocked main SHA | `f30be79f864d08386d299f23ca174329505cc988` |
| Workflow | Legal Documents — Production Readiness CI |
| Job | Nest production boot check |
| Symptom | `HvChargingCounterEvidenceModule imports[0] is undefined` |

## Root cause

`HvChargingCounterEvidenceModule` imported `DimoModule` directly while `DimoModule` already uses `forwardRef(() => VehicleIntelligenceModule)` and `VehicleIntelligenceModule` imports `HvChargingCounterEvidenceModule`. During decorator evaluation on the cycle, the direct `DimoModule` reference is still `undefined` (same class of failure as VO-SIG P2 / DTC-02 P1B.6).

## Correction

- `HvChargingCounterEvidenceModule.imports`: `forwardRef(() => DimoModule)` (no new providers; DIMO auth/telemetry exports unchanged).
- Regression: `hv-charging-counter-evidence.nest-di.spec.ts` + wired into `synqdrive-nest-boot-check-ci.sh`.

## Validation

```bash
cd backend && npx prisma generate
npx jest --runTestsByPath src/modules/vehicle-intelligence/battery-health/hv-charging-counter-evidence/hv-charging-counter-evidence.nest-di.spec.ts
npm run test:nest:boot-check:ci   # ephemeral postgres + redis
```
