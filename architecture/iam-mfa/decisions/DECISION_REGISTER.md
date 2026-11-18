# IAM MFA — Decision Register (Bootstrap)

| Decision ID | Title | STATUS | Evidence |
|-------------|-------|--------|----------|
| IAM-MFA-DEC-FLAGS-001 | Default-off MFA rollout | VALIDATED | IAM-MFA-EVID-CODE-FLAGS-001 |

---

## IAM-MFA-DEC-FLAGS-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Privileged operations relied on JWT + RBAC only |
| **WHY** | Ship MFA machinery without forcing Production activation before org rollout |
| **CHANGE** | `IamMfaFeatureFlagsResolver` — all rollout flags default **false** when env unset; guards no-op when disabled |
| **NON-EFFECTS** | Does not enable MFA on Production without operator env changes |
| **EVIDENCE** | IAM-MFA-EVID-CODE-FLAGS-001 |
| **VALIDATION** | `iam-mfa-feature-flags.resolver.spec.ts`, `iam-mfa.security.spec.ts` |
| **PRODUCTION STATUS** | **NOT_PRODUCTION_VALIDATED** — flag values **UNKNOWN** (IAM-MFA-GAP-001) |

Supporting (non-authority): `architecture/IAM_MFA_STEP_UP_2026-07-21.md`, P2-PR4A change record default-off note.