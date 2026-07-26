# Notification Engine — Channel Matrix & Delivery Policy

Version: **V4.9.872**  
Companion: `docs/notification-engine-permissions-and-preferences.md`, `docs/notification-engine-delivery-and-observability.md`

## Channel matrix

| Channel | Engine delivery | Status | Trust | Verified recipient | Notes |
|---------|-----------------|--------|-------|-------------------|-------|
| **In-App** | Canonical (API inbox) | `active` | high | no | Default for all events; not routed via outbox |
| **E-Mail** | Outbox → Resend | `active` | medium | no (valid address required) | Gated by `NOTIFICATIONS_DELIVERY_ENABLED` |
| **Push** | — | `stub` | medium | yes (device token) | Never enqueued; processor suppresses legacy rows |
| **SMS** | — | `disabled` | low | yes | Prisma enum + user prefs only; no dispatcher |
| **WhatsApp** | — | `disabled` | low | yes | Separate `whatsapp` module (booking reminders); not wired to engine |
| **Voice** | — | `disabled` | low | yes | Separate Voice AI stack; not wired to engine |

Source of truth: `delivery/notification-channel-matrix.ts`.

## Policy rules

1. **In-App is canonical** — all materialized notifications are readable via API when role/scope permits.
2. **External delivery only when allowed** — `NotificationChannelPolicyService.evaluateExternalChannel()` checks:
   - channel implementation status (`active` only for enqueue)
   - event `deliveryPolicy.channels`
   - membership role ∈ `supportedRoles`
   - user channel opt-out (unless mandatory)
   - recipient prerequisites (email address)
   - channel verification (push/whatsapp/voice)
3. **Org defaults vs user prefs** — platform defaults in `account-notification.defaults.ts` seed first-time rows; `UserNotificationPreference` overrides per category.
4. **Mandatory (Pflichtmeldungen)** — SECURITY category, explicit org-critical events, CRITICAL with `criticalOverridesPreferences`. Mandatory bypasses email opt-out; in-app always shown.
5. **Quiet hours** — env `NOTIFICATION_QUIET_HOURS_START/END` (default 22:00–07:00), evaluated in user/org timezone. Defers external delivery `availableAt`. **CRITICAL** and **mandatory** bypass deferral.
6. **Privacy** — `redactTemplateParamsForExternalChannel()` strips billing/org secrets from email bodies. In-app API uses role-based redaction separately.

## Quiet-hour rules

| Condition | External delivery |
|-----------|-------------------|
| Outside quiet window | Immediate (`availableAt = now`) |
| Inside quiet window, WARNING/INFO | Deferred to `quietHoursEnd` local |
| Inside quiet window, CRITICAL | Immediate (escalation policy) |
| Inside quiet window, mandatory | Immediate |
| WEEKLY_REPORTS email | Digest hour (`NOTIFICATION_DIGEST_HOUR_LOCAL`, default 08:00) |

## Not implemented (do not treat as active)

- **Push** — stub; `CHANNEL_STUB` at enqueue, `*_NOT_IMPLEMENTED` if legacy outbox row exists
- **SMS** — disabled; preference toggle stored but no delivery path
- **WhatsApp** — disabled for engine; use standalone WhatsApp module for booking comms
- **Voice** — disabled for engine; Voice Assistant is a separate product surface

## Tests

`delivery/notification-channel-policy.spec.ts` covers:

- user opt-out
- mandatory bypass
- quiet hours deferral
- CRITICAL quiet-hour exception
- stub/disabled channel
- missing email
- unverified push channel
- org default vs user override separation
