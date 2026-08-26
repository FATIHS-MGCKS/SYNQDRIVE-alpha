-- Read-only connectivity closure audit queries (Production)
\set ON_ERROR_STOP on

\echo '=== INBOX BY STATUS ==='
SELECT processing_status::text AS status, count(*) AS n
FROM device_connection_webhook_inbox
GROUP BY 1
ORDER BY 1;

\echo '=== INBOX POST-CUTOVER (>= 2026-08-25T08:04:17Z) ==='
SELECT processing_status::text AS status, count(*) AS n
FROM device_connection_webhook_inbox
WHERE received_at >= '2026-08-25T08:04:17Z'
GROUP BY 1
ORDER BY 1;

\echo '=== INBOX STUCK POST-CUTOVER ==='
SELECT id, processing_status, processing_attempts, last_error_code, received_at, processed_at
FROM device_connection_webhook_inbox
WHERE received_at >= '2026-08-25T08:04:17Z'
  AND processing_status IN ('RECEIVED', 'RETRYABLE_FAILED')
ORDER BY received_at;

\echo '=== INBOX OLDEST UNPROCESSED ==='
SELECT min(received_at) AS oldest_unprocessed_received_at,
       count(*) FILTER (WHERE processing_status NOT IN ('PROCESSED', 'IGNORED', 'DEAD_LETTER')) AS not_terminal
FROM device_connection_webhook_inbox;

\echo '=== CANONICAL EVENTS POST-CUTOVER ==='
SELECT count(*) AS post_cutover_events,
       count(*) FILTER (WHERE processed_at IS NULL) AS processed_at_null
FROM dimo_device_connection_events
WHERE received_at >= '2026-08-25T08:04:17Z';

\echo '=== CANONICAL EVENTS KS MX ==='
SELECT id, event_type::text, observed_at, received_at, processed_at
FROM dimo_device_connection_events
WHERE vehicle_id = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63'
ORDER BY observed_at;

\echo '=== EPISODES GLOBAL ==='
SELECT status::text, count(*) AS n
FROM device_connection_episodes
GROUP BY 1
ORDER BY 1;

\echo '=== EPISODES KS MX ==='
SELECT id, status::text, opened_at, resolved_at, resolution_method::text, opened_by_event_id
FROM device_connection_episodes
WHERE vehicle_id = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63'
ORDER BY opened_at;

\echo '=== OPEN EPISODES DETAIL ==='
SELECT id, vehicle_id, opened_at, opened_reason::text
FROM device_connection_episodes
WHERE status = 'OPEN';

\echo '=== RESOLUTION OUTBOX BY STATUS ==='
SELECT status::text, count(*) AS n
FROM device_connection_episode_resolution_outbox
GROUP BY 1
ORDER BY 1;

\echo '=== RESOLUTION OUTBOX KS MX EPISODE ==='
SELECT id, event_type::text, status::text, created_at, processed_at, last_error_code
FROM device_connection_episode_resolution_outbox
WHERE episode_id = 'b256bb09-86ce-4676-a197-76dd7ea5871b'
ORDER BY created_at;

\echo '=== RESOLUTION AUDITS KS MX ==='
SELECT id, resolution_method::text, resolution_snapshot_id, provider_observed_at, received_at, outcome, created_at
FROM device_connection_episode_resolution_audits
WHERE episode_id = 'b256bb09-86ce-4676-a197-76dd7ea5871b';

\echo '=== HISTORICAL JULY EVENT ==='
SELECT id, processed_at, observed_at, received_at
FROM dimo_device_connection_events
WHERE id = '5389a9c7-33c3-4f50-ba07-0338da4841d6';

\echo '=== HISTORICAL PRE-CUTOVER INBOX UNTOUCHED SAMPLE ==='
SELECT count(*) AS pre_cutover_inbox,
       count(*) FILTER (WHERE processing_status = 'PROCESSED') AS pre_cutover_processed
FROM device_connection_webhook_inbox
WHERE received_at < '2026-08-25T08:04:17Z';

\echo '=== PROVIDER LINKS (DIMO ACTIVE) ==='
SELECT count(*) AS active_dimo_links
FROM vehicle_data_source_links
WHERE provider = 'DIMO' AND is_active = true;

\echo '=== KS MX PROVIDER LINK ==='
SELECT id, provider, is_active, dimo_vehicle_id, source_reference_id
FROM vehicle_data_source_links
WHERE vehicle_id = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';
