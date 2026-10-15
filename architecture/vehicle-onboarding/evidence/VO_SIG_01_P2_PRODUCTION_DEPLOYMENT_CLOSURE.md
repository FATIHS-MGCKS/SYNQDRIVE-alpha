# VO-SIG-01 P2 — Production deployment closure

| Field | Value |
|-------|-------|
| **Status** | `DEPLOYED_TECHNICALLY_VERIFIED` / `NATURAL_E2E_PENDING` |
| **Production release SHA** | `f5bb7bb0b35ca2ca1ccd69a24e73038d968761fb` |
| **Date recorded** | 2026-10-15 |
| **Epistemic** | Operator-confirmed deploy report + repository ancestry on `main` |

## Scope closed in production

- **VO-SIG-01 B1:** Four existing DIMO connections reconciled (legacy connection-identity cohort); one-time execute — **no repeat B1 backfill**.
- **VO-SIG-01 P2:** Master Admin `register-from-dimo` canonical onboarding path (`MasterDimoCanonicalRegistrationService` → adoption → capture → readiness → activation + connection identity + `VEHICLE_ACTIVATED` outbox).
- **Replicas:** Operator deployment report — both production backend replicas healthy post-release.

### Prisma migration `20261014183000_vo_sig_p2_vehicles_registration_scalar_bridge`

| Fact | Evidence |
|------|----------|
| **Ledger** | Migration **`20261014183000_vo_sig_p2_vehicles_registration_scalar_bridge`** is recorded as **applied** in the production `_prisma_migrations` ledger (additive `ADD COLUMN IF NOT EXISTS` bridge). |
| **Recovery deploy @ `f5bb7bb0`** | Operator recovery deployment on release SHA `f5bb7bb0b35ca2ca1ccd69a24e73038d968761fb` reported **`No pending migrations to apply`** — deploy-time `prisma migrate deploy` did not apply any new migration on that run. |
| **Not claimed** | **No** documented proof of the **original** first-apply timestamp or earlier deploy step for this migration; closure does not infer that timing without operator evidence. |

## Open evidence (non-blocking)

| Item | Status | Notes |
|------|--------|-------|
| **Natural E2E registration** | **PENDING** | No new production vehicle registered during closure window — **owner has no spare vehicle** for a live Master DIMO registration test. |
| **Synthetic prod vehicles** | **FORBIDDEN** | Do not create test vehicles in production to satisfy this gate. |
| **Workstream impact** | **None** | P2 remains **deployed**; natural E2E is an **evidence gap**, not a rollback trigger. |

## Verification already in repository (pre-prod / CI)

- PostgreSQL matrix `vo-sig-p2-master-dimo-registration.postgres.integration.spec.ts` (VO-2 CI gate).
- Unit/characterization: `vehicles.service.register-from-dimo.spec.ts`, payload fingerprint, connection-identity activation assertions.
- Frontend: tire partial-success warning on `RegisterFromDimoResult.postActivationEnrichment`.

## Related evidence

- [VO_SIG_01_P2_MASTER_DIMO_CANONICAL_REGISTRATION.md](./VO_SIG_01_P2_MASTER_DIMO_CANONICAL_REGISTRATION.md)
- [VO_SIG_01_B1_LEGACY_CONNECTION_IDENTITY_RECONCILIATION.md](./VO_SIG_01_B1_LEGACY_CONNECTION_IDENTITY_RECONCILIATION.md)
