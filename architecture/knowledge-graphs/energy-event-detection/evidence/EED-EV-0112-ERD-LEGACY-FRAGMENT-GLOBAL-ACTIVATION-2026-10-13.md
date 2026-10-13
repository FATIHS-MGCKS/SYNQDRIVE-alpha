# EED-EV-0112 — ERD legacy RECHARGE fragment product-read global activation

**Status:** PRODUCTION_ACTIVATED  
**Owner authorization:** YES (global `ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED=1`)  
**Production SHA:** `1bc3a3a1863abaa4feab7d242b0678f071e806b2` (unchanged — env-only rollout)  
**Activation T0 (UTC):** `2026-10-13T07:17:13Z` (both replicas rolling-restarted via `vps-enable-erd-recharge-legacy-fragment-product-read-production.sh`)  
**Rollback backup:** `/opt/synqdrive/shared/backend.env.bak-erd-legacy-fragment-20261013071645`

## Scope

- **Changed:** single shared `backend.env` key `ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED=1`
- **Not changed:** deploy SHA, APDS epoch, Battery V2 publication, RFRF policy, EXP021 GLOBAL_KILL, raw VEE rows, HvChargeSession persistence, write authority, E5.5/E5.6 gates

## Immediate regression fixture (Tesla Natural Test #1)

| Check | Expected | Observed (Nest `listCanonicalEnergyEvents` @ T0+2m) |
|-------|----------|------------------------------------------------------|
| Window | `2026-10-12T13:06:55Z` – `15:10:30Z` | same |
| Product RECHARGE | 1 | **1** (`420c253b-676a-4ab6-8e89-7528d538a7d8`) |
| Raw legacy RECHARGE | 8 | **8** |
| HvChargeSession | 1 (`3e5fe028-a217-4dfd-b165-76993117c794`) | **1** (ID match) |

Historical fleet projection (185→114) is **not** physical validation — prospective audit only from `AUDIT_CUTOFF`.

## Prospective Natural Charge Audit ledger

**AUDIT_CUTOFF:** `2026-10-13T07:17:13Z`  
**Ledger file:** `EED-NCA-LEDGER-2026-10-13.md` (same directory)  
**Convention:** one record per **physical charging episode** (not per DIMO segment); outcomes per EED/RFRF natural-event audit vocabulary.

## Monitoring

- Counter: `synqdrive_erd_recharge_legacy_fragment_product_read_total`  
- Labels (`result`): `flag_off`, `envelope_preserved`, `fragment_suppressed`, `ambiguous_preserved`, `malformed_preserved`, `non_legacy_preserved`, `unproven_episode_preserved`, `identity_conflict_preserved`, `telemetry_conflict_preserved`
- **Gap:** no dedicated alert rule verified in this activation; operator bounded checks required post-traffic.

## Cross-workstream preservation (read-only @ activation)

| Domain | Snapshot |
|--------|----------|
| EXP021 GLOBAL_KILL | `NOT_KILLED` |
| APDS ACTIVE epoch | `92d3d61133ad524ae6d328dd0f603c525b0bd178` |
| Battery V2 publication | `false` |
| RFRF | `ALPHA_ALLOWLIST` unchanged |
| S4 SUPERSEDED quarantine | **18** rows (count preserved) |
| Vehicle offboard UI | frontend offboard gates not enabled |

## Rollback procedure (flag only)

1. Restore backup: `cp /opt/synqdrive/shared/backend.env.bak-erd-legacy-fragment-20261013071645 /opt/synqdrive/shared/backend.env` (or remove key / set `0`)
2. Rolling restart both replicas at **same** SHA using `vps_replica_rolling_deploy` (no `vps-deploy-release.sh` required for flag rollback)
