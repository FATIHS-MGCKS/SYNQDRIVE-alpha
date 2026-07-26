# Master Admin Remediation — Phase 2G.7 — Go Live Certification (Re-Audit Update)

| Feld | Wert |
|------|------|
| **Dokument-ID** | `master-admin-go-live-certification` |
| **Datum (UTC)** | 2026-07-26 (Re-Audit Update) |
| **Code-Stand** | `main` @ `5dcd628f` |
| **Prod-Stand** | Pre-deploy (Remediation nicht live) |
| **Vorherige Version** | Phase 2G.7 Initial — Not Production Ready |

---

## Executive Summary

**Remediation abgeschlossen (Code):** P0/P1-Stack in `main` gemergt — Security, Billing-Guards, Backup-Skripte, ClickHouse org_id, Alertmanager, DIMO unique, MFA/Audit-Hardening, RBAC-TB-1, COMP-2, COMP-3.

**Deploy:** Fehlgeschlagen (SSH `Permission denied` zum VPS). Production entspricht weiterhin dem Pre-Remediation-Release.

**Re-Audit Live-Prod:** `/docs` → 200 (Fix nicht live). Health/readiness ok.

### Zertifizierungsentscheidung

| Kontext | Option | Auswahl |
|---------|--------|---------|
| **Code (`main`)** | Production Ready with Conditions | **☑** |
| **Production (live)** | Not Production Ready | **☑** (bis Deploy) |

---

## Behobene Findings (Code in `main`)

| ID | Status Code | Status Prod |
|----|-------------|-------------|
| MA-NET-P1-001/002 | ✅ Swagger gated | ❌ nicht deployt |
| MA-AUD-P1-001 / COMP-1 | ✅ Audit append-only | ❌ nicht deployt |
| COMP-2 | ✅ BREAK_GLASS + confirm | ❌ nicht deployt |
| COMP-3 | ✅ GDPR deletion path | ❌ nicht deployt |
| RBAC-TB-1 | ✅ Org-scoped PATCH | ❌ nicht deployt |
| MA-CH-P0-001 | ✅ Migration 007 | ❌ nicht deployt |
| MA-CH-P1-001 | ✅ Dedup + mirror-retry | ❌ nicht deployt |
| MA-DIMO-P0-001 | ✅ Unique index | ❌ nicht deployt |
| MA-BILL-P0-002/003 | ✅ Stripe guards | ❌ nicht deployt |
| MA-BKP-P0-001 | ✅ Backup scripts | ⚠️ Cron nicht installiert |
| MA-OBS-P1-001 | ✅ Alertmanager config | ⚠️ nicht deployt |

---

## Offene Findings (VPS / Config)

| ID | Aktion |
|----|--------|
| MA-BILL-P0-001 | TRIALING orphan — Stripe reconcile nach Deploy |
| MA-BILL-P0-002 | `STRIPE_SECRET_KEY=sk_live_*` in `backend.env` |
| MA-BILL-P0-003 | Platform webhook secret registrieren |
| MA-TOPO-P0-001 | CH ghost mounts — `vps-clickhouse-storage-topology-audit.sh` |
| MA-REDIS-P1-001 | Battery.v2 failed jobs drain |
| Deploy | `bash .cursor/scripts/cloud-agent-deploy.sh` — SSH gefixt; **blockiert am Stripe-Test-Key in Prod** |

---

## Go-Live-Entscheidung (aktualisiert)

#### ☐ Production Ready

Nicht gewählt — VPS-Ops (Backup-Cron, Alertmanager, Stripe env) und erfolgreicher Deploy ausstehend.

#### ☑ Production Ready with Conditions (Code)

**Gewählt für `main`.** Alle P0/P1-Code-Fixes gemergt. Bedingungen: Deploy + VPS-Ops + Stripe-LIVE-Konfiguration + Re-Audit Live.

#### ☑ Not Production Ready (Production live)

**Gewählt für aktuelle Production.** Deploy nicht durchgeführt; Swagger öffentlich; Remediation-Code nicht aktiv.

---

## Nächste Schritte

1. ~~SSH-Credentials für Cloud Agent fixen~~ — erledigt (UFW-Allowlist für alle 8 Egress-IPs, `synqdrive-admin` + `sudo`)
2. **Stripe-Environment entscheiden** — einziger verbleibender Deploy-Blocker:
   - Option A: `STRIPE_SECRET_KEY=sk_live_*` + Live-`STRIPE_WEBHOOK_SECRET` in `/opt/synqdrive/shared/backend.env`
   - Option B: `STRIPE_ALLOW_TEST_IN_PRODUCTION=true` (setzt eine 2B.2-Kontrolle außer Kraft, braucht explizite Freigabe)
3. `bash .cursor/scripts/cloud-agent-deploy.sh` — bricht jetzt automatisch ab, wenn ein Release nicht bootet
4. `bash backend/scripts/ops/vps-post-remediation-ops.sh` — CH backfill, backup cron, alertmanager, offsite
5. Live Re-Audit → Zertifikat auf **Production Ready with Conditions** (live) hochstufen

Der Deploy-Durchlauf hat vier release-blockierende Defekte im gemergten Stack aufgedeckt (Prisma-`CONCURRENTLY`, fehlender `bcrypt`-Import, Modul-Zyklus aus COMP-3, MFA-Wiring aus 2A.5). Alle sind in `main` behoben; der Modul-Zyklus hatte Production kurzzeitig auf 502 gebracht. Ein Boot-Check-Gate verhindert diese Klasse von Ausfällen jetzt vor dem Umschalten von `current`.

Siehe: `docs/final/master-admin-deploy-attempt-2026-07-26.md`, `docs/final/master-admin-re-audit-2026-07-26.md`

---

## Changes / Architektur

Updated via merged remediation branches (ChangesView + ArchitekturView entries in frontend master components).
