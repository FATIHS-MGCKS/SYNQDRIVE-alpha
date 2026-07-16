# Battery Health V2 — Additiver Prisma-Migrationsplan

**Version:** 1.0 (Spezifikation)  
**Date:** 2026-07-16  
**Status:** **Normativ für zukünftige Schema-Implementierung** — **keine Schemaänderung in diesem Prompt**  
**Basis:**

- [`battery-health-v2.md`](./battery-health-v2.md) (Architekturvertrag Prompt 2/78)
- [`battery-health-v2-rollout-flags.md`](./battery-health-v2-rollout-flags.md) (Rollout-Flags Prompt 3/78)
- [`../audits/battery-measurement-domain-decision.md`](../audits/battery-measurement-domain-decision.md) (Messartenvertrag)
- Ist-Schema: `backend/prisma/schema.prisma`
- Ist-Migrationen: `20260311224040_init`, `20260413220000_battery_evidence_unique_dedup`, `20260614120300_battery_health_tables_guard`

**Prinzip:** Additiv-only. Bestehende Tabellen bleiben lesbar; V2 schreibt in neue Normalform-Tabellen. Publication wird primär durch **Erweiterung** der vorhandenen `battery_features` / `hv_battery_health_current` Zeilen realisiert — **kein** paralleles Publication-Modell mit doppelten Feldern.

---

## Inhaltsverzeichnis

| # | Abschnitt |
|---|-----------|
| 0 | Zweck und Nicht-Ziele |
| 1 | Ist-Bestand (Legacy-Modelle) |
| 2 | Migrationsreihenfolge (Phasen) |
| 3 | Neue Enums |
| 4 | `battery_measurement_sessions` |
| 5 | `battery_measurements` |
| 6 | `battery_assessments` |
| 7 | Publication — Erweiterung vs. neue Tabelle |
| 8 | `vehicle_battery_capabilities` |
| 9 | `vehicle_battery_reference_capacities` |
| 10 | `hv_charge_sessions` |
| 11 | `hv_capacity_observations` |
| 12 | Erweiterungen an bestehenden Modellen |
| 13 | Tenant-Scope, Indizes, Idempotency |
| 14 | Retention |
| 15 | Backfill |
| 16 | Rollback |
| 17 | Abnahmekriterien (Schema-Prompt) |

---

## 0. Zweck und Nicht-Ziele

### 0.1 Zweck

Dieses Dokument definiert den **exakten additiven** Prisma-/PostgreSQL-Plan für Battery Health V2:

- Unveränderliche Measurements (INSERT-only Semantik)
- Session-basierte HV-Kapazität (DIMO `recharge` Segmente)
- Assessment-Versionierung und Publication-Erweiterung
- Capability- und Referenzkapazitäts-Verwaltung
- Idempotency, Tenant-Isolation, Retention und Backfill ohne Datenverlust

### 0.2 Nicht-Ziele (dieser Prompt)

- Keine `schema.prisma`-Änderung
- Keine produktive Migration ausführen
- Keine Datenlöschung im Plan (nur dokumentierte Retention-Jobs)
- Kein Ersatz von `vehicle_latest_states` (bleibt Live State Ebene 2)
- Keine Duplikation vorhandener Felder (`publishedSohPct`, `rawSohPct`, Evidence-Dedup-Key, …)

---

## 1. Ist-Bestand (Legacy-Modelle)

| Modell (Prisma) | Tabelle | Rolle heute | V2-Rolle |
|-----------------|---------|-------------|----------|
| `VehicleBatterySpec` | `vehicle_battery_specs` | Chemie/Spec (AGM, Volt) | **Unverändert** — Schwellen, nicht HV-Referenz |
| `BatteryHealthSnapshot` | `battery_health_snapshots` | LV-Roh-Snapshots + Trend | **Legacy read-only** — kein neuer SOH-Write |
| `BatteryFeatures` | `battery_features` | LV Features + **Publication in-place** | **Erweitern** + Assessment-Link |
| `HvBatteryHealthSnapshot` | `hv_battery_health_snapshots` | HV Poll-Snapshots (~30 s) | **Legacy read-only** — Dedup/Retention |
| `HvBatteryHealthCurrent` | `hv_battery_health_current` | HV Publication in-place | **Erweitern** + Assessment-Link |
| `BatteryEvidence` | `battery_evidence` | Ebene 5 Evidence | **Erweitern** (`measurement_id` FK optional) |
| `Vehicle.hvBatteryCapacityKwh` | `vehicles.hv_battery_capacity_kwh` | Schwache Nominalkapazität | **Nicht** allein entscheidungsfähig → `vehicle_battery_reference_capacities` |
| `VehicleLatestState` | `vehicle_latest_states` | Live SOC/Energy/Voltage | **Unverändert** (Ebene 2) |
| `SohPublicationState` | enum | INITIAL_CALIBRATION / STABILIZING / STABLE | **Wiederverwenden** |

**Bestehende Enums (nicht duplizieren):**

- `SohPublicationState`
- `BatteryEvidenceScope` (LV / HV)
- `BatteryEvidenceSourceType`
- `BatteryEvidenceValueType` → **erweitern**, nicht ersetzen
- `BatterySourceType` (Spec-Herkunft) — bleibt auf `vehicle_battery_specs`

**Bestehende Unique Keys (beibehalten):**

- `battery_features.vehicle_id` (1:1)
- `hv_battery_health_current.vehicle_id` (1:1)
- `battery_evidence_dedup_key` auf `(vehicle_id, scope, value_type, source_type, observed_at)`

---

## 2. Migrationsreihenfolge (Phasen)

Alle Migrationen sind **additiv** und **idempotent** wo möglich (Muster: `20260614120300_battery_health_tables_guard`).

| Phase | Migration (Vorschlagsname) | Inhalt | Feature-Flag-Gate |
|-------|---------------------------|--------|-------------------|
| **P0** | `battery_v2_enums` | Neue Enums (§3) | — |
| **P1** | `battery_v2_measurement_sessions` | `battery_measurement_sessions` | `BATTERY_V2_OBSERVATION_ENABLED` |
| **P2** | `battery_v2_measurements` | `battery_measurements` + Evidence-FK | `BATTERY_V2_REST_SHADOW_ENABLED` / HV Session |
| **P3** | `battery_v2_capabilities_reference` | `vehicle_battery_capabilities`, `vehicle_battery_reference_capacities` | Preflight |
| **P4** | `battery_v2_hv_sessions` | `hv_charge_sessions`, `hv_capacity_observations` | `BATTERY_V2_HV_RECHARGE_SESSION_ENABLED` |
| **P5** | `battery_v2_assessments` | `battery_assessments` | `BATTERY_V2_ASSESSMENT_ENABLED` |
| **P6** | `battery_v2_publication_extend` | Spalten auf `battery_features` / `hv_battery_health_current` | `BATTERY_V2_PUBLICATION_ENABLED` |
| **P7** | `battery_evidence_value_type_extend` | `ESTIMATED_HEALTH_SCORE` Enum-Wert | M3 Reclassify |
| **P8** | `battery_v2_indexes_retention` | Partitions-/Retention-Hilfsindizes (optional) | Ops |

**Regel:** Keine Phase darf Legacy-Spalten droppen oder NOT NULL auf bestehende Publication-Felder setzen.

---

## 3. Neue Enums

### 3.1 `BatteryMeasurementScope`

| Wert | Bedeutung |
|------|-----------|
| `LV` | 12V-Hilfsbatterie |
| `HV` | Traktionsbatterie |

**Hinweis:** Identisch zu `BatteryEvidenceScope`. **Kein neues Enum** — `BatteryEvidenceScope` in Session/Measurement/Assessment wiederverwenden.

---

### 3.2 `BatteryMeasurementKind` (Messart / `messart`)

Prisma-Enum-Name: `BatteryMeasurementKind`  
DB-Enum-Name: `BatteryMeasurementKind`

| Wert | LV/HV | Status (Vertrag) |
|------|-------|------------------|
| `LIVE_VOLTAGE` | LV | SUPPORTED |
| `LIVE_LOADED_VOLTAGE` | LV | PROXY |
| `CHARGING_VOLTAGE` | LV | PROXY |
| `REST_AFTER_SHUTDOWN` | LV | PROXY |
| `REST_60M` | LV | EXPERIMENTAL |
| `REST_6H` | LV | EXPERIMENTAL |
| `PRE_WAKE_VOLTAGE` | LV | PROXY |
| `PRE_START_VOLTAGE` | LV | EXPERIMENTAL |
| `START_DIP_PROXY` | LV | PROXY |
| `RECOVERY_5S_VOLTAGE` | LV | PROXY |
| `RECOVERY_30S_VOLTAGE` | LV | PROXY |
| `RECOVERY_PROXY_VOLTAGE` | LV | PROXY |
| `WORKSHOP_OCV` | LV | VERIFIED |
| `WORKSHOP_LOAD_TEST` | LV | VERIFIED |
| `LIVE_HV_SOC` | HV | Live State (optional Measurement) |
| `LIVE_HV_RANGE` | HV | PROVIDER_DEPENDENT |
| `LIVE_HV_CURRENT_ENERGY` | HV | Session-Kontext |
| `LIVE_HV_CHARGING_POWER` | HV | Session-Kontext |
| `PROVIDER_HV_SOH` | HV | VERIFIED wenn fresh |
| `WORKSHOP_HV_SOH` | HV | VERIFIED |
| `DOCUMENT_HV_SOH` | HV | VERIFIED |
| `CHARGE_SESSION_CAPACITY` | HV | Shadow → VALID mit Session |
| `DISCHARGE_SESSION_CAPACITY` | HV | Shadow |
| `SESSION_MISSED` | LV/HV | Marker ohne numerischen Wert |

**Nicht im Enum:** `CRANK_MIN` (UNSUPPORTED — nur diagnostisch in Legacy-Code, kein DB-Write).

---

### 3.3 `BatteryMeasurementQuality`

Prisma: `BatteryMeasurementQuality`

| Wert | Evidence-fähig | Assessment-fähig |
|------|----------------|------------------|
| `VALID` | Ja | Ja |
| `VALID_PROXY` | Ja (confidence proxy) | Begrenzt |
| `SHADOW` | Ja (nicht publizierbar) | Intern |
| `CONTAMINATED_BY_WAKE` | Nein | Nein |
| `CONTAMINATED_BY_CHARGING` | Nein | Nein |
| `CONTAMINATED_BY_LOAD` | Nein | Nein |
| `CONTAMINATED_BY_ACTIVE_TRIP` | Nein | Nein |
| `INSUFFICIENT_CADENCE` | Nein | Nein |
| `INSUFFICIENT_COVERAGE` | Nein | Nein |
| `TIMESTAMP_INCONSISTENT` | Nein | Nein |
| `STALE` | Nein | Nein |
| `MISSED` | Nein | Nein |
| `UNSUPPORTED_PROFILE` | Nein | Nein |
| `PROVIDER_DELAY` | Nein | Nein |
| `PROVIDER_ERROR` | Nein | Nein |

**Mapping UI `BatteryDataQualityStatus` (Prompt 9):** erfolgt in Service-Layer, nicht als DB-Duplikat.

---

### 3.4 `BatterySessionKind`

| Wert | Beschreibung |
|------|--------------|
| `LV_REST_WINDOW` | Ruhefenster (60m/6h Ziele) |
| `LV_ICE_START` | Trip-Start ±120 s |
| `HV_DIMO_RECHARGE_SEGMENT` | DIMO `segments(mechanism: recharge)` |
| `HV_POLL_CHARGE_WINDOW` | Fallback aus Poll-Flanken (nur Shadow) |
| `HV_DISCHARGE_WINDOW` | Entladesession |

---

### 3.5 `BatterySessionStatus`

| Wert | Bedeutung |
|------|-----------|
| `PLANNED` | Fenster geplant, noch keine VALID-Messung |
| `ACTIVE` | Laufend (`isOngoing`) |
| `COMPLETED` | Abgeschlossen mit ≥1 Measurement oder explizitem MISSED |
| `MISSED` | Geplantes Ende erreicht ohne VALID-Wert |
| `CANCELLED` | Kontext invalidiert (Trip/Wake) |
| `INVALID` | Technisch verworfen |

---

### 3.6 `BatteryCapabilityState`

| Wert | Bedeutung |
|------|-----------|
| `AVAILABLE` | Signal gelistet + Wert in Fenster |
| `AVAILABLE_STALE` | Signal gelistet, TS zu alt |
| `AVAILABLE_NULL` | Signal gelistet, Wert null |
| `NOT_LISTED` | Nicht in `availableSignals` |
| `QUERY_ERROR` | Preflight/Query fehlgeschlagen |
| `UNSUPPORTED` | Profilverbotsfall |

---

### 3.7 `BatteryReferenceCapacitySource`

| Wert | Entscheidungsfähig für SOH-% |
|------|------------------------------|
| `WORKSHOP_MEASUREMENT` | Ja |
| `DOCUMENT_CONFIRMED` | Ja |
| `MANUAL_REPORT` | Ja |
| `PROVIDER_GROSS_NOMINAL` | Nur mit Verifikation |
| `VEHICLE_MASTER` | **Nein** allein (schwache Default-Quelle) |
| `DIMO_NOMINAL_SIGNAL` | **Nein** allein |

---

### 3.8 `BatteryAssessmentKind`

| Wert | Scope |
|------|-------|
| `LV_ESTIMATED_HEALTH` | LV Verhaltensscore |
| `HV_SOH_PROVIDER` | Provider SOH |
| `HV_CAPACITY_SESSION` | Session-M2 Kapazität |
| `HV_CAPACITY_SHADOW` | Interne Shadow-Schätzung |

---

### 3.9 `HvCapacityObservationMethod`

| Wert | Beschreibung |
|------|--------------|
| `SESSION_DELTA_ENERGY_SOC` | M2 aus vollständiger Session |
| `SHADOW_ROLLING_MEDIAN` | Rolling über N Sessions |
| `PROVIDER_GROSS_CAPACITY` | Nur Kontext, nicht SOH |
| `LEGACY_PAIRWISE_POLL` | **Nur Backfill-Tag** — nicht neu schreiben |

---

### 3.10 Erweiterung `BatteryEvidenceValueType` (bestehendes Enum)

| Neuer Wert | Zweck | Alte Entsprechung |
|------------|-------|-------------------|
| `ESTIMATED_HEALTH_SCORE` | LV-Verhaltensscore | Fälschlich `SOH_PERCENT` |

**Kein Drop** von `SOH_PERCENT` — Reclassify per Backfill.

---

## 4. `battery_measurement_sessions`

**Prisma-Modell:** `BatteryMeasurementSession`  
**Tabelle:** `battery_measurement_sessions`

Zeitlich zusammengehöriger Messzyklus (Architektur Ebene 3).

### Felder

| Feld | Prisma-Typ | DB-Spalte | Nullable | Default | Relation | Tenant | Index | Unique | Retention | Backfill | Rollback | Legacy-Entsprechung |
|------|------------|-----------|----------|---------|----------|--------|-------|--------|-----------|----------|----------|---------------------|
| `id` | `String` @id @default(uuid()) | `id` | NO | uuid | PK | — | PK | PK | — | — | Drop table | — |
| `vehicleId` | `String` | `vehicle_id` | NO | — | `Vehicle` CASCADE | via `vehicles.organization_id` | `(vehicle_id, started_at DESC)` | — | 24 Monate LV / 36 Monate HV | Aus `battery_features.rest_*` + Trip-Starts synthetisch | Drop table | `BatteryFeatures.restWindowStartedAt`, `crankTripId` |
| `organizationId` | `String` | `organization_id` | NO | — | `Organization` CASCADE | **Denormalisiert** für Fleet-Retention | `(organization_id, started_at)` | — | wie oben | aus `vehicles.organization_id` | Drop column | — |
| `scope` | `BatteryEvidenceScope` | `scope` | NO | — | — | — | `(vehicle_id, scope, session_kind)` | — | — | LV/HV aus Session-Typ | — | — |
| `sessionKind` | `BatterySessionKind` | `session_kind` | NO | — | — | — | `(session_kind, status)` | — | — | manuell klassifiziert | — | — |
| `status` | `BatterySessionStatus` | `status` | NO | `PLANNED` | — | — | `(vehicle_id, status)` | — | — | `COMPLETED` wenn Messungen existieren | — | — |
| `sessionVersion` | `Int` | `session_version` | NO | `1` | — | — | — | — | — | `1` | — | Schema-Version für Parser |
| `startedAt` | `DateTime` | `started_at` | NO | — | — | — | `(started_at)` | — | — | REST: `rest_window_started_at`; Start: `crank_at` | — | s.o. |
| `endedAt` | `DateTime?` | `ended_at` | YES | null | — | — | — | — | — | Trip-Ende / Segment-Ende | — | — |
| `plannedEndAt` | `DateTime?` | `planned_end_at` | YES | null | — | — | — | — | — | REST: started+60m/6h | — | — |
| `idempotencyKey` | `String` | `idempotency_key` | NO | — | — | — | — | **UNIQUE** `(vehicle_id, idempotency_key)` | — | `lv-rest:{vehicleId}:{startedAtMs}` / `dimo-seg:{segmentId}` | Drop unique | — |
| `dimoSegmentId` | `String?` | `dimo_segment_id` | YES | null | — | — | `(dimo_segment_id)` WHERE NOT NULL | — | — | aus DIMO Segment API | — | — |
| `tripId` | `String?` | `trip_id` | YES | null | `VehicleTrip?` SET NULL | — | `(trip_id)` | — | — | `BatteryFeatures.crank_trip_id` | — | `crankTripId` |
| `provider` | `String?` | `provider` | YES | null | — | — | — | — | — | `DIMO` | — | — |
| `providerObservedAt` | `DateTime?` | `provider_observed_at` | YES | null | — | — | — | — | — | Segment-Start TS | — | — |
| `receivedAt` | `DateTime` | `received_at` | NO | `now()` | — | — | — | — | — | `created_at` der ersten zugehörigen Messung | — | — |
| `metadataJson` | `Json?` | `metadata_json` | YES | null | — | — | — | — | — | `{ policyProfile, targetMessarts[] }` | — | — |
| `createdAt` | `DateTime` | `created_at` | NO | `now()` | — | — | — | — | 24–36 Monate | — | Drop table | — |

### Semantik

- Sessions sind **mutable** nur in `status`, `endedAt`, `metadataJson` — nicht in `startedAt` nach `COMPLETED`.
- `MISSED` Session erzeugt **kein** numerisches Measurement; optional `BatteryMeasurement` mit `quality=MISSED` und `numericValue` null **oder** separater Marker-Row `SESSION_MISSED` (Entscheidung Implementierung: **eine** MISSED-Messung pro Ziel-messart).

### Self-/Supersede

**Nicht erforderlich** für Sessions. Korrektur = neue Session mit neuem `idempotencyKey`; alte bleibt `INVALID`.

---

## 5. `battery_measurements`

**Prisma-Modell:** `BatteryMeasurement`  
**Tabelle:** `battery_measurements`

Ebene 4 — **INSERT-only** (unveränderlich nach Commit).

### Felder

| Feld | Prisma-Typ | DB-Spalte | Nullable | Default | Relation | Tenant | Index | Unique | Retention | Backfill | Rollback | Legacy-Entsprechung |
|------|------------|-----------|----------|---------|----------|--------|-------|--------|-----------|----------|----------|---------------------|
| `id` | `String` @id @default(uuid()) | `id` | NO | uuid | PK | — | PK | PK | — | — | Drop table | — |
| `vehicleId` | `String` | `vehicle_id` | NO | — | `Vehicle` CASCADE | via vehicle | `(vehicle_id, observed_at DESC)` | — | 24/36 Monate | siehe §15 | Drop table | `battery_health_snapshots`, `hv_battery_health_snapshots` |
| `organizationId` | `String` | `organization_id` | NO | — | `Organization` CASCADE | denormalisiert | `(organization_id, observed_at)` | — | wie oben | aus vehicle | — | — |
| `sessionId` | `String?` | `session_id` | YES | null | `BatteryMeasurementSession?` SET NULL | — | `(session_id)` | — | — | nullable für LIVE-only | — | — |
| `scope` | `BatteryEvidenceScope` | `scope` | NO | — | — | — | `(vehicle_id, scope, kind)` | — | — | — | — | — |
| `kind` | `BatteryMeasurementKind` | `kind` | NO | — | — | — | `(kind, quality)` | — | — | Mapping aus Evidence `valueType` | — | — |
| `quality` | `BatteryMeasurementQuality` | `quality` | NO | — | — | — | `(quality)` | — | — | aus `battery_evidence.quality` oder `VALID`/`CONTAMINATED_*` Heuristik | — | `BatteryEvidence.quality` (string) |
| `numericValue` | `Float?` | `numeric_value` | YES | null | — | — | — | — | — | Evidence `numeric_value` | — | Evidence / Snapshots |
| `unit` | `String?` | `unit` | YES | null | — | — | — | — | — | `percent`, `V`, `kWh`, `km` | — | Evidence.unit |
| `observedAt` | `DateTime` | `observed_at` | NO | — | — | — | — | **UNIQUE** `measurement_dedup_key` | — | Provider-TS | — | Evidence.observedAt |
| `receivedAt` | `DateTime` | `received_at` | NO | `now()` | — | — | `(received_at)` | — | — | `battery_evidence.created_at` | — | — |
| `providerFetchedAt` | `DateTime?` | `provider_fetched_at` | YES | null | — | — | — | — | — | `vehicle_latest_states.provider_fetched_at` | — | Live State |
| `provider` | `String?` | `provider` | YES | null | — | — | — | — | — | Evidence.provider | — | — |
| `idempotencyKey` | `String` | `idempotency_key` | NO | — | — | — | — | Teil des UNIQUE | — | `{vehicleId}:{kind}:{observedAtMs}` | — | = Evidence dedup ohne sourceType |
| `sourceJobRef` | `String?` | `source_job_ref` | YES | null | — | — | — | — | — | `vehicle_latest_states.sync_job_ref` | — | — |
| `supersededById` | `String?` | `superseded_by_id` | YES | null | self SET NULL | — | `(superseded_by_id)` | — | — | **nur** Reclassify-Backfill | — | — |
| `metadataJson` | `Json?` | `metadata_json` | YES | null | — | — | — | — | — | `{ engineRunning, odometerKm, contaminationReason }` | — | Snapshot raw_payload |
| `createdAt` | `DateTime` | `created_at` | NO | `now()` | — | — | — | — | gekoppelt an Retention | — | Drop table | — |

### Unique Key (Idempotency)

```sql
UNIQUE INDEX measurement_dedup_key
  ON battery_measurements (vehicle_id, kind, observed_at);
```

**Zusätzlich:** `idempotency_key` UNIQUE global pro Fahrzeug:

```sql
UNIQUE INDEX measurement_idempotency_key
  ON battery_measurements (vehicle_id, idempotency_key);
```

**Regel:** Kein UPDATE auf `numeric_value`, `quality`, `observedAt`. Korrektur = neue Zeile + `supersededById` auf alter Zeile (nur Backfill/Reclassify).

### Abgrenzung Evidence

| Aspekt | Measurement | Evidence |
|--------|-------------|----------|
| Zweck | Rohe Messung mit Qualität | Assessment-zugelassene Wahrheit |
| Dedup | `(vehicle, kind, observedAt)` | `(vehicle, scope, valueType, sourceType, observedAt)` |
| FK | — | optional `measurement_id` → `battery_measurements.id` |

---

## 6. `battery_assessments`

**Prisma-Modell:** `BatteryAssessment`  
**Tabelle:** `battery_assessments`

Ebene 6 — versionierte Berechnungsläufe (append-only).

### Felder

| Feld | Prisma-Typ | DB-Spalte | Nullable | Default | Relation | Tenant | Index | Unique | Retention | Backfill | Rollback | Legacy-Entsprechung |
|------|------------|-----------|----------|---------|----------|--------|-------|--------|-----------|----------|----------|---------------------|
| `id` | `String` @id @default(uuid()) | `id` | NO | uuid | PK | — | PK | PK | 12 Monate detail | aus `battery_features`/`hv_current` | Drop table | — |
| `vehicleId` | `String` | `vehicle_id` | NO | — | `Vehicle` CASCADE | via vehicle | `(vehicle_id, computed_at DESC)` | — | — | 1 Row aus aktuellem Stand | — | — |
| `organizationId` | `String` | `organization_id` | NO | — | `Organization` CASCADE | denormalisiert | `(organization_id, computed_at)` | — | — | — | — | — |
| `scope` | `BatteryEvidenceScope` | `scope` | NO | — | — | — | `(vehicle_id, scope)` | — | — | — | — | — |
| `assessmentKind` | `BatteryAssessmentKind` | `assessment_kind` | NO | — | — | — | — | — | — | — | — | — |
| `assessmentVersion` | `Int` | `assessment_version` | NO | `1` | — | — | — | — | — | `1` | — | Algorithmus-Version |
| `policyProfile` | `String?` | `policy_profile` | YES | null | — | — | — | — | — | `ICE_AGM` etc. | — | — |
| `inputWindowStart` | `DateTime?` | `input_window_start` | YES | null | — | — | — | — | — | — | — | — |
| `inputWindowEnd` | `DateTime?` | `input_window_end` | YES | null | — | — | — | — | — | — | — | — |
| `estimatedHealthScore` | `Float?` | `estimated_health_score` | YES | null | — | — | — | — | — | `battery_features.estimated_soh_pct` | — | **nicht** `publishedSohPct` |
| `estimatedCapacityKwh` | `Float?` | `estimated_capacity_kwh` | YES | null | — | — | — | — | — | HV Shadow | — | `hv_snapshots.estimated_capacity_kwh` |
| `estimatedSohPct` | `Float?` | `estimated_soh_pct` | YES | null | — | — | — | — | — | nur mit Referenz | — | `hv_current.raw_soh_pct` |
| `signalConfidence` | `String?` | `signal_confidence` | YES | null | — | — | — | — | — | `battery_features.confidence` | — | — |
| `maturityConfidence` | `String?` | `maturity_confidence` | YES | null | — | — | — | — | — | `maturity_confidence` | — | — |
| `evidenceIdsJson` | `Json?` | `evidence_ids_json` | YES | null | — | — | — | — | — | IDs der Input-Evidence | — | — |
| `idempotencyKey` | `String` | `idempotency_key` | NO | — | — | — | — | **UNIQUE** `(vehicle_id, idempotency_key)` | — | `{scope}:{version}:{inputHash}` | — | — |
| `supersededById` | `String?` | `superseded_by_id` | YES | null | self SET NULL | — | — | — | — | optional | — | — |
| `computedAt` | `DateTime` | `computed_at` | NO | `now()` | — | — | — | — | — | `battery_features.scored_at` | — | `scoredAt` |
| `createdAt` | `DateTime` | `created_at` | NO | `now()` | — | — | — | — | 12 Monate | — | Drop table | — |

### Semantik

- Jeder Assessment-Run = **neue Zeile** (kein Upsert).
- Publication-Zeilen (`battery_features`, `hv_battery_health_current`) referenzieren `last_assessment_id` (siehe §7).
- LV: Output **niemals** als `SOH_PERCENT` Evidence ohne Override-Quelle.

---

## 7. Publication — Erweiterung vorhandener Publication

**Entscheidung:** **Keine** neue Tabelle `battery_publications` für den operativen Read-Pfad. Stattdessen **additive Spalten** auf den bestehenden 1:1-Modellen + optional **History** später.

### 7.1 Erweiterung `battery_features` (LV Publication)

| Feld (neu) | Prisma-Typ | DB-Spalte | Nullable | Default | Relation | Index | Unique | Backfill | Rollback | Legacy |
|------------|------------|-----------|----------|---------|----------|-------|--------|----------|----------|--------|
| `publishedEstimatedHealth` | `Float?` | `published_estimated_health` | YES | null | — | — | — | Kopie aus `published_soh_pct` wo semantisch LV-Score | Drop column | Zielname für `publishedSohPct` |
| `publicationVersion` | `Int` | `publication_version` | NO | `1` | — | — | — | `1` | Drop column | — |
| `lastAssessmentId` | `String?` | `last_assessment_id` | YES | null | `BatteryAssessment?` SET NULL | `(last_assessment_id)` | — | null | Drop FK | — |
| `policyProfile` | `String?` | `policy_profile` | YES | null | — | — | — | abgeleitet | Drop column | — |

**Bestehende Felder (unverändert, nicht duplizieren):**

- `rawSohPct`, `stabilizedSohPct`, `publishedSohPct` → **deprecated für LV-Semantik**, bleiben für API-Compat bis M4
- `publicationState`, `maturityConfidence`, `lastPublishedAt`, `ewmaAlpha`, Counter-Felder

### 7.2 Erweiterung `hv_battery_health_current` (HV Publication)

| Feld (neu) | Prisma-Typ | DB-Spalte | Nullable | Default | Relation | Index | Backfill | Rollback | Legacy |
|------------|------------|-----------|----------|---------|----------|-------|----------|----------|--------|
| `publishedCapacityKwh` | `Float?` | `published_capacity_kwh` | YES | null | — | — | null (neu) | Drop column | — |
| `publicationVersion` | `Int` | `publication_version` | NO | `1` | — | — | `1` | Drop column | — |
| `lastAssessmentId` | `String?` | `last_assessment_id` | YES | null | `BatteryAssessment?` SET NULL | `(last_assessment_id)` | null | Drop FK | — |
| `referenceCapacityId` | `String?` | `reference_capacity_id` | YES | null | `VehicleBatteryReferenceCapacity?` SET NULL | — | aus master spec | Drop FK | — |
| `sohSource` | `String?` | `soh_source` | YES | null | — | — | `provider_reported` / null | Drop column | abgeleitet aus Methode |

**Bestehende Felder:** `publishedSohPct`, `publicationMethod`, `signalConfidence`, … — **nicht** duplizieren.

### 7.3 Optionale Zukunft: `battery_publication_history`

Nur wenn Audit/Versionierung explizit gefordert — **nicht** Phase P0–P6.

| Feld | Zweck |
|------|-------|
| `vehicleId`, `scope`, `publishedAt`, `snapshotJson` | Immutable Publication-Snapshot |

**Self-/Supersede:** nicht nötig; History ist append-only.

---

## 8. `vehicle_battery_capabilities`

**Prisma-Modell:** `VehicleBatteryCapability`  
**Tabelle:** `vehicle_battery_capabilities`

Preflight-Ergebnis pro Signal/Messart (Architektur §6.3).

### Felder

| Feld | Prisma-Typ | DB-Spalte | Nullable | Default | Relation | Tenant | Index | Unique | Retention | Backfill | Rollback | Legacy |
|------|------------|-----------|----------|---------|----------|--------|-------|--------|-----------|----------|----------|--------|
| `id` | `String` @id | `id` | NO | uuid | PK | — | PK | PK | — | — | Drop table | — |
| `vehicleId` | `String` | `vehicle_id` | NO | — | `Vehicle` CASCADE | via vehicle | — | — | 90 Tage | Preflight-Job | Drop table | — |
| `organizationId` | `String` | `organization_id` | NO | — | `Organization` CASCADE | denormalisiert | `(organization_id)` | — | — | — | — | — |
| `signalKey` | `String` | `signal_key` | NO | — | — | — | — | **UNIQUE** `(vehicle_id, signal_key)` | — | DIMO `availableSignals` | Drop table | — |
| `measurementKind` | `BatteryMeasurementKind?` | `measurement_kind` | YES | null | — | — | — | — | — | Mapping | — | — |
| `capabilityState` | `BatteryCapabilityState` | `capability_state` | NO | `NOT_LISTED` | — | — | `(capability_state)` | — | — | initial `NOT_LISTED` | — | — |
| `lastObservedAt` | `DateTime?` | `last_observed_at` | YES | null | — | — | — | — | — | `vehicle_latest_states.source_timestamp` | — | — |
| `lastProviderFetchAt` | `DateTime?` | `last_provider_fetch_at` | YES | null | — | — | — | — | — | `provider_fetched_at` | — | — |
| `lastValue` | `Float?` | `last_value` | YES | null | — | — | — | — | — | optional | — | — |
| `checkedAt` | `DateTime` | `checked_at` | NO | `now()` | — | — | `(checked_at)` | — | 90 Tage | now() | — | — |
| `metadataJson` | `Json?` | `metadata_json` | YES | null | — | — | — | — | — | `{ queryError }` | — | — |
| `createdAt` | `DateTime` | `created_at` | NO | `now()` | — | — | — | — | — | — | — | — |
| `updatedAt` | `DateTime` | `updated_at` | NO | — | — | — | — | — | — | — | — | — |

**Mutable:** ja (aktueller Capability-Stand pro Signal).

---

## 9. `vehicle_battery_reference_capacities`

**Prisma-Modell:** `VehicleBatteryReferenceCapacity`  
**Tabelle:** `vehicle_battery_reference_capacities`

Verifizierte HV-Referenzkapazität für SOH-% und Session-Capacity (Architektur §4, AC19).

### Felder

| Feld | Prisma-Typ | DB-Spalte | Nullable | Default | Relation | Tenant | Index | Unique | Retention | Backfill | Rollback | Legacy |
|------|------------|-----------|----------|---------|----------|--------|-------|--------|-----------|----------|----------|--------|
| `id` | `String` @id | `id` | NO | uuid | PK | — | PK | PK | unbegrenzt | — | Drop table | — |
| `vehicleId` | `String` | `vehicle_id` | NO | — | `Vehicle` CASCADE | via vehicle | `(vehicle_id, effective_from DESC)` | — | — | — | — | — |
| `organizationId` | `String` | `organization_id` | NO | — | `Organization` CASCADE | denormalisiert | — | — | — | — | — | — |
| `referenceCapacityKwh` | `Float` | `reference_capacity_kwh` | NO | — | — | — | — | — | — | `vehicles.hv_battery_capacity_kwh` wenn gesetzt | — | `Vehicle.hvBatteryCapacityKwh` |
| `source` | `BatteryReferenceCapacitySource` | `source` | NO | — | — | — | — | — | — | `VEHICLE_MASTER` | — | — |
| `verifiedAt` | `DateTime?` | `verified_at` | YES | null | — | — | — | — | — | null für Master | — | — |
| `verifiedByUserId` | `String?` | `verified_by_user_id` | YES | null | `User?` SET NULL | — | — | — | — | — | — | — |
| `documentExtractionId` | `String?` | `document_extraction_id` | YES | null | `VehicleDocumentExtraction?` SET NULL | — | — | — | — | — | — | — |
| `serviceEventId` | `String?` | `service_event_id` | YES | null | `VehicleServiceEvent?` SET NULL | — | — | — | — | — | — | — |
| `effectiveFrom` | `DateTime` | `effective_from` | NO | `now()` | — | — | — | — | — | `created_at` vehicle | — | — |
| `effectiveTo` | `DateTime?` | `effective_to` | YES | null | — | — | — | — | — | null | — | — |
| `isActive` | `Boolean` | `is_active` | NO | `true` | — | — | partial UNIQUE | **UNIQUE** `(vehicle_id) WHERE is_active = true` | — | ein Row pro Vehicle | — | — |
| `supersededById` | `String?` | `superseded_by_id` | YES | null | self SET NULL | — | — | — | — | bei neuer Referenz | — | — |
| `notes` | `String?` | `notes` | YES | null | — | — | — | — | — | — | — | — |
| `createdAt` | `DateTime` | `created_at` | NO | `now()` | — | — | — | — | — | — | — | — |

**Regel:** `VEHICLE_MASTER` allein **nicht** publication-fähig für SOH-% (Architektur V19/AC19).

---

## 10. `hv_charge_sessions`

**Prisma-Modell:** `HvChargeSession`  
**Tabelle:** `hv_charge_sessions`

HV-Ladesession — kanonisch aus DIMO Recharge-Segment oder Poll-Fallback (Shadow).

### Felder

| Feld | Prisma-Typ | DB-Spalte | Nullable | Default | Relation | Tenant | Index | Unique | Retention | Backfill | Rollback | Legacy |
|------|------------|-----------|----------|---------|----------|--------|-------|--------|-----------|----------|----------|--------|
| `id` | `String` @id | `id` | NO | uuid | PK | — | PK | PK | 36 Monate | — | Drop table | — |
| `vehicleId` | `String` | `vehicle_id` | NO | — | `Vehicle` CASCADE | via vehicle | `(vehicle_id, start_at DESC)` | — | — | — | — | — |
| `organizationId` | `String` | `organization_id` | NO | — | `Organization` CASCADE | denormalisiert | — | — | — | — | — | — |
| `measurementSessionId` | `String?` | `measurement_session_id` | YES | null | `BatteryMeasurementSession?` SET NULL | — | — | — | — | 1:1 wenn Segment | — | — |
| `dimoSegmentId` | `String?` | `dimo_segment_id` | YES | null | — | — | — | **UNIQUE** `(vehicle_id, dimo_segment_id)` WHERE NOT NULL | — | DIMO API | — | — |
| `source` | `String` | `source` | NO | `DIMO_RECHARGE_SEGMENT` | — | — | — | — | — | — | — | — |
| `startAt` | `DateTime` | `start_at` | NO | — | — | — | — | — | — | aus Segment | — | abgeleitet aus HV Snapshots |
| `endAt` | `DateTime?` | `end_at` | YES | null | — | — | — | — | — | — | — | — |
| `startSocPercent` | `Float?` | `start_soc_percent` | YES | null | — | — | — | — | — | Snapshots | — | `HvBatteryHealthSnapshot.socPercent` |
| `endSocPercent` | `Float?` | `end_soc_percent` | YES | null | — | — | — | — | — | — | — | — |
| `startEnergyKwh` | `Float?` | `start_energy_kwh` | YES | null | — | — | — | — | — | — | — | `energy_used_kwh` |
| `endEnergyKwh` | `Float?` | `end_energy_kwh` | YES | null | — | — | — | — | — | — | — | — |
| `energyAddedKwh` | `Float?` | `energy_added_kwh` | YES | null | — | — | — | — | — | ΔEnergy | — | — |
| `deltaSocPercent` | `Float?` | `delta_soc_percent` | YES | null | — | — | — | — | — | berechnet | — | — |
| `isOngoing` | `Boolean` | `is_ongoing` | NO | `false` | — | — | `(vehicle_id, is_ongoing)` | — | — | — | — | — |
| `sessionQuality` | `BatteryMeasurementQuality?` | `session_quality` | YES | null | — | — | — | — | — | SHADOW initial | — | — |
| `idempotencyKey` | `String` | `idempotency_key` | NO | — | — | — | — | **UNIQUE** `(vehicle_id, idempotency_key)` | — | `hv-charge:{segmentId}` | — | — |
| `providerObservedAt` | `DateTime?` | `provider_observed_at` | YES | null | — | — | — | — | — | Segment TS | — | — |
| `receivedAt` | `DateTime` | `received_at` | NO | `now()` | — | — | — | — | — | — | — | — |
| `metadataJson` | `Json?` | `metadata_json` | YES | null | — | — | — | — | — | `{ maxChargingPowerKw }` | — | — |
| `createdAt` | `DateTime` | `created_at` | NO | `now()` | — | — | — | — | 36 Monate | — | Drop table | — |
| `updatedAt` | `DateTime` | `updated_at` | NO | — | — | — | — | — | — | nur `endAt`, `isOngoing`, `sessionQuality` | — | — |

**Mutable:** begrenzt auf Session-Abschluss-Felder — keine nachträgliche Änderung von `startAt`/`startSoc` nach `COMPLETED`.

---

## 11. `hv_capacity_observations`

**Prisma-Modell:** `HvCapacityObservation`  
**Tabelle:** `hv_capacity_observations`

M2-Shadow / Session-Kapazitätsschätzungen (INSERT-only).

### Felder

| Feld | Prisma-Typ | DB-Spalte | Nullable | Default | Relation | Tenant | Index | Unique | Retention | Backfill | Rollback | Legacy |
|------|------------|-----------|----------|---------|----------|--------|-------|--------|-----------|----------|----------|--------|
| `id` | `String` @id | `id` | NO | uuid | PK | — | PK | PK | 36 Monate | — | Drop table | — |
| `vehicleId` | `String` | `vehicle_id` | NO | — | `Vehicle` CASCADE | via vehicle | `(vehicle_id, observed_at DESC)` | — | — | — | — | — |
| `organizationId` | `String` | `organization_id` | NO | — | `Organization` CASCADE | denormalisiert | — | — | — | — | — | — |
| `chargeSessionId` | `String?` | `charge_session_id` | YES | null | `HvChargeSession?` SET NULL | — | `(charge_session_id)` | — | — | — | — | — |
| `observationMethod` | `HvCapacityObservationMethod` | `observation_method` | NO | — | — | — | `(observation_method)` | — | — | `LEGACY_PAIRWISE_POLL` für Alt | — | pairwise snapshots |
| `estimatedCapacityKwh` | `Float?` | `estimated_capacity_kwh` | YES | null | — | — | — | — | — | HV Snapshots | — | `estimated_capacity_kwh` |
| `estimatedSohPct` | `Float?` | `estimated_soh_pct` | YES | null | — | — | — | — | — | nur mit Referenz | — | `soh_percent` |
| `referenceCapacityKwh` | `Float?` | `reference_capacity_kwh` | YES | null | — | — | — | — | — | Snapshot zum Compute-Zeitpunkt | — | `hvBatteryCapacityKwh` |
| `deltaSocPercent` | `Float?` | `delta_soc_percent` | YES | null | — | — | — | — | — | Session | — | — |
| `deltaEnergyKwh` | `Float?` | `delta_energy_kwh` | YES | null | — | — | — | — | — | Session | — | — |
| `quality` | `BatteryMeasurementQuality` | `quality` | NO | `SHADOW` | — | — | `(quality)` | — | — | SHADOW für Alt | — | — |
| `observedAt` | `DateTime` | `observed_at` | NO | — | — | — | — | **UNIQUE** `(vehicle_id, observation_method, observed_at)` | — | Session-Ende | — | — |
| `receivedAt` | `DateTime` | `received_at` | NO | `now()` | — | — | — | — | — | — | — | — |
| `assessmentId` | `String?` | `assessment_id` | YES | null | `BatteryAssessment?` SET NULL | — | — | — | — | — | — | — |
| `idempotencyKey` | `String` | `idempotency_key` | NO | — | — | — | — | **UNIQUE** `(vehicle_id, idempotency_key)` | — | — | — | — |
| `metadataJson` | `Json?` | `metadata_json` | YES | null | — | — | — | — | — | `{ cv, sessionCount }` | — | — |
| `createdAt` | `DateTime` | `created_at` | NO | `now()` | — | — | — | — | 36 Monate | — | Drop table | — |

**Kein UPDATE** auf Schätzwerten nach Insert.

---

## 12. Erweiterungen an bestehenden Modellen

### 12.1 `battery_evidence` (additiv)

| Feld (neu) | Prisma-Typ | DB-Spalte | Nullable | Default | Zweck |
|------------|------------|-----------|----------|---------|-------|
| `measurementId` | `String?` | `measurement_id` | YES | null | FK → `battery_measurements.id` ON DELETE SET NULL |

**Index:** `(measurement_id)`  
**Kein Unique** — mehrere Evidence-Typen können eine Measurement referenzieren.

### 12.2 `battery_health_snapshots` / `hv_battery_health_snapshots`

**Keine neuen Spalten in P0–P6.** Optional später:

| Feld | Zweck |
|------|-------|
| `legacy_import_batch_id` | Backfill-Tracking |

Writes in Snapshots werden per Feature-Flag gestoppt, Tabelle bleibt für Trend.

### 12.3 `vehicles`

**Keine Änderung** an `hv_battery_capacity_kwh` — bleibt schwache Master-Angabe; Entscheidungen über `vehicle_battery_reference_capacities`.

---

## 13. Tenant-Scope, Indizes, Idempotency

### 13.1 Tenant-Scope

| Modell | Isolation |
|--------|-----------|
| Alle neuen Tabellen | `vehicle_id` → `vehicles.organization_id` (FK CASCADE) |
| Denormalisiertes `organization_id` | **Empfohlen** auf Session/Measurement/Assessment für Retention-Jobs und Fleet-Queries ohne JOIN |
| Application layer | Jeder Query filtert über `vehicleId` aus org-scoped Vehicle-Zugriff |

**Kein** `organization_id` auf `battery_features` / `hv_battery_health_current` (bestehend) — 1:1 pro Vehicle reicht.

### 13.2 Idempotency-Übersicht

| Entität | Idempotency Key |
|---------|-----------------|
| Session | `(vehicle_id, idempotency_key)` — z. B. `dimo-seg:{id}` |
| Measurement | `(vehicle_id, kind, observed_at)` + `idempotency_key` |
| Assessment | `(vehicle_id, idempotency_key)` mit Input-Hash |
| Evidence | bestehend: `(vehicle_id, scope, value_type, source_type, observed_at)` |
| HV Charge Session | `(vehicle_id, dimo_segment_id)` oder `idempotency_key` |
| HV Capacity Observation | `(vehicle_id, observation_method, observed_at)` |

### 13.3 Provider `observedAt` vs. `receivedAt`

| Feld | Semantik |
|------|----------|
| `observedAt` / `provider_observed_at` | Provider-Signalzeit — für STALE, Session-Bounds, Dedup |
| `receivedAt` | SynqDrive-Ingest-Zeit — für Ops/Debug |
| `providerFetchedAt` | Poll-Zeitpunkt — für `liveFreshness` (aus `vehicle_latest_states` gespiegelt) |

**STALE-Entscheidung:** immer an **`observedAt`** (Architektur §6.2, Prompt 9).

---

## 14. Retention

| Tabelle | Produktions-Retention | Begründung |
|---------|----------------------|------------|
| `battery_measurements` | LV 24 Monate, HV 36 Monate | Sizing; REST-Trend |
| `battery_measurement_sessions` | wie Measurements | Session-Kontext |
| `battery_assessments` | 12 Monate (Detail), Aggregat in Publication | Audit vs. Speicher |
| `hv_charge_sessions` | 36 Monate | AC13/AC14 Session-Historie |
| `hv_capacity_observations` | 36 Monate Shadow | Median/CV-Analyse |
| `vehicle_battery_capabilities` | 90 Tage Rolling (upsert) | Preflight ist aktuell |
| `vehicle_battery_reference_capacities` | unbegrenzt (mit `effective_to`) | Compliance |
| `battery_health_snapshots` | 24 Monate (bestehend, Ops) | Legacy-Trend |
| `hv_battery_health_snapshots` | **12 Monate** nach V2 (Dedup vorher) | ~108k Duplikate bereinigen |
| `battery_evidence` | unbegrenzt; archivierbar nach 36 Monate SHADOW-only | Evidence-Priorität |

**Job:** `battery-v2-retention-worker` (neu) — org-scoped, dry-run default.

---

## 15. Backfill

| Quelle | Ziel | Strategie | Risiko |
|--------|------|-----------|--------|
| `battery_evidence` (522 falsche LV SOH) | `battery_measurements` + reclassify `ESTIMATED_HEALTH_SCORE` | Batch mit `supersededById`; **kein** neuer Publication-Write | Mittel |
| `battery_health_snapshots` REST | `battery_measurements` REST_* | `quality=CONTAMINATED_*` wenn V>13.2; sonst SHADOW | Hoch |
| `hv_battery_health_snapshots` | **nicht** als VALID Capacity | `hv_capacity_observations` mit `LEGACY_PAIRWISE_POLL` + `SHADOW` only | Hoch |
| `battery_features` | `battery_assessments` + `published_estimated_health` | 1 Snapshot-Zeile pro Vehicle | Niedrig |
| `hv_battery_health_current` | `battery_assessments` | Provider-Zeilen behalten; `published_soh_pct=85` ohne Basis → **null** | Mittel |
| `vehicles.hv_battery_capacity_kwh` | `vehicle_battery_reference_capacities` | `source=VEHICLE_MASTER`, `is_active=true`, `verified_at=null` | Niedrig |
| DIMO Segments (31d) | `hv_charge_sessions` | On-demand API Backfill pro Vehicle | API-Quota |

**Vor jedem Backfill:** Backup-Tabellen `*_bak_YYYYMMDD` (Architektur §8.3).

**Kein Backfill** erzeugt publication-fähige VALID Capacity aus Poll-Paaren (Prompt 8 Vertrag).

---

## 16. Rollback

| Phase | Rollback |
|-------|----------|
| P0 Enums | Enums nicht droppen wenn verwendet; Forward-only |
| P1–P5 neue Tabellen | `DROP TABLE` in umgekehrter Reihenfolge; Datenverlust nur in V2-Tabellen |
| P6 Publication-Spalten | `ALTER TABLE DROP COLUMN` auf `battery_features` / `hv_battery_health_current` |
| P7 Evidence Enum | Enum-Wert bleibt (PostgreSQL) — ungenutzt |
| Application | Feature-Flags OFF → Legacy-Pfad (`battery_features` allein) |

**Publication-Rollback:** neue Spalten nullen; bestehende `published_soh_pct` unverändert.

---

## 17. Abnahmekriterien (Schema-Prompt)

| ID | Kriterium |
|----|-----------|
| SP01 | Alle geforderten Entitäten dokumentiert mit Feld-Tabelle |
| SP02 | Keine Duplikation bestehender Publication-Felder |
| SP03 | Measurements INSERT-only Semantik |
| SP04 | Idempotency Keys pro Schreibpfad |
| SP05 | `observedAt` + `receivedAt` + `providerFetchedAt` getrennt |
| SP06 | Session- und Assessment-Version Felder |
| SP07 | Self-/Supersede nur wo nötig (Measurement-Reclassify, Reference-Capacity) |
| SP08 | Tenant-Scope dokumentiert |
| SP09 | Retention + Backfill + Rollback pro Tabelle |
| SP10 | Legacy-Entsprechung je Feld |
| SP11 | Publication als Erweiterung, nicht Parallelmodell |
| SP12 | Kein Schema-Change in diesem Prompt |

---

## Referenzen

- [`battery-health-v2.md`](./battery-health-v2.md)
- [`battery-health-v2-rollout-flags.md`](./battery-health-v2-rollout-flags.md)
- [`../audits/battery-measurement-domain-decision.md`](../audits/battery-measurement-domain-decision.md)
- [`../audits/battery-v2-implementation-inventory.md`](../audits/battery-v2-implementation-inventory.md)
- `backend/prisma/schema.prisma` (Zeilen 2017–5707)
- `backend/prisma/migrations/20260614120300_battery_health_tables_guard/migration.sql`

---

*Implementierungsstatus: **Dokumentation only** (Prompt 10/78). Nächster Schritt: Prisma-Schema-PR nach Feature-Flag Phase P0.*
