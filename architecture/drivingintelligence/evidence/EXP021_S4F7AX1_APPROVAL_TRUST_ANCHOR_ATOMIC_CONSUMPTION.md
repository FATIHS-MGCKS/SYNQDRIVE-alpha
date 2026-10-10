# EXP-021 S4F-7AX.1 — Approval trust anchor & atomic consumption closure

**PR:** #1955  
**Scope:** P0 closure on existing Gate-6 independent approval engineering — **no** Production mutation.

## P0-A — Pinned Production verification key

- `evaluateProductionGate6IssuanceTrustAnchors` enforces:
  - No `DI_S4_GATE6_HUMAN_APPROVAL_PUBLIC_KEY_FILE` / root key / consumption register env overrides on Production issuance.
  - Independent `realpath` checks for `backend.env` vs approved Production shared env.
  - Pinned public key + consumption register under `/opt/synqdrive/shared/*` with file type, permission, and no-symlink substitution checks.
- `issue-dispatch-token` calls trust-anchor evaluation **before** approval verify or consumption.
- HMAC v1 human approval blocked on all Production issuance paths (trust gate + explicit v1 rejection).

## P0-B — Atomic approvalId consumption

- Final marker created with single `O_CREAT | O_EXCL` on `gate6-approval-id.<id>.consumed` (no rename overwrite).
- Production register path pinned (no env override).
- Multiprocess tests: 20 parallel worker processes, exactly one `RESERVE_OK`.

## Validation

```bash
cd backend && npm run test:di:s4f7as:gate6-open-rekill-operator
```

**57** operator tests PASS (includes self-signed bypass negative, 20-process concurrency, restart persistence).
