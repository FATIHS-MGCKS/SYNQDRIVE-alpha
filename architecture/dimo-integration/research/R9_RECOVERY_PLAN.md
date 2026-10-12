# R9 — Recovery plan (PREPARED ONLY — NOT EXECUTED)

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-R21-RECOVERY-PLAN-001` |
| **Status** | **DRAFT** — requires **explicit owner authorization** before any provider mutation |
| **AUDIT_MODE default** | READ_ONLY — mirror [WEBHOOK_OPERATIONS.md](../operations/WEBHOOK_OPERATIONS.md) gated scripts |

## 1. Affected definitions

| Role | stableId | Provider UUID |
|------|----------|---------------|
| R9 Speed Wake | `9eeb7158afee` | `7a5e81bc-8f48-4b62-877a-9df104c1f42e` |
| R9 Ignition Wake | `5d611d470eab` | `3a2fcd34-1a74-45db-bee9-75e340f36b00` |

## 2. Required API operation

| Step | Operation | Notes |
|------|-----------|-------|
| Preflight | `GET /v1/webhooks`, `GET /v1/webhooks/{id}` | Capture sanitized snapshot (status, fc, subs) |
| Recovery | **`PUT /v1/webhooks/{webhookId}`** per definition | Same payload shape as UNPLUG GT-R1 recovery; set `status: enabled`; provider resets **`failureCount` to 0** (source + VERIFIED UNPLUG) |
| Postflight | `GET` again | Expect `enabled`, `failureCount=0`, **subscriber count unchanged** |

**Do not** create new webhook UUIDs if PUT succeeds (minimize blast radius).

## 3. Before / after configuration (expected)

| Field | Before (R21) | After (expected if PUT mirrors UNPLUG) |
|-------|--------------|----------------------------------------|
| `status` | `failed` | `enabled` |
| `failureCount` | 12 / 28 | `0` |
| `metricName` / `condition` / cooldown / `targetHost` | unchanged | unchanged |
| Subscriptions | 5 tokenIds | **same 5** |

## 4. Impact on existing subscriptions

| Risk | Mitigation |
|------|------------|
| Subscription drop on PUT | UNPLUG recovery **VERIFIED** subs preserved; re-GET subscriber list before/after |
| Trigger ID change | **Avoid POST create** — keep UUIDs |

## 5. Verification flow (post-mutation)

1. Provider GET — `enabled`, `failureCount=0`, 5/5 subs.
2. SynqDrive `GET /api/v1/webhooks/dimo/health` — `verificationConfigured: true`.
3. Wait for **natural** speed/ignition event on cohort vehicle (prefer **187361** with fresh signals).
4. nginx — `POST /api/v1/webhooks/dimo` **200** during event window.
5. PM2 — `Received DIMO webhook` with `tokenId` + speed/ignition (if logging retained).
6. Trip Detection — wake mailbox / snapshot enqueue evidence (cross-module).

**Success criterion:** **B+C+D** observed for at least one cohort vehicle — **not** merely `enabled` on provider.

## 6. Risks & breaking changes

| Risk | Severity | Notes |
|------|----------|-------|
| Duplicate webhook if CREATE used instead of PUT | HIGH | Forbidden in this plan |
| Brief delivery burst after re-enable | LOW | Expected; monitor nginx 5xx |
| Re-enable while deploy in progress | MEDIUM | Schedule outside deploy window |
| 187336 stale device generates noise | LOW | Owner should confirm ownership first |

## 7. Rollback

| Scenario | Action |
|----------|--------|
| PUT causes unexpected sub loss | **STOP** — document GET diff; owner decides re-subscribe vs restore |
| Enabled but delivery still 5xx | Investigate ingress before second PUT |
| Need to disable quickly | `PUT` with `status: disabled` (authorized) — **not executed in R21** |

## 8. Partial success

| Case | Response |
|------|----------|
| Speed enabled, Ignition still failed | Independent PUT per UUID; do not delete paired defs |
| Provider enabled, no natural events 24h | Extend observation; verify polling still covers trips — **separate** TDL assessment |

## 9. Owner authorization required

| Gate | Requirement |
|------|-------------|
| Provider mutation | Explicit chat/ticket approval per [WEBHOOK_OPERATIONS.md](../operations/WEBHOOK_OPERATIONS.md) |
| Cohort hygiene | Decision on **187336** before or after PUT (offboard vs keep) |
| Production deploy | **No deploy** bundled with recovery unless separately approved |

## 10. Acceptance criteria (checklist)

- [ ] Both R9 UUIDs `enabled`, `failureCount=0`
- [ ] Subscriber tokenIds unchanged (5/5, 190497 absent)
- [ ] At least one **natural** R9 speed or ignition POST processed to wake/snapshot path
- [ ] No increase in nginx 5xx rate during recovery window
- [ ] Evidence file appended to `evidence/` with sanitized GET diff

**R21 execution:** **NONE** — `RECOVERY_REQUIRES_OWNER_APPROVAL=YES`.
