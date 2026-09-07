# R9 DIMO Vehicle-Permission Root-Cause Audit (Read-Only)

| Field | Value |
|-------|-------|
| **Session** | `2026-09-07T22:20:00Z` (UTC) |
| **Mode** | **READ-ONLY** — GET webhook links + Identity GraphQL query + Production PostgreSQL read |
| **Outcome** | **PASS** — root cause identified |
| **Affected tokenId** | **190497** |
| **SynqDrive vehicle ref** | `c43c3b45…` — Volkswagen Golf 2026 (`vehicleRef` prefix only; plate/customer data omitted) |
| **Organization ref** | `faa710c9…` (same org as cohort) |

## Executive summary

The R9 bootstrap **ROLLED_BACK** because **tokenId=190497** is **not privileged for the SynqDrive developer license** in DIMO Identity, while the other five cohort vehicles are. SynqDrive internal `VehicleProviderConsent` rows show **ACTIVE** for all six, but DIMO's Vehicle Triggers subscribe API enforces **developer-license vehicle privilege**, not SynqDrive DB consent alone.

**Current R9 coverage:** **0/6**. **Natural R9 observation is impossible** until privilege is restored for tokenId=190497 (or cohort policy changes).

**NEXT_GATE:** `DIMO_VEHICLE_PERMISSION_RESOLUTION`

## Comparison matrix (sanitized)

| tokenId | Make/Model | Dev-license privileged (Identity API) | SynqDrive consent | Org DIMO auth | Webhook links | Subscribe API |
|--------:|------------|--------------------------------------|-------------------|---------------|---------------|---------------|
| 186946 | Tesla Model 3 2023 | **YES** | ACTIVE | ACTIVE | 3 | allowed |
| 187336 | Mercedes C 63 2018 | **YES** | ACTIVE | ACTIVE | 3 | allowed |
| 187361 | Audi A4 2016 | **YES** | ACTIVE | ACTIVE | 3 | allowed |
| 187784 | VW Arteon 2020 | **YES** | ACTIVE | ACTIVE | 3 | allowed |
| **190497** | **VW Golf 2026** | **NO** | ACTIVE | ACTIVE | 3 (historical) | **403** |
| 192922 | VW Tiguan 2026 | **YES** | ACTIVE | ACTIVE | 2 | allowed |

### Permission difference (190497 vs subscribable five)

| Dimension | Affected (190497) | Subscribable five |
|-----------|-------------------|-------------------|
| `vehicles(filterBy: { privileged: clientId })` (Identity GraphQL) | **absent** (`totalCount=5` for cohort) | **present** |
| Identity owner / mint / device nodes | **null** (not returned in privileged query) | owner `0x…405511`, mint + device metadata present |
| SynqDrive `VehicleProviderConsent` | ACTIVE, scopes `telemetry,location,dtc,snapshot`, granted 2026-07-02 | same pattern |
| SynqDrive `OrgDataAuthorization` (DIMO) | ACTIVE since 2026-06-19 | same |
| `DimoVehicle.connectionStatus` | CONNECTED | CONNECTED |
| `VehicleDataSourceLink` (DIMO active) | 1 | 1 |
| DIMO owner in `raw_json` (sanitized) | `0x…405511` | `0x…405511` (same on-chain owner) |
| New webhook subscribe via API | **403 Insufficient vehicle permissions** | allowed (historical links; re-subscribe returns `400 Already subscribed` on RPM probe) |

**Conclusion:** SynqDrive consent/org-auth mirrors are **insufficient** for Vehicle Triggers subscribe. The decisive gap is **missing developer-license privilege** for tokenId=190497 at DIMO Identity. Historical webhook links (June–July 2026) remain visible but **new** subscribe calls fail — consistent with privilege revoked or never granted for this token after a vehicle lifecycle change.

## Root cause

**DIMO developer-license vehicle privilege not granted (or no longer active) for tokenId=190497**, while SynqDrive operational consent records were not reconciled to this provider-side grant state.

This is **not** an R9 signal/callback/configuration defect.

## Required remediation

1. **Primary:** Vehicle owner (DIMO account holding privilege grant) must **re-grant developer-license privilege** to SynqDrive's `DIMO_CLIENT_ID` for tokenId **190497** via DIMO owner flow / Developer Console vehicle sharing (Identity `privileged` grant).
2. **Verify:** Re-run Identity GraphQL `vehicles(filterBy: { privileged: clientId })` — tokenId **190497** must appear before any bootstrap retry.
3. **Then:** Re-execute authorized scoped R9 trigger bootstrap (separate task) only after all six tokens are API-subscribable.
4. **Optional SynqDrive hygiene:** Reconcile `VehicleProviderConsent` / provider-link projection with Identity privileged state so future drift is visible before bootstrap (documentation gap only in this PR).

| Remediation class | Required |
|-------------------|----------|
| User / vehicle-owner action in DIMO | **YES** |
| DIMO-side privilege mutation (owner grant) | **YES** |
| SynqDrive DB mutation | **NO** (for permission fix itself) |
| Credential refresh alone | **NO** (developer JWT auth succeeded) |
| Application entitlement correction | **NO evidence** |
| Ownership correction | **NO** (same sanitized owner hash as cohort) |

## Safe five-vehicle canary

**YES** — tokens 186946, 187336, 187361, 187784, 192922 are Identity-privileged and API-subscribable. A **partial** canary would violate the authorized six-vehicle bootstrap contract; documented here for operational awareness only.

## Bootstrap state (unchanged)

- Bootstrap result: **ROLLED_BACK**
- Ephemeral R9 webhook IDs: **deleted, not active**
- Legacy OBD/RPM: **unchanged**
- Coverage: **0/6**

## Methods (read-only)

```text
Production PostgreSQL: cohort join vehicles + dimo_vehicles + consent/link/org-auth aggregates
DIMO Identity GraphQL: vehicles(filterBy: { privileged: DIMO_CLIENT_ID })
DIMO Vehicle Triggers GET: /v1/webhooks/vehicles/{assetDID}
Developer JWT: auth handshake only (no provider mutations)
```

## Mutations

**NONE** (Production DB, Redis, DIMO provider, runtime).
