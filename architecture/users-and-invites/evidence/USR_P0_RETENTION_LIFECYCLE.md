# USR_P0-R-006 — Privacy, retention, and deletion

Module: `backend/src/modules/iam-data-retention/`

## Personal data categories (`IamDataCategory`)

| Category | Owning module | Deletion / strategy enum | Operational job |
|----------|---------------|------------------------|-----------------|
| `GLOBAL_USER_PROFILE` | users + retention | `IamRetentionStrategy` | Worker via `IamDataRetentionWorkerService` — **requires explicit run** (`POST .../runs`) |
| `MEMBERSHIP` | users / orgs | same | same |
| `SESSION_REFRESH_TOKEN` | auth | DELETE | refresh TTL + revocation |
| `MFA_DATA` | iam-mfa | DELETE on reset | service-level |
| `INVITE` / `RESET_TOKEN` | users / auth | policy in `iam-data-retention.policy` | not claimed continuous without scheduler evidence |
| `AUDIT_LOG` | activity-log | often ANONYMIZE / legal hold | cross-org |

## Account erasure vs membership removal

| Action | Route | Mechanism |
|--------|-------|-----------|
| Org remove user | `DELETE organizations/:orgId/users/:id` | `usersService.removeOrgUser` — membership **REMOVED**, global user may persist |
| Global delete | `DELETE admin/users/:id` | `IamUserDeletionService` assessment → hard delete or pseudonymize |

## Multi-org protection

`IamUserDeletionService.assessGlobalDeletion` blockers; P6B2 REMOVED re-add does not restore global credentials (tests).

## DSAR / export

`IamDsarExportService` — org routes under `organizations/:orgId/iam/data-retention` (read/manage + step-up on sensitive ops).

## Gaps

- Retention **enum ≠ proof** of scheduled operational erasure — **AUDIT_COVERAGE_GAP**
- Backup erasure, legal basis, processor DPAs — **ORGANIZATIONAL_REQUIREMENT** / **LEGAL_REVIEW_REQUIRED**
- GDPR Art. 12–22 product DSAR identity verification — implement partial; not production-verified