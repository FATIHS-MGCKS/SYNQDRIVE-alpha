# Stations V2 — Deployment Runbook

Schrittweise Aktivierung von Stations V2 in Produktion. **Kein automatisches Deployment** — manuelle Env-Änderung + kontrollierter PM2-Restart im Wartungsfenster.

> Dieses Runbook beschreibt **nur** die Aktivierungsreihenfolge und Verifikation. Es führt **kein** Deployment aus.

---

## Voraussetzungen

1. Additive Prisma-Migrationen auf Prod angewendet (Schema-Phase).
2. `stations-v2-diagnose --dry-run` auf Staging/Prod-Kopie ohne kritische `error`-Findings.
3. Backup: `pg_dump` vor jeder Phase mit Writes.
4. Runbook Datenqualität: [`stations-v2-data-remediation.md`](./stations-v2-data-remediation.md)

---

## Aktivierungsreihenfolge

| Schritt | Phase | Env-Flags (global oder Org-Canary) | Verifikation |
|--------:|-------|--------------------------------------|--------------|
| **1** | Schema | `STATIONS_V2_SCHEMA_ENABLED=true` | API startet; keine Migration-Fehler; Diagnose read-only grün |
| **2** | Scope / RBAC | `STATIONS_V2_SCOPE_ENABLED=true` | Scoped User sieht nur zugewiesene Stationen; 404 cross-scope |
| **3** | Lifecycle | `STATIONS_V2_LIFECYCLE_ENABLED=true` | Archive/Restore/Set-Primary; kein Hard-Delete in UI |
| **4** | Summary Read Model | `STATIONS_V2_SUMMARY_READ_MODEL_ENABLED=true` | `GET …/summaries` + `…/summary` KPIs konsistent |
| **5** | Delta Assignment | `STATIONS_V2_DELTA_ASSIGNMENT_ENABLED=true` | Home-Fleet add/remove/move; kein SET-Detach |
| **6** | Positioning | `STATIONS_V2_POSITIONING_ENABLED=true` | Current/Expected mit Provenance; Home unverändert bei Current |
| **7** | Booking Rules (Shadow/Warning) | `STATIONS_V2_BOOKING_RULES_ENABLED=true` + `STATIONS_V2_BOOKING_RULES_ENFORCEMENT=shadow` dann `warning` | Snapshots/Warnings ohne Block; danach `enforce` |
| **8** | Transfers | `STATIONS_V2_TRANSFERS_ENABLED=true` | Plan/Arrive/Cancel; Expected aus Transfer |
| **9** | UI | `STATIONS_V2_UI_ENABLED=true` | Rental Stations UI; Feature-Flags-API im Frontend |
| **10** | Legacy deaktivieren | `STATIONS_V2_SET_VEHICLES_DISABLED=true` | `PUT …/stations/:id/vehicles` → 410 |

### Optionale parallele Flags

| Flag | Wann |
|------|------|
| `STATIONS_V2_CAPACITY_WARNINGS_ENABLED` | Mit Schritt 7 (Booking Rules) oder 8 (Transfers) |
| `STATIONS_V2_AUDIT_TRAIL_ENABLED` | Ab Schritt 3 (Lifecycle) oder mit Schritt 4 |
| `STATIONS_V2_GEOFENCE_SHADOW_ENABLED` | Nach Positioning; **niemals** vor Shadow-Validierung |

---

## Org-Canary Rollout

```bash
# Nur zwei Pilot-Orgs
STATIONS_V2_ORG_ALLOWLIST=uuid-org-a,uuid-org-b
STATIONS_V2_SCOPE_ENABLED=true
STATIONS_V2_LIFECYCLE_ENABLED=true
```

Alle anderen Orgs bleiben auf Legacy-Verhalten (Flags effektiv `false`).

---

## Booking Rules — empfohlene Sub-Phasen (Schritt 7)

```bash
# 7a — Shadow: evaluate only, keine Snapshots, keine Blocks
STATIONS_V2_BOOKING_RULES_ENABLED=true
STATIONS_V2_BOOKING_RULES_ENFORCEMENT=shadow

# 7b — Warning: Snapshots persistieren, BLOCKED nicht werfen
STATIONS_V2_BOOKING_RULES_ENFORCEMENT=warning

# 7c — Enforce: volle Persistenz-Blocks
STATIONS_V2_BOOKING_RULES_ENFORCEMENT=enforce
STATIONS_V2_CAPACITY_WARNINGS_ENABLED=true
```

---

## Verifikation nach jedem Schritt

```bash
cd backend

# Effektive Flags für Org
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://app.synqdrive.eu/api/v1/organizations/$ORG_ID/stations/feature-flags" | jq .

# Datenqualität (read-only, nach Merge von stations-v2-diagnose)
# npx ts-node -r tsconfig-paths/register scripts/ops/stations-v2-diagnose.ts --dry-run --organization-id=$ORG_ID

# Stations-Tests (lokal/CI)
npm run test:stations:v2
```

---

## Rollback

| Stufe | Maßnahme |
|-------|----------|
| **R1 — Soft** | Betroffenes Flag `false` in `backend.env`; PM2 restart |
| **R2 — UI** | `STATIONS_V2_UI_ENABLED=false` |
| **R3 — Rules** | `STATIONS_V2_BOOKING_RULES_ENFORCEMENT=off` oder `STATIONS_V2_BOOKING_RULES_ENABLED=false` |
| **R4 — Scope** | `STATIONS_V2_SCOPE_ENABLED=false` (Legacy ALL_STATIONS für alle) |
| **R5 — Legacy restore** | `STATIONS_V2_SET_VEHICLES_DISABLED=false` falls SET-Endpoint benötigt |

**Keine** automatischen Datenlöschungen beim Rollback.

---

## Was dieses Runbook nicht tut

- Kein `git push` / kein `cloud-agent-deploy.sh`
- Kein PM2-Restart (manuell im Wartungsfenster)
- Keine Schema-Migrationen
- Keine Produktionsdaten-Mutation

---

## Referenzen

| Dokument | Inhalt |
|----------|--------|
| [`stations-v2-shadow-validation.md`](./stations-v2-shadow-validation.md) | Shadow-Gates vor Enforce / breiter UI (Prompt 75) |
| [`stations-v2-rollout-flags.md`](../architecture/stations-v2-rollout-flags.md) | Flag-Katalog + Dependencies |
| [`stations-v2-data-remediation.md`](./stations-v2-data-remediation.md) | Diagnose + Remediation |
| [`stations-v2-prisma-migration-rollout-plan.md`](../architecture/stations-v2-prisma-migration-rollout-plan.md) | Schema / Dual-Write Plan |
| `backend/.env.example` | Env-Variablen |
