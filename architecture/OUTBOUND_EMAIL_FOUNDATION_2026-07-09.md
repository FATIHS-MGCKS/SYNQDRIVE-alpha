# Outbound Email Foundation (V4.9.290)

Tenant-scoped outbound email for SynqDrive organizations.

## Principles

- **No spoofing:** Organization/user email is never used as technical `From` unless the domain is `VERIFIED`.
- **Default mode:** `noreply@synqdrive.eu` (env) + organization Reply-To chain.
- **Verified domain mode:** `From` only when `OrgEmailSettings.mode = VERIFIED_DOMAIN` and `OrgEmailDomain.status = VERIFIED`.
- **Explicit send:** No automated document blast in this phase; `test-email` requires admin action.

## Module

`backend/src/modules/outbound-email/`

| Component | Role |
|-----------|------|
| `EmailProviderPort` | Provider abstraction |
| `DevEmailProvider` | Local dev — logs payload, `SENT_SIMULATED` |
| `EmailAddressPolicyService` | From/Reply-To resolution |
| `OrgEmailSettingsService` | Per-org settings CRUD |
| `OrgEmailDomainService` | Domain + DNS verification |
| `OutboundEmailService` | Persist + send + events |

## Data model

- `OrgEmailSettings` — mode, default from name, reply-to, signatures
- `OrgEmailDomain` — domain, from/reply, DNS records JSON, verification status
- `OutboundEmail` — send record with status lifecycle
- `OutboundEmailAttachment` — metadata only (optional `generatedDocumentId`)
- `OutboundEmailEvent` — CREATED, QUEUED, SENT, FAILED, DOMAIN_USED, FALLBACK_USED, …

## API (org-scoped)

| Method | Path | Access |
|--------|------|--------|
| GET | `/organizations/:orgId/email-settings` | Org member (read via OrgScopingGuard) |
| PUT | `/organizations/:orgId/email-settings` | ORG_ADMIN, MASTER_ADMIN |
| GET | `/organizations/:orgId/email-domains` | Org member |
| POST | `/organizations/:orgId/email-domains` | ORG_ADMIN, MASTER_ADMIN |
| POST | `/organizations/:orgId/email-domains/:domainId/check` | ORG_ADMIN, MASTER_ADMIN |
| POST | `/organizations/:orgId/email-settings/test-email` | ORG_ADMIN, MASTER_ADMIN |

## Environment

```
EMAIL_PROVIDER=dev|resend|postmark
EMAIL_DOMAIN_VERIFICATION_PROVIDER=dev|resend|postmark
EMAIL_DEFAULT_FROM_EMAIL=noreply@synqdrive.eu
EMAIL_DEFAULT_FROM_NAME=SynqDrive
EMAIL_DEFAULT_REPLY_TO=support@synqdrive.eu
EMAIL_DEV_AUTO_VERIFY_DOMAINS=false
```

Resend/Postmark adapters are stubbed; unconfigured providers fall back to `DevEmailProvider`.

## Future

- Administration → E-Mail & Versand UI
- Document send flows (booking documents, invoices) via `OutboundEmailService.sendExplicit`
- Real Resend/Postmark provider + webhook bounce handling
