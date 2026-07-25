# Runbook: Operator App Data Retention & Legal Hold

| Feld | Wert |
|------|------|
| **Gültig ab** | V4.9.827 (Prompt 34) |
| **Audit** | `docs/audits/operator-app-privacy-retention-2026-07.md` |
| **Architektur** | `architecture/OPERATOR_APP_DATA_RETENTION_2026-07-25.md` |
| **Scheduler** | `OperatorDataRetentionScheduler` — Cron `0 5 * * *` (05:00 UTC) |
| **Master switch** | `OPERATOR_DATA_RETENTION_ENABLED=false` (default) |
| **Dry-run** | `OPERATOR_DATA_RETENTION_DRY_RUN=true` (default) |

## Phases (in order)

1. `abandoned_handover_draft` — expired/stale server drafts (respects booking legal hold)
2. `handover_signature_bitmap` — null signature data URLs on old protocols
3. `operator_orphan_extraction` — stale operator-surface extractions without downstream links
4. `operator_extraction_ocr_cache` — strip OCR cache from soft-deleted operator extractions

## Manual dry-run (single org)

```bash
curl -X POST "https://app.synqdrive.eu/api/v1/organizations/{orgId}/operator/data-retention/runs" \
  -H "Authorization: Bearer …" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

Requires `bookings.manage`.

## Booking evidence legal hold

```bash
curl -X POST "…/organizations/{orgId}/operator/bookings/{bookingId}/evidence-legal-hold" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Dispute case #123"}'
```

Release:

```bash
curl -X DELETE "…/organizations/{orgId}/operator/bookings/{bookingId}/evidence-legal-hold"
```

## Configurable windows

| Env | Default | Meaning |
|-----|---------|---------|
| `OPERATOR_HANDOVER_DRAFT_TTL_HOURS` | 72 | TTL for new drafts |
| `OPERATOR_RETENTION_ABANDONED_HANDOVER_DRAFT_DAYS` | 0 | Extra stale-day cleanup (0 = TTL only) |
| `OPERATOR_RETENTION_HANDOVER_SIGNATURE_BITMAP_DAYS` | 0 | Signature redaction (0 = disabled) |
| `OPERATOR_RETENTION_ORPHAN_EXTRACTION_DAYS` | 0 | Orphan operator extractions |
| `OPERATOR_RETENTION_EXTRACTION_OCR_CACHE_DAYS` | 0 | OCR cache strip |

`0` = phase disabled. **Do not enable production values without legal/compliance sign-off.**

## Recovery checklist

1. Inspect retention report from manual dry-run
2. Verify booking legal hold before expecting signature/draft purge
3. Orphan extractions with downstream links are intentionally skipped
4. Document extractions also respect `lifecycle.legalHold` in pipeline JSON
