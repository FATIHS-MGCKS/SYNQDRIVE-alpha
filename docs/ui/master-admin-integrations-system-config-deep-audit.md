# Master Admin — Integrations & System Configuration Deep Audit

**Datum:** 2026-08-18  
**Phase:** UI-10.1 (read-only — keine Implementierung)  
**Branch:** `cursor/master-admin-ia-audit-6608`  
**Scope:** Master-Admin-Oberflächen für globale Integrationen, Provider-Konfiguration, Webhooks, Plattform-Settings, Credentials/Secrets, Health, Test/Live-Trennung und globale vs. tenant-spezifische Konfiguration

**Verbindliche Referenzen:**

| Referenz | Pfad |
|----------|------|
| Page Framework (UI-2) | `docs/ui/master-admin-canonical-page-framework.md` |
| Security Remediation | `docs/remediation/master-admin-mfa.md`, `master-admin-privileged-access.md`, `master-admin-audit-log-hardening.md` |
| Stripe Remediation | `docs/remediation/stripe-environment-separation.md`, `stripe-webhook-hardening.md` |
| Billing Audit (UI-6) | `docs/ui/master-admin-billing-deep-audit.md`, `master-admin-billing-post-remediation.md` |
| Connected Vehicles / DIMO (UI-7) | `docs/ui/master-admin-connected-vehicles-dimo-deep-audit.md` |
| Security & Governance (UI-9) | `docs/ui/master-admin-security-audit-users-roles-deep-audit.md`, `master-admin-canonical-security-governance-blueprint.md` |
| Navigation / IA (UI-1) | `docs/ui/master-admin-information-architecture-audit.md` |

**Leitfrage:** Kann ein Master Admin **sofort und ohne Risiko** erkennen, welche Integrationen global konfiguriert sind, ob sie gesund laufen, ob TEST vs. LIVE eindeutig getrennt ist, welche Aktionen produktionskritisch sind — und wird niemals versehentlich eine globale Plattform-Konfiguration wie eine Mandanten-Einstellung behandelt?

---

## 1. Executive Summary

Die SynqDrive Master Admin Control Plane verfügt **backend-seitig** über ausgereifte Integrationsschichten (DIMO, Stripe mit Environment Guards, Resend/Outbound Email, Voice Control Plane mit Twilio/ElevenLabs, High Mobility, Integrations-Registry). **Frontend-seitig** fehlt jedoch ein **kanonischer Integrations- & Systemkonfigurations-Hub**: Konfiguration ist über mindestens **acht verteilte Views** fragmentiert (Settings, Billing, Connected Vehicles, Platform Ops, Voice Assistant, High Mobility, Org-Detail, Dashboard), mehrere **Mock-/Orphan-Oberflächen** existieren, und **WhatsApp** sowie **globale Feature Flags** haben **keine Master-UI**.

| Stärke (Backend / Remediation) | Schwäche (Master Admin UI) |
|----------------------------------|----------------------------|
| Stripe `StripeEnvironmentService` — fail-fast Test-in-Prod, livemode-Mismatch | Kein zentraler Integrations-Hub; Stripe nur unter Billing erreichbar |
| Platform Email Settings mit `MasterAdminMfaGuard` + Step-up | Settings → General ist vollständiger Mock ohne API |
| Voice Control Plane — Provider-Booleans, Webhook-Events, Replay, Audit | Kein einheitliches Status-Modell mit Billing/DIMO |
| DIMO Credentials nur serverseitig (`DIMO_*` env) | DIMO-Status über 4+ Views fragmentiert (UI-7) |
| `GET /admin/integrations` Registry existiert | **Kein Frontend-Verbrauch** — tote API-Schicht |
| UI-9.3 entfernte Fake DIMO/Stripe-Credentials aus Settings | General-Tab weiterhin Fake Company Info mit leerem Save |
| Billing Stripe Tab trennt Config vs. Runtime Events | `integration-outage`-Badge nur `dimoConnected`-Boolean |

**Kritischste Befunde (P0):**

1. **Kein kanonischer Integrations-Hub** — Master Admin muss wissen, dass DIMO unter Connected Vehicles, Stripe unter Billing, Voice unter Voice Assistant, E-Mail unter Settings liegt; kein Single Pane of Glass.
2. **Settings → General ist produktionsirreführender Mock** — Formular mit Default-Werten und `onClick={() => {}}` Save; suggeriert globale Firmenkonfiguration ohne Persistenz.
3. **`GET /admin/integrations` ohne UI** — Backend-Registry für Plattform-Integrationen existiert, Frontend nutzt `api.integrations.*` nirgends im Master Admin.
4. **WhatsApp ohne Master-Admin-Oberfläche** — Plattformweite Provider-Konfiguration (`WHATSAPP_*`, Simulate-Flags) nur über ENV/Runbooks; operative WhatsApp-UX nur Rental-App.
5. **Status-Dimensionen vermischt** — `Connected` (Config), `Healthy` (Runtime), `Stale` (Freshness), `PREPARED` (Stripe) werden in verschiedenen Views unterschiedlich gelabelt; Nav-Badge `integration-outage` leitet nur aus `dimoConnected > 0` ab.
6. **Orphan-Komponenten** — `BillingResendTab`, `BillingOutboxTab` implementiert aber nicht in `BillingControlCenter` verdrahtet; Email-Delivery-Ops versteckt.

**Post-UI-9.3 Verbesserung:** Settings → Integrations zeigt jetzt **informationelle Weiterleitungskarten** statt Fake-Credential-Inputs — korrekte Richtung, aber unvollständig als Control Plane.

**Gesamtbewertung:** Backend-Integrationsarchitektur **stark**; Master-Admin-Integrations-UX **fragmentiert, nicht enterprise-ready**. Empfehlung: UI-10 kanonischer **„Integrationen & Plattform“**-Hub analog Security & Governance (UI-9).

**Changes / Architektur:** Nicht aktualisiert (read-only Audit).

### Scores (0–100)

| Dimension | Score | Kurzbegründung |
|-----------|-------|----------------|
| Integration Clarity | **38** | 8+ Views, keine zentrale Registry-UI, tote APIs |
| Scope Clarity | **45** | Email-Panel erklärt Global vs. Tenant gut; Org-Integrations read-only; General-Tab irreführend |
| Health Visibility | **42** | Platform Ops + Billing Stripe gut; DIMO fragmentiert; kein globales Health Board |
| Environment Safety | **55** | Stripe `runtimeStripeMode` sichtbar; Voice Provider-Labels; kein globales ENV-Banner |
| Secret Safety | **72** | Keine Raw-Secrets in UI; Booleans/masked IDs; `debug-jwt` Backend-Risiko |
| Mutation Safety | **48** | Email MFA-guarded; Voice Provisioning ohne einheitliche Confirm; Resend replay ohne sichtbares Audit |
| Configuration UX | **40** | Mock General; Mischsystem Save-Semantik; EN-Labels in Settings-Tabs |
| Auditability | **50** | Billing/Voice Audit-Tabs; kein plattformweites Integrations-Change-Log |
| Responsive UX | **46** | Breite Tabellen in Billing/Voice; Settings ok |
| Accessibility | **52** | Pattern Library teilweise; Settings EN; Status teils nur Farbe |
| Technical Cleanliness | **44** | Orphan APIs/Tabs, duplicate health paths, unused `dimoConnected` props |

**Gewichteter Gesamtscore (governance-dominant):** ~**47/100**

---

## 2. Page Inventory

### 2.1 Kanonische Master-Admin-Oberflächen (Integrations & System Config)

| # | Oberfläche | Route / View | Datei | Zweck | Scope | Source of Truth | Endpoint(s) | Permission | Mutation | Audit | Environment |
|---|------------|--------------|-------|-------|-------|-----------------|-------------|------------|----------|-------|-------------|
| 1 | **Settings — General** | `?view=settings` (default) | `PlatformSettingsView.tsx` | Company Information Form | **Unklar (suggeriert global)** | **Keine** (Hardcoded Defaults) | — | `MASTER_ADMIN` | Fake (`onClick={() => {}}`) | Nein | — |
| 2 | **Settings — E-Mail** | `settingsTab=email` | `PlatformEmailSettingsPanel.tsx` | Plattform-Absender (From/Reply-To) | **Global** | DB `platform_email_settings` | `GET/PUT /admin/email/settings` | `MASTER_ADMIN` + MFA Step-up | Ja | `PLATFORM_SETTINGS_UPDATED` | Prod |
| 3 | **Settings — Integrations** | `settingsTab=integrations` | `PlatformSettingsView.tsx` | Weiterleitungshinweise Stripe/DIMO | Info only | — | — | `MASTER_ADMIN` | Nein | — | — |
| 4 | **Billing — Stripe / Webhooks** | `?view=billing&masterBilling=reconciliation` | `BillingStripeTab.tsx`, `BillingReconciliationSection.tsx` | Stripe Status, Webhook Events, Reconciliation | **Global Platform Stripe** | `StripeEnvironmentService` + DB events | `GET /admin/billing/stripe-status`, webhook-events | Master Billing | Reconcile (Ja) | Billing audit | TEST/LIVE via `runtimeStripeMode` |
| 5 | **Billing — Overview KPIs** | `masterBilling=overview` | `BillingOverviewView.tsx` | Failed emails, drift, sync | Global aggregates | Billing admin service | `GET /admin/billing/overview` | Master Billing | Nein | — | — |
| 6 | **Billing — Audit** | `masterBilling=audit` | `BillingAuditSection.tsx` | Billing config mutations | Global | `billing_audit_logs` | `GET /admin/billing/audit-log` | Master Billing | Nein | Billing audit table | — |
| 7 | **Connected Vehicles / DIMO** | `?view=vehicles`, `fleet-connection` | `ConnectedVehiclesHub`, `FleetConnectionView` | Fahrzeug-Konnektivität, DIMO Diagnose | **Tenant vehicles + global DIMO platform** | DIMO Segments + mirror | `GET /admin/dimo/*`, fleet-connectivity | `MASTER_ADMIN` | Deregister, sync actions | Teilweise Activity | Server env |
| 8 | **High Mobility** | `?view=high-mobility` | `HighMobilityDataView.tsx` | HM Eligibility, Streaming, MQTT | **Per-org vehicles** | HM integration module | `GET/POST /admin/high-mobility/*` | `MASTER_ADMIN` | Link, refresh, stream test | Activity | HM env |
| 9 | **Platform Ops** | `?view=platform-ops` | `platform-ops/*` | Aggregiertes Plattform-Health, Service Detail | **Global** | `platform-ops.service` | `GET /admin/platform-ops/*` | `MASTER_ADMIN` | Nein (read + drilldown) | — | Derived |
| 10 | **Voice Assistant** | `?view=voice-assistant&voiceSection=*` | `VoiceAssistantAdminView.tsx` | Twilio/ElevenLabs CP, Provisioning, Webhooks | **Global CP + per-org assignment** | Voice control plane | `GET/POST …/control-plane/*` | `MASTER_INTEGRATIONS` | Provision, replay | Voice audit events | Provider labels |
| 11 | **Org Detail — Integrations** | `?view=organizations&orgId=&orgTab=integrations` | `OrganizationDetailView.tsx` | Read-only Integrations-Liste pro Org | **Tenant** | `integrations` registry | Org detail DTO | `MASTER_ADMIN` | **Nein** (read-only) | — | Per integration |
| 12 | **Dashboard — Connectivity** | `?view=dashboard` | `MasterDashboardView.tsx` | DIMO KPI Snippet | Global summary | Operational dashboard | `GET /admin/dashboard` | `MASTER_ADMIN` | Nein | — | — |
| 13 | **Security & Governance** | `?view=security-access` | `security-access/*` | IAM (nicht Integration, aber Settings-adjacent) | Global | Security governance APIs | `/admin/security-access/*` | `MASTER_ADMIN` | Ja | Activity log | — |

### 2.2 Orphan / Legacy / Nicht verdrahtet

| Element | Datei | Status | Risiko |
|---------|-------|--------|--------|
| `BillingResendTab` | `billing/BillingResendTab.tsx` | Implementiert, **nicht in BCC** | Email-Delivery-Ops unsichtbar |
| `BillingOutboxTab` | `billing/BillingOutboxTab.tsx` | Implementiert, **nicht in BCC** | Outbox-Dead-Letters unsichtbar |
| `api.integrations.listAll()` | `frontend/src/lib/api.ts` | **Zero Master usage** | Backend ohne UI |
| `PlatformHealthView` | `PlatformHealthView.tsx` | Redirect → `platform-ops` | Legacy URL only |
| `FleetConnectionView` (standalone) | Legacy in nav als `fleet-connection` | Parallel zu Connected Vehicles Hub | Duplicate DIMO diagnostics |
| `dimoConnected` / `onDimoToggle` props | `PlatformSettingsView`, `App.tsx` | Props passed but **unused** in Settings after UI-9.3 | Dead code / confusion |

### 2.3 Explizit **nicht** im Master Admin

| Integration / Setting | Master UI | Backend / Rental | Anmerkung |
|----------------------|-----------|------------------|-----------|
| **WhatsApp** | ❌ | ✅ Rental `WhatsApp*` modules | Plattform-Simulate-Flag nur ENV |
| **Notification Provider (global)** | ❌ | ✅ `NOTIFICATIONS_V2` env + per-org | Runbook only |
| **Feature Flags (Stations V2, Workflow Runtime)** | ❌ | ✅ Env + per-org API | Kein Master Console |
| **Stripe Connect Webhook Admin** | ❌ | ✅ `POST /webhooks/stripe-connect` | Kein Event-Browser |
| **Resend Inbound Webhook** | ❌ | ✅ Webhook handler | Kein Master Event-UI |
| **DIMO Webhook Inbox** | ❌ | ✅ Org-level replay | Nicht Master |
| **Credential Rotation UI** | ❌ | Teilweise ENV-only | Gap dokumentiert |
| **Global API Keys Management** | ❌ | `MASTER_API_KEYS` reserviert | Nicht implementiert |

### 2.4 Element-Inventar pro Oberfläche (Auszug kritische Flächen)

#### Settings → General

| Element | Zweck | Scope | Endpoint | Mutation | Audit |
|---------|-------|-------|----------|----------|-------|
| Company Name Input | Firmenname | Unklar | — | Fake save | Nein |
| Legal Entity, Address, Country, Email, Support | Kontaktdaten | Unklar | — | Fake save | Nein |
| Save Changes Button | Persistenz | — | — | **No-op** | Nein |

#### Settings → E-Mail

| Element | Zweck | Scope | Endpoint | Mutation | Audit |
|---------|-------|-------|----------|----------|-------|
| defaultFromEmail | Global noreply | Global | PUT settings | Ja + MFA | Ja |
| defaultFromName | Absendername | Global | PUT settings | Ja + MFA | Ja |
| defaultReplyToEmail | Reply-To | Global | PUT settings | Ja + MFA | Ja |
| effectiveFrom* (read-only) | Aktiver Versand | Global | GET settings | Nein | — |
| Save Button | Expliziter Save | Global | PUT | Ja | Ja |

#### Billing → Stripe Tab

| Element | Zweck | Scope | Endpoint | Mutation | Audit |
|---------|-------|-------|----------|----------|-------|
| Integration KPI | Config state CONNECTED/PREPARED | Global | stripe-status | Nein | — |
| Modus KPI | `runtimeStripeMode` TEST/LIVE | Global | stripe-status | Nein | — |
| Secret/Webhook configured | Booleans | Global | stripe-status | Nein | — |
| Kommunikationsstatus | Config vs. Events | Global | Derived | Nein | — |
| Webhook Events Table | Runtime ingest | Global | webhook-events | Nein | — |
| Reconciliation starten | Drift scan | Global | POST reconciliation/run | Ja | Billing audit |
| Nur fehlgeschlagen Filter | Event filter | Global | webhook-events | Nein | — |

#### Voice Assistant — Sections

| Section | Tabs/Cards | Health | Actions | Test |
|---------|------------|--------|---------|------|
| platform | Provider KPIs, DLQ, backlog | Ja | — | — |
| organizations | Org assignment table | Partial | — | — |
| provisioning | Twilio subaccount, ElevenLabs import | Partial | Provision mutations | Ja (provision) |
| phone-numbers | Number inventory | Partial | — | — |
| deployments | Agent deployments | Partial | — | — |
| webhooks | Event list + replay | Ja | Replay | Replay = prod risk |
| costs | Provider cost breakdown | Read | — | — |
| audit | CP audit events | Read | — | — |

---

## 3. Global vs Tenant Scope

### 3.1 Scope-Matrix (Setting → Scope → Inheritance → Override → Source of Truth)

| Setting / Integration | Scope | Inheritance | Tenant Override Allowed | Source of Truth | UI Scope Clarity |
|-------------------------|-------|-------------|-------------------------|-----------------|------------------|
| `DIMO_CLIENT_ID`, `DIMO_PRIVATE_KEY`, API endpoint | **Global Platform** | N/A (env) | Nein | Server ENV + DIMO | ✅ Settings Integrations verweist weg; ⚠️ Fleet Views mischen Vehicle-State |
| DIMO vehicle link / segment sync | **Per Vehicle / Org** | Org ownership | N/A | DIMO Segments + DB mirror | ⚠️ UI-7: fragmentiert |
| `STRIPE_SECRET_KEY`, webhook secrets | **Global Platform** | N/A | Nein | Server ENV | ✅ Billing Stripe Tab (booleans only) |
| Stripe Customer / Subscription | **Per Org** | Org billing record | Nein (platform manages) | `billing_subscriptions` | ✅ BCC Org Drawer |
| Stripe Connect account | **Per Org** | Org payments | Org connects via Rental | `stripe_connect_accounts` | Rental only |
| Platform default From Email | **Global** | Fallback for orgs in „SynqDrive Standard“ mode | Org kann eigene Domain/Sender | `platform_email_settings` | ✅ Email panel erklärt |
| Org email domain / sender | **Per Org** | Overrides platform default when configured | Ja | Org email settings | Rental Admin; Master read-only in Org detail |
| Resend API key | **Global** | N/A | Nein | Server ENV | ❌ Keine UI |
| Twilio / ElevenLabs platform credentials | **Global** | N/A | Nein | Server ENV | ✅ Voice CP (configured booleans) |
| Voice org provisioning | **Per Org** | Assigned from platform pool | Ja (provision per org) | Voice CP DB | ✅ Voice organizations section |
| WhatsApp Business / numbers | **Per Org** (primär) | Platform simulate flag global | Org templates/numbers | WhatsApp module | ❌ Kein Master UI |
| High Mobility eligibility | **Per Vehicle** | Org-scoped | N/A | HM integration | ✅ HM view (org filter) |
| Notification channel flags | **Per Org + Workflow** | Org defaults | Ja | Notification engine | ❌ Kein Master UI |
| `stationsV2` feature flags | **Env + Per Org API** | Org contract | Ja (API) | `stations-v2-feature-flags` | ❌ Kein Master UI |
| `NOTIFICATIONS_V2` | **Env global** | All tenants | Nein | ENV | ❌ Kein Master UI |
| `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE` | **Env global** | All tenants | Nein | ENV | ❌ Kein Master UI |
| Integrations registry entries | **Per Org** | Catalog global | Connect/disconnect per org | `integrations` table | Master Org tab read-only |
| Company Information (Settings General) | **Unklar / Mock** | — | — | **Keine** | **P0 irreführend** |

### 3.2 Scope-Unklarheiten (kritisch)

| UI-Stelle | Problem | Risiko |
|-----------|---------|--------|
| Settings → General „Company Information“ | Sieht aus wie globale Plattform-Firmendaten | Master Admin denkt, SynqDrive GmbH wird global gespeichert — **ist Mock** |
| Org Detail → Integrations (read-only) | Kein Connect/Disconnect | Master kann Tenant-Integration nicht verwalten — OK für Scope, aber **kein globaler Gegenpart** |
| Connected Vehicles DIMO actions | Vehicle-level actions ohne explizites „Platform vs. Tenant“ Banner | Verwechslung mit globaler DIMO-Config |
| `dimoConnected` in App state | Global boolean für Nav badge | Misleading — bedeutet „mindestens ein Fahrzeug connected“, nicht Platform DIMO health |
| Billing Stripe „Verbunden“ | Config state, nicht Connect-per-org | OK wenn Modus sichtbar — **ist es** (`runtimeStripeMode`) |

---

## 4. Integration Inventory

| Integration | Zweck | Environment | Connected State (UI) | Health (UI) | Last Success / Error | Credentials Model | Webhooks | Tenant Scope | Master Actions |
|-------------|-------|-------------|----------------------|-------------|----------------------|-------------------|----------|--------------|----------------|
| **DIMO** | Telematik, Segments, Trips | Server `DIMO_*` env | Mirror counts, fleet-connectivity | Platform Ops + Fleet (fragmentiert) | Poll logs, token health (Ops) | ENV private key — **nicht in UI** | `POST /webhooks/dimo` | Vehicles per org | Sync, deregister, diagnostics |
| **Stripe (Platform)** | SaaS billing + catalog | `sk_test_*` / `sk_live_*` | `integrationStatus` in Billing | Webhook events + reconciliation | `lastWebhookAt`, failed count | ENV — booleans in UI | Billing + Connect routes | Subscriptions per org | Reconcile, view events |
| **Stripe Connect** | Rental payments | Same platform key | Org-level in Rental | Partial in org billing row | Connect webhook (no Master UI) | Platform env | `stripe-connect` webhook | Per org | Rental only |
| **Resend / Email** | Transactional email | API key ENV | Implicit (effective sender works) | Billing overview `failedEmailDeliveries` | Resend tab (orphan) | ENV `RESEND_API_KEY` | Inbound Resend webhook | Platform sender + org domains | Platform sender edit; resend/replay (orphan tab) |
| **Twilio** | Voice PSTN | Platform + per-org subaccounts | Voice CP `twilioIe1` label | Voice platform section | Webhook backlog, DLQ | ENV + provisioned subaccounts | Voice webhooks | Per-org provision | Provision subaccount |
| **ElevenLabs** | Voice AI agent | Platform | Voice CP `elevenLabs` label | Assignment status per org | CP metrics | ENV API key | Via Voice pipeline | Per-org import | Import agent |
| **WhatsApp** | Rental messaging | `WHATSAPP_SIMULATE_ENABLED` global | Rental UI only | Provider health in backend | Last error in rental | ENV + org config | WhatsApp webhooks | Per org | **Kein Master** |
| **High Mobility** | OEM telematics alt path | HM credentials ENV | Per-vehicle status in HM view | Stream/MQTT status endpoints | Stream logs | ENV / org link | HM webhook | Per vehicle/org | Eligibility, link, stream test |
| **Notification Engine** | Multi-channel notifications | `NOTIFICATIONS_V2` flag | Kein Master UI | Metrics/runbooks | Runbook | ENV | Internal | Per org workflow flags | **Kein Master** |
| **Internal Webhooks** | DIMO, Stripe, Resend, Voice, HM | Per route | Event tables where exposed | Per integration | Per integration | Signing secrets ENV | Multiple | Mixed | Replay (Voice only in Master) |

---

## 5. Integration Status Model

### 5.1 Beobachtete Zustände im Code/UI

| State Label | Wo | Dimension | Kanonisch? |
|-------------|-----|-----------|------------|
| `CONNECTED` / `PREPARED` / disconnected | Billing Stripe | **Configuration** | ✅ Stripe-specific |
| `runtimeStripeMode` TEST / LIVE | Billing Stripe | **Environment** | ✅ Remediation-konform |
| „Aktiv (echte Events)“ vs „Nur Konfiguration“ | Billing Stripe | **Runtime Communication** | ✅ Gute Trennung |
| `healthy` / `degraded` / `critical` / `stale` / `unknown` | Platform Ops | **Runtime Health** | ✅ Kanonisch für Ops |
| `ACTIVE` / `ERROR` / disconnected | Org integrations registry | **Tenant Integration** | ✅ |
| `dimoConnected` count | Dashboard, Nav badge | **Fleet aggregate** | ⚠️ Nicht Platform DIMO health |
| `Connected` / `Disconnected` | Fleet Connection DIMO tab | **Mirror link** | ⚠️ ≠ telemetry freshness |
| `live` / `standby` / `offline` / `signal_delayed` / `no_signal` | Backend telemetry resolver | **Telemetry Freshness** | ✅ Kanonisch — **nicht überall in UI** |
| `Zugeordnet` / `Offen` | Voice ElevenLabs column | **Provisioning** | ✅ |
| Provider „konfiguriert“ / „fehlt“ | Voice, Stripe | **Credential presence** | ✅ |

### 5.2 Anti-Patterns gefunden

| Problem | Beispiel | Impact |
|---------|----------|--------|
| Gleiches Wort, andere Dimension | „Connected“ für DIMO mirror vs. Stripe config vs. HM stream | Master Admin misinterpretiert |
| Frontend-only derivation | `communicationConfigured` in Stripe Tab aus Events + status | OK, aber nicht zentralisiert |
| Healthy obwohl stale | Platform Ops `stale` existiert, aber Nav badge ignoriert es | False negative auf Outage badge |
| Config = Connected obwohl Health fails | Stripe `CONNECTED` + fehlgeschlagene Webhooks | Teilweise mitigiert durch separate KPIs |
| Boolean Nav badge | `!dimoConnected` → `integration-outage` | P1 — zu grob |

### 5.3 Empfohlenes Zielmodell (nur Audit, nicht implementiert)

Trenne immer vier Dimensionen in der UI:
1. **Configuration State** — credentials/endpoints configured?
2. **Environment** — TEST / LIVE / STAGING
3. **Runtime Health** — healthy / degraded / critical / stale
4. **Last Successful Operation** — timestamp + operation type

---

## 6. DIMO Platform Configuration

### 6.1 Was der Master Admin sieht

| Aspekt | UI-Ort | Backend | Bewertung |
|--------|--------|---------|-----------|
| Environment / API endpoint | Nicht direkt — Fleet/Ops | `DIMO_API_URL` etc. | ✅ Keine Secrets in UI |
| Client / App context | Fleet Connection diagnostics | DIMO auth module | Teilweise |
| Authorization / token health | Platform Ops → Token Health | `platform-ops` + poll logs | ✅ |
| Webhooks | Kein Master webhook browser | `POST /webhooks/dimo` | Gap |
| Sync / rate limits | Fleet actions, worker metrics in Ops | DIMO workers | Fragmentiert |
| Health aggregate | Platform Ops service card | `platform-ops.service` | ✅ mit Drilldown |
| Last success / error | Poll logs, diagnostics | `GET /admin/dimo/*` | ✅ in Fleet/Ops |
| Vehicle problems vs. platform | **Vermischt in Vehicles/Fleet views** | Separate concerns in backend | **P1** (UI-7) |

### 6.2 Security

- ✅ Keine DIMO private keys in Master UI (UI-9.3 bestätigt)
- ⚠️ `GET /admin/dimo/debug-jwt` liefert truncated JWT — admin-only, nicht in Standard-UI, aber **exposure risk** wenn missbraucht
- ✅ Tenant vehicle issues nicht als „DIMO Platform down“ dargestellt in Settings (nach Remediation)

### 6.3 Referenz UI-7

Connected Vehicles Audit Score ~44/100 — **drei konkurrierende Connectivity-Wahrheiten**. Für Integrations-Audit: DIMO **platform config** ist serverseitig korrekt isoliert; **Master UX** ist das Hauptproblem.

---

## 7. Stripe Platform Configuration

### 7.1 TEST vs. LIVE — Prioritätsprüfung

| Anforderung | Status | Evidenz |
|-------------|--------|---------|
| Unmissverständliche TEST/LIVE Anzeige | **✅ Gut** | `runtimeStripeMode` KPI in `BillingStripeTab` |
| Kein Eindruck Test = Produktiv | **✅ Gut** | Backend `validateStripeEnvironmentOrThrow` in Prod |
| Webhook signing state | **✅ Partial** | `stripeWebhookConfigured` boolean |
| Webhook events sichtbar | **✅** | Event table mit failed filter |
| Connect context getrennt | **⚠️** | Connect webhook ohne Master UI |
| Product/Price context | **✅** | Billing Pricing tab |
| Reconciliation | **✅** | Reconciliation section + run button |
| Last event | **✅** | `lastWebhookAt`, event list |

### 7.2 UI-6 Cross-Reference

Billing Deep Audit ~49/100 — Stripe Admin ist **Ops-Tabelle**, nicht Kontrollfläche. Für Integrations-Audit: **Environment Safety ist relativ stark** (Score 55), Rest fragmentiert in BCC.

### 7.3 Risiken

- Reconciliation „starten“ ohne ausführliche Impact-Confirmation in Stripe Tab
- `integrationStatus === 'CONNECTED'` neben hoher `failedWebhookCount` — KPIs getrennt, aber kein aggregiertes „Degraded“

---

## 8. Email (Resend)

### 8.1 Platform Sender (Master)

| Aspekt | Status | Details |
|--------|--------|---------|
| Provider | Resend (implicit) | Kein Provider-Picker — korrekt wenn single provider |
| Sender identity | ✅ | `defaultFromEmail`, `defaultFromName` |
| Domain verification | ❌ Master UI | Org domains in Rental Admin |
| Default From / Reply-To | ✅ | Editable with scope explanation |
| Health | Partial | `effectiveFrom*` display; kein Resend API health ping in Settings |
| Delivery / Last Error | Orphan | `BillingResendTab` nicht verdrahtet |
| Test Send | ❌ | Kein „Test-E-Mail senden“ in Master |
| MFA on mutation | ✅ | `MasterAdminMfaGuard` + `MASTER_PLATFORM_SETTINGS` |

### 8.2 Global vs Tenant

Platform panel **erklärt explizit**: Mandanten mit eigenen Domains konfigurieren unter Administration → E-Mail & Versand. **Best practice example** für Scope Clarity.

### 8.3 Secret Handling

- `RESEND_API_KEY` nur ENV — ✅ nicht in UI
- Billing overview zeigt `failedEmailDeliveries` count — gut für Attention

---

## 9. WhatsApp / Twilio

### 9.1 Twilio (Voice Control Plane)

| Dimension | Master UI | Getrennt? |
|-----------|-----------|-----------|
| Provider Account | Voice → platform (label) | ✅ |
| Phone numbers | Voice → phone-numbers section | ✅ |
| Environment | Provider label (IE1 etc.) | Partial |
| Webhook | Voice → webhooks + replay | ✅ |
| Messaging state | N/A (voice, not SMS) | — |
| Health | DLQ, backlog, delay metrics | ✅ |
| Last error | Webhook event rows | ✅ |
| Tenant assignment | organizations + provisioning | ✅ |

**Bewertung:** Voice CP ist das **reifste Integrations-UI-Muster** im Master Admin — multi-section, health metrics, audit, webhooks.

### 9.2 WhatsApp

| Dimension | Master UI |
|-----------|-----------|
| Account / Number | ❌ |
| WhatsApp Business Status | ❌ |
| Templates | ❌ (Rental) |
| Health | ❌ |
| Webhook | ❌ |
| `WHATSAPP_SIMULATE_ENABLED` | ❌ (ENV only) |

**P0 Gap:** Plattformweite Simulate-Flags und Provider-Health sind für Master Admin **unsichtbar**. Risiko: Master Admin kann nicht erkennen, ob WhatsApp live oder simuliert ist.

### 9.3 Vermischungsrisiko

Voice und WhatsApp teilen Twilio als Provider — aber **keine Master-UI** vermischt sie. Problem ist **Abwesenheit**, nicht falsche Badge-Vermischung.

---

## 10. ElevenLabs / Voice AI

| Aspekt | UI | Backend | Secret Exposure |
|--------|-----|---------|-----------------|
| Agent | deployments section | CP DB | ✅ |
| Provider | platform status | ENV + label | ✅ Boolean only |
| Phone integration | phone-numbers + Twilio provision | CP | ✅ |
| Environment | Provider labels | Config | Partial |
| Tool/MCP integration | Nicht in Master UI | Agent config | ✅ |
| Health | platform KPIs, DLQ | CP metrics | ✅ |
| Last call / error | costs + webhooks | CP | ✅ |
| Tenant assignment | organizations table | Per-org | ✅ |
| Internal prompts | Nicht exponiert | Server | ✅ |

**Provisioning actions** (`twilioProvisionSubaccount`, `elevenLabsImport`) — mutations without unified step-up dialog pattern across platform.

---

## 11. Webhook Management

### 11.1 Inventar

| Provider | Master UI | Endpoint (typical) | Signing | Last Received | Retry/Replay |
|----------|-----------|-------------------|---------|---------------|--------------|
| Stripe Billing | ✅ Billing Stripe Tab | `/webhooks/stripe` | ENV secret | Event table | Reconciliation |
| Stripe Connect | ❌ | `/webhooks/stripe-connect` | ENV secret | — | — |
| Voice (Twilio etc.) | ✅ Voice webhooks section | Voice routes | Platform | Event table | **Replay button** |
| Resend Inbound | ❌ | Resend route | ENV | — | — |
| DIMO | ❌ | `/webhooks/dimo` | DIMO | Ops health only | Org-level only |
| High Mobility | ❌ | HM webhook | HM | HM logs | — |

### 11.2 Master Admin Erkennbarkeit

- **Stripe:** Master kann Fehler erkennen (failed filter, counts) — **gut**
- **Voice:** Master kann DLQ/backlog + events sehen — **gut**
- **Alles andere:** **Lücke** — kein Unified Webhook Health Board

### 11.3 Secrets

✅ Keine Webhook-Secrets im DOM across audited views.

---

## 12. Secret Handling

### 12.1 Regel-Compliance

| Regel | Status | Evidenz |
|-------|--------|---------|
| Niemals vollständig zurückliefern | ✅ | APIs return booleans / masked IDs |
| Niemals vollständig im DOM | ✅ | Post UI-9.3 keine fake keys |
| Maskierung | ✅ | Stripe „konfiguriert/fehlt“ |
| Rotation statt Readback | ⚠️ | Kein Rotation-UI |
| Last Rotated | ❌ | Nicht vorhanden |
| Scope / Environment | Partial | Stripe mode ja; andere nein |
| Audit | Partial | Billing/Voice/Email ja |

### 12.2 Formulare geprüft

| Formular | Secrets? | Bewertung |
|----------|----------|-----------|
| Settings General | Nein (aber fake data) | P0 mock |
| Settings Email | Nein (email addresses only) | ✅ |
| Settings Integrations | Nein (info cards) | ✅ |
| Billing Stripe | Nein | ✅ |
| Voice provisioning | Nein | ✅ |
| Org integrations | Read-only status | ✅ |

### 12.3 Risiken

- `debug-jwt` admin endpoint — truncated but still sensitive
- Dead `dimoConnected`/`onDimoToggle` props suggest incomplete cleanup after credential removal

---

## 13. Credential Rotation

| Capability | Vorhanden? | UI | Gap |
|------------|------------|-----|-----|
| Stripe key rotation | ENV/deploy only | ❌ | Kein guided rotation |
| Resend API key rotation | ENV only | ❌ | Gap |
| DIMO key rotation | ENV only | ❌ | Gap |
| Twilio/ElevenLabs rotation | ENV + reprovision | Partial (re-provision) | Kein formal rotation flow |
| Webhook secret rotation | ENV + Stripe dashboard | ❌ | Gap |
| Grace period / dual-key | Backend unknown in audit | ❌ | Nicht dokumentiert in UI |
| Rollback | ❌ | ❌ | Gap |
| Confirmation / step-up | MFA on some mutations | Partial | Nicht für rotation |
| Audit trail for rotation | Activity log (if logged) | ❌ dedicated | Gap |

**Audit-Urteil:** Rotation ist **nicht als Produktfeature** umgesetzt — korrekt dokumentieren, **nicht neu erfinden**.

---

## 14. Test Actions

| Action | UI-Ort | Echte Wirkung | Produktionsrisiko | Empfänger | Audit | Rate Limit | Confirmation |
|--------|--------|---------------|-------------------|-----------|-------|------------|--------------|
| Test Email | ❌ | — | — | — | — | — | — |
| Test Webhook | ❌ (Stripe) | — | — | — | — | — | — |
| Voice webhook replay | Voice webhooks | Re-processes event | **Hoch** | Real pipeline | Voice audit | Unknown | Weak |
| HM stream test | High Mobility view | Tests MQTT/stream | Mittel | HM API | Activity? | Unknown | Partial |
| Stripe reconciliation run | Billing Stripe | Scans drifts | Mittel | DB/Stripe | Billing audit | Unknown | Weak |
| Resend delivery replay | Orphan tab | Re-queues email | **Hoch** | Real recipient | Unknown | Unknown | Weak |
| DIMO debug/sync | Fleet Connection | API calls | Mittel | DIMO | Partial | Unknown | Varies |

**P1:** Voice replay und potenzielle Email replay können **unbeabsichtigt produktive Nebenwirkungen** haben ohne klare Confirmation/Recipient-Anzeige.

---

## 15. System Settings

### 15.1 Inventar globaler Plattformsettings (Master-sichtbar)

| Kategorie | UI | SoT | Default | Restart? | Runtime Effect |
|-----------|-----|-----|---------|----------|----------------|
| Company Information | Settings General (mock) | — | Hardcoded | — | **Keine** |
| Platform Email Sender | Settings Email | DB | API defaults | Nein | Sofort für Standard-Absender-Modus |
| Stripe keys/mode | Billing (read) | ENV | — | Deploy | Billing + Connect |
| DIMO credentials | Info card only | ENV | — | Deploy | Telematics |
| Voice provider config | Voice platform | ENV | — | Deploy | Voice calls |
| Notification flags | Kein UI | ENV | — | Deploy | Channel routing |
| Workflow runtime mode | Kein UI | ENV | legacy | Deploy | Task automation |

### 15.2 Anti-Patterns

| Problem | Fundstelle |
|---------|------------|
| Key-Value-Wand ohne Kategorien | Settings General (fake) |
| Technische ENV-Namen | ArchitekturView (nicht Settings, aber Referenz) |
| Gefährliche Settings ohne Risiko | Voice replay, reconciliation — minimal context |

---

## 16. Feature Flags

### 16.1 Vorhandene Flags (Backend/Env — kein Master Console)

| Flag | Scope | UI |
|------|-------|-----|
| `stationsV2` / UI v2 | Env + per-org API | ❌ Master |
| `NOTIFICATIONS_V2` | Global env | ❌ Master |
| `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE` | Global env | ❌ Master |
| `DOCUMENT_MALWARE_SCAN_ENABLED` | Global env | ❌ Master |
| `WHATSAPP_SIMULATE_ENABLED` | Global env | ❌ Master |
| IAM MFA master admin | Env + resolver | Security hub (status only) |

### 16.2 Audit-Urteil

**Kein kanonisches Feature-Flag-System in Master Admin.** Flags sind mit normalen Settings vermischt **nur auf ENV-Ebene**, nicht in UI — besser als falsche UI, aber **Blind Spot** für Master Admin.

**Nicht neu erfinden** — nur als Gap dokumentieren.

---

## 17. Environment Safety

| Dimension | Development | Staging | Production | Test Provider | Live Provider |
|-----------|-------------|---------|------------|---------------|---------------|
| Visuelle Trennung | ❌ Kein global banner | ❌ | ❌ | Stripe TEST/LIVE KPI ✅ | Stripe ✅ |
| Funktionale Trennung | Backend guards ✅ | Partial | `STRIPE_ALLOW_TEST_IN_PRODUCTION` escape | WhatsApp simulate ❌ UI | — |
| Voice provider labels | Partial | Partial | Partial | — | — |
| DIMO environment | ❌ UI | ❌ | Server env only | — | — |

**Score 55** — Stripe remediation trägt hauptsächlich; **kein globales Environment-Chrome** im Master Shell.

---

## 18. Mutation Safety

| Kritische Aktion | Permission | MFA Step-up | Confirmation | Reason | Audit | Impact Shown | Rollback |
|------------------|------------|-------------|--------------|--------|-------|--------------|----------|
| Platform email save | MASTER_ADMIN | ✅ | Save only | ❌ | ✅ | Partial (scope text) | Manual revert |
| Stripe reconciliation | Master Billing | Unknown in UI | Weak | ❌ | ✅ | Weak | N/A |
| Voice provision | MASTER_INTEGRATIONS | Unknown | Partial | ❌ | Voice audit | Weak | Manual |
| Voice webhook replay | MASTER_INTEGRATIONS | Unknown | Weak | ❌ | Partial | ❌ | ❌ |
| DIMO deregister | MASTER_ADMIN | ❌ | ✅ Confirm dialog | ❌ | Activity | Good (UI-7) | ❌ |
| Provider disconnect (org) | — | — | — | — | — | **No Master UI** | — |
| Live/Test switch | — | — | — | — | — | **ENV only** | — |
| Feature flag change | — | — | — | — | — | **No UI** | — |

---

## 19. Change Impact

| Änderung | Impact in UI erklärt? | Orgs betroffen | Restart nötig | Messaging/Payments/Telemetry |
|----------|----------------------|----------------|----------------|------------------------------|
| Platform sender email | ✅ Partial (text) | Alle im Standard-Modus | Nein | Email sofort |
| Stripe env key | ❌ | Alle | Deploy | Billing + Connect |
| DIMO env | ❌ | Alle Fahrzeuge | Deploy | Telemetry |
| Voice provision | ❌ | Einzelne Org | Nein | Voice calls |
| General settings mock | ❌ | — | — | — |

**Gap:** Kein einheitliches „Change Impact Panel“ vor globalen Mutationen.

---

## 20. Save Semantics

| Oberfläche | Modell | Dirty State | Nav Warning | Bewertung |
|------------|--------|-------------|-------------|-----------|
| Settings General | Save button, **no-op** | Nein | Nein | **P0 broken** |
| Settings Email | Explicit Save | Nein tracked | Nein | ✅ Klar |
| Billing forms | Mixed per tab | Varies | Nein | ⚠️ |
| Voice | Per-action buttons | Nein | Nein | ⚠️ |
| Platform Ops | Read-only | — | — | ✅ |

**Kein Mischsystem-Problem auf Email** — aber **General vs. Email im selben Settings-Hub** ohne klare Regelkommunikation.

---

## 21. Configuration History

| Quelle | Scope | Actor | Before/After | Secrets excluded | Master UI |
|--------|-------|-------|--------------|------------------|-----------|
| Activity Log | Platform | ✅ | Partial | ✅ | Security hub (post UI-9.3) |
| Billing Audit Log | Billing | ✅ | ✅ | ✅ | Billing audit tab |
| Voice CP Audit | Voice | ✅ | Partial | ✅ | Voice audit section |
| Platform email changes | Platform | ✅ via activity | Unknown detail | ✅ | ❌ dedicated |
| Integrations registry changes | Org | Backend | Unknown | ✅ | ❌ |

**Kanonische Quelle:** `activity_logs` + domain-specific audit tables — **kein unified Integrations Change Log**.

---

## 22. Responsive

| Surface | Smartphone | Tablet | Notebook | Desktop | Issues |
|---------|------------|--------|----------|---------|--------|
| Settings | OK | OK | OK | OK | General form 1-col mobile ok |
| Billing Stripe | Cramped KPIs | OK | Wide tables | OK | Event table horizontal scroll |
| Voice CP | Section tabs wrap | OK | Tables scroll | OK | Many sections |
| Platform Ops | Cards stack | OK | OK | OK | Drawer ok |
| Fleet/HM | Horizontal scroll | Scroll | Scroll | OK | UI-7: form walls on mobile |
| Org integrations | List ok | OK | OK | OK | Read-only simple |

**Score 46** — komplexe Tabs (Billing, Voice, Fleet) mobile **benutzbar aber nicht optimal**.

---

## 23. Accessibility

| Prüfpunkt | Status | Fundstelle |
|-----------|--------|------------|
| Form labels | ✅ Settings forms | Email panel |
| Secret inputs | N/A (no secrets) | — |
| Status chips | Partial | Farbe + Text in Ops/Stripe |
| Tabs | ✅ | `MasterPageTabs`, `tabsAriaLabel` on Settings |
| Dialogs | Partial | Voice/Billing uneven |
| Keyboard | Partial | Tables dominate |
| Focus | Pattern library helps | — |
| Error messaging | ✅ Toasts on email save | — |
| Confirmation | Weak on destructive integration actions | — |
| Touch targets | Generally ok | sq-cta buttons |

**Score 52** — Settings tabs noch **EN** („General“, „Integrations“) in DE-kanonischem Produkt.

---

## 24. Technical Architecture

### 24.1 Schichten

```
Master Admin UI (Vite/React)
  ├── PlatformSettingsView → api.admin.email (live) | mock general
  ├── BillingControlCenter → api.billing.admin* (live)
  ├── VoiceAssistantAdminView → api.voiceAssistant.admin.controlPlane (live)
  ├── ConnectedVehiclesHub / FleetConnection → api.admin.dimo* (live)
  ├── PlatformOps → api.admin.platformOps (live)
  ├── OrganizationDetailView → org detail DTO (integrations read-only)
  └── api.integrations.* → UNUSED in Master

Backend (NestJS)
  ├── platform-email (MFA guarded)
  ├── billing + stripe-environment module
  ├── dimo module (env credentials)
  ├── voice-assistant admin control plane
  ├── integrations.controller (admin + org routes)
  ├── high-mobility admin
  └── outbound-email / resend integration
```

### 24.2 Risiken

| Risiko | Severity | Details |
|--------|----------|---------|
| Secrets in client bundle | Low | No VITE_* secrets found in integration views |
| Unused API surface | Medium | `admin/integrations` drift from UI |
| Caching | Medium | Operational dashboard cache drives nav badges — stale possible |
| Mutation invalidation | Medium | Per-view reload patterns, no global integration cache |
| Health derivation duplication | High | DIMO/fleet/dashboard/ops — UI-7 documented |
| localStorage/session | Low | No integration secrets in localStorage |

### 24.3 Server/Client Boundary

✅ Integration credentials remain server-side. Frontend receives only DTOs with booleans, counts, labels, timestamps.

---

## 25. Security / Exposure Risks

| ID | Risiko | Severity | Mitigation vorhanden | Empfehlung |
|----|--------|----------|---------------------|------------|
| SEC-01 | Settings General mock suggeriert persistierte globale Daten | P0 | — | Remove or wire to API |
| SEC-02 | `debug-jwt` endpoint | P1 | Admin-only | Restrict further / remove from prod |
| SEC-03 | Voice webhook replay ohne strong confirm | P1 | Auth | Step-up + impact dialog |
| SEC-04 | Orphan Resend replay actions | P1 | Auth in API | Wire with safety or remove |
| SEC-05 | No visibility into WHATSAPP_SIMULATE | P1 | ENV | Master platform flags read-only view |
| SEC-06 | Nav `integration-outage` false signals | P2 | — | Use platform-ops health |
| SEC-07 | Dead `dimoConnected` toggle props | P3 | — | Code cleanup |

---

## 26. Duplicate Truth Risks

| Domäne | Konkurrierende Wahrheiten | Referenz |
|--------|---------------------------|----------|
| DIMO connectivity | Vehicles view / Fleet / Dashboard / Ops | UI-7 §1 |
| Stripe health | integrationStatus vs. webhook failures vs. reconciliation drifts | UI-6 |
| Email delivery health | Billing overview KPI vs. orphan Resend tab | This audit |
| Integration registry | `admin/integrations` API vs. Org detail list vs. per-module views | This audit |
| Platform health | Legacy `platform-health` vs. `platform-ops` | Redirect exists ✅ |

---

## 27. Findings P0 / P1 / P2 / P3

### P0 — Blocker / Irreführung / Sicherheitsrelevant

| ID | Finding | Ort |
|----|---------|-----|
| P0-01 | Kein kanonischer Integrations- & Systemconfig-Hub | IA gesamt |
| P0-02 | Settings → General ist Mock mit funktionslosem Save | `PlatformSettingsView.tsx` |
| P0-03 | `GET /admin/integrations` ohne Master-Frontend | `api.integrations.*` unused |
| P0-04 | WhatsApp / globale Messaging-Flags ohne Master-Sicht | Rental only |
| P0-05 | Feature Flags platformweit blind | ENV only |

### P1 — Erhebliche Governance-Lücke

| ID | Finding | Ort |
|----|---------|-----|
| P1-01 | DIMO Platform vs. Vehicle vermischt über Views | UI-7 carryover |
| P1-02 | `integration-outage` Badge zu grob (`dimoConnected`) | `useMasterNavBadges.ts` |
| P1-03 | `BillingResendTab` / `BillingOutboxTab` orphan | `billing/*` |
| P1-04 | Kein Unified Webhook Health (Connect, DIMO, Resend) | — |
| P1-05 | Test/Replay-Aktionen ohne Production-Safety UX | Voice, Billing |
| P1-06 | Kein Credential Rotation UI/Runbook-Surface | — |
| P1-07 | Settings Tabs EN statt DE | `PlatformSettingsView.tsx` |
| P1-08 | Status-Labels nicht dimensionsbasiert kanonisch | Multiple views |

### P2 — UX / Konsistenz

| ID | Finding | Ort |
|----|---------|-----|
| P2-01 | Kein globales Environment-Banner (TEST/LIVE/Simulate) | Shell |
| P2-02 | High Mobility parallel zu DIMO ohne Integrations-Übersicht | Nav |
| P2-03 | Org integrations read-only ohne Master-Gegenstück | Org detail |
| P2-04 | Change Impact nicht vor globalen Saves | Email only partial |
| P2-05 | Configuration History nicht aggregiert | — |
| P2-06 | Dead props `dimoConnected`/`onDimoToggle` in Settings | `App.tsx` |

### P3 — Nice-to-have / Cleanup

| ID | Finding | Ort |
|----|---------|-----|
| P3-01 | Legacy Fleet Connection duplicate nav entry | Nav |
| P3-02 | `FleetConnectionView` vs Connected Vehicles Hub overlap | UI-7 |
| P3-03 | ArchitekturView widerspricht teils Feature-Flag-Verdrahtung | Docs vs code |

---

## 28. Recommended Target State

### 28.1 Kanonischer Hub: „Integrationen & Plattform“

Analog UI-9 Security & Governance:

```
?view=platform-integrations
├── Übersicht (Attention Board — alle Provider)
├── Provider (DIMO | Stripe | E-Mail | Voice | WhatsApp | HM | Notifications)
├── Webhooks (unified event health, no secrets)
├── Umgebung (TEST/LIVE/Simulate flags — read-only)
├── Einstellungen (nur echte globale Settings — kein Mock)
└── Änderungsprotokoll (aggregiert aus Activity + domain audits)
```

### 28.2 Scope-Regeln (verbindlich)

1. **Jede Karte** zeigt: Scope-Badge (`Global` | `Mandant` | `Fahrzeug`), Environment, vier Status-Dimensionen.
2. **Keine Credentials** in Forms — nur `configured` / `rotate via deploy` / `last rotated`.
3. **TEST/LIVE** immer sichtbar wo Stripe oder billable providers betroffen.
4. **Tenant overrides** verlinken in Org-Detail, nicht inline ohne Kontext.

### 28.3 Konsolidierung

| Von | Nach |
|-----|------|
| Settings Integrations info cards | Platform Integrations hub |
| Billing Stripe tab (keep) | Hub deep-link + embed or iframe pattern |
| Voice CP (keep) | Hub entry + health summary |
| Connected Vehicles (keep) | Hub DIMO card → drilldown |
| Orphan Resend/Outbox tabs | Billing oder Hub Email delivery section |
| `admin/integrations` API | Hub registry table |

### 28.4 Nicht im Scope der Ziel-UI

- Tenant WhatsApp template editor (bleibt Rental)
- Per-vehicle DIMO diagnostics detail (bleibt Connected Vehicles)
- Feature flag **editing** (bis kanonisches Backend-Modell existiert — nur read-only Anzeige)

### 28.5 Erfolgskriterien (für spätere UI-10 Implementierung)

| Kriterium | Ziel |
|-----------|------|
| 10-Sekunden-Test | Master Admin nennt Stripe-Modus, DIMO platform health, Email sender, Voice status |
| Scope clarity | 100% der sichtbaren Settings haben Scope-Badge |
| Secret safety | 0 raw secrets in DOM/API responses to UI |
| Webhook visibility | Alle produktiven Webhooks mit last event + failure count |
| Mutation safety | Kritische Aktionen: MFA + confirm + reason + audit |

---

## Anhang A — UI-1 bis UI-9 Cross-Map

| Phase | Relevanz für Integrations-Audit |
|-------|--------------------------------|
| UI-1 IA | Integrationen über 6+ Nav-Einträge verteilt — nicht konsolidiert |
| UI-2 Page Framework | Settings/Voice/Ops nutzen `MasterPageHeader` — konform |
| UI-3 Dashboard | Connectivity KPIs — duplicate DIMO truth |
| UI-4 Organizations | Org integrations read-only chip |
| UI-5 Organizations blueprint | Billing handoff — gut |
| UI-6 Billing | Stripe TEST/LIVE stark; Resend orphan |
| UI-7 Connected Vehicles | DIMO fragmentation — carryover P1 |
| UI-8 Platform Ops | Best global health aggregate |
| UI-9 Security | Settings fake credentials **entfernt**; Security hub Pattern für UI-10 |

## Anhang B — Dateireferenzen

| Bereich | Pfad |
|---------|------|
| Settings | `frontend/src/master/components/PlatformSettingsView.tsx` |
| Email | `frontend/src/master/components/PlatformEmailSettingsPanel.tsx` |
| Billing | `frontend/src/master/components/billing/BillingControlCenter.tsx` |
| Stripe Tab | `frontend/src/master/components/billing/BillingStripeTab.tsx` |
| Voice | `frontend/src/master/components/VoiceAssistantAdminView.tsx` |
| Platform Ops | `frontend/src/master/platform-ops/` |
| Nav Badges | `frontend/src/master/navigation/useMasterNavBadges.ts` |
| Integrations API | `backend/src/modules/integrations/integrations.controller.ts` |
| Platform Email API | `backend/src/modules/outbound-email/platform-email.controller.ts` |
| Stripe env | `backend/src/shared/stripe/stripe-environment.*` |

---

**Ende des Audits — keine Implementierung in UI-10.1.**
