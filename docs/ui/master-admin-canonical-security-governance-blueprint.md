# Master Admin — Kanonisches Security & Governance Blueprint

**Datum:** 2026-08-18  
**Phase:** UI-9.2 (Spezifikation — keine Implementierung)  
**Basis:**
- `docs/ui/master-admin-security-audit-users-roles-deep-audit.md` (UI-9.1)
- `docs/ui/master-admin-canonical-page-framework.md` (UI-2.2)
- `docs/ui/master-admin-canonical-navigation-blueprint.md` (UI-1.3)
- `docs/remediation/master-admin-mfa.md` (Phase 2A.5)
- `docs/remediation/master-admin-privileged-access.md` (Phase 2A.6)
- `docs/remediation/master-admin-audit-log-hardening.md` (Phase 2A.7)
- `docs/audits/iam-mfa-step-up-2026-07.md`

**Leitfrage:** *Wer hat privilegierten Zugriff, ist er abgesichert (MFA), und ist jede sicherheitsrelevante Aktion revisionssicher nachvollziehbar?*

**Grundsatz:** SynqDrive baut **keine** zweite IAM-Engine im Master Admin. Die Control Plane **governt** plattformweite Identität und Audit; **org-scoped Role Templates** bleiben in der Rental-App — der Master Admin erhält Read-only-Einblick, Deep-Links und plattformweite Attention, nicht eine duplizierte Permission-Matrix.

---

## 0. Produktrolle & Abgrenzung

| Identität & Zugriff **ist** | Identität & Zugriff **ist nicht** |
|-----------------------------|-----------------------------------|
| Plattformweite User-Governance (cross-tenant) | Vollständige Org-IAM-CRUD-Oberfläche (→ Rental `users-roles/`) |
| Master-Admin-MFA-Sichtbarkeit und Attention | MFA als verstecktes Settings-Unterfeature |
| Kanonisches Audit Log + Security Events | Operatives Activity-Protokoll (Imports, Syncs) |
| Self-Service Sessions + eigene MFA | Impersonation / Actor-Swap (nicht vorhanden — nicht erfinden) |
| Privileged-Action-Safety (Reason, Step-up, Audit) | Frontend-Permission-Wahrheit oder Risk-Score-Engine |
| Platform-Rollen-Übersicht (MASTER_ADMIN, master-billing) | Tenant Role Template Editor im Master |

| Verwandte Hubs — **bleiben eigenständig** | Rolle |
|-------------------------------------------|-------|
| Organisationen (`organizations`) | Mandanten-Lifecycle; Org Users Tab = read-only Slice |
| Plattform & Betrieb (`platform-ops`) | Infra-Alerts, Worker-Health — **nicht** IAM Security Events |
| Master-Abrechnung (`billing`) | Domain-spezifisches Billing-Audit (eigenes Tab) |
| Voice Assistant (`voice-assistant`) | Voice Protection Audit (eigenes Tab) |
| Support (`support`) | Ticket-Ops — kein unsichtbarer Tenant-Zugriff |
| Einstellungen (`settings`) | Plattform-E-Mail, echte Integrationen — **keine** Fake-Credentials |

**10-Sekunden-Ziel:** Master Admin sieht im ersten Viewport: wie viele Plattform-Admins ohne MFA, offene Security-Attention-Fälle, letzte privilegierte Änderungen — ohne JSON, ohne vermischte Activity-Liste.

---

## 1. Information Architecture

### 1.1 Entscheidung: Ein Hub, sechs Primärbereiche

Nach fachlicher Prüfung (nicht 1:1 Audit-Vorschlag oder Ist-Navigation übernommen):

| # | Bereich | Behalten? | Begründung |
|---|---------|-----------|------------|
| 1 | **Übersicht** | **Ja** | Security Attention, MFA-Pflicht-Status, letzte kritische Events |
| 2 | **Benutzer** | **Ja** | Cross-tenant User-Governance — **eine** Account-Verwaltung |
| 3 | **Plattform-Admins** | **Ja** | Gefilterte Ansicht privilegierter Accounts — **kein** zweites CRUD |
| 4 | **Rollen** | **Ja** | Platform-Rollen + org Role Template Browser (read-only) |
| 5 | **Audit** | **Ja** | Revisionssichere Wahrheit — kanonische Audit-Oberfläche |
| 6 | **Sicherheitsereignisse** | **Ja** | Kompakte IAM/Auth-Events — getrennt von Audit und Ops |
| 7 | **Eigene Sicherheit** | **Ja** | MFA, Sessions, Recovery — Self-Service Control Plane |
| — | Separates `?view=users` | **Nein** | → Hub Tab „Benutzer" |
| — | Separates `?view=activity-log` | **Nein** | → Hub Tab „Audit" + „Betrieb" Link |
| — | MFA in Settings | **Nein** | → Tab „Eigene Sicherheit" |
| — | Org IAM Matrix im Master | **Nein** | → Deep-Link Rental + read-only Role Detail |
| — | Impersonation UI | **Nein** | Backend nicht vorhanden |
| — | API Keys Mock in Settings | **Nein** | Entfernen bis echte API existiert |

**Keine Mikro-Pages:** User Detail, Role Detail, Audit Detail sind **Drawer** unter dem Hub — keine eigenen Sidebar-Roots.

### 1.2 Ziel-Navigationsbaum

```
Identität & Zugriff  (?view=security-access)
├── Übersicht                         securityAccess=overview
├── Benutzer                          securityAccess=users
│   └── Detail                        &userId={uuid}
├── Plattform-Admins                  securityAccess=master-admins
│   └── Detail                        &userId={uuid}  (gleicher Drawer, vorgefilterter Kontext)
├── Rollen                            securityAccess=roles
│   └── Detail                        &roleId={uuid}&roleScope=platform|org&orgId={uuid?}
├── Audit                             securityAccess=audit
│   └── Detail                        &auditId={uuid}
├── Sicherheitsereignisse             securityAccess=security-events
│   └── Detail                        &eventId={uuid}
└── Eigene Sicherheit                 securityAccess=own-security
    └── Unter-Tabs                    ownSecurityTab=mfa|sessions|recovery
```

**Sidebar:** Ein Eintrag ersetzt `users` + `activity-log`:

| Feld | Wert |
|------|------|
| **Label (DE)** | Identität & Zugriff |
| **i18n Key** | `master.nav.securityAccess` |
| **Icon** | `ShieldCheck` (Lucide) |
| **View ID** | `security-access` |
| **Gruppe** | Mandanten & Nutzer (ersetzt `users` in dieser Gruppe) |
| **Badge** | `security-attention` (kanonische Backend-Signale) |
| **Permission** | `MASTER_ADMIN` (+ MFA Enrollment Gate global) |
| **Mobile Primary** | Ja (Pin nach Organisationen) |

**Redirects (verbindlich):**

| Alt | Neu |
|-----|-----|
| `?view=users` | `?view=security-access&securityAccess=users` |
| `?view=activity-log` | `?view=security-access&securityAccess=audit` |
| `MasterAccountSheet` → Settings MFA | `?view=security-access&securityAccess=own-security&ownSecurityTab=mfa` |
| Org Detail Tab „Aktivität" (Audit-Toggle) | Bleibt — Deep-Link `securityAccess=audit&organizationId={orgId}` |

**Betrieb / Activity (nicht Audit):**

Operative Ereignisse (Vehicle Import, DIMO Sync, …) **nicht** in diesem Hub. Stattdessen:

- Dashboard Widget „Letzte Aktivität" (gekürzt, Link)
- Optional später: `?view=platform-ops&platformOps=overview` Activity-Chip — **nicht** UI-9 Scope

### 1.3 Cross-Links (verbindlich)

| Von | Nach | Trigger |
|-----|------|---------|
| Dashboard Security Attention | `securityAccess=master-admins` gefiltert MFA missing | Chip-Klick |
| Dashboard Recent Privileged Change | `securityAccess=audit&auditId=` | Zeilen-Klick |
| Benutzer Zeile → Org | `organizations&orgId=` | Org-Name Link |
| Benutzer Detail → Org IAM | Rental `/organizations/{orgId}/settings/users-roles` | „IAM in Mandant öffnen" (neuer Tab) |
| Rollen Detail (org) | Org Detail + Rental IAM | „Rolle bearbeiten" (nur wenn Org-Kontext) |
| Org Detail Users Tab | `securityAccess=users&organizationId=` | „In Identität & Zugriff öffnen" |
| Billing Audit Tab | `securityAccess=audit&auditDomain=BILLING` | Querverweis-Link |
| Platform Ops Auth-Ausfall | `securityAccess=security-events` | nur bei kanonischem AUTH_EVENT |
| Nav Badge `security-attention` | `securityAccess=overview` | Badge-Klick |

### 1.4 Page Shell (UI-2)

```
MasterPageHeader variant="page"
  title="Identität & Zugriff"
  meta="{liveCount} Benutzer · {attentionCount} Aufmerksamkeit"
  actions=[Refresh] [Export] (Export nur auf Audit-Tab sichtbar)
  tabs=MasterPageTabs (URL-synced securityAccess)

PageContainer variant="wide"   /* Tabellen + Filter */
```

---

## 2. Administrator List (Plattform-Admins Tab)

**Zweck:** Sofortige Sicht auf **alle privilegierten Control-Plane-Accounts** — nicht identisch mit „Benutzer", sondern vorgefilterte Governance-Ansicht.

### 2.1 Primäre Spalten (Liste)

| Spalte | Inhalt | Quelle |
|--------|--------|--------|
| **Identität** | Avatar, Name, E-Mail (truncated mobile) | `user.name`, `user.email` |
| **Rolle** | `Plattform-Administrator` / `Abrechnung (eingeschränkt)` | `platformRole`, `platformPermissions` |
| **Status** | Account State Chip (DE) | `User.status` + `MembershipStatus` |
| **MFA** | Chip: `Aktiv` / `Erforderlich` / `Fehlt` / `Unbekannt` | **Neu:** `GET /admin/users` erweitert oder `GET /admin/security/master-admins` |
| **Security Attention** | 0–n Attention-Chips (max 2 sichtbar + „+n") | Kanonische `attentionCodes[]` |
| **Zuletzt aktiv** | Relativ DE (`vor 2 Std.`) | `lastLoginAt` / `lastActivityAt` |

### 2.2 Sekundär (nur Detail-Drawer)

- User-ID, Membership-ID
- Session-Liste (Device, IP maskiert, Timestamps)
- MFA-Faktor-Metadaten (Typ, enrolledAt — **kein** Secret)
- Correlation zu letzten Audit-Events als Target

### 2.3 Default-Sortierung

1. MFA fehlt (kritisch)
2. Security Attention vorhanden
3. `lastActivityAt` absteigend

### 2.4 Empty / Attention States

- **Keine Master Admins:** unmöglicher Zustand — ErrorState + Ops-Hinweis
- **MFA fehlt bei ≥1 Admin:** Overview + Tab Badge `security-attention` + Tabellenzeile `Achtung: MFA fehlt` (Icon + Text, nicht nur Farbe)

---

## 3. Administrator / User Detail (Drawer)

Gemeinsamer **UserDetailDrawer** für Tabs „Benutzer" und „Plattform-Admins" — Kontext-Badge unterscheidet Scope.

### 3.1 Sektionen

```
┌─ User Detail Drawer ─────────────────────────────────────────┐
│ [Avatar] Max Mustermann                    [StatusChip]      │
│ max@synqdrive.eu                              [MFA Chip]     │
│ Plattform-Administrator · Organisation: —                    │
├──────────────────────────────────────────────────────────────┤
│ IDENTITÄT                                                    │
│   Name · E-Mail · Account State · Erstellt · Einladung       │
├──────────────────────────────────────────────────────────────┤
│ ZUGRIFF                                                      │
│   Plattform-Rolle · Org-Memberships (read-only Liste)        │
│   Effective Access Summary (menschenlesbar, kein JSON)       │
│   [IAM in Mandant öffnen] (pro Org-Zeile)                    │
├──────────────────────────────────────────────────────────────┤
│ SICHERHEIT                                                   │
│   MFA Status · Enrollment · Recovery (Restanzahl, nicht Codes)│
│   Security Attention (Codes + Erklärung)                     │
│   [MFA zurücksetzen] (High Risk — §9)                        │
├──────────────────────────────────────────────────────────────┤
│ SITZUNGEN                                                    │
│   Aktive Sessions Tabelle (§10)                              │
│   [Alle anderen Sitzungen beenden] (Admin, Sensitive)        │
├──────────────────────────────────────────────────────────────┤
│ LETZTE PRIVILEGIERTE AKTIVITÄT                               │
│   Max 5 Einträge → Link Audit gefiltert auf Target           │
├──────────────────────────────────────────────────────────────┤
│ TECHNISCHE DETAILS (eingeklappt)                             │
│   User-ID · Request-IDs · Raw Envelope (readonly)            │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Account State (kanonisch — DE Labels)

| Backend | UI Label | Chip-Ton |
|---------|----------|----------|
| `ACTIVE` + Membership `ACTIVE` | Aktiv | success |
| `INVITED` / pending invite | Eingeladen | info |
| `INACTIVE` | Deaktiviert | muted |
| `SUSPENDED` | Gesperrt (Mandant) | warning |
| Locked (auth policy) | Gesperrt (Anmeldung) | danger |
| MFA `REQUIRED` / `ACTION_REQUIRED` | MFA ausstehend | danger |
| Recovery pending | Wiederherstellung erforderlich | warning |

Nur **reale** Backend-Zustände — keine erfundenen Badges.

---

## 4. MFA Experience

MFA ist **Control-Plane-Pflicht**, nicht Nebenfeature.

### 4.1 Zustandsmodell (vier Dimensionen)

| Dimension | Werte (UI) | Quelle |
|-----------|------------|--------|
| **Enrollment State** | Nicht eingeschrieben · Eingeschrieben · Ausstehend | `GET /account/mfa/status` (self) / Admin DTO (other) |
| **Factor State** | TOTP aktiv · Kein Faktor | `mfaFactors[]` |
| **Recovery State** | Codes verfügbar (n) · Aufgebraucht · Rotation empfohlen | `recoveryCodesRemaining` |
| **Step-up State** | Gültig (TTL) · Erforderlich für Aktion X | Client `stepUpToken` + Server 403 |

### 4.2 Kritischer Zustand — Master Admin ohne MFA

**Sichtbarkeit (Pflicht):**

| Ort | Darstellung |
|-----|-------------|
| Hub Übersicht | KPI-Karte „Plattform-Admins ohne MFA" (rot nur als Akzent — **Text Pflicht**: „3 Administratoren ohne MFA") |
| Tab Plattform-Admins | Spalte MFA + Default-Filter „MFA fehlt" Quick-Filter |
| Tabellenzeile | `Achtung` Icon + „MFA fehlt" + Tooltip Erklärung |
| Nav Badge | `security-attention` wenn count > 0 |

### 4.3 Flows

| Flow | Ort | Schutz |
|------|-----|--------|
| **Enrollment (self)** | Tab Eigene Sicherheit → MFA | `MasterMfaGate` blockiert bis complete |
| **Step-up (mutation)** | Global `MfaStepUpDialog` — **kontextualisiert** | Action-Label: „Schritt-für-Schritt-Bestätigung für: {Aktion}" |
| **Recovery Codes anzeigen** | Nur bei Enrollment (einmalig) | Nicht erneut abrufbar |
| **Recovery Codes rotieren** | Eigene Sicherheit | Step-up `MASTER_PLATFORM_SETTINGS` |
| **MFA Reset (self)** | Eigene Sicherheit | Step-up + Reason |
| **MFA Reset (other user)** | User Detail — **High Risk** | Step-up `MFA_RESET_OTHER_USER` + Reason + Bestätigung Name/E-Mail + Audit |

### 4.4 MFA Reset — High-Risk-Flow (verbindlich)

```
1. Aktion „MFA zurücksetzen" (destructive styling + Text)
2. Dialog: Ziel-Identität anzeigen (Name, E-Mail, Rolle)
3. Warnung: „Der Benutzer muss MFA neu einrichten. Alle aktiven Sitzungen werden beendet."
4. Pflichtfeld Grund (min 10 Zeichen)
5. Step-up MFA (kontextualisiert)
6. Ergebnis: Success/Failure Toast + Audit-Eintrag verlinkt
```

**Hinweis Implementierung:** Org-scoped API existiert (`POST …/mfa/reset`); Master-Scope benötigt **neuen** oder erweiterten Admin-Endpoint — als **ADD Backend** in Implementierungsphase, nicht erfinden im UI ohne API.

---

## 5. Roles List

### 5.1 Zwei Scope-Ebenen in **einer** Liste (Scope-Spalte unterscheidet)

| Scope | Beispiele | Master UI |
|-------|-----------|-----------|
| **Plattform** | `MASTER_ADMIN`, `master-billing` | Vollständige Zeilen |
| **Mandant** | Org Role Templates | Read-only Browser + Link |

### 5.2 Primäre Spalten

| Spalte | Inhalt |
|--------|--------|
| **Rollenname** | `Plattform-Administrator`, `Fuhrparkleiter`, … |
| **Scope** | `Plattform` / `Mandant: {OrgName}` |
| **Benutzer** | Anzahl zugewiesener User/Memberships |
| **Kritische Rechte** | Chip „Kritisch" + Kurztext (z. B. „Benutzerverwaltung, Abrechnung") — **keine** Permission-Keys |
| **Zuletzt geändert** | Relativ + absolut im Tooltip |
| **Typ** | `System` / `Benutzerdefiniert` (nur org templates) |

### 5.3 Keine Rohdaten in der Liste

Verboten in Listenspalten: `users-roles.manage`, JSON-Blobs, Permission-Module-Keys.

---

## 6. Role Detail

### 6.1 Layout (Drawer oder Full-Page bei Desktop wide)

| Sektion | Inhalt |
|---------|--------|
| **Zweck** | Menschenlesbare Beschreibung (Systemrolle: feste Copy; Custom: `description` aus Template) |
| **Scope** | Plattform vs. Org + Station Scope Summary |
| **Zugewiesene Benutzer** | Tabelle (max 10 + „Alle anzeigen" → Users Tab gefiltert) |
| **Berechtigungsgruppen** | Domain-gruppierte Capability-Liste (§7) |
| **Kritische Fähigkeiten** | Hervorgehobene Liste (z. B. „Kann Rollen ändern", „Kann MFA zurücksetzen") |
| **Änderungshistorie** | Letzte 5 Role-Version-Events → Audit-Link |
| **Aktionen** | Plattform-Rollen: keine Edit; Org-Rollen: „In Mandant bearbeiten" |

### 6.2 Platform Role Detail (fest)

| Rolle | Kritische Fähigkeiten (Copy) |
|-------|------------------------------|
| `MASTER_ADMIN` | Vollzugriff Control Plane, alle Mandanten, privilegierte Mutationen |
| `master-billing` | Abrechnung & Verträge, Billing-Audit — **kein** User-Management |

---

## 7. Permission UX

### 7.1 Hierarchie (skalierbar — keine Default-Checkbox-Matrix)

```
Domäne (aufklappbar)
└── Fähigkeit (Capability) — menschenlescher Name
    └── Berechtigung — read / write / manage Chips
```

**Darstellungsmodi:**

| Breakpoint | Modus |
|------------|-------|
| Desktop ≥1024px | Accordion pro Domäne, 2-Spalten Capability-Liste |
| Tablet | Accordion, 1 Spalte |
| Mobile | **Keine Matrix** — nur „Kritische Fähigkeiten" Summary + Link „Vollständige Rechte (Desktop)" |

### 7.2 Domänen-Mapping (an reale `PERMISSION_MODULE_KEYS` angepasst)

| Domäne (DE) | Module Keys | Kritische Capabilities |
|-------------|-------------|------------------------|
| **Mandanten & Organisation** | `company-info` | Mandantendaten ändern |
| **Benutzer & Rollen** | `users-roles` | Benutzer einladen, Rollen zuweisen, MFA zurücksetzen |
| **Flotte & Fahrzeuge** | `fleet`, `fleet-condition`, `fleet-connectivity` | Fahrzeugdaten, Konnektivität |
| **Abrechnung & Zahlungen** | `billing`, `payments`, `payments-refund`, `payments-disputes`, `payments-connect`, `payments-settings` | Erstattungen, Connect, Abrechnungseinstellungen |
| **Buchungen & Vermietung** | `bookings`, `rental-rules`, `rental-rules-publish`, `rental-rules-assign`, `rental-rules-overrides`, `booking-eligibility`, `booking-eligibility-override` | Regeln veröffentlichen, Overrides |
| **Betrieb & Aufgaben** | `tasks`, `support`, `stations`, `vendor-management` | — |
| **Dokumente & Compliance** | `document-upload`, `legal-documents`, `legal-documents-audit` | Rechtsdokumente, Audit |
| **Daten & Auswertung** | `data-analyse`, `data-authorization`, `evaluations` | Datenfreigaben |
| **Automatisierung & KI** | `workflow-automation`, `workflow-emergency-override`, `ai-assistant` | Notfall-Override |
| **Finanzen & Mahnwesen** | `invoices`, `fines`, `price-tariffs` | — |
| **Kunden** | `customers`, `dashboard` | — |

### 7.3 Kritische Permissions markieren

Jede kritische Capability zeigt:

- Icon `ShieldAlert` + **Textlabel** „Kritische Berechtigung"
- Kurzbeschreibung der Wirkung (1 Satz)
- Optional: „Betrifft: {Scope}"

**Nicht** allein durch Farbe (WCAG).

---

## 8. Least-Privilege Guards

Bei **jeder** Rollenänderung oder Permission-Erweiterung (Org-Kontext via Link; Platform im User-Formular):

### 8.1 Role-Change Preview (vor Apply)

Dialog / Side Panel zeigt:

| Block | Inhalt |
|-------|--------|
| **Neue Rechte** | Liste hinzukommender Capabilities (grün-neutral, mit Text) |
| **Entfallende Rechte** | Liste (falls vorhanden) |
| **Sensible Rechte** | Separater Block „Sensible Berechtigungen" mit Warn-Icon + Erklärung |
| **Scope** | Org, Stationen, Plattform |
| **Betroffene Sitzungen** | „X aktive Sitzungen werden beendet" (wenn Backend `sessionInvalidationTriggers`) |

Backend-Vorbild: `POST …/roles/:roleId/preview-change` (existiert org-scoped).

### 8.2 Platform User Role → Master Admin

**Zusätzlicher** Escalation-Dialog (nicht nur FormDialog):

```
Titel: Plattform-Administrator-Rechte gewähren
Warnung: Dieser Benutzer erhält vollständigen Zugriff auf alle Mandanten
         und privilegierte Control-Plane-Aktionen.
Checkbox: Ich bestätige die Ausweitung privilegierter Rechte.
Grund: [Pflichtfeld]
Step-up: MASTER_USER_MANAGEMENT
```

### 8.3 Verboten

- „Alle Berechtigungen auswählen" ohne Preview
- Stilles PATCH ohne Diff-Anzeige
- Optimistic UI auf Role Changes

---

## 9. Privileged Action Model

### 9.1 Kategorien

| Kategorie | Beispiele | Placement |
|-----------|-----------|-----------|
| **Standard** | Name, E-Mail, Org-Zuordnung (non-privileged) | Inline Form / Row Action |
| **Sensitive** | Session revoke, Passwort-Reset, Account deaktivieren | Row Action → Confirm Dialog |
| **High Risk** | Master Admin zuweisen, MFA Reset, Role Escalation, Audit Export | Dedicated Dialog + Escalation UI |
| **Destructive** | User löschen, Org löschen (cross-ref) | ConfirmDialog destructive + Reason |

### 9.2 Matrix (verbindlich)

| Aktion | Kategorie | Confirmation | Reason | Step-up Action | Audit Action | Success UI | Failure UI |
|--------|-----------|--------------|--------|----------------|--------------|------------|------------|
| User erstellen | Standard | Form submit | Optional | `MASTER_USER_MANAGEMENT` | `PLATFORM_USER_CREATED` | Toast + Row | Inline Error |
| User bearbeiten (Metadaten) | Standard | Form submit | — | `MASTER_USER_MANAGEMENT` | `PLATFORM_USER_UPDATED` | Toast | Inline Error |
| Rolle → Master Admin | High Risk | Escalation Dialog | **Pflicht** | `MASTER_USER_MANAGEMENT` | `PLATFORM_USER_UPDATED` | Toast + Attention | Step-up / 403 Message |
| Passwort zurücksetzen | Sensitive | Confirm + Ziel anzeigen | Empfohlen | `PRIVILEGED_PERMISSION_CHANGE` | `PLATFORM_USER_PASSWORD_RESET` | Toast | Error |
| User deaktivieren | Sensitive | Confirm | Empfohlen | `MASTER_USER_MANAGEMENT` | `PLATFORM_USER_UPDATED` | Toast | Error |
| User löschen | Destructive | Confirm destructive | **Pflicht** | `PRIVACY_DATA_DELETION` | `PLATFORM_USER_DELETED` | Toast + Row remove | Reason/Step-up Error |
| MFA Reset (other) | High Risk | High-Risk Flow §4.4 | **Pflicht** | `MFA_RESET_OTHER_USER` | `MFA_RESET` | Toast + Detail refresh | Error |
| Session revoke (other) | Sensitive | Confirm | — | Org policy / TBD | `SESSION_REVOKED` | Toast | Error |
| Audit Export | High Risk | Export Dialog | — | `MASTER_AUDIT_EXPORT` | `AUDIT_EXPORT` | Download + Toast | Step-up Error |
| Eigene Session revoke others | Sensitive | Confirm | — | `REVOKE_OTHER_USER_SESSIONS` | `SESSION_REVOKED` | Toast | Error |

**Rollback:** Kein UI-Rollback. Bei Fehlern: Audit-Eintrag `FAILED` + Nutzerhinweis Support.

---

## 10. Session Management

### 10.1 Self-Service (Tab Eigene Sicherheit → Sitzungen)

| Feld | Anzeige | Datenschutz |
|------|---------|-------------|
| **Aktuelle Sitzung** | Badge „Aktuelle Sitzung" — nicht revokable ohne Logout | — |
| **Gerät/Client** | `device` + `browser` + `os` aus DTO | OK |
| **Letzte Aktivität** | `lastUsedAt` relativ | OK |
| **IP** | **Maskiert** `192.168.x.x` / IPv6 gekürzt — Voll-IP nur in Technical Details | Minimierung |
| **Erstellt / Ablauf** | `createdAt`, `expiresAt` | OK |
| **Aktion** | „Beenden" pro Zeile; „Alle anderen beenden" | Confirm |

**Kein Standort** — Backend liefert keine kanonische Geo; nicht erfinden.

### 10.2 Admin-Ansicht (User Detail)

Gleiche Tabelle für Ziel-User — erfordert **neuen** Admin-Endpoint oder org-scoped Pfad mit Master-Override.

Revoke-All: Sensitive Confirm + Audit.

### 10.3 Verdächtige Abweichung (nur kanonisch)

Wenn Backend liefert (z. B. new device + impossible travel — **nur wenn Signal existiert**):

- Attention-Chip an Session-Zeile
- Keine eigene Heuristik im Frontend

---

## 11. Security Events

Kompakte Ansicht — **nicht** vollständiger Audit Trail.

### 11.1 Scope-Filter (Server)

```
entity IN (AUTH_EVENT, ADMIN_OPERATION)
AND (
  action IN (LOGIN_FAILED, MFA_*, STEP_UP_*, ROLE_CHANGE, SESSION_REVOKED, …)
  OR metaJson.auditDomain = 'MASTER_ADMIN'
  OR level = 'SECURITY'
)
```

### 11.2 Listen-Spalten

| Spalte | Inhalt |
|--------|--------|
| **Was** | Menschenlesbare Aktion (DE) |
| **Wer** | Actor Name (Fallback: System) |
| **Ziel** | Target Entity + Kurzname |
| **Zeit** | Relativ + Tooltip absolut |
| **Ergebnis** | Erfolg / Fehlgeschlagen / Abgelehnt |
| **Schwere** | Kategorie-Chip: Kritisch / Warnung / Info |

### 11.3 Priorisierung (Default-Sort)

1. Kritische Events (`MFA_STEP_UP_DENIED`, Lockout, failed privileged)
2. MFA/Security Events
3. Chronologisch absteigend

### 11.4 Drilldown

Drawer: gleiche Felder + Link „Vollständiger Audit-Eintrag" → Audit Tab mit `auditId`.

**Abgrenzung Platform Ops:** Worker down ≠ Security Event — kein Merge.

---

## 12. Audit Log

Kanonische revisionssichere Oberfläche — **read-only**.

### 12.1 Listen-Spalten

| Spalte | Inhalt |
|--------|--------|
| **Zeitstempel** | `createdAt` |
| **Akteur** | `userName` / actor display |
| **Aktion** | `auditAction` menschenlesbar (DE Map) |
| **Ziel** | Entity Type + Label |
| **Organisation** | Org Name oder „Plattform" |
| **Ergebnis** | Erfolg/Fehler Chip |
| **Grund** | Gekürzt (max 40 Zeichen), Volltext im Detail |

### 12.2 Detail-Drawer (Primär menschenlesbar)

| Block | Inhalt |
|-------|--------|
| **Zusammenfassung** | Wer hat was an welchem Objekt wann getan — 1 Absatz auto-generiert |
| **Grund** | `reasonCode` / `reason` |
| **Ergebnis** | HTTP Status, success/fail |
| **Vorher/Nachher** | Strukturierter Diff (Billing-Audit-Muster) — nicht JSON-Wand |
| **Technische Details** (eingeklappt) | IDs, Correlation, Request ID, IP maskiert, User Agent gekürzt, Raw Envelope |

### 12.3 Verboten

- Edit / Delete Buttons
- „Audit bereinigen"
- Client-seitige Volltextsuche über kompletten Bestand

---

## 13. Audit Filter

### 13.1 Primäre Filter (Toolbar)

| Filter | Typ | Server-Param |
|--------|-----|--------------|
| **Zeitraum** | Presets + Custom Range | `from`, `to` |
| **Akteur** | Async User Search | `actorUserId` (ADD wenn fehlt) |
| **Aktionskategorie** | Multi-select Chips | `auditDomain`, `action` group |
| **Organisation** | Org Picker | `organizationId` |
| **Zieltyp** | Entity Type select | `entity` |
| **Ergebnis** | Erfolg / Fehler | `level` oder `metaJson.result` |

### 13.2 Weitere Filter (Sheet „Erweiterte Filter")

- Correlation ID
- Request ID
- IP (maskiert input)
- `auditAction` exakt (Admin-only)

### 13.3 Pagination

Server-side `page` + `limit` (default 50) — **Pflicht** für Skalierung.

---

## 14. Audit Export

Kanonisch vorhanden: `GET /admin/activity-log/export`.

### 14.1 Export-Dialog (High Risk)

| Feld | Regel |
|------|-------|
| **Zeitraum** | Pflicht, max 90 Tage Default-Vorschlag |
| **Scope** | Plattform / Einzelorg |
| **Format** | JSON / CSV |
| **PII Hinweis** | „Export enthält personenbezogene Daten (E-Mail, IP). Nur für autorisierte Compliance-Zwecke." |
| **Permission** | `MASTER_ADMIN` |
| **Step-up** | `MASTER_AUDIT_EXPORT` |
| **Audit** | `AUDIT_EXPORT` mit rowCount + filters |

Download via Browser — kein E-Mail-Versand.

---

## 15. Activity vs Audit

| | **Activity (Betrieb)** | **Audit (Revisionssicher)** |
|--|------------------------|------------------------------|
| **Zweck** | Schnelle menschenlesbare Historie | Compliance, Forensik, Privileged Actions |
| **Ort** | Dashboard Widget, ggf. Org Detail Tab „Betrieb" | Hub Tab „Audit" |
| **Datenquelle** | `activity_logs` ohne `auditDomain` / operational entities | `activity_logs` mit `auditDomain`, `ADMIN_OPERATION` |
| **Filter** | entity = VEHICLE, IMPORT, … | `auditDomain`, reason, diff |
| **Detail** | Kurzbeschreibung | Vollständiger Drawer |
| **Export** | Nein | Ja (kontrolliert) |
| **Löschbar** | Nein (DB append-only) | Nein |

**Eine Tabelle im Backend — zwei semantische Views im Frontend.** Keine doppelte Speicherung, keine abweichende Statuslogik.

---

## 16. Impersonation

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Backend Actor-Swap | **Nicht vorhanden** |
| Master UI | **Nicht implementieren** |
| Alternative | Jeder cross-tenant Master-Zugriff erscheint im Audit als privilegierte Aktion |

Falls Impersonation **später** eingeführt wird — separates High-Risk-Spec:

- Permanenter Banner: „Support-Zugriff aktiv — Mandant: {Name}"
- Startzeit, Grund, Ziel-User
- Step-up + Audit Start/End
- Eingeschränkte Actions whitelist
- „Sitzung beenden" jederzeit sichtbar

---

## 17. Security Attention

Nur aus **kanonischen Backend-Signalen** — keine Frontend Risk Engine.

### 17.1 Attention Codes

| Code | Bedingung (Backend) | UI |
|------|---------------------|-----|
| `MFA_MISSING` | `platformRole=MASTER_ADMIN` ∧ ¬mfaEnrolled | Chip + Overview KPI |
| `MFA_REQUIRED` | mfaState = REQUIRED / ACTION_REQUIRED | Chip |
| `ACCOUNT_LOCKED` | auth lock / suspended | Chip danger |
| `PRIVILEGE_CHANGED` | Audit event last 24h targeting user | Chip info |
| `STEP_UP_DENIED` | Recent `MFA_STEP_UP_DENIED` for actor | Security Events link |
| `ANOMALOUS_ACCESS` | **Nur wenn** Backend liefert | Chip |

### 17.2 Aggregation

`GET /admin/security/attention-summary` (ADD Backend) oder berechnet aus erweitertem Users-Endpoint:

```typescript
{ total: number, byCode: Record<AttentionCode, number>, topItems: AttentionItem[] }
```

Nav Badge `security-attention`: `total > 0`.

---

## 18. Data Minimization

| Daten | Standard sichtbar | Nur Detail / Technical | Nie anzeigen |
|-------|-------------------|------------------------|--------------|
| E-Mail | User Liste, Detail | — | — |
| Vollständige IP | — | Maskiert in Liste; Voll in Technical (Admin) | Öffentliche UI |
| User Agent | — | Gekürzt in Detail | — |
| MFA Secrets / TOTP Seed | — | — | **Niemals** |
| Recovery Codes (vollständig) | Einmalig bei Enrollment (self) | — | Admin-View |
| API Keys / Tokens | — | — | **Niemals** (Settings Mock entfernen) |
| Passwort | Eingabefeld nur bei Reset | — | Nie anzeigen |
| before/after JSON | — | Strukturierter Diff | Rohe JSON-Wand als Default |

**Export:** PII-Warnung im Dialog; Export selbst wird auditiert.

---

## 19. Mobile

### 19.1 Benutzer / Plattform-Admins

Card-Liste statt Tabelle:

1. Identität (Name + E-Mail)
2. Rolle
3. Security State (Status + Attention)
4. MFA Chip
5. Actions (Overflow Menu)

Detail: Full-Screen Sheet.

### 19.2 Audit / Security Events

Card-Liste:

1. Event / Aktion
2. Akteur
3. Ziel
4. Zeit
5. Ergebnis

Filter: Bottom Sheet.

### 19.3 Rollen / Permissions

- Rollenliste: Cards mit Name, Scope, User Count, Kritisch-Chip
- Role Detail: nur Summary + kritische Fähigkeiten — **keine** Permission-Matrix
- Hinweis: „Vollständige Berechtigungsmatrix auf Desktop verfügbar"

---

## 20. Data Contract

### 20.1 Übersicht Attention

| UI Element | Canonical Source | Endpoint | Permission | Refresh | Mutation | Audit |
|------------|------------------|----------|------------|---------|----------|-------|
| KPI MFA missing | Security attention DTO | `GET /admin/security/attention-summary` **(ADD)** | `MASTER_ADMIN` | 60s + on navigate | — | — |
| Attention Badge Nav |同上 |同上 |同上 | 60s | — | — |

### 20.2 Benutzer / Plattform-Admins Liste

| UI Element | Source | Endpoint | Permission | Refresh | Mutation | Audit |
|------------|--------|----------|------------|---------|----------|-------|
| User rows | `users` + MFA enrichment | `GET /admin/users` **(EXTEND mfaState, attentionCodes)** | `MASTER_ADMIN` | on tab focus, manual | — | — |
| Master-Admins filter | Client/server `platformRole` | `GET /admin/users?platformRole=MASTER_ADMIN` **(ADD query)** | `MASTER_ADMIN` |同上 | — | — |
| Create user | — | `POST /admin/users` | `MASTER_ADMIN` + MFA | — | POST | `PLATFORM_USER_CREATED` |
| Update user | — | `PATCH /admin/users/:id` | `MASTER_ADMIN` + MFA | — | PATCH | `PLATFORM_USER_UPDATED` |
| Delete user | — | `DELETE /admin/users/:id` + body `{reason}` | `MASTER_ADMIN` + MFA | — | DELETE | `PLATFORM_USER_DELETED` |
| Change password | — | `POST /admin/users/:id/change-password` | Step-up | — | POST | `PLATFORM_USER_PASSWORD_RESET` |

### 20.3 User Detail

| UI Element | Source | Endpoint | Permission | Refresh | Mutation | Audit |
|------------|--------|----------|------------|---------|----------|-------|
| Identity | User DTO | `GET /admin/users/:id` | `MASTER_ADMIN` | on open | — | — |
| MFA state | IAM MFA | `GET /admin/users/:id/security` **(ADD)** | `MASTER_ADMIN` | on open | — | — |
| Sessions | Account sessions | `GET /admin/users/:id/sessions` **(ADD)** | `MASTER_ADMIN` | on open | POST revoke | `SESSION_REVOKED` |
| Security activity | User access audit | `GET /organizations/:orgId/users/:userId/security-activity` or admin variant | `MASTER_ADMIN` | on open | — | — |
| Privileged activity | Activity log | `GET /admin/activity-log?targetUserId=` | `MASTER_ADMIN` | on open | — | — |

### 20.4 Rollen

| UI Element | Source | Endpoint | Permission | Refresh | Mutation | Audit |
|------------|--------|----------|------------|---------|----------|-------|
| Platform roles | Static config + DB counts | `GET /admin/security/platform-roles` **(ADD)** | `MASTER_ADMIN` | manual | — | — |
| Org role templates | OrganizationRole | `GET /admin/organizations/:orgId/iam/roles` **(ADD admin)** or cross-org `GET /admin/security/org-roles` | `MASTER_ADMIN` | manual | Read-only in Master | — |
| Role detail | IAM role DTO | `GET /organizations/:orgId/iam/roles/:roleId` | `MASTER_ADMIN` | on open | — | — |
| Permission preview | Effective access | `GET …/roles/:roleId/permission-preview` | `MASTER_ADMIN` | on open | — | — |

### 20.5 Eigene Sicherheit

| UI Element | Source | Endpoint | Permission | Refresh | Mutation | Audit |
|------------|--------|----------|------------|---------|----------|-------|
| MFA status | Account MFA | `GET /account/mfa/status` | Auth | on tab | enroll/reset | `MFA_*` |
| MFA enroll | Account MFA | `POST /account/mfa/totp/enroll/*` | Auth | — | POST | `MFA_ENROLLED` |
| MFA challenge | Step-up | `POST /account/mfa/challenge` | Auth | — | POST | `MFA_STEP_UP_*` |
| Sessions (self) | Account | `GET /account/me/sessions` | Auth | on tab | POST revoke | `SESSION_REVOKED` |

### 20.6 Audit & Export

| UI Element | Source | Endpoint | Permission | Refresh | Mutation | Audit |
|------------|--------|----------|------------|---------|----------|-------|
| Audit list | activity_logs | `GET /admin/activity-log?page&limit&filters` | `MASTER_ADMIN` | manual, paginated | — | — |
| Audit detail | activity_logs row | `GET /admin/activity-log/:id` **(ADD if missing)** | `MASTER_ADMIN` | on open | — | — |
| Export | export service | `GET /admin/activity-log/export` | `MASTER_ADMIN` + step-up | — | GET | `AUDIT_EXPORT` |

### 20.7 Security Events

| UI Element | Source | Endpoint | Permission | Refresh | Mutation | Audit |
|------------|--------|----------|------------|---------|----------|-------|
| Event list | activity_logs filtered | `GET /admin/activity-log?securityOnly=true` **(ADD)** | `MASTER_ADMIN` | 30s optional | — | — |

### 20.8 Caching & Auth Regeln

- **Kein** lokales Ableiten von Permissions für Gating — `canAccessMasterNavItem` bleibt; Tab-Inhalt server-authoritative
- **Kein** optimistic delete auf User/Role
- **Stale-Data-Hint** nach 60s (UI-2 Pattern)
- Step-up Token im Memory — nicht localStorage

**ADD** = Backend-Erweiterung in Implementierungsphase, in Spec als Gap markiert.

---

## 21. Duplicate Truth Risks

| Risiko | Ist | Soll |
|--------|-----|------|
| Users in `App.tsx` bulk state vs. Tab fetch | Global load | Tab-scoped server paged fetch |
| Activity Log vs. Dashboard recent | Duplikat | Dashboard: max 5, Link zu Audit |
| Org Activity vs. Audit Tab | Toggle in Org Detail | Betrieb vs. Audit Links zum Hub |
| Billing Audit vs. Master Audit | Separate tables OK | Cross-link + `auditDomain` Filter |
| MFA status Nav badge vs. Detail | Nur self | Admin list uses server MFA |
| Permission labels in Dropdown vs. IAM | Display strings | Platform roles from config; org from IAM API |
| Settings Integrations mock | Fake DIMO key | REMOVE |

---

## 22. Findings → Blueprint Mapping (UI-9.1)

| Finding | Blueprint-Antwort |
|---------|-------------------|
| P0-1 MFA nicht sichtbar | §2 MFA-Spalte, §4, §17 Attention |
| P0-2 Delete ohne Reason | §9 Destructive + Reason Pflicht |
| P0-3 Master Admin ohne Warnung | §8.2 Escalation Dialog |
| P0-4 Kein Security Hub | §1 Hub `security-access` |
| P0-5 Fake Credentials | REMOVE Settings Mock |
| P1-1 Sessions UI | §10, Tab Eigene Sicherheit |
| P1-2 Activity/Audit vermischt | §15 Trennung |
| P1-3 Audit Detail | §12.2 Drawer |
| P1-4 Export UI | §14 |
| P1-5 MFA Settings dead link | MOVE → own-security |
| P1-7 Attention | §17 |

---

## 23. Scores — Ziel nach Umsetzung

| Kriterium | Ist (9.1) | Ziel (9.2+) |
|-----------|-----------|-------------|
| Account Clarity | 42 | 85 |
| MFA Clarity | 38 | 90 |
| Role/Permission Clarity | 28 | 80 |
| Least-Privilege UX | 35 | 85 |
| Privileged-Action Safety | 48 | 90 |
| Session Security UX | 15 | 80 |
| Audit Usability | 40 | 88 |
| Security Awareness | 32 | 85 |
| Data Minimization | 55 | 85 |
| Responsive UX | 58 | 80 |
| Accessibility | 50 | 82 |
| Technical Cleanliness | 45 | 85 |

---

## 24. Migration Matrix (KEEP / REMOVE / MOVE / MERGE / RENAME / ADD)

| Objekt | Aktion | Ziel / Anmerkung |
|--------|--------|------------------|
| `PlatformUsersView.tsx` | **MERGE** | → `security-access/users` Tab; CRUD-Logik extrahieren |
| `?view=users` Sidebar Item | **MOVE** | → `?view=security-access&securityAccess=users` |
| `ActivityLogView.tsx` | **MERGE** | → `security-access/audit` Tab (nicht 1:1 — neu nach §12) |
| `?view=activity-log` Sidebar Item | **MOVE** | → `security-access=audit` |
| `MasterMfaGate.tsx` | **KEEP** | Global enrollment gate unverändert |
| `MfaStepUpDialog.tsx` | **KEEP** | Erweitern: Kontext-Label |
| `MfaEnrollmentPanel.tsx` | **MOVE** | Primary: Tab Eigene Sicherheit; Gate weiter nutzen |
| `MasterAccountSheet.tsx` MFA Link | **MOVE** | → `own-security` Tab |
| `PlatformSettingsView` Integrations Mock | **REMOVE** | Fake DIMO/Stripe Credentials |
| `PlatformSettingsView` General Mock | **KEEP** | Bis echte Platform-Settings API — nicht Security |
| `OrganizationDetailView` Users Tab | **KEEP** | Read-only + Link zu Security Hub |
| `OrganizationDetailView` Activity Tab | **RENAME** | „Betrieb" (operational) + Link Audit Hub |
| `BillingAuditLogTab.tsx` | **KEEP** | Domain-Audit; Cross-Link |
| `VoiceAssistantAdminView` Audit | **KEEP** | Domain-Audit; Cross-Link |
| `RightSidebar` Activity | **MERGE** | In Dashboard Widget — max 5 Einträge |
| `useMasterNavBadges` mfa-required | **KEEP** | Self MFA |
| Nav Badge `security-attention` | **ADD** | Attention summary |
| Sidebar Label „Benutzer" | **RENAME** | → „Identität & Zugriff" (`security-access`) |
| `frontend/src/master/security-access/*` | **ADD** | Hub Module (Tabs, Hooks, Types) |
| `SecurityAccessOverviewTab` | **ADD** | Attention KPIs |
| `SecurityUsersTab` | **ADD** | Server-paged users |
| `SecurityMasterAdminsTab` | **ADD** | Filtered view (kann shared table sein) |
| `SecurityRolesTab` | **ADD** | Platform + org role browser |
| `SecurityAuditTab` | **ADD** | Kanonisches Audit |
| `SecurityEventsTab` | **ADD** | IAM/Auth events |
| `OwnSecurityTab` | **ADD** | MFA + Sessions self-service |
| `UserDetailDrawer` | **ADD** | Shared detail |
| `RoleDetailDrawer` | **ADD** | Permission hierarchy |
| `AuditDetailDrawer` | **ADD** | Nach BillingAudit-Muster |
| `PrivilegeActionDialog` | **ADD** | Reason + Step-up + Kategorie |
| `RoleEscalationDialog` | **ADD** | Master Admin Zuweisung |
| `AuditExportDialog` | **ADD** | Export flow |
| `GET /admin/security/attention-summary` | **ADD** | Backend |
| `GET /admin/users` MFA fields | **ADD/EXTEND** | `mfaState`, `attentionCodes` |
| `GET /admin/users/:id/security` | **ADD** | Admin MFA view |
| `GET /admin/users/:id/sessions` | **ADD** | Admin session list |
| `GET /admin/activity-log/:id` | **ADD** | Wenn nicht vorhanden |
| `GET /admin/security/platform-roles` | **ADD** | Platform role summary |
| Rental `users-roles/*` | **KEEP** | Tenant IAM SoT — nicht duplizieren |
| Impersonation UI | **—** | Nicht vorhanden — nicht ADD |
| API Keys UI | **—** | Warten bis `MASTER_API_KEYS` implementiert |
| `master-nav.config.ts` | **RENAME** | `users` → `security-access`; remove `activity-log` |
| i18n `master.nav.users` | **RENAME** | → `master.nav.securityAccess` |
| Redirect `view=users` | **ADD** | In `master-nav-url.ts` |
| Redirect `view=activity-log` | **ADD** | In `master-nav-url.ts` |
| `ChangesView` / `Architektur` | **ADD** | Bei Implementierung UI-9.3 |

---

## 25. Implementierungsphasen (Vorschlag — nicht Teil von UI-9.2)

| Phase | Scope |
|-------|-------|
| **UI-9.3** | Hub Shell, Tabs, Redirects, Overview, Users Liste + Detail, Own Security |
| **UI-9.4** | Audit Tab + Detail + Export, Security Events, Attention Backend |
| **UI-9.5** | Roles Browser, Least-Privilege Dialogs, Admin Session/MFA Reset APIs |
| **UI-9.6** | Mobile polish, A11y, Acceptance |

---

**Ende UI-9.2 — Spezifikation. Keine Implementierung in diesem Schritt.**

**Changes / Architektur:** Nicht aktualisiert (Spec-only).
