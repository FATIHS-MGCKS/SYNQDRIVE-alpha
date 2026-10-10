# EXP-021 — Direct fleet pilot preparation (five vehicles)

**Date:** 2026-10-10 (UTC)  
**Production read-only:** no mutations in this workstream.

## A — Environment drift (vs `ecdb76f7…` post-release-identity pin)

| Item | Value |
|------|--------|
| Post-identity backup | `/opt/synqdrive/shared/backups/backend.env.g5-pre-publication-off-20261010203831` → SHA256 `ecdb76f7f63ddc4c38cdbe581effd5b54bcf8f77d3f0795d05ed8049812366f8` |
| Live `backend.env` | SHA256 `19685a3b15d88f7df5ffb6376ef1d74a922021edb921d2190d4b17ae1cfac2af` (mtime 2026-10-10T20:38:32Z) |
| Keys changed since `ecdb76f7…` | **Only** `BATTERY_V2_PUBLICATION_ENABLED`: `true` → `false` (key relocated to file tail) |
| S4 / APDS / `SYNQDRIVE_DEPLOYED_GIT_SHA` | **Unchanged** between `ecdb76f7…` and live |
| Authorization artifact | VPS backup name `g5-pre-publication-off-20261010203831`; owner directive preserves G5 publication safeguards (`false`) |

**Stop gate:** No unaccounted S4, APDS, security, or release-authority drift beyond Battery V2 publication gate.

## B — Fleet scope correction (code PR only)

- Removed sold KS MX 2024 / DIMO **187336** / `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` from `S4_ELIGIBLE_FLEET_VEHICLE_IDS`.
- Added `S4_SOLD_OR_REMOVED_FLEET_VEHICLE_IDS` → merged into `S4_UNSUPPORTED_VEHICLE_IDS`.
- Wave **1** and **2** definitions unchanged.
- Wave **3** = five eligible vehicles (direct concurrent pilot).

## C — 24h flight (plan only)

See mission output block; execution requires merge + deploy + owner pins + DRY_RUN + LIVE_OPEN authorizations.
