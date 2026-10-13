# VO-SIG-01 — Connection identity audit (2026-10-13)

| Field | Value |
|-------|-------|
| Registry module | Vehicle Onboarding / Vehicle Registry (`AUDIT_IN_PROGRESS`) |
| Production read-only | VPS `srv1374778` via `sudo` + Prisma inventory script |
| Code anchor | `cursor/vo-sig-01-connection-identity-dafe` |

## Confirmed code findings

| ID | Finding | Status |
|----|---------|--------|
| A | `Vehicle.hardwareType` defaults `UNKNOWN`; VO-3 activation does not persist hardware classification | **CONFIRMED** — `insertActivatedVehicleRow` does not set `hardwareType` |
| B | HM activation `vehicleDataSourceLink.create` omitted `provider` (DB default `UNKNOWN`) | **CONFIRMED** — fixed in VO-SIG-01 PR |
| C | Readiness validated source sets but lacked explicit connection modality gate | **CONFIRMED** — `VO-RDY-CONN-001` added |

## Authoritative classifications elsewhere

| System | Role |
|--------|------|
| `resolveTelemetrySourceFamily(DimoVehicle.rawJson)` | Device family for telemetry semantics — **not** onboarding connection modality |
| `Vehicle.hardwareType` | Driving Intelligence event routing (`LTE_R1` vs `SMART5`) — **must not** be used as generic hardware/software flag |
| `VehicleDataSourceLink` | Provider-neutral binding with `provider`, `sourceType`, `sourceSubtype` |

## Production inventory snapshot (2026-10-13)

| Metric | Value |
|--------|-------|
| ACTIVE vehicles | 9 |
| ACTIVE source links | 7 |
| `provider=UNKNOWN` on active links | 1 (HM link on multi-provider vehicle) |
| `hardwareType=UNKNOWN` (ACTIVE) | 3 (staging / non-fleet test rows) |
| Modality `UNKNOWN_REQUIRES_REVIEW` (ACTIVE) | 3 |

Full JSON: `/opt/cursor/artifacts/vo-sig-01-production-inventory-vps.json` (agent run).

### Known DIMO tokens (still registered ACTIVE — offboard via VO-5C, do not “reconnect”)

| Token | Vehicle ID | Note |
|-------|------------|------|
| 187336 | `a60c0749-…` | Sold — **MANUAL_REVIEW_OFFBOARD** |
| 190497 | `c43c3b45-…` | Sold — **MANUAL_REVIEW_OFFBOARD** |
| 186946 | `68868291-…` | Tesla — software/OEM modality |
| 187361, 192922, 187784 | pilot LTE_R1 fleet | DIMO links present |

## VSI-03 implication

VSI evidence scope keys must consume **resolved** `VehicleDataSourceLink.id` + explicit `provider` from onboarding — not legacy `Vehicle.dimoVehicleId` alone when links are missing.
