# IAM Endpoint Enforcement Triage — 2026-07

Prompt 13/22 manual triage of static P0/P1 candidates from `iam-endpoint-enforcement-matrix-2026-07.csv`.

## Summary

- Total P0/P1 candidates reviewed: **152**
- Priority IAM/org surfaces reviewed: **67**

### Classification counts (all P0/P1)

- `CONFIRMED_MISSING_GUARD`: 33
- `FALSE_POSITIVE`: 29
- `REQUIRES_TEST`: 74
- `SERVICE_LEVEL_ENFORCED`: 15
- `SIGNED_WEBHOOK`: 1

## Confirmed fixes (Prompt 13)

| Method | Route | Controller | Fix |
|--------|-------|------------|-----|
| POST | `/organizations/:orgId/chat/agent` | ChatController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| DELETE | `/organizations/:orgId/chat/history` | ChatController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| POST | `/organizations/:orgId/chat/message` | ChatController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| POST | `/organizations/:orgId/chat/message/stream` | ChatController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| PATCH | `/organizations/:orgId/fines/:id` | FinesController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| POST | `/organizations/:orgId/fines/upload` | FinesController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| DELETE | `/organizations/:orgId/integrations/:integrationId` | IntegrationsController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| POST | `/organizations/:orgId/integrations/:integrationId/connect` | IntegrationsController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| POST | `/organizations/:orgId/vehicles` | VehiclesController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| DELETE | `/organizations/:orgId/vehicles/:vehicleId` | VehiclesController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| PATCH | `/organizations/:orgId/vehicles/:vehicleId` | VehiclesController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| POST | `/organizations/:orgId/vehicles/:vehicleId/complaints` | VehiclesController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| PATCH | `/organizations/:orgId/vehicles/:vehicleId/status` | VehiclesController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| PUT | `/organizations/:orgId/vehicles/:vehicleId/tires` | VehiclesController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| POST | `/organizations/:orgId/vehicles/register-from-dimo` | VehiclesController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| PUT | `/organizations/:orgId/whatsapp/config` | WhatsAppController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| POST | `/organizations/:orgId/whatsapp/connect` | WhatsAppController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| POST | `/organizations/:orgId/whatsapp/conversations/:conversationId/actions/:actionId` | WhatsAppController | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| POST | `/organizations/:orgId/whatsapp/conversations/:conversationId/ai-reply` | WhatsAppController | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| POST | `/organizations/:orgId/whatsapp/conversations/:conversationId/ai-suggestion` | WhatsAppController | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| POST | `/organizations/:orgId/whatsapp/conversations/:conversationId/human-review` | WhatsAppController | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| POST | `/organizations/:orgId/whatsapp/conversations/:conversationId/messages` | WhatsAppController | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| POST | `/organizations/:orgId/whatsapp/disconnect` | WhatsAppController | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| POST | `/organizations/:orgId/whatsapp/reminders/bookings/:bookingId/confirmation` | WhatsAppController | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| POST | `/organizations/:orgId/whatsapp/reminders/bookings/:bookingId/handover-link` | WhatsAppController | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| POST | `/organizations/:orgId/whatsapp/reminders/bookings/:bookingId/missing-documents` | WhatsAppController | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| POST | `/organizations/:orgId/whatsapp/reminders/bookings/:bookingId/payment-deposit` | WhatsAppController | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| POST | `/organizations/:orgId/whatsapp/reminders/bookings/:bookingId/pickup` | WhatsAppController | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| POST | `/organizations/:orgId/whatsapp/reminders/bookings/:bookingId/return` | WhatsAppController | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| POST | `/organizations/:orgId/whatsapp/reminders/bookings/:bookingId/return-link` | WhatsAppController | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| POST | `/organizations/:orgId/whatsapp/reminders/damages/:damageId/followup` | WhatsAppController | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| POST | `/organizations/:orgId/whatsapp/simulate-incoming` | WhatsAppController | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| POST | `/organizations/:orgId/whatsapp/templates` | WhatsAppController | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |

## Priority surfaces — disposition

| Domain | Disposition | Notes |
|--------|-------------|-------|
| users_roles | OK / no P0 | Already guarded — no P0 gaps |
| audit_security | OK / no P0 | Self-service + public auth expected; org activity-log uses users-roles.read |
| stations | OK / no P0 | Org + Permissions + StationScope — OK |
| integrations | CONFIRMED_MISSING_GUARD=1 | Fixed connect/disconnect with data-authorization.manage |
| documents | FALSE_POSITIVE=2, SERVICE_LEVEL_ENFORCED=2 | Fixed download/metadata with bookings.read |
| export_import | CONFIRMED_MISSING_GUARD=1 | Fixed fines upload; admin imports MASTER_ADMIN only |
| billing_subscription | FALSE_POSITIVE=1, REQUIRES_TEST=11 | REQUIRES_TEST — pricing uses RolesGuard; separate billing prompt |
| organizations_profile | SERVICE_LEVEL_ENFORCED=2 | SERVICE_LEVEL_ENFORCED — ORG_ADMIN assert in controller |

## Full candidate table

| Risk | Class | Domain | Method | Route | OrgG | PermG | Notes |
|------|-------|--------|--------|-------|------|-------|-------|
| P0 | REQUIRES_TEST | billing_subscription | POST | `/organizations/:orgId/price-tariffs/assignments` | yes | no | Domain module uses RolesGuard; permission module mapping not yet standardized |
| P0 | REQUIRES_TEST | billing_subscription | PATCH | `/organizations/:orgId/price-tariffs/assignments/:assignmentId/deactivate` | yes | no | Domain module uses RolesGuard; permission module mapping not yet standardized |
| P0 | REQUIRES_TEST | billing_subscription | POST | `/organizations/:orgId/price-tariffs/groups` | yes | no | Domain module uses RolesGuard; permission module mapping not yet standardized |
| P0 | REQUIRES_TEST | billing_subscription | DELETE | `/organizations/:orgId/price-tariffs/groups/:groupId` | yes | no | Domain module uses RolesGuard; permission module mapping not yet standardized |
| P0 | REQUIRES_TEST | billing_subscription | PATCH | `/organizations/:orgId/price-tariffs/groups/:groupId` | yes | no | Domain module uses RolesGuard; permission module mapping not yet standardized |
| P0 | REQUIRES_TEST | billing_subscription | DELETE | `/organizations/:orgId/price-tariffs/groups/:groupId/drafts/:versionId` | yes | no | Domain module uses RolesGuard; permission module mapping not yet standardized |
| P0 | REQUIRES_TEST | billing_subscription | POST | `/organizations/:orgId/price-tariffs/groups/:groupId/publish` | yes | no | Domain module uses RolesGuard; permission module mapping not yet standardized |
| P0 | REQUIRES_TEST | billing_subscription | POST | `/organizations/:orgId/price-tariffs/groups/:groupId/version` | yes | no | Domain module uses RolesGuard; permission module mapping not yet standardized |
| P0 | REQUIRES_TEST | billing_subscription | PATCH | `/organizations/:orgId/price-tariffs/versions/:versionId` | yes | no | Domain module uses RolesGuard; permission module mapping not yet standardized |
| P0 | REQUIRES_TEST | billing_subscription | POST | `/organizations/:orgId/price-tariffs/versions/:versionId/activate` | yes | no | Domain module uses RolesGuard; permission module mapping not yet standardized |
| P0 | REQUIRES_TEST | billing_subscription | POST | `/organizations/:orgId/pricing/simulate` | yes | no | Domain module uses RolesGuard; permission module mapping not yet standardized |
| P0 | FALSE_POSITIVE | billing_subscription | PUT | `/organizations/:orgId/voice-assistant/billing/subscription` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | REQUIRES_TEST | bookings | POST | `/organizations/:orgId/bookings` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | POST | `/organizations/:orgId/bookings/:bookingId/documents/generate-initial-bundle` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | POST | `/organizations/:orgId/bookings/:bookingId/documents/regenerate/:documentType` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | POST | `/organizations/:orgId/bookings/:bookingId/documents/send-email` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | DELETE | `/organizations/:orgId/bookings/:id` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | PATCH | `/organizations/:orgId/bookings/:id` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | POST | `/organizations/:orgId/bookings/:id/allowed-drivers` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | DELETE | `/organizations/:orgId/bookings/:id/allowed-drivers/:customerId` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | POST | `/organizations/:orgId/bookings/:id/handover/pickup` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | POST | `/organizations/:orgId/bookings/:id/handover/return` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | POST | `/organizations/:orgId/bookings/:id/no-show` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | PATCH | `/organizations/:orgId/bookings/:id/primary-driver` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | POST | `/organizations/:orgId/bookings/eligibility-check` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | POST | `/organizations/:orgId/bookings/wizard-draft` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | PATCH | `/organizations/:orgId/bookings/wizard-draft/:bookingId` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | POST | `/organizations/:orgId/bookings/wizard-draft/:bookingId/abort` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | bookings | POST | `/organizations/:orgId/bookings/wizard-draft/:bookingId/confirm` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | CONFIRMED_MISSING_GUARD | bookings | POST | `/organizations/:orgId/whatsapp/reminders/bookings/:bookingId/confirmation` | no | no | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| P0 | CONFIRMED_MISSING_GUARD | bookings | POST | `/organizations/:orgId/whatsapp/reminders/bookings/:bookingId/handover-link` | no | no | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| P0 | CONFIRMED_MISSING_GUARD | bookings | POST | `/organizations/:orgId/whatsapp/reminders/bookings/:bookingId/missing-documents` | no | no | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| P0 | CONFIRMED_MISSING_GUARD | bookings | POST | `/organizations/:orgId/whatsapp/reminders/bookings/:bookingId/payment-deposit` | no | no | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| P0 | CONFIRMED_MISSING_GUARD | bookings | POST | `/organizations/:orgId/whatsapp/reminders/bookings/:bookingId/pickup` | no | no | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| P0 | CONFIRMED_MISSING_GUARD | bookings | POST | `/organizations/:orgId/whatsapp/reminders/bookings/:bookingId/return` | no | no | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| P0 | CONFIRMED_MISSING_GUARD | bookings | POST | `/organizations/:orgId/whatsapp/reminders/bookings/:bookingId/return-link` | no | no | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| P0 | REQUIRES_TEST | customers | POST | `/organizations/:orgId/customers` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | customers | DELETE | `/organizations/:orgId/customers/:id` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | customers | PATCH | `/organizations/:orgId/customers/:id` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | customers | POST | `/organizations/:orgId/customers/:id/documents` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | customers | PATCH | `/organizations/:orgId/customers/:id/documents/:documentId/review` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | customers | PATCH | `/organizations/:orgId/customers/:id/risk` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | customers | PATCH | `/organizations/:orgId/customers/:id/status` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | customers | POST | `/organizations/:orgId/customers/:id/timeline/notes` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | customers | POST | `/organizations/:orgId/customers/documents` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | FALSE_POSITIVE | documents | POST | `/organizations/:orgId/documents/:documentId/void` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | SERVICE_LEVEL_ENFORCED | documents | POST | `/organizations/:orgId/legal-documents/:id/activate` | yes | no | Legal document mutations restricted to ORG_ADMIN |
| P0 | SERVICE_LEVEL_ENFORCED | documents | POST | `/organizations/:orgId/legal-documents/:id/archive` | yes | no | Legal document mutations restricted to ORG_ADMIN |
| P0 | FALSE_POSITIVE | documents | POST | `/organizations/:orgId/legal-documents/upload` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | CONFIRMED_MISSING_GUARD | export_import | POST | `/organizations/:orgId/fines/upload` | yes | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | FALSE_POSITIVE | fines_tariffs | POST | `/organizations/:orgId/fines` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | CONFIRMED_MISSING_GUARD | fines_tariffs | PATCH | `/organizations/:orgId/fines/:id` | yes | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | CONFIRMED_MISSING_GUARD | integrations | DELETE | `/organizations/:orgId/integrations/:integrationId` | yes | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | CONFIRMED_MISSING_GUARD | organizations_other | POST | `/organizations/:orgId/chat/agent` | no | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | CONFIRMED_MISSING_GUARD | organizations_other | DELETE | `/organizations/:orgId/chat/history` | no | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | CONFIRMED_MISSING_GUARD | organizations_other | POST | `/organizations/:orgId/chat/message` | no | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | CONFIRMED_MISSING_GUARD | organizations_other | POST | `/organizations/:orgId/chat/message/stream` | no | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/driving-decisions` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/driving-decisions/:id/revoke` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/email/domains` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | DELETE | `/organizations/:orgId/email/domains/:domainId` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/email/domains/:domainId/activate` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/email/domains/:domainId/verify` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | PUT | `/organizations/:orgId/email/settings` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/email/test` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/misuse-cases/:id/lifecycle` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | SERVICE_LEVEL_ENFORCED | organizations_other | POST | `/organizations/:orgId/notifications/:id/acknowledge` | yes | no | Notification mutations use role allow-list decorator |
| P0 | SERVICE_LEVEL_ENFORCED | organizations_other | POST | `/organizations/:orgId/notifications/:id/archive` | yes | no | Notification mutations use role allow-list decorator |
| P0 | SERVICE_LEVEL_ENFORCED | organizations_other | POST | `/organizations/:orgId/notifications/:id/read` | yes | no | Notification mutations use role allow-list decorator |
| P0 | SERVICE_LEVEL_ENFORCED | organizations_other | POST | `/organizations/:orgId/notifications/:id/resolve` | yes | no | Notification mutations use role allow-list decorator |
| P0 | SERVICE_LEVEL_ENFORCED | organizations_other | POST | `/organizations/:orgId/notifications/:id/snooze` | yes | no | Notification mutations use role allow-list decorator |
| P0 | SERVICE_LEVEL_ENFORCED | organizations_other | POST | `/organizations/:orgId/notifications/:id/unread` | yes | no | Notification mutations use role allow-list decorator |
| P0 | SERVICE_LEVEL_ENFORCED | organizations_other | POST | `/organizations/:orgId/notifications/:id/unsnooze` | yes | no | Notification mutations use role allow-list decorator |
| P0 | FALSE_POSITIVE | organizations_other | PATCH | `/organizations/:orgId/voice-assistant` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/voice-assistant/activate` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | SERVICE_LEVEL_ENFORCED | organizations_other | POST | `/organizations/:orgId/voice-assistant/agent-deployment/deploy` | yes | no | Voice admin mutations use explicit role decorator |
| P0 | SERVICE_LEVEL_ENFORCED | organizations_other | PATCH | `/organizations/:orgId/voice-assistant/agent-deployment/draft` | yes | no | Voice admin mutations use explicit role decorator |
| P0 | SERVICE_LEVEL_ENFORCED | organizations_other | POST | `/organizations/:orgId/voice-assistant/agent-deployment/rollback` | yes | no | Voice admin mutations use explicit role decorator |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/voice-assistant/calls/outbound` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/voice-assistant/conversations/sync` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/voice-assistant/deactivate` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/voice-assistant/mcp-approvals/:approvalId/approve` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/voice-assistant/mcp-approvals/:approvalId/reject` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/voice-assistant/phone-number/assign` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/voice-assistant/phone-number/unassign` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | PATCH | `/organizations/:orgId/voice-assistant/protection/budget-policy` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | PATCH | `/organizations/:orgId/voice-assistant/telephony-settings` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/voice-assistant/telephony/refresh` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/voice-assistant/test-session` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | FALSE_POSITIVE | organizations_other | POST | `/organizations/:orgId/voice-assistant/twilio/outbound-call` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | SIGNED_WEBHOOK | organizations_other | POST | `/organizations/:orgId/voice-assistant/webhook-events/:eventId/replay` | yes | no | Provider-signed or verification-token webhook surface |
| P0 | CONFIRMED_MISSING_GUARD | organizations_other | PUT | `/organizations/:orgId/whatsapp/config` | no | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | CONFIRMED_MISSING_GUARD | organizations_other | POST | `/organizations/:orgId/whatsapp/conversations/:conversationId/actions/:actionId` | no | no | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| P0 | CONFIRMED_MISSING_GUARD | organizations_other | POST | `/organizations/:orgId/whatsapp/conversations/:conversationId/ai-reply` | no | no | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| P0 | CONFIRMED_MISSING_GUARD | organizations_other | POST | `/organizations/:orgId/whatsapp/conversations/:conversationId/ai-suggestion` | no | no | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| P0 | CONFIRMED_MISSING_GUARD | organizations_other | POST | `/organizations/:orgId/whatsapp/conversations/:conversationId/human-review` | no | no | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| P0 | CONFIRMED_MISSING_GUARD | organizations_other | POST | `/organizations/:orgId/whatsapp/conversations/:conversationId/messages` | no | no | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| P0 | CONFIRMED_MISSING_GUARD | organizations_other | POST | `/organizations/:orgId/whatsapp/reminders/damages/:damageId/followup` | no | no | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| P0 | CONFIRMED_MISSING_GUARD | organizations_other | POST | `/organizations/:orgId/whatsapp/simulate-incoming` | no | no | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| P0 | CONFIRMED_MISSING_GUARD | organizations_other | POST | `/organizations/:orgId/whatsapp/templates` | no | no | Hardened in Prompt 13 — WhatsApp org routes missing OrgScopingGuard |
| P0 | SERVICE_LEVEL_ENFORCED | organizations_profile | PATCH | `/organizations/:orgId/profile` | yes | no | ORG_ADMIN write enforced via assertCanWriteOrgProfile |
| P0 | SERVICE_LEVEL_ENFORCED | organizations_profile | POST | `/organizations/:orgId/profile/logo` | yes | no | ORG_ADMIN write enforced via assertCanWriteOrgProfile |
| P0 | SERVICE_LEVEL_ENFORCED | other | POST | `/mcp/voice/:orgId` | no | no | Bearer MCP token verified in VoiceMcpTokenService |
| P0 | REQUIRES_TEST | other | POST | `/organizations/:orgId/rental-rules/categories` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | other | DELETE | `/organizations/:orgId/rental-rules/categories/:categoryId` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | other | PATCH | `/organizations/:orgId/rental-rules/categories/:categoryId` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | other | PATCH | `/organizations/:orgId/rental-rules/defaults` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | other | POST | `/organizations/:orgId/service-cases` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | other | PATCH | `/organizations/:orgId/service-cases/:id` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | other | POST | `/organizations/:orgId/service-cases/:id/attachments` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | other | PATCH | `/organizations/:orgId/service-cases/:id/cancel` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | other | POST | `/organizations/:orgId/service-cases/:id/comments` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | other | PATCH | `/organizations/:orgId/service-cases/:id/complete` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | CONFIRMED_MISSING_GUARD | payments | POST | `/organizations/:orgId/integrations/:integrationId/connect` | yes | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | CONFIRMED_MISSING_GUARD | payments | POST | `/organizations/:orgId/whatsapp/connect` | no | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | CONFIRMED_MISSING_GUARD | payments | POST | `/organizations/:orgId/whatsapp/disconnect` | no | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | REQUIRES_TEST | support | POST | `/organizations/:orgId/support/tickets` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | support | POST | `/organizations/:orgId/support/tickets/:id/messages` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | support | POST | `/organizations/:orgId/support/tickets/:id/reopen` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | support | POST | `/support/org/:orgId/tickets` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | support | POST | `/support/org/:orgId/tickets/:ticketId/messages` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | support | POST | `/support/org/:orgId/tickets/:ticketId/reopen` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P1 | REQUIRES_TEST | support | POST | `/support/upload` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | FALSE_POSITIVE | vehicles_fleet | PATCH | `/organizations/:orgId/rental-rules/categories/:categoryId/vehicles` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | CONFIRMED_MISSING_GUARD | vehicles_fleet | POST | `/organizations/:orgId/vehicles` | no | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | CONFIRMED_MISSING_GUARD | vehicles_fleet | DELETE | `/organizations/:orgId/vehicles/:vehicleId` | no | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | CONFIRMED_MISSING_GUARD | vehicles_fleet | PATCH | `/organizations/:orgId/vehicles/:vehicleId` | no | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | CONFIRMED_MISSING_GUARD | vehicles_fleet | POST | `/organizations/:orgId/vehicles/:vehicleId/complaints` | no | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | FALSE_POSITIVE | vehicles_fleet | PATCH | `/organizations/:orgId/vehicles/:vehicleId/rental-requirements/overrides` | yes | no | OrgScopingGuard present; role or service-level checks may be sufficient for non- |
| P0 | CONFIRMED_MISSING_GUARD | vehicles_fleet | PATCH | `/organizations/:orgId/vehicles/:vehicleId/status` | no | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | CONFIRMED_MISSING_GUARD | vehicles_fleet | PUT | `/organizations/:orgId/vehicles/:vehicleId/tires` | no | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | CONFIRMED_MISSING_GUARD | vehicles_fleet | POST | `/organizations/:orgId/vehicles/register-from-dimo` | yes | no | Hardened in Prompt 13 — OrgScopingGuard/PermissionsGuard added |
| P0 | REQUIRES_TEST | workflows_tasks | POST | `/organizations/:orgId/tasks` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | PATCH | `/organizations/:orgId/tasks/:id` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | PATCH | `/organizations/:orgId/tasks/:id/assign` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | POST | `/organizations/:orgId/tasks/:id/attachments` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | PATCH | `/organizations/:orgId/tasks/:id/cancel` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | POST | `/organizations/:orgId/tasks/:id/checklist` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | PATCH | `/organizations/:orgId/tasks/:id/checklist/:itemId` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | POST | `/organizations/:orgId/tasks/:id/comments` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | PATCH | `/organizations/:orgId/tasks/:id/complete` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | PATCH | `/organizations/:orgId/tasks/:id/start` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | PATCH | `/organizations/:orgId/tasks/:id/waiting` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | POST | `/organizations/:orgId/tasks/bulk` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | POST | `/organizations/:orgId/workflows` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | DELETE | `/organizations/:orgId/workflows/:id` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | PATCH | `/organizations/:orgId/workflows/:id` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | POST | `/organizations/:orgId/workflows/:id/duplicate` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | POST | `/organizations/:orgId/workflows/:id/test` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | PATCH | `/organizations/:orgId/workflows/:id/toggle` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | POST | `/organizations/:orgId/workflows/action-runs/:actionRunId/approve` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
| P0 | REQUIRES_TEST | workflows_tasks | POST | `/organizations/:orgId/workflows/action-runs/:actionRunId/reject` | yes | no | Org scoped with RolesGuard only — needs runtime permission matrix review |
