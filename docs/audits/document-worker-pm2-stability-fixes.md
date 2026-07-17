# PM2 Stability Fixes (Prompt 6 of 84)

| Field | Value |
|-------|-------|
| **Date (UTC)** | 2026-07-17 |
| **Basis** | [document-worker-pm2-stability.md](./document-worker-pm2-stability.md) (Prompt 5 audit) |
| **Scope** | PROVEN / LIKELY restart causes only |

---

## Root Causes Addressed

| # | Classification | Cause | Fix |
|---|----------------|-------|-----|
| 1 | **PROVEN** | NestJS bootstrap/DI failure after deploy → PM2 autorestart every ~2–3s (517× exit code 1) | Pre-deploy `npm run ops:bootstrap-smoke` aborts deploy before `pm2 reload` |
| 2 | **PROVEN** | PM2 `autorestart: true` without backoff amplifies single boot error | `ecosystem.config.cjs`: `min_uptime` 10s, `max_restarts` 5, `exp_backoff_restart_delay` 2s |
| 3 | **PROVEN** | Bootstrap failures lack explicit tagging | `BOOTSTRAP_FAILED` in `main.ts` via `bootstrap().catch()` |
| 4 | **Policy** | Worker/async errors must not uncontrolled-kill API | `unhandledRejection` → structured log, no `process.exit` |
| 5 | **LIKELY** | Battery V2 BullMQ job IDs with `:` → `Custom Id cannot contain :` (7540+ errors) | Prefix `battery-v2-`, sanitize `:` → `-` in job IDs |

**Not changed (EXCLUDED in audit):** document worker, OOM, Mistral, ClickHouse warnings, separate worker PM2 process, Docker.

---

## Changed Files

| File | Change |
|------|--------|
| `backend/src/main.ts` | Process handlers + bootstrap failure logging |
| `backend/ecosystem.config.cjs` | PM2 crash-loop limits |
| `backend/scripts/ops/bootstrap-smoke.ts` | Nest bootstrap smoke (create + close) |
| `backend/scripts/ops/vps-deploy-release.sh` | Smoke gate + `pm2 reload ecosystem.config.cjs` |
| `backend/package.json` | `ops:bootstrap-smoke`, `ops:pm2-config-validate` |
| `backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-queue.util.ts` | BullMQ-safe job IDs |
| `backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-queue.util.spec.ts` | Updated expectations |
| `backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-producer-migration.spec.ts` | Updated expectations |
| `frontend/src/master/components/ChangesView.tsx` | Changelog entry V4.9.582 |
| `frontend/src/master/components/ArchitekturView.tsx` | PM2 deploy stability layer |

---

## Deployment Steps

**No manual production restart in Prompt 6.** Apply on next standard deploy:

1. Merge PR to `main` and push.
2. Run deploy as usual: `bash .cursor/scripts/cloud-agent-deploy.sh` (clones `main`, runs `vps-deploy-release.sh` on VPS).
3. Deploy script order (backend):
   - `npm ci` → `prisma generate` → migrate → `npm run build`
   - **`npm run ops:bootstrap-smoke`** — fails fast if Nest cannot bootstrap
   - Switch `/opt/synqdrive/current` symlink
   - **`pm2 reload ecosystem.config.cjs --update-env`** (or `pm2 start` if process missing)
   - `pm2 save` → health curl
4. On smoke failure: deploy aborts; previous release remains active; fix DI/build and redeploy.

**Rollback:** Deploy previous known-good release via standard release symlink + `pm2 reload ecosystem.config.cjs --update-env`.

---

## Local Validation

```bash
cd backend
npm ci
npx prisma generate
npm run build
npm run ops:pm2-config-validate
npm test -- battery-v2-job-queue.util.spec.ts battery-v2-producer-migration.spec.ts
```

`ops:bootstrap-smoke` requires working `.env` (DB/Redis). Run only when local infra is up.

---

*Prompt 6 complete — no production mutations during implementation.*
