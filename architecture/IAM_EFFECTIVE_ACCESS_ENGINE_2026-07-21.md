# IAM — Canonical EffectiveAccessEngine (2026-07-21)

## Changes

- `EffectiveAccessEngine` — pure domain service computing module permissions, station scope, privileged capabilities, and decision reasons from a single input contract
- `EffectiveAccessLoaderService` — DB adapter loading membership + organization role template, then delegating to the engine
- `PermissionsGuard`, `assertMembershipPermission`, `StationAccessService.resolve`, and `OrganizationRoleService.permissionPreview` wired to the engine
- `iam-effective-access.policy.ts` delegates to the engine for regression harness parity

## Architektur

### Single source of truth

```
EffectiveAccessLoaderService (DB)
  → computeEffectiveAccess(input)   [pure domain]
  → EffectiveAccessResult
       ├─ PermissionsGuard / assertMembershipPermission
       ├─ OrganizationRoleService.permissionPreview
       └─ StationAccessService.resolve (station axis)
```

### Input contract

| Field | Source |
|-------|--------|
| `platformRole` | JWT / actor |
| `serviceAccount` | service context flag |
| `membership` | `OrganizationMembership` (role, status, permissions, stationScope, stationIds, fieldAgentAccess) |
| `organizationRole` | linked `OrganizationRole` template |
| `directPermissionOverrides` | explicit override layer (optional) |
| `resourceContext` | orgId, stationId, `stationsScopeV2Enabled` |

### Output contract

`effectiveRole`, `roleSource`, `roleVersion`, `permissionVersion`, `inheritedPermissions`, `directOverrides`, `effectivePermissions`, `stationScope`, `effectiveStationIds`, `privilegedCapabilities`, `deniedCapabilities`, `decisionReasons`, `calculatedAt`

### Permission semantics (central)

- `manage` → implies `write` and `read`
- `write` → implies `read`
- unknown module keys → deny (`UNKNOWN_CONFIGURATION`)
- missing permission value → deny
- no wildcards; default deny for new modules

### Decision types

`ALLOW` | `DENY` | `NOT_APPLICABLE` | `UNKNOWN_CONFIGURATION` — unknown never allows.

### Admin bypass (central — do not duplicate in controllers)

1. `MASTER_ADMIN` → all modules, all stations
2. `SERVICE_ACCOUNT` (flagged context) → same module/station bypass
3. ACTIVE `ORG_ADMIN` membership → all modules in org, station bypass

### Station scope (integrated)

Resolved in the same engine pass:

| Mode | Behavior |
|------|----------|
| `ALL` | bypass station filter |
| `SELECTED` | `stationIds` JSON allow-list |
| `SINGLE` | `stationScope` as single station id (SUB_ADMIN/WORKER) |
| `NONE` | no stations (inactive membership) |

Feature flag `stationsScopeV2Enabled` off → station bypass (legacy behavior).

### Version snapshots

`permissionVersion` and `roleVersion` reuse `refresh-session-binding.policy` hash helpers for session invalidation alignment.

## Consumers

- `PermissionsGuard` — module permission enforcement
- `assertMembershipPermission` — service-layer checks
- `StationAccessService.resolve` — station visibility
- `OrganizationRoleService.permissionPreview` — includes `effectiveAccess` snapshot
- IAM regression harness — `computeEffectiveModuleAccess` wrapper

## Files

- `backend/src/modules/users/policies/effective-access-engine.ts`
- `backend/src/modules/users/policies/effective-access-engine.types.ts`
- `backend/src/shared/auth/effective-access-loader.service.ts`
