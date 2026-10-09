# VO5C-P2B4-0 — Platform prune emergency containment

| Field | Value |
|-------|-------|
| **Slice** | VO5C-P2B4-0 |
| **Status** | IMPLEMENTED (draft PR) |
| **Audit predecessor** | VO5C-P2B4 prune security audit — **FAIL** |
| **Security posture** | `SECURITY_REMEDIATION_IN_PROGRESS` |
| **Last updated** | 2026-10-08 |

## Disabled entry points

| Path | Behavior |
|------|----------|
| `POST /admin/prune` | Route **registered**; guards preserved (`MASTER_ADMIN`, `MASTER_PLATFORM_SETTINGS` MFA, `BREAK_GLASS` step-up); handler always **409** `PLATFORM_PRUNE_DISABLED` / `CONTACT_PLATFORM_SECURITY_OPERATOR` |
| `PlatformAdminService.pruneMasterData()` | Throws same contract; **no** Prisma/billing/provider/outbox |
| `npm run prisma:prune` / `prisma/prune-master-data.ts` | Exits **1** with JSON `PLATFORM_PRUNE_DISABLED` **before** `PrismaClient` or DB connection |

## No environment override

No `PRUNE_ENABLED`, `FORCE_PRUNE`, or `NODE_ENV` bypass. Recovery-grade replacement prune is **not implemented**.

## Intentional breaking change

Authorized operators previously able to wipe platform master data via HTTP or CLI now receive **409** (HTTP) or nonzero exit (CLI).

## Rollback risk

Re-enabling legacy destructive prune is a **critical security regression** (mass deletion, CLI bypass of HTTP controls).

## Historical mutation inventory (non-executable reference for P2B4 redesign)

Pre-P2B4-0 HTTP and CLI performed sequential `deleteMany` / `updateMany` on (order mattered): `booking`, `customer`, `prospect`, `vehicleLatestState`, `vehiclePositionUpdate`, `analyticsCache`, `dimoPollLog`, `vehicleEnrichmentJob`, `vehicleServiceEvent`, `vehicleTireTreadMeasurement`, `vehicleTireSetup`, `vehicleBrakeReferenceSpec`, `vehicleBatterySpec`, `vehicle`, `station`, `organizationIntegration`, `organizationProduct`, billing invoice/usage/override/payment tables, `billingSubscription`, `organizationMembership`, `supportTicket`, `organization`, non–`MASTER_ADMIN` `user`, `dimoVehicle`. Activity/billing audit logs were **not** deleted (Phase 2A.7). No single transaction; incomplete schema coverage vs current Prisma models.

## Deployment

**Not deployed.** Production MFA/prune configuration **not verified** in this slice.

## Unchanged

Canonical P1 offboard, P2B1 deregister 409, P2B2 frontend retirement, P2B3 vehicle DELETE 409, normal billing/registry flows.
