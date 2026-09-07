# R9 DIMO Vehicle-Permission Root-Cause Audit (Read-Only)

| Field | Value |
|-------|-------|
| **Session** | `2026-09-07T22:20:00Z` (UTC) |
| **Mode** | **READ-ONLY** — GET webhook links + Identity GraphQL query + Production PostgreSQL read |
| **Outcome** | **PASS** — root cause identified |
| **Affected tokenId** | **190497** |
| **SynqDrive vehicle ref** | `c43c3b45…` — Volkswagen Golf 2026 (`vehicleRef` prefix only; plate/customer data omitted) |
| **Organization ref** | `faa710c9…` (same org as cohort) |

## Executive summary (corrected 2026-09-07)

Initial audit interpreted tokenId **190497** as requiring DIMO developer-license re-grant. **Owner clarification supersedes that remediation:** tokenId **190497** is a **FORMER_FLEET_VEHICLE** — no longer a current connected fleet vehicle and **must not** be reauthorized, reconnected, or included in R9 coverage.

The prior subscribe **403** for tokenId=190497 is **expected** for a former vehicle with stale SynqDrive mirrors (AVAILABLE, CONNECTED, active consent, active data-source link). That drift is a **separate data-integrity cleanup gap** — not an R9 blocker.

**Active R9 cohort (authorized):** exactly five Identity-privileged tokenIds — 186946, 187336, 187361, 187784, 192922.

**Rejected remediation:** re-grant developer-license privilege for tokenId=190497.

**NEXT_GATE:** `NATURAL_R9_WAKE_OBSERVATION` — five-vehicle canary **PASS**; see [R9_FIVE_VEHICLE_CANARY_2026-09-07.md](R9_FIVE_VEHICLE_CANARY_2026-09-07.md)

## Historical comparison matrix (sanitized, pre-correction context)

## Comparison matrix (sanitized)

| tokenId | Make/Model | Dev-license privileged (Identity API) | SynqDrive consent | Org DIMO auth | Webhook links | Subscribe API |
|--------:|------------|--------------------------------------|-------------------|---------------|---------------|---------------|
| 186946 | Tesla Model 3 2023 | **YES** | ACTIVE | ACTIVE | 3 | allowed |
| 187336 | Mercedes C 63 2018 | **YES** | ACTIVE | ACTIVE | 3 | allowed |
| 187361 | Audi A4 2016 | **YES** | ACTIVE | ACTIVE | 3 | allowed |
| 187784 | VW Arteon 2020 | **YES** | ACTIVE | ACTIVE | 3 | allowed |
| **190497** | **VW Golf 2026** | **NO** (former fleet — excluded) | ACTIVE *(stale mirror)* | ACTIVE | 3 (historical) | **403 expected** |
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

**Conclusion (corrected):** tokenId **190497** lacks Identity developer-license privilege because it is a **former fleet vehicle**, not because R9 configuration failed. SynqDrive DB mirrors for 190497 are **stale** and must not define the active R9 cohort. The five privileged vehicles are the authoritative Production R9 canary cohort.

## Root cause (corrected business interpretation)

| Layer | Finding |
|-------|---------|
| **Provider (DIMO Identity)** | tokenId **190497** absent from `privileged` list — **expected** for former fleet vehicle |
| **SynqDrive DB (stale)** | 190497 still shows AVAILABLE + CONNECTED + active consent + active link — **data-integrity drift** |
| **R9 bootstrap failure (six-vehicle attempt)** | Fail-closed on 190497 subscribe 403 — **correct** under obsolete six-vehicle cohort assumption |

This is **not** an R9 signal/callback/configuration defect.

## Required remediation (superseded — do not execute)

~~Re-grant developer-license privilege for tokenId=190497~~ — **REJECTED** per owner clarification (former fleet vehicle).

| Remediation class | Required for R9 canary |
|-------------------|------------------------|
| Exclude 190497 from R9 cohort | **YES** (policy) |
| Five-vehicle scoped bootstrap | **YES** (authorized separate task) |
| SynqDrive stale vehicle record cleanup | **Separate gap** — not in R9 canary task |
| Re-authorize 190497 in DIMO | **NO — rejected** |

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
