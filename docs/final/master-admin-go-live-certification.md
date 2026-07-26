# Master Admin Remediation — Phase 2G.7 — Go Live Certification (Post-Deploy)

| Feld | Wert |
|------|------|
| **Dokument-ID** | `master-admin-go-live-certification` |
| **Datum (UTC)** | 2026-07-26 (Post-Deploy Update) |
| **Code-Stand** | `main` @ `d8461e2` |
| **Prod-Stand** | Release `20260726212924_v4994` — Remediation **live** (seit `20260726211156_v4994`) |
| **Vorherige Version** | Phase 2G.7 Initial — Not Production Ready |

---

## Executive Summary

**Remediation abgeschlossen und deployt:** Der P0/P1-Stack läuft in Production — Security, Billing-Guards, Backup-Skripte, ClickHouse org_id, Alertmanager, DIMO unique, MFA/Audit-Hardening, RBAC-TB-1, COMP-2, COMP-3.

**Billing:** bewusst im Sandbox-Modus (`STRIPE_ALLOW_TEST_IN_PRODUCTION=true` + `STRIPE_ENVIRONMENT=test`) bis zum Go-Live. Der 2B.2-Guard ist aktiv und protokolliert `runtime=TEST nodeEnv=production`.

**Post-Deploy-Ops** haben drei zuvor unsichtbare Defekte aufgedeckt und behoben: ClickHouse-Migrationen wurden wegen eines Build-Pfad-Mismatch seit Wochen still übersprungen, der ClickHouse-Container hing mit `/backups` an einem gelöschten Release, und die Backup-Verifikationskette war an vier Stellen defekt. Der Restore-Drill lief danach erstmals erfolgreich.

### Zertifizierungsentscheidung

| Kontext | Option | Auswahl |
|---------|--------|---------|
| **Code (`main`)** | Production Ready with Conditions | **☑** |
| **Production (live)** | Production Ready with Conditions | **☑** |

**Bedingungen:** Stripe-Sandbox-Betrieb (bewusst), offene Entscheidung zur Backup-Verschlüsselung, historischer Datenverlust `telemetry_snapshots` 202607.

---

## Behobene Findings

| ID | Code (`main`) | Production (live) | Nachweis |
|----|---------------|-------------------|----------|
| MA-NET-P1-001/002 | ✅ Swagger gated | ✅ live | `/docs` + `/docs-json` liefern die SPA-Shell, 0 Swagger-/OpenAPI-Marker |
| MA-AUD-P1-001 / COMP-1 | ✅ Audit append-only | ✅ live | Release `20260726211156_v4994` |
| COMP-2 | ✅ BREAK_GLASS + confirm | ✅ live | Release `20260726211156_v4994` |
| COMP-3 | ✅ GDPR deletion path | ✅ live | Route unverändert, jetzt in `MasterAdminUserDeletionController` |
| RBAC-TB-1 | ✅ Org-scoped PATCH | ✅ live | Release `20260726211156_v4994` |
| MA-CH-P0-001 | ✅ Migration 007 | ✅ live | `appliedMigrationCount=7`, `pendingMigrationCount=0` |
| MA-CH-P1-001 | ✅ Dedup + mirror-retry | ✅ live | Release `20260726211156_v4994` |
| MA-DIMO-P0-001 | ✅ Unique index | ✅ live | Migration `20260726140000` applied (ohne `CONCURRENTLY`) |
| MA-BILL-P0-002/003 | ✅ Stripe guards | ✅ live (Sandbox) | `Stripe environment locked: runtime=TEST nodeEnv=production` |
| MA-BKP-P0-001 | ✅ Backup scripts | ✅ Cron installiert | Restore-Drill erfolgreich; Verschlüsselung offen (s. u.) |
| MA-TOPO-P0-001 | ✅ Migrationsskript | ✅ live | Storage-Topology-Audit 10 P0 → 0, 818 871 Zeilen unverändert |
| MA-OBS-P1-001 | ✅ Alertmanager config | ⚠️ Templates synchronisiert | Container läuft nicht (`alertmanager.env` fehlt) |

---

## Offene Punkte

| ID | Schwere | Aktion |
|----|---------|--------|
| MA-BILL-P0-001 | P0 | TRIALING orphan — Stripe-Reconcile; im Sandbox-Betrieb ohne Wirkung, vor Go-Live nachziehen |
| MA-BILL-P0-002/003 | Bedingung | Beim Go-Live `sk_live_*` + Live-Webhook-Secret setzen und **beide** Sandbox-Zeilen entfernen |
| MA-CH-P0-002 | P0 (historisch) | 9 Detached Parts `broken-on-start` in `telemetry_snapshots` 202607 — Re-Ingest aus DIMO oder bewusster Verlust |
| MA-BKP-P0-002 | Entscheidung | GPG-Schlüssel/Hinterlegung für Backup-Verschlüsselung; ohne sie scheitern beide Crons bewusst |
| MA-BKP-P1-001 | P1 | Offsite unkonfiguriert — Backups liegen nur lokal |
| MA-REDIS-P1-001 | P1 | `battery.v2` 30 Failed Jobs, `dimo.trip-tracking` 2 — Drain offen |
| MA-OBS-P1-001 | P1 | `alertmanager.env` anlegen, Container starten |
| MA-CH-P1-002 | P1 | Checksum-Drift 001–003 als `schemaDrift` sichtbar; Re-Baseline ist eine bewusste Entscheidung |

---

## Go-Live-Entscheidung

#### ☐ Production Ready

Nicht gewählt. Billing läuft bewusst gegen Stripe TEST, die Backup-Verschlüsselung ist unentschieden, und `telemetry_snapshots` 202607 hat einen unbehobenen historischen Verlust.

#### ☑ Production Ready with Conditions

**Gewählt für `main` und für Production.** Der vollständige P0/P1-Stack ist deployt und live verifiziert: Swagger geschlossen, Backend-Port nicht öffentlich, Audit-Log append-only, MFA-Step-Up aktiv, ClickHouse `org_id` durchgesetzt, Backup-Kette von Erzeugung bis Restore nachgewiesen.

**Bedingungen:**

1. **Stripe-Sandbox** — `STRIPE_ENVIRONMENT=test` + `STRIPE_ALLOW_TEST_IN_PRODUCTION=true` in `/opt/synqdrive/shared/backend.env`. Bewusste, dokumentierte Ausnahme von 2B.2; der Guard bleibt aktiv und protokolliert den Zustand bei jedem Start. Kein Live-Geldfluss bis zur Umstellung.
2. **Backup-Verschlüsselung** — Crons installiert, scheitern aber an der Verschlüsselungspflicht aus 2C. Entscheidung über Schlüsselmaterial und Hinterlegung erforderlich; bis dahin existiert kein automatisiertes verschlüsseltes Backup.
3. **Historischer Datenverlust** — `telemetry_snapshots` 202607, 9 leere Parts vom 2026-07-17. Betrifft ein abgeschlossenes Zeitfenster, nicht den laufenden Betrieb.

#### ☐ Not Production Ready

Nicht mehr gültig. Die Einstufung der Vorversion beruhte auf dem fehlgeschlagenen Deploy — dieser ist nachgeholt.

---

## Technische Begründung

Der Deploy-Durchlauf hat vier release-blockierende Defekte im gemergten Stack aufgedeckt (Prisma-`CONCURRENTLY`, fehlender `bcrypt`-Import, Modul-Zyklus aus COMP-3, MFA-Wiring aus 2A.5). Alle sind behoben; der Modul-Zyklus hatte Production kurzzeitig auf 502 gebracht. Ein Boot-Check-Gate (`SYNQDRIVE_BOOT_CHECK=1`) verhindert diese Klasse von Ausfällen jetzt, bevor `current` umgeschaltet wird.

Die anschließenden VPS-Ops haben drei Defekte sichtbar gemacht, die vorher nicht auffallen konnten, weil die betroffenen Werkzeuge selbst nicht liefen:

- **ClickHouse-Migrationen wurden seit Wochen still übersprungen** (Build-Pfad-Mismatch zwischen `nest-cli`-Assets und `tsc`-Output). Migration 007 war nie angewandt, der Runner meldete dabei `pendingMigrationCount=0`. Jetzt bricht ein fehlendes Migrationsverzeichnis laut ab statt still.
- **Der ClickHouse-Container hing mit `/backups` an einem gelöschten Release.** `BACKUP DATABASE` hätte Erfolg gemeldet, ohne ein Artefakt zu hinterlassen.
- **Die Backup-Verifikationskette war an vier Stellen defekt.** Kein Backup war verifizierbar oder rückspielbar.

Alle drei sind behoben und live nachgewiesen; der Restore-Drill lief danach erstmals erfolgreich durch. Das Acceptance-Audit sank von 5 P0 auf 1 — die verbleibende Meldung ist der echte historische Verlust, nicht ein Werkzeugfehler.

---

## Nächste Schritte

1. Entscheidung zur Backup-Verschlüsselung, dann `CH_BACKUP_GPG_PASSPHRASE_FILE` / `REDIS_BACKUP_GPG_PASSPHRASE_FILE` setzen und Offsite konfigurieren
2. `telemetry_snapshots` 202607: Re-Ingest aus DIMO oder `DROP DETACHED PARTITION` mit dokumentierter Verlustannahme
3. `alertmanager.env` anlegen und Container starten
4. Failed-Job-Drain `battery.v2` / `dimo.trip-tracking`
5. Beim Go-Live: `sk_live_*` + Live-Webhook-Secret, **beide** Sandbox-Zeilen entfernen, Stripe-Reconcile für MA-BILL-P0-001

Siehe: `docs/final/master-admin-production-deploy-2026-07-26.md`, `docs/final/master-admin-deploy-attempt-2026-07-26.md`, `docs/final/master-admin-re-audit-2026-07-26.md`

---

## Changes / Architektur

`ChangesView` und `ArchitekturView` (frontend master components) sind auf den Post-Deploy-Stand aktualisiert.
