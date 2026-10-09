# EXP-021 S4F-7AS.3 — Gate-6 authority seal

**Date (UTC):** 2026-10-09  
**PR:** #1949  
**Scope:** Seal dispatch HMAC + human approval boundary — **no** Production execution.

## HMAC / approval separation

- Dispatch token **v2**: no signing key in JSON payload; HMAC key in sidecar `*.hmac-key` (mode `0600`).
- **Issuance** requires verified `DI_S4_GATE6_LIVE_OPEN_HUMAN_APPROVAL_FILE` MAC’d with root key (`/opt/synqdrive/shared/gate6-live-open-approval-root.key` or explicit `DI_S4_GATE6_HUMAN_APPROVAL_ROOT_KEY_FILE`). OPEN_ACK env alone cannot issue.
- **Verification** consumes token + sidecar key path; `approvalId` bound in token and env.
- Without root key material: `INDEPENDENT_APPROVAL_AUTHORITY=BLOCKED`.

## One-shot

- Atomic claim via rename; `.spent` marker prevents replay; failed verify burns token; no auto re-issue (`DISPATCH_AUTO_REISSUE=NO`).

## Production path

- Live OPEN (non-fixture): resolved `realpath` must equal approved Production `backend.env`; env canonical claims cannot override.

## Preserved

- Unknown OPEN commit recovery orchestration unchanged (S4F-7AS.2).

## Tests

- `npm run test:di:s4f7as:gate6-open-rekill-operator` — **44** (includes replay, double-consume, approval blocked, exact-path negatives).

## Status

| Field | Value |
|-------|--------|
| `PRODUCTION_MUTATION` | **NO** |
| `GATE6_GRANTED` | **NO** |
| `GLOBAL_KILL` | **KILLED** |
| `S4_ACTIVATED` | **NO** |
