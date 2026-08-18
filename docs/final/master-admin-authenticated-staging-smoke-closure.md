# Master Admin — Authenticated Staging Smoke Closure (UI-STAGING-SMOKE)

| Feld | Wert |
|------|------|
| **Dokument-ID** | `master-admin-authenticated-staging-smoke-closure` |
| **Blocker** | A5 — `UI-STAGING-SMOKE` |
| **Execution mode** | **Authenticated production read-only smoke** (Staging existiert nicht; explizit freigegeben) |
| **Datum (UTC)** | 2026-08-18 (Update: Provisioning-Analyse) |
| **Abschlussstatus** | **PARTIALLY CLOSED** |
| **Agent-Run** | `bc-01a012c9-ae0d-7e99-baa2-ea36f3926608` |

---

## Kompakte Zusammenfassung

| Metrik | Wert |
|--------|------|
| **Dedizierte Staging-Umgebung** | **Nicht vorhanden** (`staging.synqdrive.eu` nicht erreichbar) |
| **Approved execution** | Production `https://app.synqdrive.eu` — **strict read-only** (keine Mutationen) |
| **Login-Methode** | Normaler Browser-Login → `POST /api/v1/auth/login` (kein Clerk Server API erforderlich) |
| **Deployed Backend SHA** | `3b0caf1e2c49e4c08a317fbfcdecb0c899cb731d` |
| **Production Release** | `20260818142436_v4994` |
| **Frontend Asset (live)** | `assets/index-Dn0wo6ra.js` |
| **MASTER_ADMIN Smoke Account** | **Nicht provisionierbar** — kein kanonischer Weg für zusätzlichen temporären `MASTER_ADMIN` (siehe §2) |
| **Authentifizierte Workflows A–F** | **Nicht ausgeführt** (Provisioning- + Credential-Blocker) |
| **Unauth Auth-Gate + API 401** | **PASS** |
| **Final Status** | **PARTIALLY CLOSED** |

**Hinweis:** Es wird **nicht** behauptet, dass Staging existiert. Der Dateiname bleibt aus historischen Gründen; der tatsächliche Modus ist **authenticated production read-only smoke**.

---

## 1. Production Baseline (2026-08-18T15:21Z)

| Feld | Wert |
|------|------|
| **Environment** | Production VPS (Hostinger `srv1374778`) |
| **URL** | `https://app.synqdrive.eu` |
| **Backend / Release SHA** | `3b0caf1e2c49e4c08a317fbfcdecb0c899cb731d` |
| **Release ID** | `20260818142436_v4994` |
| **Frontend Asset** | `index-Dn0wo6ra.js` |
| **Browser (unauth pass)** | Chromium (Cloud Agent computerUse) |
| **Viewport (unauth pass)** | Desktop + iPhone XR 414×896 |
| **`GET /api/v1/health`** | `200` `{"status":"ok"}` |
| **Login erreichbar** | `200` `/login` |
| **Master UI Route** | `/master` → Redirect `/login` (unauth) |

### Sicherheitsrahmen (read-only)

**Verboten und nicht ausgeführt:** Org-/Billing-/Vehicle-/DIMO-/Security-/Integration-Mutationen, Zahlungen, Reconcile-Mutation, Alerts/Queues/Backups, Messaging/Voice.

**Erlaubt (wenn authentifiziert):** Login, Navigation, GET/read-only APIs, Suche/Filter/Tabs, Drilldowns, Back/Forward, Refresh, sichere GET-Negativtests.

---

## 2. Canonical Provisioning Path Analysis

Gemäß Auftrag §1 wurde geprüft, ob ein **sicherer kanonischer Weg** existiert, einen **zusätzlichen** temporären `MASTER_ADMIN` für Acceptance-Tests zu provisionieren.

### 2.1 Geprüfte Pfade

| Pfad | Kanonisch? | Ergebnis für temporären Smoke-Account |
|------|------------|----------------------------------------|
| `POST /api/v1/auth/seed-admin` (`AuthController.seedAdmin`) | Ja (Bootstrap) | **Nicht nutzbar** — erstellt nur den **ersten** `MASTER_ADMIN`, wenn keiner existiert; auf Production existieren bereits aktive Master-Admins → Endpoint liefert „Admin already exists“ |
| `POST /api/v1/admin/users` (`UsersController.adminCreate`) | Ja (Platform User Mgmt) | **Nicht nutzbar** — erstellt regulären User **ohne** `platformRole: MASTER_ADMIN`; kein Follow-up-API zum Rollen-Grant gefunden |
| `POST /api/v1/admin/organizations/:id/admin` | Ja (Org Admin) | **Nicht nutzbar** — erstellt **ORG_ADMIN** innerhalb einer Organisation, nicht Plattform-`MASTER_ADMIN` |
| `SecurityGovernanceController` / Security Hub UI | Read-only + Session/MFA-Mutationen | **Kein Create/Escalate-Endpoint** — `RoleEscalationDialog` im Frontend ist **nicht** an ein Backend angebunden |
| `DELETE /api/v1/admin/users/:id` (`MasterAdminUserDeletionController`) | Ja (Lifecycle Cleanup) | Nur **Cleanup** nach existierendem Account — kein Provisioning |
| NestJS Ops-Skripte (`NestFactory.createApplicationContext`) | Ja (Ops-Pattern) | Vorhanden für Billing/E2E — **kein** Master-Admin-Smoke-Provisioner im Repo |
| Direkter SQL / manuelle Prisma-Updates | — | **Explizit verboten** |

### 2.2 MFA Policy (Production)

| Prüfung | Ergebnis |
|---------|----------|
| `IAM_MFA_MASTER_ADMIN_ENABLED` auf VPS | **Nicht gesetzt** (Default: Master-Admin-MFA-Login-Gate inaktiv) |
| Kanonische Policy bei aktivem Flag + unenrolled User | Passwort-Login erlaubt bis Enrollment (`AuthMfaLoginService.evaluateMasterAdminLoginGate`) |
| MFA umgehen/deaktivieren für Test | **Nicht durchgeführt** — nicht erforderlich bei aktuellem Prod-Flag |

### 2.3 STOP-Entscheidung (Provisioning)

**Kein kanonischer sicherer Provisioning-Weg für einen zusätzlichen temporären `MASTER_ADMIN` auf Production.**

Folgeaktionen **nicht** ausgeführt:

- Kein temporärer Account erstellt
- Kein Passwort generiert
- Kein authentifizierter Smoke A–F
- Kein Cleanup

**Fehlende Voraussetzung:** Entweder (a) ein dedizierter, auditierbarer **Master-Admin Smoke Provisioning**-Pfad (Service/API/CLI) für zusätzliche temporäre Accounts, oder (b) manuell bereitgestellte `MASTER_ADMIN_SMOKE_*` Secrets für einen bereits existierenden freigegebenen Testaccount.

---

## 3. Test Account

| Feld | Status |
|------|--------|
| Temporärer dedizierter Smoke-Account | **Nicht provisioniert** (§2 STOP) |
| `MASTER_ADMIN_SMOKE_EMAIL` | **Nicht injiziert** |
| `MASTER_ADMIN_SMOKE_PASSWORD` | **Nicht injiziert** |
| `MASTER_ADMIN_SMOKE_MFA_OTP` | **Nicht injiziert** (optional) |
| `CLERK_SECRET_KEY` | **Nicht erforderlich** für Browser-Login |

**Credentials wurden nicht** committed, geloggt, gescreenshotet oder in Reports geschrieben.

---

## 4. Login / Authentication

| Prüfung | Ergebnis | Evidenz |
|---------|----------|---------|
| Login erfolgreich (MASTER_ADMIN) | **NOT TESTABLE** | Keine Smoke-Credentials |
| MFA (falls aktiv) | **NOT TESTABLE** | — |
| Master-Admin-Route nach Login | **NOT TESTABLE** | — |
| Sidebar / User Identity (auth) | **NOT TESTABLE** | — |
| Session bei Navigation | **NOT TESTABLE** | — |
| Refresh mit Session | **NOT TESTABLE** | — |
| UI Route Guard (unauth) | **PASS** | `/master` → `/login` |
| Deep Link Guard (unauth) | **PASS** | `/master?view=organizations` → `/login` |
| Admin GET APIs ohne Token | **PASS** | Konsistent `401` (§13) |
| Invalid JWT | **PASS** | `401` |

---

## 5–10. Workflows A–F

Alle authentifizierten Workflow-Durchläufe: **NOT TESTABLE** — Login nicht möglich ohne `MASTER_ADMIN_SMOKE_*` Secrets.

| Workflow | Auth | Navigation | Data | Source of Truth | Security | Result |
|----------|------|------------|------|-----------------|----------|--------|
| **A Organization** | NOT TESTABLE | NOT TESTABLE | NOT TESTABLE | NOT TESTABLE | PARTIAL (401 API) | **NOT TESTABLE** |
| **B Billing** | NOT TESTABLE | NOT TESTABLE | NOT TESTABLE | NOT TESTABLE | PARTIAL (401 API) | **NOT TESTABLE** |
| **C Vehicle/DIMO** | NOT TESTABLE | NOT TESTABLE | NOT TESTABLE | NOT TESTABLE | PARTIAL (401 API) | **NOT TESTABLE** |
| **D Operations** | NOT TESTABLE | NOT TESTABLE | NOT TESTABLE | NOT TESTABLE | PARTIAL (401 API) | **NOT TESTABLE** |
| **E Security** | NOT TESTABLE | NOT TESTABLE | NOT TESTABLE | NOT TESTABLE | PARTIAL (401 API) | **NOT TESTABLE** |
| **F Integrations** | NOT TESTABLE | NOT TESTABLE | NOT TESTABLE | NOT TESTABLE | PARTIAL (401 API) | **NOT TESTABLE** |

**Incident-spezifisch:** Ohne Auth nicht prüfbar; fehlender aktiver Incident wäre **kein FAIL**, sofern Operations-Navigation read-only verifiziert werden kann — hier **NOT TESTABLE**.

---

## 11. Cross-Workflow Source of Truth

**NOT TESTABLE** — erfordert authentifizierte Lese-Durchläufe über mehrere Hubs.

---

## 12. Navigation (authenticated)

**NOT TESTABLE** — Sidebar active state, Tabs, Back/Forward mit Session, Filter-Persistenz.

**Unauth-Subset:** Deep-Link-Schutz **PASS**.

---

## 13. Mobile Authenticated Smoke

**NOT TESTABLE** (auth). **Unauth-Subset:** Mobile Login-Layout ohne horizontalen Overflow **PASS**.

---

## 14. Console / Network

### Unauth Login-Load (Production)

| Signal | Ergebnis |
|--------|----------|
| Unerwartete 401/403 auf Login-Load | Keine |
| 5xx | Keine |
| Chunk / Asset 404 | Keine |
| Hydration / uncaught JS | Keine (1 CSP inline-block — erwartet) |
| Request Loops | Keine |
| Secrets in Payloads | Keine beobachtet |

### Admin GET APIs (ohne Token) — erwartete 401

| Endpoint | HTTP |
|----------|------|
| `/api/v1/admin/dashboard/operational` | 401 |
| `/api/v1/admin/organizations` | 401 |
| `/api/v1/admin/billing/overview/operational` | 401 |
| `/api/v1/admin/vehicles/operational/overview` | 401 |
| `/api/v1/admin/ops/overview` | 401 |
| `/api/v1/admin/ops/incidents` | 401 |
| `/api/v1/admin/security/attention-summary` | 401 |
| `/api/v1/admin/security/users` | 401 |
| `/api/v1/admin/platform-integrations/overview` | 401 |
| `/api/v1/admin/connectivity/platform-summary` | 401 |

---

## 15. Findings

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| **SMOKE-PROV-001** | **P0 (Gate)** | Kein kanonischer Provisioning-Weg für zusätzlichen temporären `MASTER_ADMIN` auf Production | **OPEN** |
| **SMOKE-AUTH-001** | **P0 (Gate)** | Weder provisionierter noch injizierter Smoke-Login verfügbar | **OPEN** |
| **SMOKE-ENV-001** | Info | Kein Staging-Host; Production read-only explizit freigegeben | **ACCEPTED** |
| **SMOKE-PASS-001** | Info | Unauth UI + API 401 Enforcement | **VERIFIED** |

---

## 16. Evidence

| Artefakt | Pfad |
|----------|------|
| Master redirect | `/opt/cursor/artifacts/smoke_unauth_master_redirect.png` |
| Login desktop | `/opt/cursor/artifacts/smoke_unauth_login_desktop.png` |
| Orgs blocked | `/opt/cursor/artifacts/smoke_unauth_master_orgs_blocked.png` |
| Login mobile | `/opt/cursor/artifacts/smoke_unauth_login_mobile.png` |
| Unauth report | `/opt/cursor/artifacts/smoke_test_report_master_admin_staging.md` |
| Deploy SHA evidence | `docs/final/master-admin-a1-ui-production-deploy-closure.md` |

---

## 17. Final Status — **PARTIALLY CLOSED**

**Begründung:** Production read-only smoke ist freigegeben, aber **Provisioning STOP** (§2) — kein kanonischer Weg für temporären `MASTER_ADMIN`. Ohne Account/Login sind Workflows A–F **NOT TESTABLE** (nicht FAIL).

**Nicht CLOSED weil:**

- Kein temporärer dedizierter Smoke-Account provisioniert
- Kein erfolgreicher authentifizierter Production-Login
- Workflows A–F nicht read-only navigiert
- Cross-Workflow SoT nicht verglichen
- Account-Cleanup nicht durchgeführt (kein Account)

### Reconciliation

`docs/final/master-admin-final-closure-reconciliation.md` — **unverändert** (`UI-STAGING-SMOKE` bleibt BLOCKING BEFORE PRODUCTION).

---

## 18. Required Actions to reach CLOSED

**Option A — Secrets (schnellster Pfad, wenn Account bereits existiert):**

1. Dedizierten freigegebenen `MASTER_ADMIN` Testaccount manuell anlegen (außerhalb dieses Agents, mit Governance)
2. `MASTER_ADMIN_SMOKE_EMAIL` + `MASTER_ADMIN_SMOKE_PASSWORD` als Cloud-Agent Secrets
3. Cloud Agent neu starten → read-only Smoke A–F

**Option B — Produkt/Ops (kanonischer Pfad fehlt):**

1. Implementieren: auditierbarer **temporary master-admin smoke provisioner** (Service oder `backend/scripts/ops/master-admin-smoke-lifecycle.ts` mit setup→smoke→cleanup)
2. Muss `platformRole: MASTER_ADMIN`, Passwort-Set, Audit (`PLATFORM_USER_CREATED` / Reason), und **DISABLED**/Deletion-Cleanup unterstützen
3. **Kein** SQL-Bypass, **kein** MFA-Bypass

4. Bei **CLOSED:** `UI-STAGING-SMOKE` aus Reconciliation §11 entfernen; Final Decision neu berechnen

**Kein `CLERK_SECRET_KEY` erforderlich** — Login erfolgt über `POST /api/v1/auth/login`.

---

**Changes / Architektur:** `architecture/MASTER_ADMIN_PRODUCTION_CERTIFICATION_2026-08-18.md` (Condition #2 — partial).
