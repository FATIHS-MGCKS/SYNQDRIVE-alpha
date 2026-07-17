# Voice AI Security, Privacy & Observability Hardening (2026-07-17)

Phase 10A hardening for staging/production Voice AI.

## Security

| Area | Implementation |
|------|----------------|
| Secrets | `VoiceSecretsStartupService` — startup checks without logging values; production requires dedicated `VOICE_MCP_TOKEN_SECRET` |
| Legacy Twilio webhook PII | `TwilioWebhookEvent.payload` now stores redacted Twilio form |
| Tenant isolation | Existing guards + `voice-tenant-isolation.security.spec.ts` cross-tenant negatives |
| MCP | Short-lived tokens, nonce replay, rate limits (existing); metrics on errors/limits |
| Webhooks | Signature verification (existing); metrics on invalid signatures |
| Retention | `VoiceRetentionService` + `VoiceRetentionScheduler` — transcripts, summaries, provider payloads |

## Observability

| Component | Path |
|-----------|------|
| Metrics | `VoiceMetricsService` — `synqdrive_voice_*` Prometheus series |
| Gauge refresh | `MetricsRefreshService.refreshVoiceWebhookGauges` |
| Alerts | `backend/monitoring/prometheus/alerts.yml` → `synqdrive_voice` |
| Dashboard | `backend/monitoring/grafana/dashboards/synqdrive-ops.json` Voice row |
| Structured logs | `voice-structured-log.util.ts` — correlation IDs, masked IDs, no transcripts |

## Verification

```bash
cd backend && npm run test:voice:security
cd backend && npm run audit:voice-secrets
cd backend && npm run audit:dependencies
```

## Runbook

`docs/runbooks/voice-incidents.md`

## Non-goals (10A)

- No ClickHouse voice mirror changes
- No production service restarts/deploys from this change set
- No Alertmanager wiring (rules-only convention preserved)
