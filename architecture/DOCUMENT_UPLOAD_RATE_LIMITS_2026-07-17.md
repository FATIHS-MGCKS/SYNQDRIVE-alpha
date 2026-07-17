# Document Upload Rate Limits (V4.9.621)

**Date:** 2026-07-17  
**Prompt:** 46/84 — Upload rate limits via existing Redis + Throttler infrastructure

## Infrastructure reused

| Layer | Mechanism |
|-------|-----------|
| IP (HTTP) | `@Throttle` on `POST .../document-extractions/upload` (Nest `ThrottlerGuard`, global APP_GUARD) |
| Org / user / IP (business) | `DocumentUploadRateLimitService` — Redis fixed-window counters via Lua script |
| Metrics | `synqdrive_document_extraction_upload_rate_limited_total{scope,reason}` — low cardinality only |

No parallel throttling engine — Redis is already used for BullMQ/locks; Throttler already guards HTTP.

## Hook point

`createFromUpload` after vehicle/org resolve, **before** identify/hash/storage/queue:

```text
assertQueueAcceptingUploads → uploadRateLimit.assertAllowed → identify → hash → duplicate → storage → queue
```

## Limits (default 60s window)

| Dimension | Default count | Default bytes |
|-----------|---------------|---------------|
| Organization | 40 | 200 MB |
| User | 25 | 120 MB |
| IP | 30 | 150 MB |

Multipliers:
- `operator_app` source → `DOCUMENT_UPLOAD_RATE_LIMIT_OPERATOR_MULTIPLIER` (default 2)
- `MASTER_ADMIN` → `DOCUMENT_UPLOAD_RATE_LIMIT_ADMIN_MULTIPLIER` (default 4)

## 429 response

```json
{
  "statusCode": 429,
  "errorCode": "DOCUMENT_UPLOAD_RATE_LIMITED",
  "scope": "organization|user|ip",
  "reason": "count|bytes",
  "retryAfterSeconds": 42,
  "windowMs": 60000,
  "limit": 40,
  "message": "..."
}
```

Redis failures fail-open (log warning, allow upload) to avoid blocking intake during Redis blips.

## Config env vars

See `backend/.env.example` — `DOCUMENT_UPLOAD_RATE_LIMIT_*`, `DOCUMENT_UPLOAD_THROTTLE_*`

## Tests

- `document-upload-rate-limit.service.spec.ts` — limit, reset (new bucket), org isolation, operator multiplier, fail-open
- `document-extraction-upload-rate-limit.spec.ts` — blocks before storage/queue
- `frontend/src/lib/document-upload-rate-limit.test.ts` — 429 parser
