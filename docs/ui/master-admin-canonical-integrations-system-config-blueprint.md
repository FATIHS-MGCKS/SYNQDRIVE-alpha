# Master Admin — Kanonisches Integrations & System Configuration Blueprint

**Datum:** 2026-08-18  
**Phase:** UI-10.2 (Spezifikation — keine Implementierung)  
**Basis:**
- `docs/ui/master-admin-integrations-system-config-deep-audit.md` (UI-10.1)
- `docs/ui/master-admin-canonical-page-framework.md` (UI-2.2)
- `docs/ui/master-admin-canonical-security-governance-blueprint.md` (UI-9.2 — Hub-Muster)
- `docs/remediation/stripe-environment-separation.md`, `stripe-webhook-hardening.md`
- `docs/remediation/master-admin-mfa.md`, `master-admin-privileged-access.md`, `master-admin-audit-log-hardening.md`
- `docs/remediation/observability-architecture.md`
- UI-6 Billing, UI-7 Connected Vehicles, UI-8 Platform Ops, UI-9 Security

**Leitfrage:** *Welche globalen Integrationen und Plattform-Einstellungen sind konfiguriert, in welchem Environment, mit welchem Runtime-Status — und welche Änderung hat welche Wirkung auf Mandanten, Zahlungen, Nachrichten und Telemetrie?*

**Grundsatz:** SynqDrive baut **keine** zweite Integrations-Engine im Master Admin. Der Hub **governt** globale Provider-Sichtbarkeit, Health, Webhooks und echte Plattform-Settings; **operative Tenant-Konfiguration** (Org-Domains, Connect-Onboarding, WhatsApp-Templates, Fahrzeug-DIMOs) bleibt in den fachlichen Oberflächen — der Master Admin erhält Summary, Attention, Deep-Links und plattformweite Mutationen, nicht duplizierte CRUD-Mikroseiten.

---

## 0. Produktrolle & Abgrenzung

| Integrationen & Plattform **ist** | Integrationen & Plattform **ist nicht** |
|-----------------------------------|----------------------------------------|
| Kanonisches Integrations-Verzeichnis (Directory) | Zwölf Provider-Mikroseiten in der Sidebar |
| Vier getrennte Status-Dimensionen pro Integration | Ein Universal-„Connected“-Badge |
| Globale Plattform-Settings (nur echte APIs) | Mock-Formulare oder Fake-Credentials |
| Unified Webhook Health (ohne Secrets) | Webhook-Secret-Anzeige oder Readback |
| Read-only Platform Flags (bestehende ENV/API) | Feature-Flag-Editor ohne Backend-Modell |
| Change Preview + Risk-Tiered Mutations | Blind-Save kritischer ENV-Werte |
| Drilldown zu fachlichen Hubs (Billing, Voice, Vehicles) | Duplikat Tenant-Fahrzeugverwaltung |

| Verwandte Hubs — **bleiben eigenständig** | Rolle |
|-------------------------------------------|-------|
| Master-Abrechnung (`billing`) | Verträge, Preise, Rechnungen — Stripe-Detail bleibt hier |
| Verbundene Fahrzeuge (`vehicles`) | Per-Vehicle DIMO/HM — nicht im Integrations-Hub duplizieren |
| Voice Assistant (`voice-assistant`) | Provisioning, Deployments, Voice-Audit — Detail bleibt hier |
| Plattform & Betrieb (`platform-ops`) | Infra/Worker-Alerts — nicht Integrations-Config |
| Identität & Zugriff (`security-access`) | IAM/MFA — nicht in Settings mischen |
| Organisationen (`organizations`) | Tenant-Integrations read-only + Deep-Links |

**10-Sekunden-Ziel:** Master Admin sieht im ersten Viewport: wie viele Integrationen Attention benötigen, Stripe TEST/LIVE, DIMO Platform Health, E-Mail-Absender aktiv — ohne JSON, ohne vermischte Config/Health-Dimensionen.

---

## 1. Information Architecture

### 1.1 Entscheidung: Ein Hub, fünf Primärbereiche

Nach fachlicher Prüfung (minimal sinnvoll, keine Provider-Mikroseiten):

| # | Bereich | Behalten? | Begründung |
|---|---------|-----------|------------|
| 1 | **Übersicht** | **Ja** | Attention Board, Environment Summary, letzte kritische Integration-Events |
| 2 | **Integrationen** | **Ja** | Kanonisches Directory + Detail-Drawer/Panel — **eine** Liste, keine Sidebar pro Provider |
| 3 | **Webhooks** | **Ja** | Cross-Provider Webhook Health — nur wo produktiv Webhooks existieren |
| 4 | **Plattform-Einstellungen** | **Ja** | Kategorisierte echte globale Settings — ersetzt Settings-Mock |
| 5 | **Änderungsprotokoll** | **Ja** | Aggregierter Audit-Kontext für Integration/Settings-Mutationen |
| — | Separates `?view=settings` | **Nein** | → Hub Tab „Plattform-Einstellungen" |
| — | Settings Tab „Integrations" (Info-Cards) | **Nein** | → Hub Tab „Integrationen" |
| — | Feature Management (Edit) | **Nein** | Kein kanonisches Flag-Backend — nur read-only „Plattform-Flags" Unterbereich in Einstellungen |
| — | Provider-Mikroseiten (Stripe-Only-Nav etc.) | **Nein** | Detail unter Integrationen + Deep-Link Billing/Voice |
| — | `fleet-connection` als Integrations-Einstieg | **Nein** | Bleibt Fahrzeug-Diagnose — Link aus DIMO-Detail |

**Keine Mikro-Pages:** Integration Detail, Webhook Event Detail, Setting Detail sind **Drawer oder Inline-Panel** unter dem Hub — keine eigenen Sidebar-Roots pro Provider.

### 1.2 Ziel-Navigationsbaum

```
Integrationen & Plattform  (?view=platform-integrations)
├── Übersicht                              platformIntegrations=overview
├── Integrationen                          platformIntegrations=integrations
│   └── Detail                             &integrationId={slug}
├── Webhooks                               platformIntegrations=webhooks
│   └── Event-Detail                       &webhookEventId={uuid}
├── Plattform-Einstellungen                platformIntegrations=settings
│   └── Kategorie                          &settingsCategory={slug}
│   └── Plattform-Flags (read-only)        &settingsCategory=flags
└── Änderungsprotokoll                     platformIntegrations=changelog
    └── Detail                             &auditId={uuid}
```

**Sidebar:** Ein Eintrag ersetzt `settings` (für Integrations/System-Config-Zweck):

| Feld | Wert |
|------|------|
| **Label (DE)** | Integrationen & Plattform |
| **i18n Key** | `master.nav.platformIntegrations` |
| **Icon** | `Plug` oder `Blocks` (Lucide) |
| **View ID** | `platform-integrations` |
| **Gruppe** | Betrieb (neben Plattform & Betrieb) |
| **Badge** | `integration-attention` (kanonische Backend-Signale) |
| **Permission** | `MASTER_ADMIN`; Voice/Stripe-Mutationen zusätzlich `MASTER_INTEGRATIONS` / `master-billing` wo fachlich |
| **Mobile Primary** | Ja (Pin nach Dashboard) |

**Redirects (verbindlich):**

| Alt | Neu |
|-----|-----|
| `?view=settings` | `?view=platform-integrations&platformIntegrations=settings` |
| `?view=settings&settingsTab=email` | `?view=platform-integrations&platformIntegrations=settings&settingsCategory=communication` |
| `?view=settings&settingsTab=integrations` | `?view=platform-integrations&platformIntegrations=integrations` |
| `?view=settings&settingsTab=general` | `?view=platform-integrations&platformIntegrations=settings` (Mock entfernt) |
| Footer/TopBar „Settings" | Hub Übersicht oder letzter Tab |

**Verbleibende eigenständige Views (Deep-Link-Ziele, nicht ersetzen):**

| View | Rolle im Ökosystem |
|------|-------------------|
| `billing` + `masterBilling=reconciliation` | Stripe Ops-Detail, Reconciliation, Pricing |
| `voice-assistant` | Voice CP Provisioning, Deployments, Voice-Audit |
| `vehicles` / Connected Vehicles Hub | Per-Vehicle DIMO/HM |
| `high-mobility` | HM-spezifische Diagnose |
| `platform-ops` | Infra/Worker — Querverweis aus Integration Detail „Diagnostics" |

### 1.3 Cross-Links (verbindlich)

| Von | Nach | Trigger |
|-----|------|---------|
| Dashboard Integration Attention | `platformIntegrations=integrations&attentionOnly=1` | Chip |
| Dashboard Stripe Modus | `platformIntegrations=integrations&integrationId=stripe` | KPI |
| Billing Overview failed emails | `platformIntegrations=integrations&integrationId=email` | Link |
| Billing Reconciliation Stripe Tab | `platformIntegrations=integrations&integrationId=stripe` + „Vollständige Stripe-Ops öffnen" → `billing` | Secondary |
| Voice CP Header | `platformIntegrations=integrations&integrationId=voice` | Breadcrumb |
| DIMO Detail „Fahrzeuge betroffen" | `vehicles` gefiltert | Link |
| Org Detail Integrations Tab | `platformIntegrations=integrations` + Tenant-Filter | „Plattform-Integrationen" |
| Platform Ops Service Card | `platformIntegrations=integrations&integrationId={serviceId}` | Drilldown |
| Security Audit | `platformIntegrations=changelog&auditDomain=PLATFORM` | Querverweis |

### 1.4 Page Shell (UI-2)

```
MasterPageHeader variant="page"
  title="Integrationen & Plattform"
  meta="{attentionCount} Aufmerksamkeit · {environmentSummary}"
  environmentChip=PlatformEnvironmentIndicator (§13)
  actions=[Refresh] (Export nur auf Änderungsprotokoll-Tab)
  tabs=MasterPageTabs (URL-synced platformIntegrations)

PageContainer variant="wide"
```

---

## 2. Integration Directory

### 2.1 Listenprinzip

**Eine Tabelle / Mobile-Card-Liste** — keine Kachelwand mit zwölf technischen KPIs pro Provider.

**Default-Sortierung:**
1. Attention vorhanden (absteigend nach Severity)
2. Runtime Health `error` → `degraded` → `unknown`
3. Name alphabetisch (DE)

**Filter (Toolbar):**
- Attention only
- Scope: Global / Mandant-fähig
- Environment: Test / Live / Simulate / Nicht zutreffend
- Runtime Health
- Configuration: incomplete

### 2.2 Primäre Spalten (Liste)

| Spalte | Inhalt | Max. Komplexität |
|--------|--------|------------------|
| **Integration** | Icon + Name + einzeiliger Purpose (Tooltip) | 1 Zeile |
| **Scope** | Chip: `Plattform` / `Plattform + Mandant` | 1 Chip |
| **Environment** | Chip: `Test` / `Live` / `Simuliert` / `—` | 1 Chip |
| **Konfiguration** | Chip: `Vollständig` / `Unvollständig` | 1 Chip — **nicht** „Connected" |
| **Laufzeit** | Chip: `Gesund` / `Eingeschränkt` / `Fehler` / `Unbekannt` | 1 Chip |
| **Aufmerksamkeit** | 0–n Attention-Chips (max 1 sichtbar + „+n") | kompakt |
| **Letzte Aktivität** | Relativ DE + absolut im Tooltip | 1 Wert |

**Verboten in der Liste:** API-Endpoint-URLs, Secret-Status-Zeilen, Webhook-Counts, Reconciliation-Drifts, JWT-Hinweise, ENV-Variablennamen.

### 2.3 Kanonische Integrationen (Directory-Einträge)

| integrationId | Name (DE) | Purpose (Kurz) | Scope | Detail-Tiefe |
|---------------|-------------|------------------|-------|--------------|
| `dimo` | DIMO | Telematik-Plattform, Segments, API | Plattform | Hub Detail + Link Vehicles |
| `stripe` | Stripe | SaaS-Abrechnung + Connect (Plattformkonto) | Plattform | Hub Detail + Link Billing |
| `email` | E-Mail (Resend) | Transaktions-E-Mail, Plattform-Absender | Plattform + Mandant | Hub Detail |
| `voice` | Sprachassistent | Voice AI, Twilio PSTN, ElevenLabs | Plattform + Mandant | Hub Detail + Link Voice CP |
| `whatsapp` | WhatsApp | Rental-Messaging (Twilio/Meta) | Plattform-Flags + Mandant | Hub Detail (read-heavy) |
| `high-mobility` | High Mobility | OEM-Telematik alternativ | Mandant-Fahrzeug | Hub Summary + Link HM View |
| `notifications` | Benachrichtigungen | Notification Engine v2 | Plattform-Flag + Mandant | Hub Summary (read-only) |

**Nicht als eigene Directory-Zeile:** Stripe Connect (Teil von Stripe), Resend Inbound Webhook (unter E-Mail/Webhooks), einzelne HM-MQTT-Apps (unter HM).

### 2.4 Drilldown

Zeilenklick öffnet **Integration Detail** (§4) als Drawer (Desktop ≥1280px: optional Split-Panel rechts).  
Secondary Action in Zeile: `⋯` → „In {Fach-Hub} öffnen" wenn vorhanden.

### 2.5 Empty / Error States

| Zustand | UI |
|---------|-----|
| Keine Integrationen geladen | `ErrorState` + Retry |
| Alle gesund, keine Attention | `EmptyState` variant success: „Alle Integrationen ohne Aufmerksamkeit" |
| Backend Registry leer | Zeige kanonische 7 Zeilen aus Hub-Assembler (nicht leere Tabelle) |

**Datenquelle (Ziel):** Neuer Aggregator `GET /admin/platform-integrations/directory` — **ADD Backend**; interim: Frontend compose aus `platform-ops`, `billing/stripe-status`, `admin/email/settings`, Voice CP status, ENV-readonly flags.

---

## 3. Status Dimensions

Vier **unabhängige** Dimensionen — niemals in einem Universal-Badge zusammenfassen.

### 3.1 Configuration State

| Kanonischer Wert | DE Label | Bedeutung |
|------------------|----------|-----------|
| `complete` | Vollständig | Alle Pflicht-Konfigurationen für den Scope vorhanden |
| `incomplete` | Unvollständig | Mindestens ein Pflichtfeld/Secret/Endpoint fehlt |

**Nicht verwenden:** `Connected`, `Disconnected`, `Prepared` (Stripe-intern → auf complete/incomplete mappen).

**Stripe-Mapping:**

| Backend `integrationStatus` | Configuration UI |
|----------------------------|------------------|
| `CONNECTED` | Vollständig |
| `PREPARED` | Unvollständig |
| sonst | Unvollständig |

### 3.2 Authentication State

| Kanonischer Wert | DE Label | Bedeutung |
|------------------|----------|-----------|
| `valid` | Authentifizierung gültig | Letzter Auth/API-Check erfolgreich |
| `failed` | Authentifizierung fehlgeschlagen | 401/403/invalid credentials |
| `unknown` | Unbekannt | Kein Auth-Probe verfügbar |

**Anzeige:** Nur in Integration Detail und bei Attention — **nicht** in Directory-Spalte (Platz sparen: in „Laufzeit" oder Attention codiert wenn `failed`).

### 3.3 Runtime Health

| Kanonischer Wert | DE Label | Bedeutung | Quelle |
|------------------|----------|-----------|--------|
| `healthy` | Gesund | Erwarteter Betrieb | platform-ops, webhook recency, probe |
| `degraded` | Eingeschränkt | Teilfunktion, Stale, erhöhte Fehlerrate | ops `degraded`, stale telemetry |
| `error` | Fehler | Ausfall oder kritische Fehlerrate | ops `critical`, auth failed + no success |
| `unknown` | Unbekannt | Keine Health-Daten | Default wenn kein Signal |

**Observability-Regel:** Health kommt bevorzugt aus **kanonischem Ops-Aggregat** (`platform-ops.service`), nicht aus Frontend-Booleans (`dimoConnected`).

**Stale:** Mappt auf `degraded` mit Attention-Code `STALE_DATA` — nicht als eigener Health-Wert in UI (vermeidet fünfte Dimension).

### 3.4 Environment

| Kanonischer Wert | DE Label | Anwendung |
|------------------|----------|-----------|
| `test` | Test | Stripe `sk_test_*`, Stripe-Events `livemode: false` |
| `live` | Live | Produktiv-Provider |
| `simulate` | Simuliert | z. B. `WHATSAPP_SIMULATE_ENABLED` |
| `not_applicable` | — | DIMO/HM ohne Test/Live-Split in UI |

**Pflicht:** Stripe und billable Provider **immer** `test` oder `live` — nie `—`.

### 3.5 Attention (ergänzende Dimension, keine Badge-Vermischung)

Attention-Codes (Backend `attentionCodes[]`) — Beispiele:

| Code | Bedeutung |
|------|-----------|
| `CONFIG_INCOMPLETE` | Configuration incomplete |
| `AUTH_FAILED` | Authentication failed |
| `WEBHOOK_FAILURES` | Anhaltend fehlgeschlagene Webhooks |
| `RECONCILIATION_DRIFT` | Stripe drift offen |
| `DELIVERY_FAILURES` | E-Mail dead letters |
| `SIMULATE_MODE_ACTIVE` | WhatsApp/Voice im Simulate |
| `STALE_DATA` | Health degraded wegen veralteter Daten |

Directory zeigt **Attention-Chips** getrennt von Health-Chips.

---

## 4. Integration Detail (gemeinsames Pattern)

Gilt für alle `integrationId` — provider-spezifische Sektionen als Unterblöcke.

### 4.1 Layout

```
┌─ Integration Detail (Drawer / Panel) ────────────────────────────────┐
│ [Icon] {Name}                    [ScopeChip] [EnvironmentChip]      │
│ {Purpose one-liner}                                                  │
│ Konfiguration: {chip} · Laufzeit: {chip} · Auth: {chip}              │
├──────────────────────────────────────────────────────────────────────┤
│ AKTUELLER ZUSTAND                                                    │
│   4 Dimensionen + letzte erfolgreiche Operation + letzter Fehler     │
├──────────────────────────────────────────────────────────────────────┤
│ KONFIGURATION                                                        │
│   Menschenlesbare Felder (keine ENV-Namen primär)                    │
│   Secret-Zeilen: §8 Pattern                                          │
│   [Global Default · Override erlaubt: Ja/Nein · N Overrides]           │
├──────────────────────────────────────────────────────────────────────┤
│ WEBHOOKS / KONNEKTIVITÄT (falls relevant)                            │
│   Kompakte Webhook-Summary → Link Tab Webhooks gefiltert             │
├──────────────────────────────────────────────────────────────────────┤
│ AKTUELLE PROBLEME                                                    │
│   Attention-Liste mit Erklärung + empfohlener Aktion                 │
├──────────────────────────────────────────────────────────────────────┤
│ DIAGNOSTIK (optional, eingeklappt)                                   │
│   Link Platform Ops / Fach-Hub / letzte 5 Events                     │
├──────────────────────────────────────────────────────────────────────┤
│ ÄNDERUNGSHISTORIE                                                    │
│   Letzte 5 Einträge → Änderungsprotokoll gefiltert                   │
├──────────────────────────────────────────────────────────────────────┤
│ AKTIONEN                                                             │
│   Risk-tiered (§14) — Primary max 1                                    │
│   [In {Billing|Voice|Fahrzeuge} öffnen]                              │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 Section-Regeln

| Sektion | Immer | Nie |
|---------|-------|-----|
| Header | Scope + Environment | Raw secrets |
| Current State | 4 Dimensionen getrennt | „Alles ok" ohne Daten |
| Configuration | Label + Erklärung + aktueller Wert | `STRIPE_SECRET_KEY` als Input |
| Webhooks | Wenn Provider Webhooks hat | Signing secret |
| Recent Issues | Wenn Attention > 0 | Leerer Block verstecken |
| Diagnostics | Optional collapsed | Vollständige Log-Dumps |
| Change History | Audit-Slice | Secrets in Diff |
| Actions | Nach Risiko sortiert | Destructive als Primary |

---

## 5. DIMO (globale Plattformperspektive)

### 5.1 Scope-Abgrenzung

| Im Hub DIMO Detail | **Nicht** im Hub (→ Connected Vehicles) |
|--------------------|----------------------------------------|
| Platform Environment (prod API context) | Per-Vehicle Link/Deregister |
| Authentication / Token Health | Fleet Connection Query Console |
| API Health / Rate limit signals | Vehicle list CRUD |
| Webhook ingest health (summary) | Segment-level trip editing |
| Sync worker last success | HM actions on vehicle rows |
| Platform issues + Attention | Org-specific vehicle mapping UI |

### 5.2 Detail-Inhalt

| Block | Felder (menschenlesbar) |
|-------|-------------------------|
| **Environment** | API-Umgebung (z. B. „DIMO Production API"), Region/Endpoint-Label — **nicht** volle URL wenn sensitiv |
| **Authentication** | Client konfiguriert: Ja/Nein · Token-Health: gültig/fehlgeschlagen · Letzte Token-Aktualisierung |
| **API Health** | Laufzeit-Chip · Poll-Fehlerrate (%) · Letzter erfolgreicher API-Call |
| **Webhook / Sync** | Webhook-Events empfangen (24h) · Letzter Webhook · Sync-Worker letzter Erfolg |
| **Issues** | Attention aus Ops + Token + Webhook failures |
| **Connected Vehicle Impact** | KPI: „{n} Fahrzeuge mit DIMO-Verbindung" · „{m} mit Aufmerksamkeit" — Link `vehicles` |

### 5.3 Aktionen

| Aktion | Risiko | Ort |
|--------|--------|-----|
| „Fahrzeug-Konnektivität öffnen" | Normal | Deep-Link `vehicles` |
| „Diagnose in Plattform & Betrieb" | Normal | `platform-ops` DIMO service |
| Token-/Sync-Retry (falls API existiert) | Sensitive | Step-up + Confirm — **ADD** wenn nicht vorhanden |

**Keine** API-Key-Rotation in UI (ENV/deploy) — nur Anzeige: „Client-Schlüssel: konfiguriert · Verwaltung über Server-Deployment".

---

## 6. Stripe (Plattformperspektive)

### 6.1 TEST vs LIVE — Pflichtanzeige

| Ort | Darstellung |
|-----|-------------|
| Directory Environment-Spalte | `Test` oder `Live` — **fett**, niemals fehlend |
| Detail Header | `EnvironmentChip` + Warnbanner wenn `test` in Production-VPS (Backend-Signal `testInProductionAllowed`) |
| Webhook-Tab | Jede Zeile/Gruppe mit `livemode` Badge |

**Quelle:** `StripeEnvironmentService` → `runtimeStripeMode` — kanonisch per `docs/remediation/stripe-environment-separation.md`.

### 6.2 Detail-Inhalt

| Block | Felder |
|-------|--------|
| **Environment** | Test / Live · Hinweis auf `STRIPE_ENVIRONMENT` cross-check |
| **Platform Account Context** | Modus · Stripe-Kunden-Mappings (Anzahl) — **keine** Account-ID als Hero unless masked |
| **Configuration** | API-Schlüssel: konfiguriert · Webhook-Signatur: konfiguriert · Connect-Webhook: konfiguriert |
| **Webhook Health** | Letzter Event · Letzter Erfolg · Fehlgeschlagen (24h/7d) |
| **Reconciliation Health** | Offene Drifts · Letzter Lauf · Letzter Konflikt-Typ |
| **Issues** | `RECONCILIATION_DRIFT`, `WEBHOOK_FAILURES`, `TEST_LIVE_MODE_CONFLICT` |

### 6.3 Aktionen

| Aktion | Risiko | UX |
|--------|--------|-----|
| „Vollständige Abrechnungs-Ops öffnen" | Normal | → `billing&masterBilling=reconciliation` |
| Reconciliation starten | Sensitive | Change Preview (§15) + Confirm |
| Webhook-Events anzeigen | Normal | → Tab Webhooks gefiltert `provider=stripe` |

**Niemals:** Secret Key, Webhook Signing Secret, Connect Secret im DOM.

---

## 7. Communication Providers

Gemeinsames UX-Prinzip mit provider-spezifischen Erweiterungen — **nicht** künstlich angleichen.

### 7.1 Gemeinsame Spalten / Detail-Blöcke

| Element | E-Mail | WhatsApp | Voice |
|---------|--------|----------|-------|
| Provider | Resend | Twilio / Meta (Backend-Label) | Twilio + ElevenLabs |
| Identity | Absender E-Mail + Name | Business-Nummer / Status | Agent + Telefonnummer(n) |
| Environment | — (prod) | Live / **Simuliert** | Provider-Region-Label |
| Configuration | From, Reply-To, Domain-Status summary | Simulate-Flag, Provider configured | CP configured booleans |
| Runtime Health | Delivery rate / dead letters | Delivery / provider health | DLQ, backlog, delay |
| Last Success | Letzte erfolgreiche Zustellung | Letzte Nachricht (aggregiert) | Letzter erfolgreicher Call/Webhook |
| Issue | Dead letters, bounce | Simulate aktiv, provider error | DLQ > 0, provision incomplete |
| Test Action | Test-E-Mail (§10) | — (kein Master blast) | Kontrollierter Test-Call (Voice Hub) |

### 7.2 E-Mail — Spezifika

- **Scope:** Global Default + Hinweis „{n} Mandanten mit eigener Domain" (count from backend, **ADD**)
- **Configuration:** Plattform-Absender-Formular (bestehende `PlatformEmailSettingsPanel`-Logik, in Hub eingebettet)
- **Domain Verification:** Read-only summary — Detail in Org/Rental, Link aus Setting-Zeile
- **Delivery Ops:** Dead-letter / Resend aus orphan `BillingResendTab` → unter E-Mail Detail oder Webhooks

### 7.3 WhatsApp — Spezifika

- **Master = Governance, nicht Conversations**
- **Pflicht:** `WHATSAPP_SIMULATE_ENABLED` als read-only Plattform-Flag mit Environment `Simuliert` wenn aktiv
- **Kein** Template-Editor, **kein** Chat — Link Rental WhatsApp
- **Health:** Provider reachability + letzter Fehler (aggregiert, **ADD** backend)

### 7.4 Voice — Spezifika

- Hub zeigt **Summary**; Provisioning/Deployments bleiben in `voice-assistant`
- Identity: „{n} Mandanten zugeordnet", „{m} ohne ElevenLabs"
- Test: nur über Voice Hub mit §10 Flow — Hub linkt dorthin

---

## 8. Secret UX

### 8.1 Verbindliche Regeln

| Erlaubt | Verboten |
|---------|----------|
| `Konfiguriert` / `Nicht konfiguriert` | Maskierter Fake-Wert (`sk_live_••••1234`) der Readback suggeriert |
| `Zuletzt rotiert: {date}` wenn Backend liefert | Copy-to-clipboard für Secrets |
| `Ersetzen` / `Rotieren` (wenn API) | Vollständiges Lesen |
| `Entfernen` (wenn API) mit High-Risk Flow | Secret als normales Textfeld |
| Hinweis „Verwaltung über Deployment" für ENV-only | Password-Input mit bestehendem Wert |

### 8.2 Secret-Zeilen-Pattern

```
API-Schlüssel (Plattform)
  Status: Konfiguriert
  Zuletzt rotiert: 12.07.2026 (oder „Unbekannt")
  [Schlüssel ersetzen]  → High-Risk Flow (§14) — nur wenn Backend ADD
  Hinweis: Aktueller Schlüssel kann aus Sicherheitsgründen nicht angezeigt werden.
```

**Rotation (wenn implementiert):** Neuer Wert einmal eingeben → Confirm → Grace period Erklärung → Audit — **kein** Anzeigen des alten Werts.

**Ist-Zustand:** Meiste Secrets ENV-only → nur Status-Zeile + Deploy-Hinweis, **kein** Fake-Rotation-Button.

---

## 9. Webhook UX

### 9.1 Tab „Webhooks" (cross-provider)

**Liste / Gruppen nach Provider** — nicht eine unfilterbare Mega-Tabelle.

| Spalte | Inhalt |
|--------|--------|
| Provider | Stripe / Voice / DIMO / Resend / HM / Connect |
| Endpoint | Pfad-Label (z. B. `/webhooks/stripe`) — nicht volle URL mit Token |
| Environment | Test / Live / — |
| Signatur | `Gültig konfiguriert` / `Fehlt` / `Unbekannt` |
| Letztes Event | Timestamp relativ |
| Letzter Erfolg | Timestamp |
| Letzter Fehler | Timestamp + Kurzcode |
| Zustellung | Gesund / Eingeschränkt / Fehler |

**Signing Secret:** nie anzeigen.

### 9.2 Fehler-Drilldown

Event-Detail-Drawer:

- Event-ID, Provider, Type, Status, Timestamp
- Fehlerursache (menschenlesbar)
- Correlation ID
- Empfohlene Aktion (Link Reconciliation / Ops / Provider-Dashboard)
- **Kein** Raw payload mit PII default — eingeklappt „Technische Details"

### 9.3 Provider-Abdeckung (realistisch)

| Provider | Master Webhook Tab | Quelle |
|----------|-------------------|--------|
| Stripe Billing | Ja | `adminWebhookEvents` |
| Stripe Connect | Ja (ADD aggregate) | Connect webhook store |
| Voice | Ja | Voice CP webhook events |
| DIMO | Summary + Link Ops | Metrics / poll — vollständige Liste **ADD** |
| Resend Inbound | Optional read-only | **ADD** |
| HM | Link HM View | Nicht zentral wenn nur HM-Logs |

---

## 10. Test Actions

### 10.1 Vor dem Test — Pflicht-Dialog

| Feld | Inhalt |
|------|--------|
| Was passiert? | z. B. „Sendet eine Test-E-Mail an die angegebene Adresse" |
| Environment | Test / Live / Simuliert |
| Empfänger | Explizit (E-Mail, Nummer) — **Pflichtfeld** |
| Kosten | „Kann Provider-Kosten verursachen" wenn zutreffend |
| Echtes Event? | Ja/Nein — bei Webhook-Replay „Ja, re-verarbeitet Event {id}" |

### 10.2 Nach dem Test

| Feld | Inhalt |
|------|--------|
| Ergebnis | Erfolg / Fehlgeschlagen |
| Zeitstempel | ISO + relativ |
| Referenz | correlationId / messageId / eventId |
| Nächster Schritt | Link Diagnostics |

### 10.3 Kanonische Test-Aktionen

| Aktion | Integration | Risiko | Erlaubt |
|--------|-------------|--------|---------|
| Test-E-Mail senden | email | Sensitive | Ja — Empfänger Pflicht, nicht an Kunden |
| Stripe Reconciliation (kein Test) | stripe | Sensitive | Nicht als „Test" labeln — „Abgleich starten" |
| Voice Test-Call | voice | High | Nur via Voice Hub + Bestätigung |
| Webhook Replay | voice/stripe | High | Step-up + Event-ID + Impact |
| WhatsApp Test | whatsapp | — | **Nein** im Master (Rental only) |
| DIMO API Probe | dimo | Sensitive | Optional **ADD** — read-only ping |

**Regel:** Kein Button labeled „Test" ohne §10.1 Dialog.

---

## 11. System Settings

### 11.1 Kategorien (nur reale Settings)

| Kategorie ID | Label (DE) | Beispiele (wenn API/DB existiert) |
|--------------|--------------|-----------------------------------|
| `platform` | Plattform | Plattformname/Support-Kontakt — **nur wenn Backend ADD**; bis dahin Kategorie entfällt |
| `communication` | Kommunikation | Plattform-Absender (E-Mail) |
| `billing` | Abrechnung | Read-only Stripe mode summary + Link Integration Detail |
| `vehicles` | Fahrzeuge & Telemetrie | Read-only DIMO/HM platform flags |
| `operations` | Betrieb | Read-only Links zu Platform Ops |
| `security` | Sicherheit | Link Identität & Zugriff — **keine** IAM-Formulare hier |
| `flags` | Plattform-Flags | Read-only ENV-Flags (§11.2) |

**Entfernt:** Mock „Company Information" Formular.

### 11.2 Plattform-Flags (read-only, kein Feature Management)

Nur Flags die **tatsächlich existieren**:

| Flag | Anzeige | Edit |
|------|---------|------|
| `NOTIFICATIONS_V2` | An/Aus | Nein — Deploy |
| `WHATSAPP_SIMULATE_ENABLED` | Simuliert/Live | Nein |
| `TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE` | legacy/shadow/cutover | Nein |
| Stations V2 (global env) | An/Aus | Nein |
| Per-org Stations V2 | „{n} Mandanten mit Override" | Link Org — **kein** Edit hier |

**Kein** Prozent-Rollout-Editor, **kein** Flag-Erstellen — das wäre Spekulation.

### 11.3 Setting-Zeilen-Pattern

| Feld | Pflicht |
|------|---------|
| Label (DE) | Ja |
| Erklärung (1–2 Sätze) | Ja |
| Scope-Chip | Ja |
| Aktueller Wert | Ja |
| Standardwert | Wenn bekannt |
| Laufzeit-Auswirkung | Ja bei Mutation |
| Neustart erforderlich | Nur wenn Backend `restartRequired: true` |
| Validierung | Inline bei Edit |

**ENV-Namen:** Nur in eingeklappt „Technische Details" — nicht als Primärlabel.

---

## 12. Global vs Tenant

### 12.1 Scope-Badge (überall)

| Badge | Bedeutung |
|-------|-----------|
| `Plattform` | Gilt für gesamte SynqDrive-Instanz |
| `Plattform + Mandant` | Globaler Default, Mandanten können überschreiben |
| `Mandant` | Nur tenant-scoped — Master zeigt Summary, nicht Edit |

### 12.2 Override-Darstellung

Bei `Plattform + Mandant`:

```
Globaler Standard: noreply@synqdrive.eu
Mandanten-Override: erlaubt
12 Mandanten mit eigener Absender-Konfiguration  [Anzeigen → Org-Liste gefiltert]
```

**Nicht:** Alle Overrides in einem globalen Formular editieren.

### 12.3 Org Detail Integrations Tab

Bleibt **read-only** — ergänzt um Link „In Integrationen & Plattform öffnen" mit `organizationId` Filter auf Directory (zeigt welche globalen Integrationen für diesen Mandanten relevant sind).

---

## 13. Environment Context

### 13.1 `PlatformEnvironmentIndicator` (Shell)

Kompakte Zeile im Page Header (nicht aggressive Farborgie):

```
Plattform: Produktion · Stripe: Live · WhatsApp: Simuliert
```

**Regeln:**
- Max 3 Provider-Signale + „+n" Tooltip
- `Test` immer mit Text „Test" — nie nur Farbe
- Klick öffnet gefilterte Integrationen-Liste

### 13.2 Provider-spezifisch

| Provider | Indicator-Pflicht |
|----------|-------------------|
| Stripe | Test/Live im Header + Directory + jedem Stripe-Webhook |
| DIMO | Production API context label |
| WhatsApp | Simuliert-Banner wenn simulate flag |
| Voice | Region/Provider label |
| Webhooks | livemode / environment pro Endpoint |

---

## 14. High-Risk Config Changes

### 14.1 Risiko-Kategorien

| Stufe | Beispiele | Policy |
|-------|-----------|--------|
| **Normal** | Refresh, Drilldown, Link | Keine Extra-Steps |
| **Sensitive** | Plattform-Absender ändern, Reconciliation starten, HM stream test | Confirm + Audit |
| **High Risk** | Credential replace/rotate, Webhook endpoint change, global sender domain, Voice replay | Impact Preview (§15) + Step-up MFA + Reason + Confirm + Audit |
| **Destructive** | Disconnect integration, remove configuration, disable provider | High Risk + typed confirmation (`DISABLE EMAIL`) |

**Backend-Mapping:** `MasterAdminMfaGuard` + `STEP_UP_ACTION.*` per `master-admin-mfa.md` — UI spiegelt vorhandene Actions, erfindet keine neuen ohne API.

### 14.2 Step-up Actions (bestehend / Ziel)

| Mutation | Step-up Action |
|----------|----------------|
| Platform email update | `MASTER_PLATFORM_SETTINGS` (existiert) |
| Credential rotation | `MASTER_INTEGRATION_CREDENTIALS` (**ADD** wenn Rotation API) |
| Voice webhook replay | `MASTER_INTEGRATIONS` + contextual (**erweitern**) |

---

## 15. Change Preview

Vor **Sensitive / High Risk / Destructive** globalen Änderungen:

```
┌─ Änderung überprüfen ─────────────────────────────────────┐
│ Aktuell:     noreply@synqdrive.eu / SynqDrive              │
│ Geplant:     billing@synqdrive.eu / SynqDrive Billing      │
│ Scope:       Plattform — betrifft Mandanten im Standard-   │
│              absender-Modus (ca. 45 Organisationen)         │
│ Auswirkung:  Transaktions-E-Mails ab Speichern             │
│ Wirksam:     Sofort (kein Neustart)                         │
│ [Abbrechen]  [Grund eingeben…]  [Bestätigen & speichern]    │
└─────────────────────────────────────────────────────────────┘
```

**Pflichtfelder:** Current, Proposed, Scope, Impact, Effective Time.  
**Reason:** min 10 Zeichen bei High Risk+.

---

## 16. Save Model

### 16.1 Eine klare Regel

**Section-scoped explicit save** — jede editierbare Kategorie speichert **nur ihre Section** mit einem Primary Button „Speichern".

| Bereich | Save-Modell |
|---------|-------------|
| Plattform-Einstellungen → Kommunikation | Ein Save für E-Mail-Felder zusammen |
| Integration Detail (editierbare Felder) | Pro Section ein Save |
| Directory / Webhooks / Flags | Read-only — kein Save |
| Änderungsprotokoll | Read-only |

**Verboten ohne explizite UX:**
- Auto-Save auf blur
- Globaler „Alles speichern" über Kategorien hinweg
- Sofort-Persist bei Toggle ohne Confirm (außer harmlose UI-Preferences)

---

## 17. Unsaved Changes

Gilt nur für **editierbare Settings-Sections**:

| Mechanismus | Regel |
|-------------|-------|
| Dirty State | Section markiert „Ungespeicherte Änderungen" |
| Discard | „Verwerfen" setzt auf letzten geladenen Stand |
| Save | Wie §16 |
| Navigation Guard | `beforeunload` + Tab-Wechsel innerhalb Hub: Confirm Dialog |

**Nicht** auf read-only Tabs (Übersicht, Webhooks, Änderungsprotokoll, Flags).

---

## 18. Health vs Configuration

### 18.1 Darstellungsregel

Immer **zwei Chips nebeneinander** in Detail Header:

```
Konfiguration: Vollständig    Laufzeit: Fehler
```

Beispiel-Kombinationen (Tooltip erklärt):

| Config | Runtime | Bedeutung für Admin |
|--------|---------|---------------------|
| Vollständig | Gesund | Alles ok |
| Vollständig | Fehler | Provider down / Webhooks failing — **nicht** Config-Problem |
| Unvollständig | Unbekannt | Setup unvollständig |
| Unvollständig | Fehler | Erwartbar bis Config fertig |

**Verboten:** Ein grüner „Connected"-Chip der beides impliziert.

---

## 19. Change History

### 19.1 Tab „Änderungsprotokoll"

Aggregiert aus kanonischen Quellen:

| Quelle | Domain |
|--------|--------|
| `activity_logs` | `PLATFORM_SETTINGS_UPDATED`, Integration mutations |
| `billing_audit_logs` | Stripe/Reconciliation |
| Voice CP audit | Voice provisioning |

### 19.2 Zeilen

| Spalte | Inhalt |
|--------|--------|
| Zeit | Relativ + absolut |
| Akteur | Name + Rolle |
| Änderung | Menschenlesbar (Setting/Integration) |
| Grund | Wenn vorhanden |
| Ergebnis | Erfolg / Fehlgeschlagen |

**Before/After:** Nur nicht-sensitive Felder — Secrets → `[REDACTED]`.

Detail-Drawer: Link zu Security Audit bei `auditDomain=MASTER_ADMIN`.

---

## 20. Mobile

### 20.1 Prioritäts-Stack (Card Layout)

1. Integration Name + Icon  
2. Scope-Chip  
3. Environment-Chip  
4. Runtime Health-Chip  
5. Attention (wenn vorhanden)  
6. Configuration (gekürzt)  
7. Actions (Overflow-Menü)

**Versteckt auf Mobile (bis Drilldown):** Webhook-Tabellen, Reconciliation-Details, Diagnostics, technische ENV.

### 20.2 Navigation

- Hub als Mobile Primary Nav Item  
- Integration Detail = Full-screen Drawer  
- Test/High-Risk = Full-screen Confirm Flow  

---

## 21. Data Contract

### 21.1 Directory Row

| UI Element | Canonical Source | Endpoint (Ziel) | Scope | Env | Refresh | Mutation | Audit |
|------------|------------------|-----------------|-------|-----|---------|----------|-------|
| Integration name | Directory assembler | `GET /admin/platform-integrations/directory` **ADD** | — | — | 60s + manual | — | — |
| Scope | Per integration metadata | same | platform/tenant | — | — | — | — |
| Environment | Stripe env / flags | stripe-status, flags resolver | platform | test/live/sim | — | — | — |
| Configuration chip | Provider config completeness | same | platform | — | — | — | — |
| Runtime health | platform-ops integrationHealth | platform-ops + provider status | platform | — | 60s | — | — |
| Attention codes | Attention service **ADD** | same | platform | — | 60s | — | — |
| Last activity | Max timestamp across signals | same | platform | — | — | — | — |

### 21.2 Platform Email Setting

| UI Element | Source | Endpoint | Scope | Refresh | Mutation | Audit |
|------------|--------|----------|-------|---------|----------|-------|
| defaultFromEmail | platform_email_settings | `GET/PUT /admin/email/settings` | platform | on load | PUT + MFA | activity log |
| effectiveFrom* | computed server-side | GET | platform | on load | — | — |
| override count | org email settings aggregate **ADD** | `GET /admin/email/settings/summary` **ADD** | tenant count | on load | — | — |

### 21.3 Stripe Integration Detail

| UI Element | Source | Endpoint | Scope | Env | Mutation | Audit |
|------------|--------|----------|-------|-----|----------|-------|
| runtimeStripeMode | StripeEnvironmentService | `GET /admin/billing/stripe-status` | platform | test/live | — | — |
| webhook health | stripe webhook events | webhook-events | platform | livemode | — | — |
| reconciliation drifts | billing reconciliation | reconciliation API | platform | — | POST run | billing audit |
| secret configured | boolean DTO | stripe-status | platform | — | — | — |

### 21.4 DIMO Platform Detail

| UI Element | Source | Endpoint | Scope | Mutation | Audit |
|------------|--------|----------|-------|----------|-------|
| token health | platform-ops | platform-ops detail | platform | — | — |
| api health | dimo stats / ops | `/admin/dimo/stats` | platform | — | — |
| vehicle impact counts | dashboard connectivity | dashboard operational | tenant aggregate | — | — |
| webhook summary | metrics / **ADD** | webhook aggregate | platform | — | — |

### 21.5 Voice Summary (Hub slice)

| UI Element | Source | Endpoint | Scope | Mutation | Audit |
|------------|--------|----------|-------|----------|-------|
| provider configured | voice CP platform | control-plane/status | platform | — | — |
| org assignment counts | voice CP | control-plane/orgs | tenant | provision in Voice hub | voice audit |
| DLQ / backlog | voice CP | control-plane/status | platform | — | — |

### 21.6 Webhook Row

| UI Element | Source | Endpoint | Scope | Env | Mutation | Audit |
|------------|--------|----------|-------|-----|----------|-------|
| last event | provider event store | unified webhooks **ADD** or per-provider | platform | livemode | replay: high risk | yes |

---

## 22. Übersicht-Tab (Bonus-Spezifikation)

Erster Viewport beim Hub-Öffnen:

| Widget | Inhalt |
|--------|--------|
| Attention KPIs | Integrationen mit Aufmerksamkeit / kritisch |
| Environment Summary | Stripe mode, Simulate flags |
| Integration Health Strip | 7 Directory-Einträge als kompakte Chips — Klick → Detail |
| Letzte Änderungen | 5 Einträge aus Änderungsprotokoll |
| Quick Links | Billing Stripe Ops, Voice CP, Platform Ops |

---

## 23. i18n & Accessibility

- **DE kanonisch** — keine EN-Tabs („General", „Integrations")
- Status-Chips: **Text + Icon**, nicht nur Farbe
- Secret-Zeilen: `aria-label` „Geheimer Schlüssel, Status konfiguriert"
- Environment `Test`: Text immer sichtbar (WCAG)
- Touch Targets min 36×36 für Actions

---

## 24. Transformation Matrix

Vollständige KEEP / REMOVE / MOVE / MERGE / RENAME / ADD Matrix.

### 24.1 Navigation & Views

| Objekt | Aktion | Ziel / Begründung |
|--------|--------|-------------------|
| `?view=settings` | **REMOVE** (als Root) | Ersetzt durch `platform-integrations` |
| `PlatformSettingsView.tsx` | **MERGE** | In Hub `platform-integrations/settings` |
| Settings Tab General (Mock) | **REMOVE** | Kein Backend — irreführend (P0) |
| Settings Tab Integrations (Info) | **MERGE** | → Hub Integrationen Directory |
| Settings Tab Email | **MOVE** | → Hub `settingsCategory=communication` |
| `PlatformEmailSettingsPanel.tsx` | **KEEP** | Wiederverwendet im Hub |
| Neuer Hub `platform-integrations` | **ADD** | Kanonischer Root |
| Sidebar-Eintrag Settings | **RENAME** → Integrationen & Plattform | `master.nav.platformIntegrations` |
| `?view=billing` (Stripe) | **KEEP** | Fach-Hub — Deep-Link aus Integration Detail |
| `?view=voice-assistant` | **KEEP** | Fach-Hub — Deep-Link |
| `?view=vehicles` / Connected Vehicles | **KEEP** | Fach-Hub — DIMO vehicle ops |
| `?view=high-mobility` | **KEEP** | Fach-Hub — HM diagnostics |
| `?view=platform-ops` | **KEEP** | Infra — nicht mergen |
| `?view=fleet-connection` | **MERGE** (Nav) | Unter Connected Vehicles — nicht eigener Integrations-Einstieg |
| `PlatformHealthView` | **KEEP** (Redirect only) | Bereits → platform-ops |
| Org Detail Tab integrations | **KEEP** | Read-only + Cross-Link ADD |

### 24.2 Komponenten

| Objekt | Aktion | Ziel |
|--------|--------|------|
| `BillingStripeTab.tsx` | **KEEP** | Embedded summary in Stripe Detail + volle Version in Billing |
| `BillingResendTab.tsx` | **MOVE** | → E-Mail Integration Detail oder Billing Email Delivery Section |
| `BillingOutboxTab.tsx` | **MOVE** | → E-Mail Delivery / Billing subsection |
| `VoiceAssistantAdminView.tsx` | **KEEP** | Volle Voice Ops — Hub nur Summary |
| `useMasterNavBadges` `integration-outage` | **RENAME** | → `integration-attention` aus kanonischem Attention API |
| `dimoConnected` nav boolean | **REMOVE** | Ersetzt durch Ops/Attention Signale |
| `App.tsx` dimoConnected props to Settings | **REMOVE** | Dead code |
| `api.integrations.listAll` | **KEEP** (API) | Verwenden in Directory **ADD** wiring |
| Integration Detail Drawer | **ADD** | Neues Pattern §4 |
| `PlatformEnvironmentIndicator` | **ADD** | Shell component §13 |
| Unified Webhooks Tab | **ADD** | §9 |
| Change Preview Dialog | **ADD** | §15 — shared mit Security Hub Pattern |
| Test Action Dialog | **ADD** | §10 |

### 24.3 Backend

| Objekt | Aktion | Ziel |
|--------|--------|------|
| `GET /admin/email/settings` | **KEEP** | |
| `PUT /admin/email/settings` + MFA | **KEEP** | |
| `GET /admin/billing/stripe-status` | **KEEP** | |
| `GET /admin/integrations` | **KEEP** | Directory input |
| `GET /admin/platform-integrations/directory` | **ADD** | Kanonischer Aggregator |
| `GET /admin/platform-integrations/attention` | **ADD** | Nav badge + Overview |
| `GET /admin/email/settings/summary` | **ADD** | Override counts |
| `GET /admin/platform-integrations/webhooks` | **ADD** | Unified webhook health |
| `POST …/test-email` | **ADD** | Controlled test send |
| Credential rotation endpoints | **ADD** (später) | Nur wenn Rotation implementiert — bis dahin nicht UI |

### 24.4 Dokumentation

| Objekt | Aktion |
|--------|--------|
| `master-admin-integrations-system-config-deep-audit.md` | **KEEP** (Basis) |
| Dieses Blueprint | **ADD** |
| `architecture/` Eintrag | **ADD** bei Implementierung (UI-10.3) — nicht jetzt |

### 24.5 Zusammenfassung Matrix (Kompakt)

| Aktion | Anzahl (ca.) | Beispiele |
|--------|--------------|-----------|
| **KEEP** | 12 | Billing BCC, Voice CP, Platform Ops, Email API, Stripe tab, Connected Vehicles |
| **REMOVE** | 5 | Settings root, General mock, integration-outage boolean, dimoConnected props, Settings integrations info-only |
| **MOVE** | 6 | Email settings, Resend tab, Outbox tab, fleet-connection nav emphasis |
| **MERGE** | 4 | Settings → Hub, Integrations info → Directory, Fleet nav → Vehicles |
| **RENAME** | 3 | settings → platform-integrations, integration-outage → integration-attention, Sidebar label |
| **ADD** | 10+ | Hub view, Directory API, Detail drawer, Webhooks tab, Flags read-only, Environment indicator, Change preview, Test dialog, Attention API, Redirects |

---

## 25. Implementierungs-Reihenfolge (Hinweis für UI-10.3 — nicht jetzt)

1. Hub shell + redirects + REMOVE mock General  
2. Directory API + Liste + Status dimensions  
3. Integration Detail Drawer (Stripe, Email, DIMO zuerst)  
4. Webhooks tab + Environment indicator  
5. Settings categories + Flags read-only  
6. CHANGELOG tab + Change preview + Test flows  
7. Nav badge migration + REMOVE dead props  
8. Wire orphan Resend/Outbox  

---

## 26. Erfolgskriterien (Acceptance)

| Test | Ziel |
|------|------|
| 10-Sekunden | Admin nennt Stripe Live/Test, DIMO health, Email sender, Attention count |
| Scope | Jede Zeile hat Scope-Chip |
| Secrets | 0 Klartext-Secrets im DOM |
| TEST/LIVE | Stripe niemals ohne Environment-Chip |
| Health ≠ Config | Zwei Chips sichtbar im Detail |
| Save | Eine Semantik pro Section — kein No-op Save |
| Mobile | Name, Scope, Env, Health sichtbar ohne Scroll |
| Audit | Jede High-Risk Mutation → Änderungsprotokoll |

---

**Ende UI-10.2 — keine Implementierung.**

**Changes / Architektur:** Nicht aktualisiert (Spezifikation only).
