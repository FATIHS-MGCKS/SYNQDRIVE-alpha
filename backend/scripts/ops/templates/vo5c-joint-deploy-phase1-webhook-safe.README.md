# VO5C joint deploy — Phase 1 webhook-safe integration (R2.6)

**Production file (read-only reference):** `/opt/synqdrive/shared/deploy-state/vo5c-joint-deploy-orchestrate.sh`

**Problem:** Phase 1 replaces the live site with a global `return 503`, breaking DIMO Vehicle Triggers callbacks.

**Repo integration (not applied on VPS until owner rollout):**

1. Source `backend/scripts/ops/lib/vps-vo5c-nginx-webhook-safe-maintenance.lib.sh` from the **pinned executor** tree at deploy time.
2. Replace the `NGINX_MAINT` heredoc (Phase 1) with output of:

   ```bash
   vo5c_emit_webhook_safe_maintenance_site synqdrive_backend /api/v1/webhooks/dimo
   ```

3. Keep existing golden backup (`cp -a "$NGINX_SITE" "$NGINX_BACKUP"`) and restore on deploy failure (unchanged).
4. After `nginx -t`, `systemctl reload nginx`.
5. **Public isolation check** must distinguish:
   - `GET /` → expect **503**
   - `POST /api/v1/webhooks/dimo` → expect **502/503** only if **no healthy upstream** (fail-closed), never fake 200 from nginx.

**Preserved VO5C gates:** pinned executor, security floor preflight, `SYNQDRIVE_VO5C_DEPLOY_AUTHORIZED`, deploy lock, DB backup, rolling restart, Phase 6 restore.

**Other webhooks:** Same callback URL path serves all SynqDrive DIMO triggers — single exemption covers R9, UNPLUG, RPM, etc.
