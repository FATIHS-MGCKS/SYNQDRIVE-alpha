# ClickHouse — Runtime, Architektur-Grenzen & No-Gos

**Stand:** 2026-07-08  
**Scope:** Runtime-Hardening, Ops-Dokumentation, sichere Scripts — keine fachlichen CH-Features.

---

## 1. Runtime-Modell

SynqDrive bindet ClickHouse **ausschließlich über Umgebungsvariablen** (`CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`, `CLICKHOUSE_DATABASE`). Es gibt **keine Docker-Pflicht** im Backend-Code.

| Umgebung | Typisches Setup | Hinweis |
|----------|-----------------|--------|
| **Local / Dev** | `docker compose` startet optional `clickhouse` neben Postgres/Redis (`npm run infra:up`) | Dev-Defaults in `.env.example` passen zu `docker-compose.yml` |
| **Prod / VPS** | Native Installation, externes Managed-CH oder self-hosted Docker **außerhalb** von `infra:up` | Nur `CLICKHOUSE_URL` setzen — Compose ist **nicht** die globale Wahrheit |

### Vor Prod-Infra-Änderungen prüfen

1. Was lauscht bereits auf **8123** (HTTP) und **9000** (native)?
2. Läuft ClickHouse **native** oder als **bestehender Docker-Container**?
3. Würde `npm run infra:up` einen **zweiten** ClickHouse starten oder Ports kollidieren?

**Verboten auf Prod-VPS:** blindes `npm run infra:up` ohne Port-/Runtime-Check.

### Backend-Verhalten

| Zustand | Verhalten |
|---------|-----------|
| `CLICKHOUSE_URL` fehlt | Analytics-Layer **disabled** — App startet normal |
| URL gesetzt, nicht erreichbar | **degraded** — Mirror/Reads aus, operative Flows laufen |
| URL gesetzt, erreichbar | Schema-Migrationen idempotent beim Bootstrap |

Details: `backend/docs/clickhouse-local-selfhosted.md`

---

## 2. Architektur-Grenzen (System of Record)

```
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL — System of Record (canonical truth)            │
│  Vehicles, Trips, Bookings, Damages, Customers, Billing,    │
│  Tasks, Health snapshots, Enrichment results                │
└─────────────────────────────────────────────────────────────┘
         │ mirror (best-effort)              │ queues
         ▼                                   ▼
┌──────────────────────┐            ┌──────────────────────┐
│ ClickHouse           │            │ Redis / BullMQ       │
│ append-only analytics│            │ runtime, workers,    │
│ telemetry, evidence  │            │ job queues           │
└──────────────────────┘            └──────────────────────┘
         │
         │ ops metrics (separate)
         ▼
┌──────────────────────┐
│ Prometheus           │
│ /api/v1/metrics      │
│ health, mirror state │
└──────────────────────┘
```

| Store | Rolle |
|-------|--------|
| **PostgreSQL** | Einzige operative Wahrheit für Business-Entitäten und persistierte Trip-/Health-Ergebnisse |
| **ClickHouse** | Append-only **Analytics / Telemetry / Evidence Mirror** — Zeitreihen, HF-Punkte, abgeleitete Events, Detektor-Evidence |
| **Redis / BullMQ** | Laufzeit, Queues, Worker-Locks — kein Langzeit-Analytics-Store |
| **Prometheus** | Ops / Health / Alerts — kein Business-Daten-Store |

### ClickHouse und Trips

- ClickHouse darf **Repair- und Evidence-Vorschläge** liefern (z. B. Ignition-/Motion-Segmente aus `telemetry_state_changes`).
- ClickHouse darf **niemals allein** finale Trip-Wahrheit erzeugen.
- Canonical Trip-Grenzen: **PostgreSQL `VehicleTrip`** + wo architektonisch vorgesehen **DIMO Segments**.
- CH-gestützte Detektoren degradieren zu `INCONCLUSIVE`, wenn CH fehlt.

### `CLICKHOUSE_TRIP_ASSIST_ENABLED` (bewusste Ausnahme, default `true`)

**Entscheidung 2026-07-08:** Default **`true`** beibehalten — accepted risk, kein Must-Fix.

| Aspekt | Regel |
|--------|--------|
| Zweck | CH-gestützte Detektoren für **Trip-Start**, **Kontinuitäts-Guard** und **Repair-Kandidaten** |
| Datenpfad | DIMO → DimoSnapshotProcessor → CH-Mirror → Detektoren (nicht DIMOs internes CH) |
| Opt-out | `CLICKHOUSE_TRIP_ASSIST_ENABLED=false` |
| Scores / Bookings | **Kein** CH-Einfluss |
| Trip-Ende (live FSM) | **CH-first End Assist** (`CLICKHOUSE_END_ASSIST`) mit FSM/CUSUM-Fallback; opt-out → nur FSM/CUSUM |
| Monitoring | `synqdrive_trip_evidence_paths_total` |

Details + Trip-Ende-Audit: `architecture/CLICKHOUSE_TRIP_ASSIST_AND_TRIP_END_2026-07-08.md`

### Schreib-/Lesevertrag

- **Writes:** fire-and-forget, best-effort — CH-Ausfall blockiert keine Snapshot-Pipeline, kein Enrichment, keine Buchungen.
- **Reads (Data Analyse):** graceful degradation (`available: false`), keine 500 bei CH-Ausfall für operative APIs.

---

## 3. Scripts (npm)

| Script | Ziel | Docker nötig? |
|--------|------|----------------|
| `clickhouse:ping:url` | HTTP + `SELECT 1` via `CLICKHOUSE_URL` | **Nein** |
| `clickhouse:ping:docker` | `clickhouse-client` im Compose-Container | **Ja** (local dev) |
| `clickhouse:backup:docker` | Lokales BACKUP via Compose + `Disk('backups')` | **Ja** |
| `clickhouse:restore:docker` | RESTORE aus lokalem Backup (non-destructive) | **Ja** |

**Legacy-Aliase** (weiterhin vorhanden, verweisen auf Docker-Varianten):

- `clickhouse:ping` → `clickhouse:ping:docker`
- `clickhouse:backup:local` → `clickhouse:backup:docker`
- `clickhouse:restore:local` → `clickhouse:restore:docker`

Für Prod/native/external: **`clickhouse:ping:url`** und Backend-Readiness (`GET /api/v1/health/readiness`).

---

## 4. No-Go-Liste (verbindlich)

| # | Verboten | Warum |
|---|----------|-------|
| 1 | ClickHouse als Wahrheit für Vehicles, Trips, Bookings, Damages, Customers, Billing | Nur PostgreSQL ist System of Record |
| 2 | `docker compose down -v` ohne Backup | Löscht Docker-Volumes inkl. CH-Daten |
| 3 | Destructive CH-Migrationen (DROP, ORDER BY/PARTITION BY ändern) ohne kontrollierten Migrationsplan | Risiko für bestehende native/external Instanzen |
| 4 | Docker-Pflicht für Produktion erzwingen | Backend ist URL-gesteuert |
| 5 | `vehicle_id`, `vin`, `customer_id`, `booking_id`, `trip_id`, `org_id` als **Prometheus-Labels** | High cardinality |
| 6 | Operative Buchungs-/Schadensdaten **nur** in ClickHouse | Business-Daten gehören in PostgreSQL |
| 7 | UI/API, die bei ClickHouse-Ausfall **500** werfen (operative Pfade) | CH ist optional; Data Analyse degradiert |
| 8 | Blindes `infra:up` auf Prod-VPS | Port-Konflikt / parallele Instanz |
| 9 | Bestehendes native/external ClickHouse auf dem VPS überschreiben | Runtime-Check vor jeder Infra-Änderung |

---

## 5. Env-Referenz

Siehe `backend/.env.example`:

- `CLICKHOUSE_URL` — wenn leer: Analytics disabled
- `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` / `CLICKHOUSE_DATABASE`
- `HF_MIRROR_ENABLED=false` — optional; spiegelt ausgewählte HF-Signale post-trip; **kein** Einfluss auf canonical Trip-Scoring
- `CLICKHOUSE_TRIP_ASSIST_ENABLED` — default an; CH-Detektoren für Start/Repair/Guard; **kein** Score-Einfluss; Trip-Ende live weiterhin FSM/CUSUM
