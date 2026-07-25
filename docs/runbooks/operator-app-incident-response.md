# Operator App — Incident Response Runbook

Operational playbook for SynqDrive Operator WebApp surfaces. Complements platform runbooks (`docs/runbooks/voice-incidents.md`, document intake ops).

## Quick signals

| Symptom | Primary metrics / logs | Health endpoint |
|---------|------------------------|-----------------|
| Handover won't complete | `synqdrive_operator_handover_total{event="completion_failure"}` | — |
| Upload stuck / failing | `synqdrive_operator_upload_failure_total`, `synqdrive_operator_upload_queue_backlog` | `GET /api/v1/health/operator` |
| Draft sync issues | `synqdrive_operator_draft_save_failure_total` | — |
| Permission errors spike | `synqdrive_operator_auth_denial_total` | — |
| Queue backlog | `synqdrive_document_extraction_queue_age`, operator upload backlog gauge | `health/operator` → `documentQueue` |
| Storage errors | `synqdrive_operator_storage_health` | `health/operator` → `storage` |
| Suspicious tenant access | `iam_cross_tenant_denial_total`, `synqdrive_operator_auth_denial_total{reason="tenant_scope"}` | — |

**Correlation:** Use `X-Request-Id` / `correlationId` from structured logs (`operator.*`). Logs intentionally omit PII — only `orgRef` (first 8 chars of org UUID).

---

## 1. Handover completion failure

### Detect

- Alert: `rate(synqdrive_operator_handover_total{event="completion_failure"}[5m]) > 0.2` sustained 10m
- Log: `operator.handover.failed` with `errorCode` (`HANDOVER_PICKUP_WRONG_STATUS`, `HANDOVER_ALREADY_EXISTS`, `HANDOVER_PICKUP_VEHICLE_BLOCKED`, …)

### Triage

1. Confirm booking status matches expected transition (CONFIRMED→pickup, ACTIVE→return).
2. Check pickup gate / eligibility blocks in booking detail API.
3. Search idempotent replays: `synqdrive_operator_idempotency_replay_total` — benign if client double-tapped.
4. Version conflicts: `synqdrive_operator_version_conflict_total{surface="task_complete"}` (task side effects after handover).

### Mitigate

- Operator retries after refreshing booking detail.
- If vehicle blocked (`HANDOVER_PICKUP_VEHICLE_BLOCKED`): release vehicle from IN_SERVICE/OUT_OF_SERVICE first.
- If duplicate protocol: verify existing protocol in DB; do not delete without ops approval.

### Recovery / rollback

- Handover protocols are transactional — failed requests leave no partial protocol.
- Idempotent pickup replay returns existing protocol when booking already ACTIVE.

---

## 2. Upload disruption

### Detect

- `synqdrive_operator_upload_failure_total` spike
- `synqdrive_operator_upload_queue_backlog > 50` (warning) / `> 200` (critical)
- `synqdrive_operator_ocr_failure_total` for post-upload processing

### Triage

1. `GET /api/v1/health/operator` — check `documentQueue`, `storage`, `workers`.
2. `GET /api/v1/health/readiness` — Postgres, Redis, document extraction subsystem.
3. Grafana: `synqdrive_document_extraction_*` panels (shared intake pipeline).
4. Error codes: `mime_rejected`, `duplicate_blocked`, `queue_unavailable`, OCR `error_code` labels.

### Mitigate

- Redis/workers down → restore workers (`RuntimeStatusRegistry`, PM2 `synqdrive-worker`).
- Storage unavailable → check `LOCAL_DOCUMENT_STORAGE_DIR` / S3 credentials; `storageAvailable` in readiness.
- Queue backlog → scale workers; inspect failed jobs in BullMQ `document.extraction`.

### Recovery

- Re-upload after queue healthy; duplicate detection may require `reuploadReason` from rental UI path.
- Operator uploads tagged `uploadSource=operator_app` in extraction metadata.

---

## 3. Draft sync disruption

### Detect

- `synqdrive_operator_draft_save_failure_total` (server draft API — when enabled)
- Client-side: operator handover form data loss (no server metric yet)

### Triage

1. Verify network / auth on operator device.
2. Check API errors on handover routes in `operator.api.request` logs.
3. Confirm draft retention job not purging active sessions (future `operator_orphan_extraction` retention).

### Mitigate

- Operator re-opens booking and re-enters handover data.
- Disable aggressive retention env windows if legal hold applies.

---

## 4. Auth / permission disruption

### Detect

- `synqdrive_operator_auth_denial_total` by `reason` (`unauthorized`, `forbidden`, `tenant_scope`)
- Parallel IAM metric: `iam_effective_access_denied_total`

### Triage

1. **unauthorized** — JWT expired; Clerk/session issue; check 401 rate on operator routes.
2. **forbidden** — missing module permission (e.g. `bookings.write`, `tasks.complete`).
3. **tenant_scope** — user JWT `organizationId` mismatch or revoked membership.

### Mitigate

- Re-login on operator device.
- Org admin: verify membership ACTIVE and permissions JSON.
- MASTER_ADMIN cross-org access is intentional — still logged via IAM metrics.

---

## 5. Queue backlog

### Thresholds (document.extraction — operator uploads)

| Level | `synqdrive_operator_upload_queue_backlog` | Action |
|-------|-------------------------------------------|--------|
| OK | ≤ 50 | Monitor |
| Warning | 51–200 | Check worker CPU/Redis; review failed jobs |
| Critical | > 200 | Page on-call; pause non-essential batch jobs |

### Task automation outbox

| Level | `synqdrive_operator_outbox_backlog` | Action |
|-------|-------------------------------------|--------|
| Warning | > 100 pending | Inspect `task_automation_outbox` DEAD_LETTER rows |
| Critical | > 500 | Scale workers; review `synqdrive_task_automation_outbox_failed_total` |

---

## 6. Storage disruption

### Detect

- `synqdrive_operator_storage_health == 0`
- Readiness `documentExtraction.storageAvailable: false`

### Triage

1. Disk space on VPS (`df -h`) for local storage provider.
2. Object storage credentials / bucket policy if S3-compatible.
3. Malware scan or identification failures masquerading as storage errors.

### Mitigate

- Free disk / rotate logs.
- Restore storage mount; redeploy if env misconfigured.

---

## 7. Suspicious tenant access

### Detect

- Spike in `synqdrive_operator_auth_denial_total{reason="tenant_scope"}`
- `iam_cross_tenant_denial_total{source="org_scoping"}`

### Triage

1. Correlate by time window — single user vs distributed.
2. Review `OrgScopingGuard` warn logs (user id only, not email).
3. Check for leaked booking URLs with wrong org context.

### Response

- Revoke compromised sessions if JWT theft suspected (IAM session revoke).
- No automated block — escalate to security contact.

---

## 8. Rollback / recovery steps

1. **Deploy rollback** — `bash .cursor/scripts/cloud-agent-deploy.sh` with previous `main` SHA (see `docs/runbooks` VPS deploy).
2. **Disable operator mutations** — not feature-flagged; use org-level permission freeze via membership if needed.
3. **Queue drain** — pause producers only after identifying root cause; do not purge Redis without backup.
4. **Data repair** — handover protocols require manual ops review; never delete `booking_handover_protocol` in prod without ticket.
5. **Post-incident** — export Prometheus snapshot + `operator.*` logs filtered by `correlationId`.

---

## Related documentation

- `docs/audits/operator-app-observability-2026-07.md` — metric catalog & alert thresholds
- `architecture/` Operator WebApp entry in Architektur view
- Document intake: `docs/runbooks/` document extraction ops (if present)
- IAM: `docs/audits/` IAM security regression specs
