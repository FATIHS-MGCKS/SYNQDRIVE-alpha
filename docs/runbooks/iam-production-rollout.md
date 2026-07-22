# IAM / Users & Roles — Production Rollout Runbook

| Field | Value |
|-------|-------|
| **Remediation ID** | `users-roles-production-readiness-remediation-2026-07` |
| **RC Branch** | `cursor/iam-production-readiness-fb6e` |
| **Implementation tracker** | `docs/implementation/users-roles-production-readiness-remediation-2026-07.md` |
| **Post-remediation audit** | `docs/audits/users-roles-post-remediation-readiness-2026-07.md` |
| **Metrics catalog** | `docs/architecture/IAM_PROMETHEUS_METRICS_2026-07-21.md` |

## Preconditions

- [ ] All IAM remediation branches (Prompts 1–21) integrated and green on RC branch
- [ ] `npx prisma validate` green
- [ ] Backend `npm run build` green
- [ ] IAM security specs green (`npm test -- --testPathPattern='iam-'`)
- [ ] `ENABLE_SEED_ADMIN=false` on production target
- [ ] Feature flags reviewed (see below)
- [ ] Backup verified within last 24h

## Feature flags (production defaults)

| Flag | Production default | Notes |
|------|-------------------|-------|
| `ENABLE_SEED_ADMIN` | `false` | **Must remain false** after bootstrap |
| `SEED_ADMIN_TOKEN` | unset | Required only during one-time bootstrap |
| `IAM_MFA_ENROLLMENT_ENABLED` | `false` | Enable per pilot org via allowlist |
| `IAM_MFA_STEP_UP_ENFORCED` | `false` | Enable after enrollment baseline |
| `IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED` | `false` | Pilot-only |
| `IAM_MFA_ORG_ALLOWLIST` | empty | Comma-separated org IDs |
| `IAM_DATA_RETENTION_ENABLED` | `false` | Enable only after dry-run sign-off |
| `IAM_DATA_RETENTION_DRY_RUN` | `true` | Keep true until legal review |

## Rollout sequence

### 1. Backup

```bash
# On VPS — use existing ops backup script before any migration
ssh root@${CLOUD_AGENT_VPS_HOST:-srv1374778.hstgr.cloud} \
  '/opt/synqdrive/current/backend/scripts/ops/vps-backup-database.sh'
```

Verify backup artifact exists and is restorable (read-only restore test on staging copy).

### 2. Release tag

Tag the merged RC commit on `main`:

```bash
git tag -a iam-rc-2026-07-22 -m "IAM users roles production readiness RC"
git push origin iam-rc-2026-07-22
```

### 3. Seed admin deaktivieren {#seed-admin}

Confirm on target environment:

```bash
grep -E 'ENABLE_SEED_ADMIN|SEED_ADMIN_TOKEN' /opt/synqdrive/env/backend.env
```

Expected production: `ENABLE_SEED_ADMIN=false` or unset; `SEED_ADMIN_TOKEN` unset.

Prometheus alert: `IamSeedAdminEnabledInProduction` (`iam_seed_admin_enabled == 1`).

### 4. Migration

```bash
cd /opt/synqdrive/current/backend
npx prisma migrate status
npx prisma migrate deploy
```

IAM migrations (apply in order):

| Migration | Purpose |
|-----------|---------|
| `20260721220000_invite_email_outbox` | Invite delivery outbox |
| `20260721230000_iam_audit_outbox` | Audit outbox v1 |
| `20260722000000_iam_audit_outbox_v2` | Transactional audit outbox |
| `20260722100000_iam_membership_lifecycle` | JML lifecycle |
| `20260722110000_iam_mfa_step_up` | MFA / step-up |
| `20260722120000_iam_access_review` | Access reviews |
| `20260722130000_iam_data_retention` | Retention / DSAR |

### 5. Backend + Worker deploy

Standard VPS deploy:

```bash
bash .cursor/scripts/cloud-agent-deploy.sh
```

Verify health: `https://app.synqdrive.eu/api/v1/health`

### 6. Feature flags

Roll out in order:

1. Deploy with all IAM flags **off** (safe defaults above)
2. Enable MFA enrollment for **one pilot org** (`IAM_MFA_ORG_ALLOWLIST`)
3. After enrollment baseline: `IAM_MFA_STEP_UP_ENFORCED=true` for pilot
4. Retention: dry-run on staging → `IAM_DATA_RETENTION_DRY_RUN=false` on staging → production last

### 7. Interne Pilotorganisation

Select one low-risk org with:

- ≥2 ORG_ADMIN users (not last-admin edge cases)
- Active invites disabled during first hour
- Operators on standby for session revocation

Validate:

- Login / refresh / logout
- Team tab KPIs and member drawer
- Role change with preview (if Prompt 10 integrated)
- Invite create → email delivery → accept
- Audit outbox processing (no DLQ growth)

### 8. Session migration

Read-only classification first (staging):

```sql
-- Legacy unscoped sessions (no membership binding) — classify only
SELECT COUNT(*) FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > NOW();
```

If Prompt 6–7 integrated: run session binding migration in **small batches** per runbook section in implementation doc. Do **not** mass-revoke without operator approval.

### 9. Role reconciliation (controlled)

Only after Prompt 11 integration:

- Dry-run drift report per org
- **Safe** assignments migrated in batches of ≤10 memberships
- **Unsafe** drift flagged for manual review — never auto-correct

### 10. Monitoring

Confirm Prometheus scrapes `iam_*` metrics and alerts in `backend/monitoring/prometheus/alerts.yml` group `synqdrive_iam`:

- Audit outbox DLQ
- Seed admin enabled
- Refresh reuse
- Privileged change spike
- Org without admin
- Invite delivery failures
- Cross-tenant denials

Grafana: import IAM panel from architecture doc when available.

### 11. Schrittweiser Rollout

| Phase | Audience | Duration | Gate |
|-------|----------|----------|------|
| Pilot | 1 internal org | 24h soak | No P0/P1, no cross-tenant |
| Wave 1 | 5 orgs | 48h | DLQ stable, invite delivery OK |
| Wave 2 | All orgs | — | `PRODUCTION_READY` sign-off |

## Rollback

1. **Disable new features via flags** — fastest path:
   - `IAM_MFA_STEP_UP_ENFORCED=false`
   - `IAM_DATA_RETENTION_ENABLED=false`
2. **Sessions** — if token behavior uncertain:
   - Revoke all refresh tokens for affected org(s) via admin tooling
   - Never re-enable legacy unscoped JWT claims
3. **Audit data** — **never delete** outbox or audit rows during rollback
4. **Code rollback** — redeploy previous release tag; migrations are expand-only — do not drop IAM tables in production
5. **Expand-contract** — old backend must tolerate new columns (nullable/defaulted)

## Non-production actions in this RC

The following were **not** executed against production in Prompt 22:

- Production DB migration
- Production deploy
- Production session mass-revocation
- Production role drift auto-correction
- 24-hour production soak

All validation was local CI + documented staging playbook.
