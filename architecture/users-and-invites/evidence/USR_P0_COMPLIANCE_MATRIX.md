# USR_P0-R-005 — Compliance engineering matrix (corrected)

**No ISO certification. No legal GDPR compliance claim.**

Classification: `ENGINEERING_CONTROL` | `ORGANIZATIONAL_REQUIREMENT` | `LEGAL_REVIEW_REQUIRED` | `EXTERNAL_CERTIFICATION_REQUIRED`

## ISO/IEC 27001:2022 (Annex A controls — engineering targets)

| Control | Applicability | Implementation evidence | Gap class |
|---------|---------------|-------------------------|-----------|
| A.5.15 Access control | HIGH | RBAC, org scoping, ProductLicenseGuard | Session audit durability (R-002) |
| A.5.16 Identity management | HIGH | User/Membership models, invites | Prod inventory not executed |
| A.5.17 Authentication information | HIGH | bcrypt, refresh rotation | Stale JWT window (R-008) |
| A.5.18 Access rights | HIGH | PermissionsGuard, platform grants | Legacy `admin/users` API_ONLY paths |
| A.8.2 Privileged access rights | HIGH | MASTER_ADMIN, MFA guards | MFA flag-gated; tests partially mocked |
| A.8.3 Information access restriction | HIGH | Tenant isolation | **NOT production verified** |
| A.8.5 Secure authentication | HIGH | MFA, step-up, throttling on login | Delegate MFA policy off |
| A.8.10 Information deletion | MEDIUM | `IamUserDeletionService` | Scheduled retention jobs not proven |
| A.8.15 Logging | HIGH | ActivityLog, master admin audit | Silent session audit drop (R-002) |
| A.8.16 Monitoring activities | MEDIUM | IamMetrics partial | No prod SIEM attestation |

**Removed:** obsolete ISO 27001:2013 **A.12** logging references (not 2022 Annex A).

## ISO/IEC 27701:2025

| Topic | Status |
|-------|--------|
| PIMS extension mapping | **Verification pending** — normative clause crosswalk not in repo |
| Privacy engineering in IAM retention module | `ENGINEERING_CONTROL` — partial |

## GDPR (engineering applicability — not legal compliance)

| Article | Engineering note |
|---------|------------------|
| Art. 5 | Minimization in audit envelope; DSAR export exists |
| Art. 6 | **LEGAL_REVIEW_REQUIRED** — RoPA not in software |
| Art. 12–22 | DSAR routes; identity verification depth **UNKNOWN** |
| Art. 25 | By-design tenant scoping; JWT stale window risk |
| Art. 28 | Processor agreements **ORGANIZATIONAL** |
| Art. 30 | RoPA **ORGANIZATIONAL** |
| Art. 32 | MFA, encryption at rest (platform) — partial test evidence |
| Art. 33–35 | Breach/DPIA **LEGAL_REVIEW_REQUIRED** |

**USR-P0-F-002 (i18n):** `ENGINEERING_CONTROL` / product quality — **not** classified as GDPR violation.

## BDSG / TDDDG / EU Data Act

| Framework | Applicability |
|-----------|---------------|
| BDSG | Where DE processing — organizational overlays |
| TDDDG §25 | Auth cookies — auth module scope |
| EU Data Act | Connected-vehicle user access — **LOW** for Users module; vehicle identity in other authorities |