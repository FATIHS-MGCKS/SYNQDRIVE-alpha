-- Notification Engine integrity audit queries (Remediation Prompt 6)
-- Run against production/staging before and after migration deploy.
-- All queries are read-only.

-- ── 1) Active duplicate fingerprints (must be zero before/after migration) ──
SELECT
  organization_id,
  fingerprint,
  COUNT(*)::bigint AS active_count,
  array_agg(id ORDER BY lifecycle_generation DESC, last_seen_at DESC) AS notification_ids
FROM notifications
WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED')
GROUP BY organization_id, fingerprint
HAVING COUNT(*) > 1
ORDER BY active_count DESC, organization_id, fingerprint;

-- ── 2) Orphan notification occurrences ──
SELECT o.id, o.notification_id, o.organization_id, o.occurred_at
FROM notification_occurrences o
LEFT JOIN notifications n ON n.id = o.notification_id
WHERE n.id IS NULL
ORDER BY o.occurred_at DESC
LIMIT 100;

-- ── 3) Orphan notification receipts ──
SELECT r.id, r.notification_id, r.user_id, r.organization_id
FROM notification_receipts r
LEFT JOIN notifications n ON n.id = r.notification_id
WHERE n.id IS NULL
ORDER BY r.created_at DESC
LIMIT 100;

-- ── 4) Orphan delivery outbox rows ──
SELECT d.id, d.notification_id, d.organization_id, d.status, d.created_at
FROM notification_delivery_outbox d
LEFT JOIN notifications n ON n.id = d.notification_id
WHERE n.id IS NULL
ORDER BY d.created_at DESC
LIMIT 100;

-- ── 5) Invalid / missing organizations on notifications ──
SELECT n.id, n.organization_id, n.fingerprint, n.status
FROM notifications n
LEFT JOIN organizations o ON o.id = n.organization_id
WHERE o.id IS NULL
ORDER BY n.created_at DESC
LIMIT 100;

-- ── 6) Cross-tenant child organization_id mismatches ──
SELECT 'occurrence' AS child_table, o.id, o.organization_id AS child_org, n.organization_id AS parent_org
FROM notification_occurrences o
JOIN notifications n ON n.id = o.notification_id
WHERE o.organization_id IS DISTINCT FROM n.organization_id
UNION ALL
SELECT 'receipt', r.id, r.organization_id, n.organization_id
FROM notification_receipts r
JOIN notifications n ON n.id = r.notification_id
WHERE r.organization_id IS DISTINCT FROM n.organization_id
UNION ALL
SELECT 'outbox', d.id, d.organization_id, n.organization_id
FROM notification_delivery_outbox d
JOIN notifications n ON n.id = d.notification_id
WHERE d.organization_id IS DISTINCT FROM n.organization_id;

-- ── 7) Invalid / blank entity references ──
SELECT id, organization_id, entity_type, entity_id, fingerprint, status
FROM notifications
WHERE length(trim(entity_id)) = 0
   OR entity_id = 'unknown'
ORDER BY created_at DESC
LIMIT 100;

-- ── 8) Status/timestamp invariant violations ──
SELECT id, organization_id, status, resolved_at, archived_at, snoozed_until
FROM notifications
WHERE (status = 'RESOLVED' AND resolved_at IS NULL)
   OR (status = 'ARCHIVED' AND archived_at IS NULL)
   OR (status = 'SNOOZED' AND snoozed_until IS NULL)
   OR first_seen_at > last_seen_at
ORDER BY updated_at DESC
LIMIT 100;

-- ── 9) JSON payload size outliers (pre-migration advisory) ──
SELECT id, organization_id, octet_length(template_params::text) AS template_params_bytes
FROM notifications
WHERE octet_length(template_params::text) > 32768
ORDER BY template_params_bytes DESC
LIMIT 50;

SELECT id, notification_id, octet_length(payload::text) AS payload_bytes
FROM notification_occurrences
WHERE payload IS NOT NULL AND octet_length(payload::text) > 65536
ORDER BY payload_bytes DESC
LIMIT 50;

-- ── 10) Repair log summary (post-migration) ──
SELECT action, COUNT(*)::bigint AS repair_count
FROM notification_integrity_repair_log
WHERE migration_id = '20260726120000_notification_db_integrity'
GROUP BY action
ORDER BY repair_count DESC;
