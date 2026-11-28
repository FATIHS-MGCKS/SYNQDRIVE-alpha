# Change ledger (append-only)

| Date | Record |
|------|--------|
| 2026-11-25 | USR_P0 bootstrap authority + registry `AUDIT_IN_PROGRESS` |
| 2026-11-25 | USR_P0 deep closeout — SQL fix, API/MFA/retention matrices, graph validator, R-001–R-008 |
| 2026-11-25 | Owner attestation USR-OWN-01–04 recorded (no runtime/flag/deploy authorization) |
| 2026-11-25 | USR_P0 final evidence seal — R008 P1, API 98, PG test hardening, R009–R013 |
| 2026-11-25 | USR-P1A — session audit harness F-003 + durable delivery R-002 (`MasterAdminAuditDeliveryService`, IAM outbox carrier) |
| 2026-11-25 | USR-P1A closeout — `master_admin_audit_outbox`, atomic ledger delivery, PG01–PG13 certification, IAM fail-closed |
| 2026-11-25 | USR-P1A runtime wiring — outbox scheduler, atomic revoke+intent txn, tenant audit isolation, PG01–PG13 re-executed (13/13) |
| 2026-11-25 | USR-P1A merge gate — outbox CAS recovery, authoritative immediate delivery, tenant null-safe scope filter, PG08/10/12 hardening |
| 2026-11-25 | USR-P1A operation identity — server `securityOperationId`, ON CONFLICT enqueue, ambiguous-commit + revoke-all count fixes, PGA–PGF |
| 2026-11-25 | USR-P2 — request-time access authority (`UserAccessAuthorityService`, JWT `tokenFamily`, AuthGuard binding); P1A outbox read failure must not block revoke |
| 2026-11-26 | USR-P2B closeout — admin password atomic invalidation, multi-scope idempotency, B01–B10+ADMIN PG (14 shards); gate 66/66 disposable |
| 2026-11-26 | USR-P2C — deterministic race barriers, pg IAM stack helper, 12-case P2C PG suite; semantic crosswalk P2C refresh |
| 2026-11-26 | USR-P2C targeted evidence seal — `pg_blocking_pids` lock wait proofs; semantic guard PG; RACE03 lock-hardening; crosswalk correction |
| 2026-11-26 | USR-P2D — admin password actor; atomic MFA consumption; P1A_B lost ack; D01–D10 PG matrix; refresh MFA downgrade |
| 2026-11-27 | USR-P3A — `MasterGlobalIdentityService`; `POST/PATCH admin/security/users`; legacy `admin/users` forward; MA create/profile UI; 9-locale keys |
| 2026-11-27 | USR-P3A.1 — audit operation binding + org tx atomicity; `requireNewGlobalIdentity`; profile null/validation; inventory restore to PR base; opt-in PG race/idempotency |
| 2026-11-27 | USR-P3A.1 closeout — recursive fingerprint; creation replay target semantics; invite field parity + delivery continuity; IANA timezone; pg lock-wait proof |
| 2026-11-27 | USR-P3A.2 — globalProfile read contract; create dialog + result states; profile hydration/PATCH; 9-locale keys; vitest + playwright scaffolding |
| 2026-11-28 | USR-P3A.3A first-login — `canEstablishInitialCredentialsViaInvite`; credentialless invite accept + HTTP L01–L12 disposable PG; T12/T14 without pre-auth |