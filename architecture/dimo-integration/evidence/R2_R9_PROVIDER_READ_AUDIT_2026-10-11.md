# R2 R9 five-vehicle provider read audit

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-R2-R9-GET-001` |
| **AUDIT_MODE** | `READ_ONLY` |
| **Observed at (UTC)** | `2026-10-11T19:15:00Z` (approx) |
| **Production SHA** | `2b89f7466836b81a4ba344138d0ad9817c5d14ee` |
| **Method** | `sudo node /opt/synqdrive/current/backend/scripts/ops/r9-post-get-audit.mjs` |
| **Provider calls** | `GET /v1/webhooks`; per-vehicle `GET /v1/webhooks/vehicles/{assetDID}`; auth via developer JWT (Web3 challenge POST to `auth.dimo.zone` only) |
| **DB** | Script uses read-only `psql -At` for eligible token list (scheduler-connected vehicles) |

## Cohort vs historical R9 authorized list

| tokenId | In historical R9 cohort B | R2 provider links | speed | ignition |
|---------|---------------------------|-------------------|-------|----------|
| 186946 | YES | 5 | YES | YES |
| 187336 | YES | 6 | YES | YES |
| 187361 | YES | 5 | YES | YES |
| 187784 | YES | 5 | YES | YES |
| 192922 | YES | 5 | YES | YES |
| 190497 | **EXCLUDED** (former fleet) | 3 | NO | NO |

**Eligible DB rows:** 6 (includes 190497). **Authorized cohort coverage (5 vehicles):** **5/5** speed + ignition subscriptions on provider.

## R9 webhook definitions (provider configuration state)

| stableId | displayName | metricName | status @ R2 |
|----------|-------------|------------|-------------|
| `9eeb7158afee` | SynqDrive R9 Speed Wake | `vss.speed` | **`failed`** |
| `5d611d470eab` | SynqDrive R9 Ignition Wake | `vss.isIgnitionOn` | **`failed`** |

**Classification:** Subscriptions **CONFIRMED** on provider for cohort vehicles; definition `status=failed` is **PRODUCTION_OBSERVED** — indicates provider-side delivery health issue, **not** the same as missing subscribe API calls. Natural wake delivery must be assessed separately (DIM-GAP-006).

## Legacy webhooks (unchanged pattern)

| stableId | status | failureCount |
|----------|--------|--------------|
| OBD unplug `a257daa23ee5` | enabled | 0 |
| OBD plug `b977124a025a` | disabled | 0 |
| High RPM `1f96faea6569` | enabled | 0 |

## Diff vs historical snapshot (2026-09-07 canary)

| Metric | Historical | R2 @ `2b89f746…` |
|--------|------------|------------------|
| 5/5 subscribed both | PASS | **PASS** |
| R9 definition status | enabled (historical ops) | **`failed`** (**NEW OBSERVATION**) |
| 190497 excluded | YES | YES (no speed/ignition) |

## Mutations

**None.**
