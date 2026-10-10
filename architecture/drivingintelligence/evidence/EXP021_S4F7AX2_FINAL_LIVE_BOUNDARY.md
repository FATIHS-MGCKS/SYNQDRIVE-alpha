# EXP-021 S4F-7AX.2 — Final live authority boundary

**PR:** #1955  
**Scope:** Close fixture bypass on Production live OPEN + trust-anchor file permissions + consumption register immutability policy.

## P0 — Fixture live bypass

- `isProductionGate6IssuanceContext` / `isProductionBackendEnvSurface` no longer disabled by fixture flags.
- `enforceExactProductionBackendEnvForLiveOpen` fixture alternate-env waiver is **opt-in** (`permitFixtureAlternateBackendEnv`) for dry-run fixture only.
- `evaluateProductionGate6LiveOpenBoundary` enforces fixture isolation, simulated guard proof ban, exact Production `backend.env`, and trust anchors for `live-open-authorized`.
- `evaluateProductionGate6DispatchIssuanceBoundary` applies the same when the backend surface is Production.

## P1 — Trust anchor permissions

Production pinned public key and consumption register require root:root ownership, restrictive modes, and secure parent chain under `/opt/synqdrive/shared`.

## P1 — Consumption persistence

O_EXCL retained. `consumptionRegisterBlocksOperatorUnlink` documents Production policy: register directory root-owned without group/other write (0750-class); operator cannot unlink consumed markers without write access to the directory.

## Validation

`npm run test:di:s4f7as:gate6-open-rekill-operator` — **60** PASS.
