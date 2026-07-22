# IAM — Incident Response & Access Revocation Runbook

| Field | Value |
|-------|-------|
| **Owner** | Platform / Security |
| **Related rollout** | `docs/runbooks/iam-production-rollout.md` |
| **Retention / DSAR** | `docs/runbooks/iam-data-retention-and-user-rights.md` |

## Severity guide

| Severity | Examples | Response time |
|----------|----------|---------------|
| **P0** | Cross-tenant data access, invite secret in API, session usable after suspend | Immediate |
| **P1** | Audit DLQ growing, seed admin enabled in prod, refresh org switch | < 1h |
| **P2** | Invite delivery failures, elevated cross-tenant denials (probing) | < 4h |
| **P3** | Overdue access reviews, retention dry-run warnings | Next business day |

---

## Audit outbox / DLQ {#audit-outbox-dlq}

**Alerts:** `IamAuditOutboxDeadLetter`, `IamAuditOutboxRetrySustained`

**Symptoms:** `iam_audit_dead_letter_total` increasing; critical IAM mutations may lack durable audit.

**Response:**

1. Check outbox backlog:
   ```sql
   SELECT status, COUNT(*) FROM iam_audit_outbox GROUP BY status;
   ```
2. Inspect dead-letter rows (no secrets in payload):
   ```sql
   SELECT id, event_type, attempts, last_error, dead_lettered_at
   FROM iam_audit_outbox WHERE status = 'DEAD_LETTER' ORDER BY dead_lettered_at DESC LIMIT 20;
   ```
3. Fix root cause (audit sink DB, worker crash, schema mismatch)
4. **Replay** dead-letter events manually via support tooling — never delete
5. Confirm `iam_audit_outbox_failed_total` stops increasing

**Do not:** Delete outbox rows; disable audit worker without flagging incident.

---

## Seed admin enabled {#seed-admin}

**Alert:** `IamSeedAdminEnabledInProduction`

**Response:**

1. Set `ENABLE_SEED_ADMIN=false` in `backend.env`
2. Remove or rotate `SEED_ADMIN_TOKEN`
3. Redeploy backend
4. Verify `iam_seed_admin_enabled == 0`
5. Review access logs for `POST /auth/seed-admin` calls

---

## Refresh token reuse {#refresh-reuse}

**Alert:** `IamSessionReuseDetected`

**Symptoms:** `iam_session_reuse_detected_total` increase; possible token theft or double-refresh client bug.

**Response:**

1. Identify affected user families from application logs (user id only — not token)
2. Confirm family revocation occurred (`iam_session_revoked_total{scope="family"}`)
3. Force user password reset if theft suspected
4. Notify user to re-login on all devices
5. If client bug: identify app version and patch double-refresh

---

## Privileged change spike {#privileged-change-spike}

**Alert:** `IamPrivilegedChangesSpike`

**Response:**

1. Correlate with scheduled admin activity
2. Review audit outbox / user access audit for `USER_ROLE_CHANGED`, `MEMBERSHIP_SUSPENDED`, etc.
3. If unauthorized: invoke **Emergency access revocation** (below)

---

## Organization without admin {#org-without-admin}

**Alert:** `IamOrganizationWithoutAdmin`

**Response:**

1. Query orgs without active ORG_ADMIN
2. Assign temporary ORG_ADMIN via MASTER_ADMIN or break-glass process
3. Document in access review campaign

---

## Active session after suspension

**Stop criterion P0**

**Detection:** User with SUSPENDED membership can still call org-scoped APIs.

**Response:**

1. Immediately revoke all refresh tokens for user (`RefreshTokenService.revokeAllForUser`)
2. Verify membership status in DB
3. File P0 incident; block rollout until lifecycle session revocation verified

---

## Invite delivery failure {#invite-delivery}

**Alert:** `IamInviteDeliveryFailures`

**Response:**

1. Check invite email outbox:
   ```sql
   SELECT status, COUNT(*) FROM invite_email_outbox GROUP BY status;
   ```
2. Verify Resend API key and domain DNS
3. Retry failed rows via worker scheduler
4. **Never** expose `inviteToken` via admin API — resend rotates token server-side only

---

## Cross-tenant denials {#cross-tenant-denials}

**Alert:** `IamCrossTenantDenialsElevated`

**Response:**

1. Review `iam_cross_tenant_denial_total{source}` breakdown
2. Check for IDOR probing (same user, many org IDs)
3. If **any** successful cross-tenant access confirmed → **P0**, invoke emergency revocation
4. Review OrgScopingGuard and PermissionsGuard logs

---

## Access reviews overdue {#access-reviews}

**Alert:** `IamAccessReviewOverdue`

**Response:** Notify org admins; extend campaign or complete attestations. Not a platform outage.

---

## Emergency access revocation

Use when credential compromise, rogue admin, or confirmed IDOR.

### Single user (all sessions)

```bash
# Via account API (self) or admin support tooling
POST /api/v1/account/me/sessions/revoke-others
# Or backend: RefreshTokenService.revokeAllForUser(userId)
```

### Single org (all members)

1. Suspend memberships via `IamMembershipLifecycleService.suspend` per member
2. Revoke refresh tokens per affected user
3. Audit each action via transactional outbox

### Platform break-glass

1. `ENABLE_SEED_ADMIN` — **do not** enable in prod unless documented break-glass
2. MASTER_ADMIN session review
3. Feature flag kill switch: `IAM_MFA_STEP_UP_ENFORCED=false` only if step-up blocks legitimate recovery

---

## Role drift

**Never auto-correct unsafe drift in production.**

1. Export drift report (dry-run reconciliation)
2. Manual review per membership
3. Apply safe migrations in batches ≤10
4. Verify effective access preview matches intent

---

## Post-incident

- Preserve audit outbox and user access audit rows
- Update `docs/audits/users-roles-post-remediation-readiness-2026-07.md` if new findings
- Do not reactivate legacy unscoped session claims
