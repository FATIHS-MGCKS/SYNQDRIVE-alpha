# EED-EV-0112 — ERD legacy RECHARGE fragment product-read global activation

**Status:** PRODUCTION_ACTIVATED  
**Owner authorization:** YES (global `ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED=1`)  
**Production SHA:** `1bc3a3a1863abaa4feab7d242b0678f071e806b2` (unchanged — env-only rollout)  
**Activation T0 (UTC):** `2026-10-13T07:17:13Z` (dual-replica rolling restart after shared `backend.env` change; no application deploy)  
**Pre-change env snapshot (reference only):** `/opt/synqdrive/shared/backend.env.bak-erd-legacy-fragment-20261013071645` — **do not restore wholesale** (see rollback below)

## Scope

- **Changed:** single shared `backend.env` key `ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED=1`
- **Not changed:** deploy SHA, APDS epoch, Battery V2 publication, RFRF policy, EXP021 GLOBAL_KILL, raw VEE rows, HvChargeSession persistence, write authority, E5.5/E5.6 gates

## Immediate regression fixture (Tesla Natural Test #1)

| Check | Expected | Observed (product read @ T0+2m) |
|-------|----------|----------------------------------|
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
- Scrape path on VPS: `GET /api/v1/metrics` (Bearer `METRICS_BEARER_TOKEN`)
- **Gap:** no dedicated alert rule in checked-in Prometheus rules for this counter; operator bounded checks required post-traffic.

## Cross-workstream preservation (read-only @ activation)

| Domain | Snapshot |
|--------|----------|
| EXP021 GLOBAL_KILL | `NOT_KILLED` |
| APDS ACTIVE epoch | `92d3d61133ad524ae6d328dd0f603c525b0bd178` |
| Battery V2 publication | `false` |
| RFRF | `ALPHA_ALLOWLIST` unchanged |
| S4 SUPERSEDED quarantine | **18** rows (count preserved) |
| Vehicle offboard UI | frontend offboard gates not enabled |

## Rollback procedure (ERD flag only — safe)

**Never** replace the live `/opt/synqdrive/shared/backend.env` with a full older backup file. Other keys (EXP021, APDS pins, Battery, RFRF, DIMO, secrets) may have changed after the snapshot; wholesale `cp` risks cross-workstream regression.

1. **Edit only the ERD key** on the live file (root-owned, mode `600`):
   - Remove the line `ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED=1`, **or**
   - Set `ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED=0`
   - Use line-level edit / `upsert_env` pattern; do **not** overwrite the entire file from `.bak-erd-legacy-fragment-*` unless every other key is verified unchanged (not routine).
2. **Rolling restart** both PM2 replicas at the **same** application SHA (`1bc3a3a…` or whatever `git -C /opt/synqdrive/current rev-parse HEAD` reports) so `process.env` reloads from the symlinked env file.
3. **Verify:** product Tesla fixture window returns **8** product RECHARGE rows when flag OFF; raw rows still **8**; P4B16 `DEPLOYED_SHA` unchanged; EXP021/APDS/Battery/RFRF keys unchanged.

Optional: use the pre-activation `.bak-erd-legacy-fragment-*` **only** as a read-only diff reference to confirm the sole intended delta was the ERD flag line.
