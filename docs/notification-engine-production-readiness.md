# Notification Engine — Production Readiness Audit (Prompt 16)

**Version:** V4.9.359  
**Date:** 2026-07-11  
**Status:** Conditional Go — migration tooling ready; cutover not approved without staged execution

---

## 1. Executive summary

| Area | Status | Notes |
|------|--------|-------|
| Architecture (backend) | **Pass** | Single canonical engine; full chain through outbox |
| Frontend V2 cutover | **Pass** | Cutover + Panel UI merged on integration branch |
| Data migration tooling | **Ready** | Dry-run + idempotent backfill + acceptance SQL |
| Legacy cleanup | **Not started** | Flags retained; no file deletion |
| E2E production test | **Partial** | Unit/integration tests pass; no prod DB run in CI |
| Security | **Pass with caveats** | Tenant isolation wired; delivery flag off by default |
| Performance | **Pass with caveats** | BullMQ + debounce; backlog alerts defined |
| **Go/No-Go** | **CONDITIONAL GO** | Staged org dry-run → backfill → acceptance → flag cutover |

We do **not** claim unconditional production readiness. Open risks are listed in §10.

---

## 2. Architecture chain audit (Teil A)

```
Producer → Candidate → Registry → Fingerprint → Lock → Core → DB → Occurrence
  → Receipt → API → [Frontend] → Outbox → Delivery → Metrics
```

| Link | Component | Verified |
|------|-----------|----------|
| Producer | Shadow adapters + BI evaluation | Yes |
| Candidate | `NotificationCandidate` + validators | Yes |
| Registry | 30 event types, delivery policies | Yes |
| Fingerprint | `org\|eventType\|entity\|condition\|vN` | Yes — no title/time |
| Lock | Redis org lock (evaluation) | Yes |
| Core | `NotificationCoreService` | Yes — single engine |
| DB | `notifications` + partial unique index | Yes |
| Occurrence | Append-only audit | Yes |
| Receipt | Per-user read/ack/snooze | Yes |
| API | `NotificationsController` gated `NOTIFICATIONS_V2` | Yes |
| Frontend | V2 panel + `useNotifications` | On feature branches |
| Outbox | Transactional `notification_delivery_outbox` | Yes |
| Delivery | BullMQ + OutboundEmail | Yes — `NOTIFICATIONS_DELIVERY_ENABLED` |
| Metrics | `synqdrive_notification_*` | Yes |

**Confirmed**

- One canonical notification engine (no second persistence path)
- No notification creation in frontend (view-model composition only)
- No text/time-based fingerprint IDs
- Partial unique index prevents multiple active fingerprints

**Parallel logic (intentional until cutover)**

- V1 `ActionQueue` / `normalizeOperationalIssues` when `VITE_NOTIFICATIONS_V2` off
- `DashboardInsight` table remains producer
- `VehicleComplaint` via technical-observation producer (not insight backfill)
- `OrgTask` / alert bridge unchanged

Run audit:

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/notification-migration-dry-run.ts
```

---

## 3. Data analysis before migration (Teil B)

### Sources analyzed

| Source | Table / path | Migration path |
|--------|--------------|----------------|
| Dashboard Insights | `dashboard_insights` | **Backfill** via `notification-migration-backfill.ts` |
| Technical observations | `vehicle_complaints` | **Producer sync** (not insight backfill) |
| Health alerts | Rental health + detectors | Partially in insights; rest via producers |
| V2 notifications | `notifications` | Target state |
| Preferences | `user_notification_preferences` | Unchanged |
| Delivery outbox | `notification_delivery_outbox` | Post-cutover only |

### Detection rules (no title-similarity migration)

- Identity = registry candidate + `fingerprintFromCandidate`
- Unmigratable = insight types without `notificationCandidateFromInsight` mapping
- Duplicate = same fingerprint, multiple insight rows
- Same entity / different cause = multiple fingerprints per entity (valid)
- Same cause / different text = same fingerprint, different titles (merge, don't split)
- Stale = active insight older than configurable threshold (default 90d)

### Dry-run command

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/notification-migration-dry-run.ts --org <ORG_ID> --out /tmp/notification-dry-run.json
```

Report fields: `duplicates`, `unmigratable`, `missingEntityIds`, `projected` (migrated/merged/skipped/unresolved).

---

## 4. Backfill strategy (Teil C)

### Properties

- **Dry-run** (`--dry-run`): statistics only, no writes
- **Apply** (`--apply`): transactional writes
- **Org-scoped** (`--org` required)
- **Batch** 100 rows per iteration
- **Checkpoint** JSON (`--checkpoint path.json`)
- **Idempotent**: `legacy_insight_id` + fingerprint active lookup
- **Merge**: existing active V2 → add occurrence, extend timestamps, preserve sourceRefs

### Migratable insight types

All 15 Prisma `InsightType` values — see `MIGRATABLE_INSIGHT_TYPES` in `insight-candidate.mapper.ts`.

Previously unmigratable types (now covered): `TIGHT_HANDOVER`, `RETURN_NEEDS_INSPECTION`, `LOW_UTILIZATION`, `SERVICE_WINDOW`, `SERVICE_BEFORE_BOOKING`, `TUV_OVERDUE`, `BOKRAFT_OVERDUE`, `HM_SERVICE_NO_TRACKING`.

### Commands

```bash
# Dry-run
npx ts-node -r tsconfig-paths/register scripts/notification-migration-backfill.ts --org <ORG_ID> --dry-run

# Apply (after dry-run review)
npx ts-node -r tsconfig-paths/register scripts/notification-migration-backfill.ts --org <ORG_ID> --apply --checkpoint /tmp/backfill-checkpoint.json
```

### Protocol counters

`migrated` | `merged` | `skipped` | `unresolved` | `failed`

---

## 5. Database acceptance (Teil D)

```sql
-- Duplicate active fingerprints (must return 0 rows)
SELECT organization_id, fingerprint, COUNT(*)
FROM notifications
WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED')
GROUP BY organization_id, fingerprint
HAVING COUNT(*) > 1;
```

Automated:

```bash
npx ts-node -r tsconfig-paths/register scripts/notification-migration-acceptance.ts --org <ORG_ID>
```

Checks: duplicate fingerprints, entity IDs, orphan occurrences, delivery dead-letter, backlog.

---

## 6. V1 vs V2 alignment

| Aspect | V1 | V2 |
|--------|----|----|
| Identity | `semanticKey` / `dedupeKey` (frontend) | Canonical fingerprint |
| Persistence | `dashboard_insights` | `notifications` |
| Inbox API | Composed in `useDashboardViewModel` | `GET /notifications` |
| User state | N/A global | `notification_receipts` |
| Delivery | None | Outbox + email |

**Cutover flags (keep until sign-off)**

- Backend: `NOTIFICATIONS_V2`, `NOTIFICATIONS_DELIVERY_ENABLED`
- Frontend: `VITE_NOTIFICATIONS_V2` (PR #146)

**Rollback:** set flags false — V1 paths remain.

---

## 7. Controlled cutover plan

1. Deploy backend through PR #148 (delivery) on staging
2. `prisma migrate deploy`
3. Per-org dry-run report → review duplicates/unresolved
4. Per-org backfill dry-run → apply
5. Acceptance script → 0 duplicate fingerprints
6. Enable `NOTIFICATIONS_V2=true` (shadow producers already ingest)
7. Enable `VITE_NOTIFICATIONS_V2=on` for pilot org
8. Monitor Grafana notification panels 48h
9. Enable `NOTIFICATIONS_DELIVERY_ENABLED=true` for pilot org
10. Fleet-wide cutover after acceptance

---

## 8. Legacy cleanup (deferred)

**Do not delete until V2 stable 2+ weeks:**

- `buildUnifiedActionQueue` V1 path
- `dashboardNotifications` synthetic feed
- Duplicate characterization tests marked legacy

Verify no imports before removal (grep + build).

---

## 9. Security audit

| Control | Status |
|---------|--------|
| Org scoping on API | Yes — `OrgScopingGuard` |
| Station scope SUB_ADMIN/WORKER | Yes |
| Receipt isolation per user | Yes |
| Delivery recipient scope | Yes — membership + station |
| No secrets in metrics/logs | Yes — payload refs only |
| Feature flags default off | Yes |
| Manual resolve policy | Yes — registry gated |

**Gaps:** No penetration test run; delivery manual retry API not implemented.

---

## 10. Performance audit

| Area | Mechanism |
|------|-----------|
| Evaluation storm | Redis debounce + org lock |
| Delivery throughput | BullMQ concurrency 4 |
| DB contention | Partial unique + optimistic version |
| Backfill | Batched 100, checkpointed |

**Gaps:** No load test at 10k notifications/org; open-age histogram not yet populated in runtime.

---

## 11. Test results

```bash
cd backend && npx prisma validate
cd backend && npx tsc --noEmit
cd backend && npm test -- --testPathPattern=notification
```

Expected: all notification suites pass including `notification-migration.spec.ts`.

---

## 12. Open risks (honest)

1. ~~Frontend V2 not merged to main~~ — **resolved** on integration branch (cutover + panel UI)
2. Backfill not executed against production data — **operational step** before flag flip (tooling ready)
3. ~~Non-migratable insight types~~ — **resolved** (all 15 InsightTypes mapped)
4. Push channel not implemented — **accepted** (intentional stub until provider wired)
5. Quiet hours/digest env-only (no per-user DB fields) — **accepted** for v1 cutover
6. `fingerprintPartsFromInsightDedupeKey` bridge ≠ candidate fingerprint for some types — **backfill uses candidate path only** (documented)

---

## 13. Go / No-Go recommendation

| Decision | **CONDITIONAL GO** |
|----------|-------------------|
| Backend engine + delivery | Ready for staged enablement |
| Migration tooling | Ready for dry-run on staging/prod clone |
| Full production cutover | **NO-GO** until per-org dry-run + backfill + acceptance on real data |
| Legacy removal | **NO-GO** — retain flags and V1 paths |

**Sign-off checklist**

- [ ] Staging dry-run reviewed
- [ ] Pilot org backfill applied
- [ ] Acceptance SQL clean
- [x] PR #146/#147 merged (integration branch)
- [ ] 48h monitoring clean
- [ ] Product owner approves flag flip

---

## Related docs

- `docs/notification-engine-delivery-and-observability.md`
- `docs/notification-engine-migration-plan.md`
- `docs/notification-engine-api.md`
- `docs/notification-engine-permissions-and-preferences.md`
