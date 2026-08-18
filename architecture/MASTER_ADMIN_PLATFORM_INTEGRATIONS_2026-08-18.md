# Master Admin — Integrationen & Plattform (UI-10.3)

**Datum:** 2026-08-18

## Zusammenfassung

Kanonischer Hub **Integrationen & Plattform** (`?view=platform-integrations`) ersetzt die fragmentierte `?view=settings`-Oberfläche und aggregiert globale Provider-Sichtbarkeit, Health, Webhooks und echte Plattform-Settings.

## Backend

- `PlatformIntegrationsController` unter `GET /admin/platform-integrations/*`
- `PlatformIntegrationsService` — kanonischer Directory-Aggregator mit `Promise.allSettled` (partial failure)
- Vier Status-Dimensionen pro Integration: `configuration`, `authentication`, `runtimeHealth`, `environment`
- Datenquellen (keine Frontend-Ableitung):
  - DIMO: `PlatformAdminService.getPlatformHealth()` + Token Health
  - Stripe: `BillingAdminService.getStripeStatus()` + `runtimeStripeMode`
  - E-Mail: `PlatformEmailSettingsService` + `RESEND_API_KEY` boolean
  - Voice: `VoiceControlPlaneAdminService.getPlatformStatus()`
  - WhatsApp: simulate flag + org config count
  - High Mobility: `HighMobilityAppConfigService` readiness
- `POST /admin/email/test` — kontrollierte Plattform-Test-E-Mail mit Step-up

## Frontend

- `frontend/src/master/platform-integrations/PlatformIntegrationsHub.tsx` — 5 Tabs
- URL-Contract: `platformIntegrations`, `integrationId`, `settingsCategory`, `attentionOnly`
- Legacy-Redirects: `?view=settings` → Hub; `settingsTab=email` → `settingsCategory=communication`
- Nav: Sidebar `platform-integrations` (Connectivity-Gruppe); Badge `integration-attention`
- Detail-Drawer mit Drilldowns zu Billing, Voice, Vehicles, High Mobility — keine Fahrzeug-Duplikation

## Signalfluss

```
PlatformIntegrationsService (aggregiert bestehende Domain-Services)
  → GET /admin/platform-integrations/*
  → usePlatformIntegrations hooks
  → PlatformIntegrationsHub (Directory, Webhooks, Settings, Changelog)
```

## Docs

- Audit: `docs/ui/master-admin-integrations-system-config-deep-audit.md`
- Blueprint: `docs/ui/master-admin-canonical-integrations-system-config-blueprint.md`
- Acceptance: `docs/ui/master-admin-integrations-system-config-post-remediation.md`
- Page Framework: `docs/ui/master-admin-canonical-page-framework.md`
