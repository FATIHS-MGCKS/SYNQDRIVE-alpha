# R2.3 — Provider-only unsubscribe (sold vehicle tokenId 187336)

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-R23-187336-PROVIDER-UNSUB-001` |
| **Owner authorization** | **YES** — provider DELETE unsubscribe **187336 only**; local SynqDrive offboard **deferred**; no MFA / no R9 reactivation |
| **Executed (UTC)** | `2026-10-11T20:25:50Z` |
| **Production SHA** | `92d3d61133ad524ae6d328dd0f603c525b0bd178` (`git rev-parse` @ `/opt/synqdrive/current`; no `REVISION` file) |
| **Deploy running** | **No** at execution |
| **FINAL_STATUS** | **SUCCESS** (provider scope) |

## Target identity (re-verified)

| Field | Value |
|-------|-------|
| tokenId | `187336` |
| vehicleId | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| organizationId | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| assetDID | `did:erc721:137:0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF:187336` |

## Auto-resubscribe risk (read-only)

| Control | Finding |
|---------|---------|
| `DIMO_TRIGGER_BOOTSTRAP_ENABLED` | **Not set** in `backend.env` → default **false**; `DimoTriggersBootstrapService` no-op at startup |
| R9 ops scripts | Manual / gated; no cron observed in this session |
| Episode reconciliation | Does **not** auto-subscribe Vehicle Triggers API |

**AUTOMATIC_RESUBSCRIBE_RISK:** **LOW** under current production config; re-subscribe would require manual ops, bootstrap flag enable, or future code path — **monitor** after deploy/restart only.

## Provider inventory BEFORE (6 links, all SynqDrive callback)

| # | webhookId | stableId | displayName | metric | def status | Module / notes |
|---|-----------|----------|-------------|--------|------------|----------------|
| 1 | `7a5e81bc-8f48-4b62-877a-9df104c1f42e` | `9eeb7158afee` | SynqDrive R9 Speed Wake | `vss.speed` | failed | R9 / Trip wake |
| 2 | `3a2fcd34-1a74-45db-bee9-75e340f36b00` | `5d611d470eab` | SynqDrive R9 Ignition Wake | `vss.isIgnitionOn` | failed | R9 / Trip wake |
| 3 | `49438f51-3ca5-4808-81d5-3598336c53a3` | `a257daa23ee5` | OBD Device unplugged | `vss.obdIsPluggedIn` | enabled | GT-R1 / VDC |
| 4 | `7a0562d3-369a-45eb-b5ed-8d35258091dd` | `b977124a025a` | OBD Device Plugged in | `vss.obdIsPluggedIn` | disabled | GT-R1 PLUG (global def disabled) |
| 5 | `f6bdbe85-dec0-4e60-ad61-d9183cd55484` | `1f96faea6569` | High RPM Triger | `vss.powertrainCombustionEngineSpeed` | enabled | Legacy RPM trigger |
| 6 | `03213b1b-7335-4565-bd5c-6f158c671b60` | `581ffa8afea0` | SynqDrive VDC OBD PLUG Canary KS MX 2024 (TEMP) | `vss.obdIsPluggedIn` | enabled | **Vehicle-specific canary** (1 subscriber = 187336 only) |

All definitions: `targetURL` host `app.synqdrive.eu`, `callbackMatch=true`, developer-license auth.

## Mutations (sequential DELETE unsubscribe)

| Order | webhookId | HTTP | subs before → after | 187336 after |
|------|-----------|------|---------------------|--------------|
| 1 | `7a5e81bc-…` (R9 Speed) | **200** | 5 → 4 | removed |
| 2 | `3a2fcd34-…` (R9 Ignition) | **200** | 5 → 4 | removed |
| 3 | `f6bdbe85-…` (High RPM) | **200** | 7 → 6 | removed |
| 4 | `7a0562d3-…` (PLUG def) | **200** | 6 → 5 | removed |
| 5 | `49438f51-…` (UNPLUG) | **200** | 7 → 6 | removed |
| 6 | `03213b1b-…` (PLUG canary) | **200** | 1 → 0 | removed |

**AFTER:** `GET /v1/webhooks/vehicles/{assetDID}` → **linkCount 0**.

## Cohort postflight

| tokenId | linkCount | R9 speed | R9 ign |
|---------|-----------|----------|--------|
| 186946 | 5 | yes | yes |
| **187336** | **0** | **no** | **no** |
| 187361 | 5 | yes | yes |
| 187784 | 5 | yes | yes |
| 190497 | 3 | no | no |
| 192922 | 5 | yes | yes |

## Global R9 definitions (unchanged)

| id | status | condition | coolDown |
|----|--------|-----------|----------|
| `7a5e81bc-…` | failed | `valueNumber > 3` | 30 |
| `3a2fcd34-…` | failed | `valueNumber == 1` | 30 |

No DELETE definition, no PUT, no subscribe/all.

## Local SynqDrive state (unchanged by design)

| Signal | Value @ postflight |
|--------|-------------------|
| `registry_lifecycle` | `ACTIVE` |
| `vehicle.status` | `AVAILABLE` |
| Active data source links | **2** active rows |
| DIMO consent | `ACTIVE` |
| Local offboard | **NOT executed** |

### Interim risks (documented, not fixed here)

| Topic | Assessment |
|-------|------------|
| **LOCAL_POLLING_RISK** | Snapshot poll / identity sync may still reach DIMO with **developer license + consent** — webhooks no longer wake R9/GT for this asset |
| **LOCAL_BILLING_STATUS** | Vehicle still **ACTIVE** registry → likely still billable until separate VO5C offboard |
| **REMAINING_PRIVACY_RISK** | **MEDIUM** — sold vehicle may still be ingested until local offboard + consent revoke |
| **Provider permissions** | Asset-owner DIMO grants **independent** of webhook subscriptions — **UNKNOWN** without owner console review |

### Follow-up (separate VO5C workstream)

1. P4A offboard when MFA/admission ready ([VO5C_P4A_OPERATOR_READINESS_2026-10-11.md](VO5C_P4A_OPERATOR_READINESS_2026-10-11.md))
2. Revoke local consent + deactivate links in offboard transaction
3. Billing bridge `VEHICLE_OFFBOARDED`
4. Optional: disable/delete orphan canary **definition** `03213b1b-…` if still unused (separate authorization — **not** done in R2.3)

## Sanitized machine evidence

Operator JSON capture (no secrets): workspace artifact path used during execution — key fields duplicated above.
