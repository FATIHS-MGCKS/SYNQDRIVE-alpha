# Master Admin Remediation — Phase 2G.5 — DSGVO / ISO Compliance Review

**Date:** 2026-07-26  
**Scope:** Master-Admin-Control-Plane (`/master`, `/api/v1/admin/*`, platform operators, billing control plane)  
**Branch:** `cursor/master-admin-compliance-review-2g5-b5f0`  
**Disclaimer:** Technische Alignments-Bewertung — **kein ISO/IEC 27001-Zertifizierungsurteil** und **keine Rechtsberatung** zu DSGVO.

---

## 1. Executive summary

| Kriterium | Bewertung | Score |
|-----------|-----------|-------|
| DSGVO | ⚠️ Teilweise | **3 / 5** |
| ISO 27001 Best Practices | ⚠️ Teilweise | **3 / 5** |
| Least Privilege | ⚠️ Teilweise | **3 / 5** |
| Separation of Duties | ❌ Schwach | **2 / 5** |
| Auditierbarkeit | ⚠️ Teilweise | **3 / 5** |
| Nachvollziehbarkeit | ⚠️ Teilweise | **4 / 5** |
| Datenminimierung | ⚠️ Teilweise | **3 / 5** |
| Löschkonzepte | ⚠️ Teilweise | **3 / 5** |
| Logging | ⚠️ Teilweise | **3 / 5** |
| Zugriffsschutz | ⚠️ Überwiegend | **4 / 5** |

**Gesamtbewertung: 3.1 / 5 — Conditional compliance**

Die Plattform verfügt über **reife IAM-, Retention- und Audit-Module** auf Mandantenebene. Die **Master-Admin-Control-Plane** konzentriert jedoch weiterhin weitreichende Privilegien (`MASTER_ADMIN` cross-tenant bypass) und enthält **kritische Ausnahmen** (insbesondere `prune` und Master-User-Hard-Delete), die DSGVO- und ISO-Anforderungen an Nachweisbarkeit, Löschung und SoD nicht vollständig erfüllen.

---

## 2. Bewertungsmaßstab

| Score | Bedeutung |
|-------|-----------|
| **5** | Erfüllt — technisch und organisatorisch nachweisbar umgesetzt |
| **4** | Überwiegend erfüllt — kleine dokumentierte Lücken |
| **3** | Teilweise erfüllt — Controls vorhanden, Lücken in Control-Plane |
| **2** | Schwach — wesentliche Lücken, Remediation erforderlich |
| **1** | Nicht erfüllt — kritisches Risiko |

---

## 3. Control-Plane-Inventar

### 3.1 Master Admin Oberflächen

| Surface | Pfad | Guard |
|---------|------|-------|
| Platform Admin API | `/api/v1/admin/*` | `@Roles('MASTER_ADMIN')` |
| Master Admin UI | `/master/*` | `ProtectedRoute platformRole=MASTER_ADMIN` |
| Platform Users | `GET/POST/PATCH/DELETE /admin/users*` | `MASTER_ADMIN` |
| Organizations (platform) | `organizations.controller` | `MASTER_ADMIN` |
| Billing control plane | `billing.controller` + `MasterBillingGuard` | `MASTER_ADMIN` oder `master-billing` permission |
| Activity log (cross-tenant) | `GET /admin/activity-log` | `MASTER_ADMIN` |
| Voice / DIMO / HM admin | jeweilige `*-admin.controller` | `MASTER_ADMIN` |

### 3.2 Hochriskante Operationen

| Operation | Endpoint | Risiko |
|-----------|----------|--------|
| **Prune all tenant data** | `POST /admin/prune` | Löscht Orgs, Users, Vehicles, Billing, **ActivityLog** |
| Master user hard delete | `DELETE /admin/users/:id` | Umgeht GDPR-Pseudonymisierung |
| Org delete | Platform org routes | Kein dediziertes Audit in Controller |
| Hardware backfill | `POST /admin/vehicles/hardware-backfill` | Cross-tenant vehicle mutation |
| Seed admin bootstrap | `POST /auth/seed-admin` | Break-glass wenn `ENABLE_SEED_ADMIN` aktiv |

---

## 4. Kriterien-Bewertung

### 4.1 DSGVO (Datenschutz-Grundverordnung)

**Score: 3 / 5 — ⚠️ Teilweise erfüllt**

| Art. / Prinzip | Bewertung | Evidenz | Lücke |
|----------------|-----------|---------|-------|
| **Art. 5 — Datenminimierung** | ⚠️ | Notification-Minimierung, Billing-Audit-Sanitisierung, DSAR-Export strukturiert | Master Admin `GET /admin/users` liefert volle User-Records |
| **Art. 5 — Speicherbegrenzung** | ⚠️ | IAM-Retention-Worker, Notification-/Document-/Voice-Retention-Scheduler | `IAM_DATA_RETENTION_ENABLED=false` default; ActivityLog-Retention oft deaktiviert |
| **Art. 15 — Auskunft** | ✅ (org) / ⚠️ (platform) | `iam-dsar-export.service.ts`, Step-up `PRIVACY_DATA_EXPORT` | Kein plattformweiter DSAR-Endpunkt für Master Admin |
| **Art. 17 — Löschung** | ⚠️ | `iam-user-deletion.service.ts` — Assessment, Pseudonymisierung, Legal Hold | `DELETE /admin/users/:id` hard delete ohne Assessment |
| **Art. 25 — Privacy by Design** | ⚠️ | OrgScopingGuard, PII-Scrub in ActivityLogService | AuditService ohne Scrub; prune zerstört Nachweise |
| **Art. 30 — VVT** | 📋 Org | Klassifikation in `notification-data-classification.ts`, IAM-Retention-Docs | Kein dediziertes VVT nur für Control Plane |
| **Art. 32 — Sicherheit** | ⚠️ | JWT, bcrypt, MFA Step-up (org), RBAC | `MASTER_ADMIN` Superuser; prune ohne Step-up |

**Fazit DSGVO:** Mandanten-IAM-Pfad ist **architektonisch DSGVO-orientiert**. Die **Master-Admin-Control-Plane** nutzt diesen Pfad nicht konsistent (Hard-Delete, Prune, fehlende Plattform-DSAR-Prozedur).

---

### 4.2 ISO 27001 Best Practices

**Score: 3 / 5 — ⚠️ Teilweise erfüllt**

Referenz: `docs/audits/data/iam-iso27001-control-alignment-2026-07.csv` (technische Alignment-Matrix, Juli 2026 — teilweise durch spätere IAM-Features überholt).

| ISO-orientiertes Thema | CSV-Stand (Jul 2026) | Aktueller Stand (Jul 2026 Code) | Bewertung |
|------------------------|----------------------|----------------------------------|-----------|
| Identity Management | PARTIAL | Global User + Membership; Multi-org switch | ⚠️ |
| Authentication | PARTIAL | bcrypt, refresh tokens; MFA Step-up wenn enforced | ⚠️ |
| Access Provisioning | PARTIAL | Invites, role templates | ⚠️ |
| Privileged Access | PARTIAL | `MASTER_ADMIN`, `ORG_ADMIN` bypass | ❌ für Platform |
| Segregation of Duties | MISSING | Workflow maker-checker; **kein** Platform prune dual-control | ❌ |
| Logging | PARTIAL | ActivityLog, IAM audit codes, Billing audit | ⚠️ |
| Information Deletion | PARTIAL | Retention scheduler; prune risk | ⚠️ |
| Data Masking | PARTIAL | ActivityLogService scrub; AuditService gap | ⚠️ |
| Periodic Access Review | MISSING → **implementiert** | `iam-access-review.controller.ts` (org-scoped) | ⚠️ org only |
| Incident Management | PARTIAL | AUTH_FAIL, refresh reuse revoke | ⚠️ |

**Fazit ISO:** Technische Controls **überwiegend PARTIAL**. Access Review und MFA Step-up wurden nach CSV ergänzt, gelten aber **primär org-scoped**, nicht für `MASTER_ADMIN`-Konten.

---

### 4.3 Least Privilege

**Score: 3 / 5 — ⚠️ Teilweise erfüllt**

| Control | Status | Evidenz |
|---------|--------|---------|
| Tenant RBAC (module permissions) | ✅ | `PermissionsGuard`, role templates |
| `ORG_ADMIN` scoped to org | ✅ | `OrgScopingGuard` + JWT org match |
| `MasterBillingGuard` | ✅ | Schmaler als voller `MASTER_ADMIN` für Billing |
| `MASTER_ADMIN` cross-tenant | ❌ | Bypass in `OrgScopingGuard`, `PermissionsGuard` |
| Platform admin list APIs | ⚠️ | Volle User/Org-Daten ohne Feld-Reduktion |
| Step-up für Master password change | ✅ | `adminChangePassword` + `StepUpGuard` |
| Step-up für Master delete/prune | ❌ | Nicht implementiert |

**Positive Beispiele:**

```typescript
// MasterBillingGuard — eingeschränkte Billing-Delegation
if (user.platformRole === 'MASTER_ADMIN') return true;
if (platformPermissions.includes('master-billing')) return true;
```

**Kritische Konzentration:**

```typescript
// OrgScopingGuard — MASTER_ADMIN bypass
if (user.platformRole === 'MASTER_ADMIN') {
  if (orgId) request.tenantId = orgId;
  return true;
}
```

**Fazit:** Least Privilege ist auf **Mandantenebene stark**, auf **Plattformebene schwach** wegen monolithischem `MASTER_ADMIN`.

---

### 4.4 Separation of Duties (SoD)

**Score: 2 / 5 — ❌ Schwach**

| Bereich | SoD-Mechanismus | Bewertung |
|---------|-----------------|-----------|
| Workflow-Automation | `workflow-maker-checker.service.ts` — Maker ≠ Checker, 72h | ✅ |
| IAM Access Review | Org-scoped attestation campaigns | ✅ (org) |
| Org user admin | Step-up für Role Assign, Password Reset Request | ✅ |
| **Platform prune** | Einzelactor, kein Checker, kein Step-up | ❌ |
| **Master user delete** | Einzelactor, kein Step-up | ❌ |
| **Org create/delete (platform)** | Kein dual approval | ❌ |
| Billing master mutations | `MASTER_ADMIN` oder `master-billing` — keine Dual-Control | ⚠️ |
| Platform `MASTER_ADMIN` review | Kein periodisches Attestationsmodell | ❌ |

**Fazit:** SoD ist für **Workflows und Org-IAM** angelegt, für die **Master-Admin-Control-Plane** fehlt Dual-Control bei destruktiven Operationen.

---

### 4.5 Auditierbarkeit

**Score: 3 / 5 — ⚠️ Teilweise erfüllt**

| Mechanismus | Abdeckung | Lücke |
|-------------|-----------|-------|
| `AuditService` | Explizit für viele Platform-Admin-Mutationen | Fire-and-forget; Fehler verschluckt |
| `AuditInterceptor` | Global POST/PUT/PATCH/DELETE | Grob: `METHOD /url → status`; 4xx → `AUTH_FAIL` |
| `UserAccessAuditService` | 50+ IAM-Codes in `metaJson.auditAction` | Nicht für Master admin delete |
| `BillingAuditService` | Separate `billing_audit_logs` | Wird von `prune` gelöscht |
| `IamAuditOutbox` | Transaktional mit IAM-Mutationen | Org-scoped |
| `GET /admin/activity-log` | Cross-tenant read für Master Admin | Kein Step-up (im Gegensatz zu org `AUDIT_EXPORT`) |

**Kritischer Befund — Prune zerstört Audit-Trail:**

```typescript
// platform-admin.controller.ts — loggt CRITICAL, dann:
return this.platformAdminService.pruneMasterData();
// platform-admin.service.ts L188:
await this.prisma.activityLog.deleteMany({});
await this.prisma.billingAuditLog.deleteMany({});
```

**Fazit:** Audit-Infrastruktur ist **breit**, aber **nicht tamper-proof** und durch `prune` **selbst untergraben**.

---

### 4.6 Nachvollziehbarkeit (Traceability)

**Score: 4 / 5 — ⚠️ Überwiegend erfüllt**

| Dimension | Implementierung | Bewertung |
|-----------|-----------------|-----------|
| Request-ID | `X-Request-Id` in `request-logging.interceptor.ts` | ✅ |
| Actor in Audit | `actorUserId`, `ipAddress`, `userAgent`, `route` | ✅ |
| IAM before/after | `metaJson` in role/permission changes | ✅ (org) |
| Billing reconciliation | `billing_audit_logs` mit sanitized payload | ✅ |
| Notification audit | Append-only `notification_audit_events` | ✅ |
| AI requests | Pseudonymisierte Audit-Logs | ✅ |
| Platform prune | Log vor Löschung, dann **evidence destroyed** | ❌ |
| Externe Log-Aggregation | Nicht im Code definiert | 📋 Org |

**Fazit:** Nachvollziehbarkeit ist **gut für operative Mandanten-Flows**, **gebrochen für post-prune-Forensik**.

---

### 4.7 Datenminimierung

**Score: 3 / 5 — ⚠️ Teilweise erfüllt**

| Layer | Maßnahme | Control-Plane-Lücke |
|-------|----------|---------------------|
| Notifications | `minimizeTemplateParams()`, blocked customer PII at rest | — |
| Billing audit | `sanitizeBillingAuditPayload` | — |
| ActivityLog (legacy path) | `scrubPiiString`, `scrubPiiJson` | — |
| **AuditService (primary)** | Kein Scrub | Master-Admin-Beschreibungen können E-Mails enthalten |
| Master Admin UI | `PlatformUsersView` — Name, E-Mail, Org | Vollständige PII-Anzeige |
| Dashboard aggregates | Counts/MRR ohne Roh-PII | ✅ |
| DIMO debug | `GET debug-jwt` für `MASTER_ADMIN` | Sensitiv bei Missbrauch |
| Monitoring poll logs | Vehicle-level operational detail | Operativ notwendig, Zugriff beschränkt |

**Fazit:** Datenminimierung ist **modul-spezifisch stark** (Notifications, Billing), **inkonsistent im zentralen Audit-Pfad und Master-User-API**.

---

### 4.8 Löschkonzepte

**Score: 3 / 5 — ⚠️ Teilweise erfüllt**

| Konzept | Implementierung | Control-Plane |
|---------|-----------------|---------------|
| IAM user deletion | Assessment → HARD_DELETE / PSEUDONYMIZE / BLOCKED + Legal Hold | ✅ org path |
| IAM retention worker | `iam-data-retention-worker.service.ts`; default **disabled** | ⚠️ |
| Notification retention | Klassen + `deletionEligibleAt` | ✅ |
| Document retention | `document-retention.scheduler.ts` | ✅ |
| Voice / Battery / Telemetry | Domain-spezifische Scheduler | ✅ |
| Activity log retention | Default oft `retentionDays: 0` (never prune) | ⚠️ |
| **`prune`** | Indiskriminate `deleteMany` — **kein GDPR-Tool** | ❌ |
| Master `DELETE /admin/users/:id` | Hard delete, keine Pseudonymisierung | ❌ |

**Org-scoped GDPR-Löschpfad (korrekt):**

```typescript
// iam-user-deletion.service.ts
recommendedAction: 'HARD_DELETE' | 'PSEUDONYMIZE' | 'BLOCKED'
// + legal hold check + iam audit
```

**Fazit:** Löschkonzepte sind **reif auf Mandantenebene**, **nicht auf Master-Admin-Ebene harmonisiert**.

---

### 4.9 Logging

**Score: 3 / 5 — ⚠️ Teilweise erfüllt**

| Log-Typ | Schutzmaßnahmen | Lücke |
|---------|-----------------|-------|
| HTTP request logs | Query-param redaction (`token`, `password`, …) | Raw IP + User-Agent |
| HTTP success logs | Unterdrückt in Prod (außer `HTTP_LOG_SUCCESS`) | Weniger Ops-Sichtbarkeit |
| ActivityLog writes | PII scrub via `ActivityLogService` | `AuditService` bypass |
| Error logs | Stack throttle | `request.url` nicht redacted in Exception filter |
| Metrics | Bearer-geschützt `/metrics` | — |
| Audit failure | `logger.error` only — **kein Alert** | Silent audit gap |

**Fazit:** Logging erfüllt **ISO/GDPR-Grundlagen** in HTTP-Layer, hat **zwei Pfade** (scrub vs. no-scrub) und **keine Audit-Failure-Eskalation**.

---

### 4.10 Zugriffsschutz

**Score: 4 / 5 — ⚠️ Überwiegend erfüllt**

| Control | Status | Evidenz |
|---------|--------|---------|
| Authentication (JWT) | ✅ | Global `AuthGuard` |
| Role enforcement | ✅ | `RolesGuard` auf `/admin/*` |
| Tenant isolation | ✅ | `OrgScopingGuard` (tenant users) |
| MFA Step-up | ✅ (org, wenn enforced) | `StepUpGuard`, `iam-mfa.policy.ts` |
| Master password change step-up | ✅ | `adminChangePassword` |
| Metrics endpoint | ✅ | `MetricsAuthGuard` + bearer token |
| Seed admin | ⚠️ | Token + rate limit; Risiko wenn enabled in prod |
| Prune / master delete | ❌ | Nur `MASTER_ADMIN` role check |
| Cross-tenant activity log | ⚠️ | Kein Step-up für platform read |
| Frontend gates | UX only | Backend ist SoT (siehe 2G.3) |

**Fazit:** Zugriffsschutz ist **solide für Authentifizierung und Mandanten-RBAC**, **schwächer für destruktive Platform-Ops**.

---

## 5. Abweichungsregister (Control Plane)

| ID | Severity | Kriterium | Befund | Empfehlung |
|----|----------|-----------|--------|------------|
| **COMP-1** | **P0** | Auditierbarkeit, DSGVO Art. 17/30 | `POST /admin/prune` löscht `activityLog` + `billingAuditLog` | Prune aus Prod deaktivieren oder externe immutable Logs; prune darf Audit nicht löschen |
| **COMP-2** | **P0** | SoD, Zugriffsschutz | Prune ohne Step-up / Dual-Control | `RequireStepUp(BREAK_GLASS)` + zweite Bestätigung / Checker-Token |
| **COMP-3** | **P1** | DSGVO Art. 17, Löschkonzepte | `DELETE /admin/users/:id` hard delete | Route auf `IamUserDeletionService` umleiten + Audit |
| **COMP-4** | **P1** | Datenminimierung, Logging | `AuditService` ohne PII-Scrub | Einheitlich `scrubPii*` vor persist |
| **COMP-5** | **P1** | Least Privilege | `MASTER_ADMIN` monolithischer Superuser | Platform-Rollen granular (ops, billing, support read-only) |
| **COMP-6** | **P1** | SoD | Kein Platform Access Review für `MASTER_ADMIN` | Periodische Attestation + Break-glass-Prozedur |
| **COMP-7** | **P2** | Auditierbarkeit | Fire-and-forget Audit ohne Alerting | Metrik `audit_write_failures_total` + Alert |
| **COMP-8** | **P2** | Nachvollziehbarkeit | Org/platform mutations nur via Interceptor | Explizite `AuditService`-Calls für org CRUD |
| **COMP-9** | **P2** | Zugriffsschutz | `GET /admin/activity-log` ohne Step-up | `RequireStepUp(AUDIT_EXPORT)` analog org |
| **COMP-10** | **P3** | DSGVO | Retention default off | Org-aktivierungs-Runbook + Master-Admin-Anleitung |
| **COMP-11** | **P3** | UI | Prune in UI nicht verdrahtet (`App.tsx`) | Bewusst lassen oder mit Guardrails verdrahten |

---

## 6. Positive Controls (nachweisbar)

| Control | Pfad / Referenz |
|---------|-----------------|
| Tenant isolation | `org-scoping.guard.ts` |
| Module RBAC | `permissions.guard.ts`, role templates |
| MFA Step-up (10 actions) | `iam-mfa.policy.ts` — inkl. `PRIVACY_DATA_EXPORT`, `PRIVACY_DATA_DELETION` |
| IAM transactional audit | `iam-audit.service.ts`, `IAM_TRANSACTIONAL_AUDIT_OUTBOX` |
| GDPR user deletion assessment | `iam-user-deletion.service.ts` |
| Legal hold | `iam-legal-hold.service.ts` |
| Access review campaigns | `iam-access-review.controller.ts` |
| Workflow maker-checker | `workflow-maker-checker.service.ts` |
| Notification GDPR minimization | `notification-data-minimization.ts`, compliance docs |
| HTTP log query redaction | `request-logging.interceptor.ts` |
| Billing audit separation | `billing-audit.service.ts` |
| Last org admin protection | `org-admin-protection.util.ts` |

---

## 7. Manuelle Organisations-Checkliste (nicht automatisierbar)

| # | Prüfpunkt | Verantwortlich |
|---|-----------|----------------|
| 1 | VVT / RoPA für Master-Admin-Zugriffe dokumentiert | DSB / Compliance |
| 2 | `ENABLE_SEED_ADMIN=false` in Produktion verifiziert | Ops |
| 3 | `IAM_DATA_RETENTION_ENABLED` pro Org nach Freigabe | Tenant Admin |
| 4 | `IAM_DATA_PSEUDONYMIZATION_SALT` gesetzt wenn Retention aktiv | Ops |
| 5 | Liste der `MASTER_ADMIN` + `master-billing` Konten | Security |
| 6 | Break-glass / Prune-Prozedur mit Dual-Control | Security + Ops |
| 7 | Externe Log-Retention (immutable) für Platform-Audits | Ops |
| 8 | Jährliche Access Review auch für Platform-Admins | Security |
| 9 | AV-Verträge DIMO/Stripe/HM für Control-Plane-Datenflüsse | Legal |
| 10 | DPIA für Cross-Tenant-Admin-Zugriff | DSB |

---

## 8. Akzeptanzentscheidung

| Kriterium | Erfüllt für Sign-off? |
|-----------|----------------------|
| DSGVO (Mandant-IAM) | ✅ Architektur vorhanden |
| DSGVO (Master Admin) | ❌ Hard-delete + prune gaps |
| ISO 27001 alignment | ⚠️ PARTIAL — dokumentiert |
| Least Privilege (Platform) | ❌ MASTER_ADMIN concentration |
| SoD (Platform destructive) | ❌ |
| Auditierbarkeit | ⚠️ Prune undermines |
| Nachvollziehbarkeit | ✅ mit Ausnahmen |
| Datenminimierung | ⚠️ |
| Löschkonzepte | ⚠️ org ja, platform nein |
| Logging | ⚠️ |
| Zugriffsschutz | ✅ Basis stark |

### Final verdict

**Compliance review: CONDITIONAL PASS (3.1 / 5)**

Die SynqDrive-Plattform erfüllt **viele DSGVO- und ISO-orientierte Anforderungen auf Mandantenebene**. Die **Master-Admin-Control-Plane** erfüllt diese Standards **nicht durchgängig**. Vollständiges Compliance-Sign-off erfordert Remediation von **COMP-1 bis COMP-3** (P0/P1) und organisatorische Checkliste §7.

**Priorisierte Remediation:**

1. Prune absichern oder aus Produktion entfernen; Audit-Trail nicht löschbar machen  
2. Master-User-Delete an IAM-Deletion-Service anbinden  
3. AuditService PII-Scrub vereinheitlichen  
4. Platform SoD für destruktive Ops (Step-up + Dual-Control)  
5. Platform Access Review für `MASTER_ADMIN`-Konten  

---

## 9. Geprüfte Quellen

| Bereich | Pfad |
|---------|------|
| Platform admin | `backend/src/modules/platform-admin/platform-admin.{controller,service}.ts` |
| Users admin | `backend/src/modules/users/users.controller.ts`, `users.service.ts` |
| Audit | `backend/src/modules/activity-log/audit.service.ts`, `activity-log.service.ts` |
| Interceptors | `backend/src/shared/interceptors/audit.interceptor.ts`, `request-logging.interceptor.ts` |
| IAM GDPR | `backend/src/modules/iam-data-retention/iam-user-deletion.service.ts` |
| MFA / Step-up | `backend/src/modules/iam-mfa/iam-mfa.policy.ts`, `step-up.guard.ts` |
| Access review | `backend/src/modules/users/iam-access-review.controller.ts` |
| ISO matrix | `docs/audits/data/iam-iso27001-control-alignment-2026-07.csv` |
| Notification GDPR | `docs/compliance/notification-engine-data-protection.md` |
| IAM runbook | `docs/runbooks/iam-data-retention-and-user-rights.md` |
| RBAC acceptance | `docs/final/master-admin-rbac-acceptance.md` (Phase 2G.3) |

---

## 10. Changes / Architektur

**Not updated** — documentation-only compliance review (consistent with Phase 2G.1–2G.4).
