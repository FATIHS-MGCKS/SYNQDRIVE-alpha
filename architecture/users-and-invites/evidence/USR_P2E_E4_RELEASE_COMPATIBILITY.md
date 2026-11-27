# USR-P2E E4 — Release compatibility (PR #2534)

**Status:** E4 **PASS** on disposable PostgreSQL + frontend auth matrix vitest; Nest boot via `synqdrive-nest-boot-check-ci.sh` when loopback infra available.

## E3 closeout (same PR)

- Gate exports `USR_P1A_SESSION_AUDIT_PG=1` before E3 (preflight helper).
- Outbox replay binds `actorUserId` + org scope; cross-target operation identity tests.
- E3-A01 requires exactly one semantic `ActivityLog` row.

## Frontend auth matrix (F01–F11)

| ID | Evidence |
|----|----------|
| F01 | `auth-release-compatibility.test.ts` + PG F01 (`SESSION_BINDING_REQUIRED`) |
| F02 | Family-bound `setAuth` upgrade |
| F03–F06 | `auth-session-refresh.ts` coalesced refresh + bounded 401 recovery |
| F07 | MFA login response `setAuth` contract |
| F08 | Step-up token cleared on downgrade path |
| F09 | Org context + refresh rotation in storage |
| F10 | `requestResult` transport failure (status 0), single fetch |
| F11 | Org switch clears `sessionStorage` step-up grant (`RentalContext`) |

**Note:** Shared `request()` still clears auth on 401 without auto-refresh; coordinator is the release-compatible primitive for future wiring (per prior evidence gap).

## Migration contract

Migration `20261127140000_iam_step_up_grant_session_binding` adds nullable binding columns + `(user_id, token_family)` index. IAM disposable preflight requires migration-derived columns (not parity-SQL only). Legacy null `token_family` grants fail closed at `validateGrant`.

### Historical drift vs new migration (P2A)

| Class | Examples |
|-------|----------|
| Historical chain drift | `users.first_name`, `users.password_hash`, `organization_memberships.role_label`, parity SQL backfill |
| New migration | step-up grant binding columns |
| Disposable fixture | `ensure-ephemeral-iam-schema-parity.sql` targeted columns |
| Production | **Unknown** — no production access in E4 |

### USR-P5 read-only production schema preflight (mandatory queries)

```sql
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_mfa_step_up_grants'
  AND column_name IN (
    'token_family','organization_id','membership_id',
    'session_version','security_version','membership_version'
  )
ORDER BY 1;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'user_mfa_step_up_grants'
  AND indexname = 'user_mfa_step_up_grants_user_id_token_family_idx';
```

## Rolling release contract (PM2 dual replica A/B)

| Mix | Access JWT | Refresh / grants | Revocation |
|-----|------------|------------------|------------|
| Old + old JWT | No `tokenFamily` enforcement on old binary | Legacy unbound grants tolerated on old binary | Old behavior |
| Old + new JWT | New JWT may include family; old binary may ignore extra claims | — | — |
| New + old JWT | **Denied** (`SESSION_BINDING_REQUIRED`) | Unbound grants fail closed on new binary | Immediate on new paths |
| New + new JWT | Full family binding | Session-bound grants | Cross-replica PG evidence |

**Mixed-version risk:** An old replica may accept pre-migration access JWTs without family binding while a new replica denies them — **immediate revocation** and step-up enforcement are not equivalent across versions.

**Controlled cutover (USR-P5, no deploy here):**

1. Apply DB migration before traffic on new binary.
2. Deploy **both** replicas to the **same** new SHA (no long-lived old/new pair).
3. Verify health + exact SHA on 3001/3002 before admitting security-sensitive master-admin traffic.

**Rollback:** Reverting code can restore weaker JWT acceptance on an old binary; rollback is **not** security-equivalent. Safe rollback requires either forward-fix or traffic restriction until a single compatible SHA is restored.

## Authority cost (disposable sample)

Representative `UserAccessAuthorityService.validateAccessJwt` for platform JWT: query count and latency recorded in E4 PG spec env (`USR_P2E_E4_AUTHORITY_QUERY_COUNT`, `USR_P2E_E4_AUTHORITY_LATENCY_MS`) — not production extrapolation.

## E5 residuals (record only)

- E1 org offboarding contention vs issuance/refresh; Vehicle onboarding CI.
- E2 grant scope null/org edge cases; Product Catalog HTTP acceptance.
- CI: VO-5B onboarding; product catalog — may relate to step-up binding; not repaired in E4.

**R-008:** OPEN. E5 not executed.