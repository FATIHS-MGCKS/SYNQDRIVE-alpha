# EXP-021 S4D P1 closure (PR #1841)

Date: 2026-09-29

## Scope

Independent pre-merge audit P1-A through P1-E on verified pin replay (S4D).

## Implemented

- Replay path bypasses `resolveDiV0S4cAcquisitionContext` when `pinned_snapshot_hash` is set (`readReplayRoutingContext`).
- Verified load: strict DB `channel_manifest` parity with parsed container manifest.
- Inner POSITION/R1 vehicle, source family, token, and window cross-binding before S1.
- Central `AbortSignal` checkpoints in S4D replay before authoritative transitions.
- POSITION/R1 parsers: exact grid labels, enum vocabularies, semantic matrices (beyond byte round-trip).

## Tests

- Postgres matrix extended: D-17 (DIMO link removed), D-18 (raw_json swap), D-19 (token relink).
- Unit adversarial: off-grid POSITION, illegal semantics, manifest subset rejection.

## Non-effects

No production deploy, no AppModule registration, no Prisma migration, no S4E/S4F.

## Final test / governance closure (2026-09-29)

- S4D abort tests: RUNNABLE `API_SYNTHETIC` fixture via `buildDiV0S4cNativeChannelInput` / `buildDiV0S4cR1ChannelInput`; post-deserialize abort via module-bound `jest.mock('./di-v0-s4d-replay-s1')` + dynamic import of pinned replay; post-compute abort via read-count `AbortSignal` at guard #6.
- S3A dormant boundary: narrow allowlist for pure parser consumers (`di-v0-s4d-replay-s1.ts`, `di-v0-s4d-replay-scope-bind.ts`); acquisition markers forbidden elsewhere.
- Required CI: `.github/workflows/s4a-postgres-integration.yml` runs `test:di:s4a`–`s4d` unit + PostgreSQL suites when S4 paths change; gate fails closed on unit or postgres failure.
