# USR_P0 — Compliance engineering matrix

**No ISO certification claimed. No legal GDPR compliance claimed.**

Framework references follow `architecture/compliance/ENGINEERING_COMPLIANCE_STANDARD.md` engineering targets only.

| Framework | Control / requirement (engineering) | Applicability | Implementation evidence | Test evidence | Gap | Risk | Remediation |
|-----------|--------------------------------------|---------------|-------------------------|---------------|-----|------|-------------|
| ISO 27001:2022 | A.5–A.8 access control | HIGH | RBAC guards, MFA, step-up on session revoke | partial jest | Session-audit spec broken | Medium | USR-P0-F-003 |
| ISO 27001:2022 | A.12 logging | HIGH | Activity log, mandatory billing audit | platform-permission http tests | Prod log health unknown | Medium | Production audit spec |
| ISO 27701:2025 | PII minimization in audit | MEDIUM | Audit DTOs redact secrets (policy) | not fully mapped | Need log sampling review | Low | USR_P1 privacy pass |
| GDPR Art. 25 | Data protection by design | HIGH | Tenant scoping, REMOVED isolation | iam-removed tests | MA i18n / UX copy | Low | USR-P0-F-002 |
| GDPR Art. 30 | Records of processing | ORG | iam-data-retention module exists | partial | Legal RoPA external | — | Legal/org owner |
| GDPR Art. 32 | Security of processing | HIGH | MFA, refresh tokens, securityVersion patterns | auth tests | Prod config unknown | Medium | Prod audit |
| GDPR Art. 17 | Erasure | MEDIUM | iam-data-retention strategies enum | module tests partial | Cross-org erasure coupling | Medium | coordinate w/ org offboarding |
| BDSG | National supplements | WHERE DE processing | same as GDPR engineering | — | Legal review external | — | Legal |
| TDDDG §25 | Cookies / device access | LOW for this audit | auth cookies in auth module | — | Not MA-users core | — | Auth authority |
| EU Data Act | Connected vehicle user access | LOW | N/A for Users module | — | — | — | — |

## Personal data categories (IAM)

From `IamDataCategory` enum: profile, membership, sessions, IP/UA, invites, reset tokens, MFA, audit, access reviews.

## Owner / legal decisions (not software)

- Legal basis documentation per processing activity
- DPIA for high-risk profiling (if applicable)
- Processor agreements (Resend, etc.)