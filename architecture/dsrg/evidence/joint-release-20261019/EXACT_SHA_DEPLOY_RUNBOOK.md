# Exact-SHA deploy runbook (do not execute without owner GO)

**Target SHA:** use **`git rev-parse origin/main`** at owner GO (audit: `76b463c98e6f8a08ce3b0560deccbdd2a9ec3866`)  
**Canonical script:** `/opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh`  
**Runbook:** `architecture/dsrg/PRODUCTION_VPS_ACCESS_AND_DEPLOY_RUNBOOK.md`

---

## Preconditions

1. `origin/main` (or chosen SHA) **CI gate green** including Backend R11.
2. Owner message authorizing production release in this task/thread.
3. No active deploy lock (none at audit).
4. Disk: root **41%** used at audit — OK for backup.
5. **Do not** enable new feature flags during deploy.

---

## Authorization (from Cloud Agent — Path A)

```bash
export CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1
# Optional explicit SHA skip git preflight only if already pushed:
# export CLOUD_AGENT_REQUESTED_DEPLOY_SHA=cf20c49f6596589a56eae346b5550f0b662c46b6

bash .cursor/scripts/cloud-agent-deploy.sh
```

**On VPS (what the script ultimately runs):**

```bash
sudo SYNQDRIVE_REQUESTED_DEPLOY_SHA=cf20c49f6596589a56eae346b5550f0b662c46b6 \
  bash /opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh
```

Secrets: `DATABASE_URL` and others remain in `/opt/synqdrive/shared/backend.env` — **not** printed.

---

## What `vps-deploy-release.sh` does (preserved flow)

1. **VO5C** executor integrity + bypass enforcement (if libs present)
2. **DB identity preflight** (live schema)
3. **Fresh** `pg_dump synqdrive | gzip` → `/opt/synqdrive/shared/backups/db-pre-deploy-${TS}.sql.gz`
4. Gzip integrity + **capture sidecar** + **content gate**
5. Shallow **clone** release at exact SHA → `/opt/synqdrive/releases/${RELEASE_ID}_v4994`
6. **VO5C deploy target admission** on candidate release
7. Symlink shared env/uploads/documents
8. `npm ci`, `prisma generate`, guarded **`prisma:migrate:deploy`**, stamp consume, ownership fix, `npm run build`
9. EXP-021 fleet capability preflight
10. Frontend `npm ci` + `build`
11. Nest **boot check** on candidate
12. **Rolling** replica restart, scheduler leader convergence
13. Post-deploy health / monitoring hooks (per script tail)

**Not in scope:** guard-only install unless deploy blocked — then use `vps-production-database-guard-install-verified-bundle.sh` with separate owner GO.

---

## Guard bundle (only if deploy blocked on stale executor)

```bash
SYNQDRIVE_GUARD_BUNDLE_INSTALL_AUTHORIZED=1 \
SYNQDRIVE_GUARD_BUNDLE_REQUIRED_SHA=cf20c49f6596589a56eae346b5550f0b662c46b6 \
bash backend/scripts/ops/vps-production-database-guard-install-verified-bundle.sh \
  /opt/synqdrive/current/backend/scripts/ops
```

Run from a git checkout at the **same** SHA on the VPS or via release tree — **no invented bootstrap**.

---

## CI gate (mandatory)

Cloud deploy script enforces **latest CI gate success** on requested SHA — do not set `CLOUD_AGENT_SKIP_CI_GATE`.

---

## Post-deploy

See `POST_DEPLOY_ACCEPTANCE_AND_ROLLBACK.md`.

**DEPLOY_EXECUTED=NO** (this document is plan-only).
