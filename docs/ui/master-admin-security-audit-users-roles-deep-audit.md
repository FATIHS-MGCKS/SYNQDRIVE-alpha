# Master Admin — Security Audit: Users, Roles, MFA & Audit (UI-9.1)

**Datum:** 2026-08-18  
**Phase:** UI-9.1 (read-only — keine Implementierung)  
**Scope:** Master-Admin-Oberflächen für Identität, Zugriff, MFA, Sessions, Audit und privilegierte Aktionen

**Basis:**
- `docs/remediation/master-admin-mfa.md` (Phase 2A.5)
- `docs/remediation/master-admin-privileged-access.md` (Phase 2A.6)
- `docs/remediation/master-admin-audit-log-hardening.md` (Phase 2A.7)
- `docs/audits/iam-mfa-step-up-2026-07.md`
- `docs/ui/master-admin-canonical-page-framework.md` (UI-2.2)
- UI-1 bis UI-8 Ergebnisse (Navigation, Page Framework, Dashboard, Organizations, Billing, Connected Vehicles, Platform Ops)

**Leitfrage:** Kann ein Master Admin **sofort** erkennen, wer privilegierten Zugriff hat, ob MFA fehlt, welche kritische Aktion zuletzt passierte — und ist jede Privilege-Escalation nachvollziehbar abgesichert?

---

## 1. Executive Summary

Die SynqDrive Master Admin Control Plane verfügt **backend-seitig** über eine ausgereifte IAM-/MFA-/Audit-Remediation (TOTP, Step-up, append-only Audit, strukturierte `MASTER_ADMIN`-Envelopes). **Frontend-seitig** fehlt jedoch eine dedizierte **Security & Access Control Plane**: Benutzer-Verwaltung ist eine generische CRUD-Tabelle ohne MFA-, Session- oder Attention-Signale; Rollen/Permissions existieren nur als flaches Dropdown; Sessions, Security Events und Impersonation haben **keine Master-UI**; Audit und Activity sind vermischt und unvollständig exponiert.

| Stärke (Backend / Remediation) | Schwäche (Master Admin UI) |
|-------------------------------|----------------------------|
| `MasterAdminMfaGuard` + Step-up auf privilegierten `/admin/*`-Mutationen | Kein Security-Hub — MFA nur als Enrollment-Gate, nicht als operatives Signal |
| Strukturierte `ActivityLog` mit `auditDomain: MASTER_ADMIN`, Correlation ID, Reason-Pflicht | `ActivityLogView` zeigt menschenlesbare Beschreibungen ohne Audit-Detail, Export, Diff |
| Org-scoped IAM vollständig (Team, Roles, Access Reviews) — **Rental-App** | Master Admin sieht **keine** Permission-Matrix, keine Role-Detail-Ansicht |
| Immutable audit triggers + Export-API mit `MASTER_AUDIT_EXPORT` | **Kein Export-UI**; Client-seitige Volltextsuche nur auf aktueller Seite |
| Session-Revocation APIs (`/account/me/sessions`, org-scoped revoke) | **Keine Session-UI** im Master Admin |
| Billing-/Voice-Audit-Tabs mit Detail-Drawer | Kein äquivalentes Muster für plattformweites IAM-Audit |

**Kritischste Befunde (P0):**

1. **Keine MFA-Sichtbarkeit für privilegierte Accounts** — Master Admin kann nicht erkennen, welcher `MASTER_ADMIN` kein MFA hat (nur eigenes Enrollment via `MasterMfaGate` / Nav-Badge).
2. **User Delete ohne Reason + unvollständige Step-up-UX** — Backend verlangt `reason` für `DELETE /admin/users/:id` und `PRIVACY_DATA_DELETION` Step-up; UI sendet weder Reason noch dedizierten Bestätigungsflow.
3. **Rollen = UI-Labels, keine echte RBAC-Oberfläche** — `Master Admin` im selben Dropdown wie `Org Admin`/`Worker`; keine Scope-, Permission- oder Escalation-Warnung.
4. **Audit vs. Activity vermischt** — Globales `Activity Log` mischt operative und sicherheitsrelevante Ereignisse; kein dediziertes Security-Events- oder Master-Audit-Hub trotz kanonischer Backend-Daten.
5. **Settings-Integrations mit Fake-Credentials** — `PlatformSettingsView` zeigt DIMO-API-Key-UI mit lokalem Mock-State (`dimo_test_…`) — irreführend für Security-Betrieb.

**Gesamtbewertung:** Backend-Sicherheitsarchitektur **stark**; Master-Admin-Security-UX **fragmentiert und unter Enterprise-Standard**. Empfehlung: UI-9 kanonischer **„Identität & Zugriff“**-Hub (nicht Rental-IAM duplizieren, sondern plattformweite Governance + Audit drilldown).

**Changes / Architektur:** Nicht aktualisiert (read-only Audit).

---

## 2. Page Inventory

### 2.1 Master Admin — vorhandene Oberflächen

| # | Oberfläche | Route / View | Datei | Zweck | Zielgruppe | Source of Truth | Endpoint(s) | Permission | Mutation | Auditierbar |
|---|------------|--------------|-------|-------|------------|-----------------|-------------|------------|----------|-------------|
| 1 | **Platform Users** | `?view=users` | `PlatformUsersView.tsx` | Cross-tenant User-Liste, Invite/Edit/Delete, Passwort-Reset | Master Admin | `GET /admin/users` | `api.users.listAll()` | `MASTER_ADMIN` | Ja (CRUD, password) | Backend `PLATFORM_USER_*` + Interceptor |
| 2 | **Org Users (read-only)** | `?view=organizations&orgId=&orgTab=users` | `OrganizationDetailView.tsx` | Org-scoped User-Tabelle | Master Admin | `GET /admin/users?organizationId=` | `api.users.listAll(orgId)` | `MASTER_ADMIN` | Nein | — |
| 3 | **Activity Log** | `?view=activity-log` | `ActivityLogView.tsx` | Plattformweite Aktivitätsliste | Master Admin | `activity_logs` | `GET /admin/activity-log` | `MASTER_ADMIN` | Nein (read) | N/A |
| 4 | **Org Activity / Audit** | Org-Detail Tab „Aktivität“ | `OrganizationDetailView.tsx` | Toggle operational vs. `ADMIN_OPERATION` | Master Admin | `activity_logs` | `GET /admin/activity-log?organizationId=&entity=` | `MASTER_ADMIN` | Nein | N/A |
| 5 | **MFA Enrollment Gate** | Shell-Wrapper | `MasterMfaGate.tsx` | Blockiert Master-UI bis TOTP enrolled | Master Admin (self) | `GET /account/mfa/status` | Account MFA API | Auth | Enrollment | `MFA_*` events |
| 6 | **MFA Step-up Dialog** | Global Overlay | `MfaStepUpDialog.tsx` | Step-up bei `synqdrive:step-up-required` | Master Admin (self) | `POST /account/mfa/challenge` | Account MFA | Auth | Challenge | Step-up grant/deny |
| 7 | **Account Sheet** | Mobile/Chrome | `MasterAccountSheet.tsx` | Profil, Settings-Link, Logout | Master Admin | `getStoredUser()` | — | — | Nein | — |
| 8 | **Settings — General** | `?view=settings` | `PlatformSettingsView.tsx` | Mock Company Info | Master Admin | **Keine** (lokale Defaults) | — | `MASTER_PLATFORM_SETTINGS` | Fake save toast | Nein |
| 9 | **Settings — E-Mail** | `settingsTab=email` | `PlatformEmailSettingsPanel.tsx` | Platform From/Reply-To | Master Admin | DB | `GET/PUT /admin/email/settings` | `MASTER_ADMIN` + MFA | Ja | `PLATFORM_SETTINGS_UPDATED` |
| 10 | **Settings — Integrations** | `settingsTab=integrations` | `PlatformSettingsView.tsx` | DIMO/Stripe **Mock-UI** | Master Admin | **Lokaler State** | — | — | Fake toggle | Nein |
| 11 | **Billing Audit** | `?view=billing&masterBilling=audit` | `BillingAuditLogTab.tsx` | Billing-spezifisches Audit | Master Admin / Billing | `billing_audit_logs` | `GET /admin/billing/audit-log` | `MASTER_ADMIN` / `master-billing` | Nein | Billing audit table |
| 12 | **Voice Audit** | `?view=voice-assistant&voiceSection=audit` | `VoiceAssistantAdminView.tsx` | Voice CP Audit Events | Master Admin | Voice audit store | `GET …/control-plane/audit-events` | `MASTER_INTEGRATIONS` | Teilweise (replay) | Voice protection audit |
| 13 | **Dashboard Activity Snippet** | `?view=dashboard` | `RightSidebar.tsx` / Dashboard | Recent activity preview | Master Admin | Dashboard DTO | `GET /admin/dashboard` | `MASTER_ADMIN` | Nein | Duplikat |
| 14 | **Login MFA** | `/login` | `LoginPage.tsx` | Master-Admin Login MFA | Alle | Auth | `POST /auth/login/mfa` | Public | Login | `AUTH_EVENT` |

### 2.2 Explizit **nicht** im Master Admin (Backend teils vorhanden)

| Oberfläche | Master UI | Backend / Rental | Anmerkung |
|------------|-----------|------------------|-----------|
| **Rollen & Permissions** | ❌ | ✅ Org `/organizations/:orgId/iam/*`, Rental `users-roles/` | Vollständige IAM-UX nur Tenant-App |
| **Role Detail / Permission Matrix** | ❌ | ✅ Rental | — |
| **Session Management** | ❌ | ✅ `/account/me/sessions`, org revoke | Kein Master-UI |
| **Security Events (IAM)** | ❌ | ✅ Metrics + `UserAccessAuditService` | Kein dedizierter Stream |
| **Audit Export** | ❌ | ✅ `GET /admin/activity-log/export` + MFA | API ohne UI |
| **Impersonation / Support Access** | ❌ | ❌ (kein Actor-Swap) | Cross-org nur via `MASTER_ADMIN` scope |
| **API Credentials / Personal API Keys** | ❌ (Mock in Settings) | `MASTER_API_KEYS` reserviert | Nicht implementiert |
| **Access Reviews** | ❌ | ✅ `/organizations/:orgId/access-reviews` | Nur Org-Admin-Kontext |
| **MFA Reset (other user)** | ❌ | ✅ Org `…/mfa/reset` | Nicht plattformweit im Master |
| **DSAR / Legal Hold** | ❌ | ✅ IAM data retention | Org-scoped |

---

## 3. Master Admin Accounts

**Primäre Datei:** `frontend/src/master/components/PlatformUsersView.tsx`  
**Datenfluss:** `App.tsx` → `api.users.listAll()` beim Boot → in-memory `users` state → Props

### 3.1 Sichtbare Felder (Listenebene)

| Feld | Sichtbar | Quelle | Bewertung |
|------|----------|--------|-----------|
| Name + Avatar | ✓ | `user.name`, Initialen | OK |
| E-Mail | ✓ | `user.email` | PII — listenebene vertretbar für Admin |
| Rolle | ✓ | `user.role` (Display-String) | ⚠ Vermischt Platform- und Membership-Rollen |
| Organisation | ✓ | `user.organizationName` | OK; `platform` für Master Admin |
| Status | ✓ | `Active` / `Inactive` / `Invited` | ⚠ Unvollständig vs. Backend |
| Last Active | ✓ | `lastLoginAt` → `lastActive` | Roh-String, nicht relativ DE |
| **MFA Status** | ❌ | Backend liefert **nicht** in `mapUser()` | **P0 Gap** |
| **Account State (locked)** | ❌ | `UserStatus` nicht differenziert | Gap |
| **Security Attention** | ❌ | — | Gap |
| **Session Count** | ❌ | API existiert org-seitig | Gap |
| **Letzte sicherheitsrelevante Aktion** | ❌ | — | Gap |

### 3.2 Detail-Ebene

Es gibt **keinen User-Detail-Drawer** — alles passiert im `FormDialog` (Edit/Invite). Fehlend für Security-Ops:

- MFA-Faktoren, Enrollment-Datum, Recovery-Codes-Rest
- Aktive Sessions (Device, IP, Last Active)
- Security-Activity-Timeline (`GET …/security-activity` — org-scoped, nicht im Master verdrahtet)
- Role-History / Permission-Effective-Access
- Audit-Trail für diesen User als Target

### 3.3 Datenschutz / PII

- E-Mail in Liste: **akzeptabel** für Master Admin, aber Export/Print nicht abgesichert
- Keine unnötige Telefonnummer/Adresse in Master Users (gut)
- Passwort-Änderung inline im Modal — Passwortfeld sichtbar togglebar (OK mit Vorsicht)

### 3.4 Empfehlung List vs. Detail

| Listenebene (P0–P1) | Detail (P1–P2) |
|---------------------|----------------|
| Name, E-Mail, Rolle, Org, Status, MFA-Chip, Last Login (relativ), Attention-Badge | Sessions, MFA-Faktoren, Security Events, Audit als Target, Role-Änderungen |

---

## 4. Account Status

### 4.1 Kanonische Backend-Zustände

| Ebene | Werte (Prisma / Service) |
|-------|--------------------------|
| `User.status` | `ACTIVE`, `INACTIVE`, `SUSPENDED`, … (`USER_STATUS_MAP`) |
| `MembershipStatus` | `ACTIVE`, `INVITED`, `REMOVED`, … |
| MFA (org IAM) | `VALID`, `EXPIRED`, `ERROR`, `NOT_ENROLLED`, … (`IamTeamService.resolveMfaState`) |

### 4.2 Master UI — sichtbare Zustände

`PlatformUsersView` Filter + Form:

- `Active`, `Inactive`, `Invited` (EN)
- Create default: `Invited`
- **Nicht sichtbar:** Locked, Suspended, Pending MFA, Recovery Required, Expired Invitation (als eigene Badges)

### 4.3 Widersprüche / Lokale States

| Problem | Detail |
|---------|--------|
| **Inactive vs. Suspended** | UI „Inactive“ mappt nicht klar auf `UserStatus` |
| **Invited ohne Backend-Invite-Flow** | Create ruft `POST /admin/users` — nicht `organizationInvites`; Toast „Invitation sent“ irreführend |
| **Optimistic local ID** | `generateId('u')` bei Create vor API-Response — kurzzeitig falsche Identität |
| **Status-Badges EN** | `userAccountStatusTone` ok, Labels nicht DE-kanonisch |

---

## 5. MFA

### 5.1 Implementierte Flows (Master)

| Flow | UI | Backend | Bewertung |
|------|-----|---------|-----------|
| **Enrollment (first login)** | `MasterMfaGate` + `MfaEnrollmentPanel` | `/account/mfa/totp/enroll/*` | ✓ Funktional |
| **Login MFA** | `LoginPage` | `/auth/login/mfa` | ✓ |
| **Step-up (mutations)** | `MfaStepUpDialog` via API 403/event | `StepUpGuard`, `x-step-up-token` | ✓ Global, aber generisch |
| **Nav Badge `mfa-required`** | `useMasterNavBadges` | `api.account.mfa.status()` | ✓ Nur **eigenes** Konto |
| **Recovery Codes** | Nur bei Enrollment-Anzeige | Backend hashed storage | ⚠ Kein Re-View/Rotate UI |
| **MFA Reset (self)** | Nicht in Master Settings | `/account/mfa/reset` + step-up | ❌ UI fehlt |
| **MFA Reset (other)** | Nicht im Master | Org `…/mfa/reset` | ❌ Master-Scope fehlt |
| **Factor Removal** | Nicht exponiert | Backend policies | ❌ |
| **Lost Device** | Login recovery code path only | `/auth/login/mfa` | ⚠ Kein Admin-Runbook-Link |

### 5.2 Kritische Prüfpunkte

| Frage | Ergebnis |
|-------|----------|
| Sieht Master Admin sofort, welcher privilegierter Account **kein MFA** hat? | **Nein** — P0 |
| Sind MFA-Reset-Aktionen ausreichend geschützt? | Backend ja (Step-up); **Master-UI fehlt** |
| Ist Recovery nachvollziehbar? | Audit backend; **UI ohne Timeline** |
| Wird Step-up bei kritischen Aktionen kommuniziert? | Generischer Dialog; **kein Action-Kontext** („Warum Step-up?“) |
| Erscheint MFA als Nebenfeature? | **Ja** — `MasterAccountSheet`: „via Einstellungen“, aber Settings hat **keinen MFA-Tab** |

### 5.3 Feature Flag

`IAM_MFA_MASTER_ADMIN_ENABLED` — wenn `false`, kein Verhalten; UI-Gate existiert unabhängig vom Flag-Status teilweise (Enrollment-Panel).

---

## 6. Roles

### 6.1 Master Admin — sichtbare „Rollen“

Dropdown in `PlatformUsersView`:

`Master Admin` | `Org Admin` | `Sub Admin` | `Worker` | `Driver` | `Customer`

Dies sind **Display-Labels**, keine verwaltbaren Role-Templates.

### 6.2 Backend-Wahrheit

| Konzept | Mechanismus |
|---------|-------------|
| Platform-Rolle | `User.platformRole === 'MASTER_ADMIN'` |
| Membership-Rolle | `MembershipRole` (ORG_ADMIN, …) |
| Org Role Templates | `OrganizationRole` + JSON permissions — **nur Rental/Org API** |
| Billing-only Master | `platformPermissions` includes `master-billing` (`master-nav-permissions.ts`) |

### 6.3 Systemrollen vs. Custom Roles

| Typ | Master UI | Tenant UI (Rental) |
|-----|-----------|-------------------|
| Systemrollen | Hardcoded Dropdown | `IamTeam` + Role Templates |
| Custom Roles | ❌ | ✅ CRUD + Preview/Apply |
| Permission Groups | ❌ | ✅ Modul-Matrix |

### 6.4 Redundanz / Unklarheit

- **„Master Admin“ im Org-User-Kontext** — kann Membership + Platform-Rolle vermischen
- **Keine User-Anzahl pro Rolle** auf Plattformebene
- **Keine „kritische Rolle“-Kennzeichnung** bei Zuweisung

---

## 7. Permissions

### 7.1 Master Admin Permission-Modell (effektiv)

| Mechanismus | Wo |
|-------------|-----|
| `MASTER_ADMIN` JWT role | Voller `/admin/*` Zugriff (mit MFA-Guard auf Subset) |
| `master-billing` permission | Eingeschränkte Rail: Dashboard + Billing only |
| `@RequirePermission` | **Nicht** auf Master-Routen — nur Org-Scoped |

### 7.2 Technische Permission-Namen in UI

**Nicht exponiert** im Master Admin (gut für normale Admins).  
**Problem:** Admins sehen auch **keine** strukturierte Permission-Übersicht für Platform-Ops.

### 7.3 Domänen-Mapping (analyse — nicht übernommen)

Backend-Module (`permission.constants.ts`) — für zukünftigen Hub:

| Domäne | Beispiel-Module | Master sichtbar? |
|--------|-----------------|------------------|
| Organizations | org CRUD | Indirekt (Orgs-View) |
| Billing | `master-billing` | Billing CC |
| Vehicles / DIMO | integrations | Connected Vehicles |
| Platform Operations | admin ops | Platform Ops (UI-8) |
| Users | `users-roles` (org) | Users-View (flach) |
| Security | IAM, MFA | **Nein** |
| Integrations | DIMO, HM, Voice | Teilweise |
| Audit | activity export | Activity Log (partial) |
| System Config | settings, email | Settings |

### 7.4 Gefährliche Kombinationen

Keine UI-Warnung bei:

- Zuweisung `Master Admin` + aktive Org-Membership
- Passwort-Reset + gleichzeitiger Role-Change (separate Aktionen ohne Bundle-Review)

---

## 8. Least Privilege

| Anti-Pattern | Ist-Zustand |
|--------------|-------------|
| „Select All“ Permissions | N/A (keine Matrix) |
| Überbreite Admin-Rolle | Ein `Master Admin` Dropdown-Wert ohne Scope-Erklärung |
| Versteckte kritische Permissions | `master-billing` Rail invisible in Users-UI |
| Fehlende Scope-Erklärung | Org vs. Platform nicht im User-Formular erklärt |
| Privilege-Escalation-Warnung | **Fehlt** bei Role → Master Admin |

**Bewertung:** UI **erschwert** Least Privilege, weil Platform-Admin-Rechte wie normale Org-Rollen aussehen.

---

## 9. Privilege Escalation

Audit privilegierter Mutationen — **Backend vs. Master UI**:

| Aktion | Permission | Step-up MFA | Confirmation UI | Reason UI | Audit Event | Result UI |
|--------|------------|-------------|-----------------|-----------|-------------|-----------|
| User erstellen | `MASTER_ADMIN` + `MASTER_USER_MANAGEMENT` | Ja (Guard) | FormDialog | ❌ | `PLATFORM_USER_CREATED` | Toast only |
| User PATCH (Rolle) |同上 | Ja | FormDialog | ❌ | `PLATFORM_USER_UPDATED` | Toast |
| **User DELETE** | + `PRIVACY_DATA_DELETION` | Ja | `ConfirmDialog` | **❌ P0** | `PLATFORM_USER_DELETED` | Toast; API may 400 |
| Passwort ändern | `PRIVILEGED_PERMISSION_CHANGE` | Ja (API) | Inline section | ❌ | `PLATFORM_USER_PASSWORD_RESET` | Toast |
| Org DELETE | `MASTER_ORGANIZATION` | Ja | Org-View | **❌** (bekannt UI-5) | `ORG_DELETED` | — |
| Master Admin zuweisen | Via user.role/platform | Ja | Keine Extra-Warnung | ❌ | In USER_UPDATED | — |
| MFA reset (other) | org `users-roles.manage` | `MFA_RESET_OTHER_USER` | Rental only | Rental | Outbox | — |
| Platform prune | `BREAK_GLASS` | Ja | — | Backend required | `PLATFORM_PRUNE` | — |
| Audit Export | `MASTER_AUDIT_EXPORT` | Ja | **Kein UI** | — | `AUDIT_EXPORT` | — |

**Rollback:** Kein UI-Rollback für Role-Changes (Backend: RoleVersioning nur org-scoped).

---

## 10. Sessions

### 10.1 Backend (kanonisch)

| API | Scope |
|-----|-------|
| `GET /account/me/sessions` | Eigenes Konto |
| `POST /account/me/sessions/revoke-others` | Step-up `REVOKE_OTHER_USER_SESSIONS` |
| `POST /account/me/sessions/:id/revoke` | Einzelne Session |
| `POST /organizations/:orgId/users/:userId/sessions/revoke-all` | Org-Admin |

Session-Felder (aus Account-DTO): Session-ID, Device-Hinweis, Created, Last Active, Expiry — **kein Location**, sofern nicht kanonisch befüllt.

### 10.2 Master Admin UI

**Komplett fehlend.**

Keine Darstellung von:

- Current Session vs. andere
- „Alle anderen abmelden“
- Schutz der aktuellen Session vor Versehentlich-Revoke
- Verdächtige Sessions (nur Backend-Metriken)

**Bewertung:** P1 — APIs existieren, Security-Hub sollte mindestens **Self-Service Sessions** + **Admin revoke** (org-scoped Link) bieten.

---

## 11. Security Events

### 11.1 Kanonische Event-Typen (Backend)

| Quelle | Events |
|--------|--------|
| `ActivityEntity.AUTH_EVENT` | LOGIN, LOGOUT, AUTH_FAIL, MFA |
| `UserAccessAuditService` | ROLE_CHANGE, MFA_RESET, SESSION_REVOKED, … |
| `MasterAdminAuditAction` | MFA_STEP_UP_GRANTED/DENIED, PRIVILEGED_HTTP_MUTATION, … |
| IAM Observability | Prometheus `iam_login_failures`, step-up denials |

### 11.2 Master UI

| Surface | Security Events? |
|---------|------------------|
| `ActivityLogView` | Teilweise — `LOGIN`/`LOGOUT` Filter, aber **kein Severity/Actor/Target-Diff** |
| Platform Ops Alerts | **Nein** — Alertmanager ≠ IAM |
| Dedicated Security Page | **❌** |

### 11.3 Erwartete Felder vs. UI

| Feld | Activity Log UI | Billing Audit UI |
|------|-----------------|------------------|
| Severity | ❌ | Teilweise (action) |
| Actor | `userName` | `actorUserId` slice |
| Target | `entity` + `entityId` | `entityType` + id |
| Timestamp | ✓ relativ | ✓ |
| Source | ❌ | ❌ |
| Result | ❌ | ❌ |
| Drilldown | ❌ | ✓ Drawer |

**Empfehlung:** Security Events als **eigener Tab** oder gefilterter `auditDomain=MASTER_ADMIN|SECURITY` — nicht mit „Vehicle IMPORT“ vermischen.

---

## 12. Audit Logs

### 12.1 Globale Activity Log UX (`ActivityLogView.tsx`)

| Capability | Status |
|------------|--------|
| Actor | `userName` (optional) |
| Action | `action` Chip |
| Target | `entity` in Meta-Zeile |
| Organization | `organizationName` |
| Time | Relativ + title tooltip |
| Reason | ❌ nicht in Liste |
| Result | ❌ |
| Correlation / Request ID | ❌ |
| IP / User Agent | ❌ (in `metaJson` backend) |
| Before/After | ❌ |
| Server Pagination | ✓ `page`, `limit=50` |
| Server Filter | ✓ `entity`, `action` |
| Client Search | ⚠ `description` **nur aktuelle Seite** |
| Detail Drawer | ❌ |
| Export | ❌ (API: `GET /admin/activity-log/export` + MFA) |
| Retention Hint | ❌ |
| Delete | ❌ (korrekt — append-only) |

### 12.2 Org Audit Mode

`OrganizationDetailView` — `activityMode === 'audit'` → `entity=ADMIN_OPERATION`  
Guter Ansatz, aber:

- Kein Detail
- Kein Export
- Nur 50 Einträge, kein Paging

### 12.3 Billing Audit (Referenzmuster)

`BillingAuditLogTab` — Tabelle + **DetailDrawer**, Actor/Org/Entity — **näher am Ziel** für Master Security Audit.

---

## 13. Audit vs Activity

| Konzept | Soll | Ist |
|---------|------|-----|
| **Activity** | Menschenlesbare Betriebsereignisse (Imports, Syncs, Support) | `ActivityLogView` Titel „Activity Log“ |
| **Audit Log** | Revisionssichere Admin-Nachvollziehbarkeit | Teilweise `ADMIN_OPERATION` Filter nur in Org-Detail |
| **Trennung** | Getrennte Nav/Filter semantik | **Vermischt** in einer Liste |
| **Duplikation** | Ein Datenpfad | Dashboard `recentActivity` + Activity Log + Org Tab |

**UI-8 Finding bestätigt:** Activity Log als Admin-Audit-Ersatz — **unzureichend** für Compliance-Review.

---

## 14. Audit Detail

Aktuell **kein** Audit-Detail im Master Admin für `activity_logs`.

Billing-Audit-Detail zeigt: Datum, Aktion, Entity, Org, Actor, `beforeJson`/`afterJson` — **Vorbild**.

Für Master Security Audit Detail sollte gelten:

- Primär: Wer / Was / Objekt / Wann / Warum / Ergebnis (menschenlesbar)
- Sekundär (Progressive Disclosure): IDs, Correlation, Request, Diff JSON
- **Keine** JSON-Wand als Default

---

## 15. Support / Impersonation

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Impersonation UI | **Nicht vorhanden** |
| Support Access sichtbar | `SupportView` — Tickets only, kein Tenant-Login |
| Backend Actor-Swap | **Nicht implementiert** |
| Cross-org `MASTER_ADMIN` | Scope-Bypass in Guards — **kein Impersonation-Banner** nötig, aber **hohes Risiko** ohne Audit-UX |

**Bewertung:** Korrekt nicht neu erfunden. Dokumentieren, dass **jeder** Master-Admin-Zugriff auf Tenant-Daten als privilegiert gilt und im Audit sichtbar sein muss.

---

## 16. Security Attention Model

### 16.1 Kanonisch verfügbare Signale (nicht in Security-UI gebündelt)

| Signal | Quelle | Master UI |
|--------|--------|-------------|
| Eigenes MFA fehlt | `api.account.mfa.status()` | Nav-Badge + Gate |
| Anderer Master Admin ohne MFA | IAM/DB query möglich | ❌ |
| Account Locked | `User.status` | ❌ |
| Ungewöhnliche Session | Session policy | ❌ |
| Kritische Rollenänderung | Audit outbox | ❌ (nur Activity Log) |
| MFA Reset fehlgeschlagen | Metrics | ❌ |
| Privileged Action Failure | Step-up deny audit | ❌ |

### 16.2 Regel

**Keine Frontend-Risk-Engine** — nur Aggregation kanonischer Backend-Signale in einem **Attention-Banner** (Vorbild: Dashboard `organizationsAttention`, Platform Ops Incidents).

---

## 17. Search & Filter

### 17.1 Users (`PlatformUsersView`)

| Filter | Implementierung | Server? |
|--------|-----------------|---------|
| Name / E-Mail / Org | Client `searchQuery` | ❌ |
| Role | Client select | ❌ |
| Status | Client select | ❌ |
| MFA | ❌ | — |
| Attention | ❌ | — |

**Skalierung:** Alle User einmal geladen — bei großer Tenant-Zahl **P2**.

### 17.2 Audit (`ActivityLogView`)

| Filter | Server? |
|--------|---------|
| Entity | ✓ |
| Action | ✓ |
| Actor | ❌ |
| Time Range | ❌ |
| Organization | ❌ (nur Org-Detail) |
| Result / Severity | ❌ |
| `auditDomain` | ❌ |

**Client description search auf 50 Zeilen** — explizit **verboten** für große Audit-Datasets (Blueprint-konform warnen).

---

## 18. Data Minimization / DSGVO

| Prüfpunkt | Befund |
|-----------|--------|
| Unnötige PII | E-Mail in User-Liste OK; kein Vollexport |
| Volle IPs in UI | Nicht gezeigt (gut) — Export ungeprüft ohne UI |
| User-Agent | Nicht in Activity UI |
| Technische Secrets | **P0:** Fake DIMO API Key in Settings |
| Credentials CRUD | Nicht real — Mock verwirrt |
| Passwort min. 6 Zeichen | Schwach für Admin-Reset (Backend may enforce stricter) |

---

## 19. Privacy & Export

| Export | Existiert | Permission | UI |
|--------|-----------|------------|-----|
| `GET /admin/activity-log/export` | ✓ JSON/CSV | `MASTER_ADMIN` + `MASTER_AUDIT_EXPORT` step-up | ❌ |
| Billing audit | Read API | Master/Billing | In-App only |
| DSAR | Org IAM | Step-up | ❌ Master |

**Export-Audit:** Backend schreibt `AUDIT_EXPORT` — ohne UI kein operativer Workflow.

---

## 20. Responsive

| Surface | Mobile | Tablet | Desktop | Anmerkung |
|---------|--------|--------|-----------|-----------|
| Users | Filter stack ✓ | Table horizontal scroll | OK | Kein Card-Fallback |
| Roles/Permissions | N/A | N/A | N/A | — |
| MFA Enrollment | `MfaEnrollmentPanel` zentriert | OK | OK | — |
| Sessions | N/A | — | — | — |
| Activity Log | Filter wrap | Tabelle scroll | OK | Kein Detail |
| Billing Audit | Tabelle `min-w-[800px]` | Scroll | OK | Drawer ok |

**Permission-Matrix:** Nur Rental — Master nicht betroffen.

---

## 21. Accessibility

| Prüfpunkt | Befund |
|-----------|--------|
| Tabellen | `DataTable` semantisch ok |
| Status | Icons + Text in Users StatusChip ✓ |
| MFA Flows | Enrollment-Panel — Focus-Management ungeprüft |
| Confirmation Dialogs | `ConfirmDialog` / `FormDialog` — Radix-basiert ✓ |
| Row Actions Users | **Keine** `aria-label` auf Edit/Delete Icons |
| Sprache | EN in Security-kritischen Flows (Delete User, Password) |
| Touch Targets | `MasterAccountSheet` min-h 44px ✓ |
| Error Messaging | API errors als Toast — teils EN |

---

## 22. Technical Architecture

### 22.1 RBAC Source of Truth

```
JWT (platformRole, platformPermissions)
  → RolesGuard / MasterBillingGuard
  → MasterAdminMfaGuard (mutations)
  → StepUpGuard (action-specific)
Org-scoped: EffectiveAccessEngine + module JSON permissions (Rental only)
```

**Frontend ersetzt keine Permissions** — korrekt.  
**Aber:** UI zeigt keine effektiven Rechte; User-Liste ist **kein** Autorisierungs-Tool.

### 22.2 Data Flow Risiken

| Risiko | Detail |
|--------|--------|
| Bulk user load in `App.tsx` | Stale state, kein per-user refresh |
| Optimistic `onAddUser` / `onUpdateUser` | Lokaler State vor API-Bestätigung |
| `api.users.delete` ohne body | Reason/Step-up mismatch |
| Activity Log kein cache | OK — immer fresh |
| MFA status nur Nav-Badge | Nicht im Security-Kontext persistiert |

### 22.3 APIs nicht angebunden (Master)

- `GET /admin/users/:id` — existiert, ungenutzt
- `GET /admin/activity-log/export` — ungenutzt
- `GET /account/me/sessions` — ungenutzt
- Org IAM APIs — nur Rental

---

## 23. Duplicate Truth Risks

| # | Risiko | Domänen |
|---|--------|---------|
| 1 | Activity vs. Audit vs. Dashboard recent | Activity Log, Dashboard, Org Tab |
| 2 | Platform Users vs. Org Users vs. Rental IAM Team | Drei Wahrheiten für „Wer hat Zugriff?“ |
| 3 | Role Dropdown vs. `platformRole` vs. `membership.role` | User Form |
| 4 | Billing Audit vs. Activity `ADMIN_OPERATION` | Cross-charge disputes |
| 5 | Settings DIMO „connected“ vs. echte Integration Health | Platform Ops / Connected Vehicles |
| 6 | MFA enrolled (Gate) vs. Team `mfaState` (org) | Plattform- vs. Tenant-Ebene |

---

## 24. Findings P0 / P1 / P2 / P3

### P0 — Sicherheit / Compliance / Irreführung

| ID | Finding |
|----|---------|
| P0-1 | Keine MFA-Status-Sicht für Master-Admin-Accounts (nur Self) |
| P0-2 | `DELETE /admin/users` ohne Reason-UI — widerspricht `MasterAdminPrivilegedAuditInterceptor` |
| P0-3 | `Master Admin` Rolle zuweisbar ohne Escalation-Warnung / separaten Flow |
| P0-4 | Kein dedizierter Master Security/Audit-Hub trotz Export-API und `MASTER_ADMIN` Envelope |
| P0-5 | Settings Integrations zeigt Fake API Key / DIMO connected — Security-Irreführung |

### P1 — Operative Sichtbarkeit

| ID | Finding |
|----|---------|
| P1-1 | Keine Session-Management-UI (Self + Admin revoke) |
| P1-2 | Activity Log vermischt Audit und Betrieb; kein `auditDomain`-Filter |
| P1-3 | Kein Audit-Detail (Correlation, Reason, Diff) |
| P1-4 | Audit-Export-API ohne UI + Step-up Flow |
| P1-5 | `MasterAccountSheet` verweist MFA auf Settings — **toter Link** |
| P1-6 | User Delete/Password ohne kontextualisierten Step-up (welche Aktion?) |
| P1-7 | Keine Security-Attention-Aggregation (locked, MFA missing, step-up denies) |

### P2 — UX / Skalierung

| ID | Finding |
|----|---------|
| P2-1 | Users: nur Client-Suche/Filter, kein Server-Paging |
| P2-2 | Activity: Client description search nur auf 50 Rows |
| P2-3 | EN UI in Security-Flows; nicht UI-2 DE-kanonisch |
| P2-4 | Kein User-Detail-Drawer (Sessions, MFA, Security Activity) |
| P2-5 | Org Users read-only ohne Link zu Rental IAM |
| P2-6 | Status-Modell unvollständig (Suspended, Locked, …) |

### P3 — Polish

| ID | Finding |
|----|---------|
| P3-1 | Last Active als Roh-ISO/String |
| P3-2 | Row-Action Icons ohne `aria-label` |
| P3-3 | Dashboard Activity dupliziert Activity Log |
| P3-4 | Invite-Flow Copy vs. tatsächlichem `POST /admin/users` |
| P3-5 | Passwort-Minimum 6 Zeichen im UI-Hint |

---

## 25. Recommended Target State

### 25.1 Kanonischer Hub: „Identität & Zugriff“ (UI-9.2 Blueprint — Vorschlag)

```
?view=security-access
├── Übersicht          — Attention: MFA missing, locked, recent privileged changes
├── Benutzer           — Platform users + MFA + Attention (Server-paged)
│   └── Detail         — Sessions, MFA, Security Activity, Audit as target
├── Master-Admins      — Gefiltert: platformRole=MASTER_ADMIN, MFA Pflicht
├── Audit              — auditDomain filter, Export, Detail Drawer
├── Security Events    — AUTH + IAM + step-up denies (nicht Ops-Alerts)
└── Eigene Sicherheit  — MFA enroll/rotate, Sessions, Recovery (ersetzt Settings-Dead-End)
```

### 25.2 Nicht duplizieren

- **Org Role Templates / Permission Matrix** → Link in Org-Detail zu Rental IAM oder eingebetteter Read-only Effective-Access
- **Impersonation** → nicht erfinden; stattdessen Audit für cross-org Master-Zugriff
- **Ops Alerts** → bleiben in Platform Ops (UI-8)

### 25.3 Verbindliche Prinzipien (aus Remediation)

1. Jede privilegierte Mutation: Permission + Step-up + Reason (wo required) + Audit + Result
2. MFA ist **Control-Plane-Requirement**, nicht Settings-Unterpunkt
3. Audit Export nur mit `MASTER_AUDIT_EXPORT` + Step-up
4. Keine zweite Permission-Wahrheit im Frontend
5. Activity ≠ Audit — getrennte Tabs, gemeinsame `activity_logs` Quelle mit Filtern

### 25.4 Referenz-Implementierungen im Repo

| Muster | Von | Übernehmen für |
|--------|-----|----------------|
| Detail Drawer + Diff | `BillingAuditLogTab` | Master Audit Detail |
| Attention List | `MasterDashboardView` organizationsAttention | Security Attention |
| Step-up Dialog | `MfaStepUpDialog` | Kontextualisieren (action label) |
| IAM Team / MFA chips | Rental `TeamTab` | Master Admin Liste |
| Page Shell | UI-2 `MasterPageHeader` + Tabs | Security Hub |

---

## 26. Scores (0–100)

| Kriterium | Score | Kurzbegründung |
|-----------|-------|----------------|
| **Account Clarity** | 42 | Liste ok, kein Detail, kein MFA |
| **MFA Clarity** | 38 | Gate/Step-up gut, keine Ops-Sicht, toter Settings-Link |
| **Role/Permission Clarity** | 28 | Dropdown only, kein RBAC-UI |
| **Least-Privilege UX** | 35 | Master Admin wie normale Rolle |
| **Privileged-Action Safety** | 48 | Backend stark, UI Reason/Context lückenhaft |
| **Session Security UX** | 15 | Keine UI |
| **Audit Usability** | 40 | Liste ohne Detail/Export/Domain-Filter |
| **Security Awareness** | 32 | Kein Attention-Modell, keine Security Events |
| **Data Minimization** | 55 | Wenig PII-Leak; Fake Credentials minus |
| **Responsive UX** | 58 | Tables scrollen, keine Matrix |
| **Accessibility** | 50 | Basis ok, EN + fehlende Labels |
| **Technical Cleanliness** | 45 | Bulk state, ungenutzte APIs, Mock Settings |

**Gewichteter Gesamt-Score: ~39/100** — Backend-Remediation nicht in Master-UI angekommen; **hohe Priorität für UI-9**.

---

## Anhang A — Datei-Index (Security-relevant)

```
frontend/src/master/components/PlatformUsersView.tsx
frontend/src/master/components/ActivityLogView.tsx
frontend/src/master/components/MasterMfaGate.tsx
frontend/src/master/components/MasterAccountSheet.tsx
frontend/src/master/components/PlatformSettingsView.tsx
frontend/src/master/components/OrganizationDetailView.tsx  (users, activity/audit tabs)
frontend/src/master/components/billing/BillingAuditLogTab.tsx  (Referenz)
frontend/src/master/navigation/useMasterNavBadges.ts
frontend/src/master/navigation/master-nav-permissions.ts
frontend/src/components/mfa/MfaStepUpDialog.tsx
frontend/src/components/mfa/MfaEnrollmentPanel.tsx
frontend/src/lib/api.ts  (users, activityLog, account.mfa, sessions)
backend/src/modules/users/users.controller.ts
backend/src/modules/iam-mfa/*
backend/src/modules/activity-log/*
backend/src/shared/interceptors/master-admin-privileged-audit.interceptor.ts
frontend/src/rental/components/users-roles/*  (Tenant IAM — nicht Master, aber Referenz)
```

## Anhang B — Abgrenzung UI-8 Platform Ops

| UI-8 Platform Ops | UI-9 Security |
|-------------------|---------------|
| Plattformbetrieb, Incidents, Queues | Identität, MFA, RBAC, Audit |
| Alertmanager / Infra Alerts | IAM Security Events |
| Worker/Scheduler Health | Session/Auth Health |
| Diagnostics (Poll Logs) | Audit Export, Privileged Action Trail |

Keine Vermischung in einem Hub — **Cross-Link** von Security Attention → Platform Ops nur bei infra-bedingten Auth-Ausfällen.

---

**Ende UI-9.1 — Read-only. Keine Implementierung in diesem Schritt.**
