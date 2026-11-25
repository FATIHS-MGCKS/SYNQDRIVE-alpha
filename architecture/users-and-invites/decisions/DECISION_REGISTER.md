# Users & Invites — decision register (append-only)

## Owner policies (2026-11-25)

| ID | Status | Decision |
|----|--------|----------|
| **USR-OWN-01** | **OWNER_APPROVED** | Central governed Master Admin user management per [USR_P0_OWNER_ATTESTATION_2026-11-25.md](../evidence/USR_P0_OWNER_ATTESTATION_2026-11-25.md) — **implementation not claimed** |
| **USR-OWN-02** | **OWNER_APPROVED** | Effective access revocation on authz checks after commit; not JWT-expiry-only — binds **USR-P0-R-008** remediation |
| **USR-OWN-03** | **OWNER_APPROVED** | Privileged MFA for MASTER_ADMIN and MASTER_BILLING delegates; **production flag arm not authorized** — binds **USR-P0-F-005** |
| **USR-OWN-04** | **OWNER_APPROVED** | Durable privileged audit; no silent audit failure; revocation succeeds on audit failure — binds **USR-P0-R-002** remediation |

**Verbatim attestation:** see evidence file above.

## USR_P0 audit decisions

| ID | Status | Decision |
|----|--------|----------|
| USR-DEC-P0-001 | RECORDED | Bootstrap authority under `architecture/users-and-invites/` |
| USR-DEC-P0-002 | RECORDED | Canonical MA users surface = `?view=security-access` |
| USR-DEC-P0-003 | **SUPERSEDED** | Superseded by **USR-OWN-01** (`OWNER_APPROVED`) — central capability is **required**, not deferred |
| USR-DEC-P0-004 | RECORDED | Production IAM verification deferred — separate authorization (unchanged) |

Historical org/IAM decisions remain in `architecture/organizations/` and flat `architecture/IAM_*.md`.