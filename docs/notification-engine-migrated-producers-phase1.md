# Notification Engine — Migrated Producers (Phase 1)

Shadow-mode migration of the highest-priority notification producers into the V2 core engine (`NOTIFICATIONS_V2`). V1 rendering (DashboardInsight, ActionQueue, `normalizeOperationalIssues`) remains the primary UI path.

## Shadow mode

| Flag | Default | Effect |
|------|---------|--------|
| `NOTIFICATIONS_V2` | `false` | When off, `NotificationProducerIngestService` routes are no-ops (`FLAG_OFF`). |
| Registry `shadowModeEnabled` | per event type | Adapter writes only when both flag and shadow are on. |

No duplicate external delivery: V2 persists to `Notification` tables only; V1 insight publish and rental ActionQueue are unchanged.

---

## Migrated producers

| Priority | Producer module | V2 event type | Adapter |
|----------|-----------------|---------------|---------|
| 1 | `vehicle-intelligence` — `DrivingAssessmentDeviceQualityService` | `DRIVING_ASSESSMENT_DEVICE_QUALITY` | `DrivingAssessmentNotificationAdapter` |
| 2 | (same) — recovery via `NORMAL` / `RECOVERING` | same fingerprint → `RESOLVED` | SUCCESS severity ingest |
| 3 | `technical-observations` — `TechnicalObservationsService` | `TECHNICAL_OBSERVATION_ACTIVE` | `TechnicalObservationNotificationAdapter` |
| 4 | — | *(no aggregate V2 event)* | Generic “N aktive Gesundheitshinweise” stays UI-only grouping |
| 5 | `business-insights` — `StationShortageDetector` | `STATION_SHORTAGE` | `StationShortageNotificationAdapter` |
| 6 | `rental-health` + `dtc` — fleet eval + DIMO poll | `ACTIVE_DTC`, `TIRE_CRITICAL`, `BRAKE_CRITICAL`, `BATTERY_CRITICAL` | `VehicleHealthNotificationAdapter` (**live**, `shadowModeOnly: false`) |

Orchestration: `NotificationProducerIngestService` (+ `NotificationProducerRouter`).

---

## Old data paths → new hooks

### A. Fahrbewertungsqualität

| Layer | Old path | V2 hook |
|-------|----------|---------|
| Runtime | `DrivingAssessmentDeviceQualityService.evaluateAfterLteR1Trip` → `vehicleDrivingAssessmentQuality` | `syncV2DrivingAssessment()` after state transition |
| BI (V1 UI) | `DrivingAssessmentDeviceQualityDetector` → `DashboardInsight` | **Not** duplicated into V2 (runtime is source of truth) |
| Auto-observation | `syncObservation()` creates system `VehicleComplaint` | Covered by driving-assessment event only |

**Fachlicher Zustand:** LTE_R1 native-event density / device quality → `DEGRADED` | `RECOVERING` | `NORMAL`.

**Fingerprint:**

```
{orgId}|DRIVING_ASSESSMENT_DEVICE_QUALITY|VEHICLE|{vehicleId}|driving_assessment_device_quality|v1
```

**Resolution:**

- `DEGRADED` → OPEN WARNING (`notification.title.drivingAssessmentDegraded`)
- Re-ingest same state → update same row, `occurrenceCount++`
- `RECOVERING` or `NORMAL` → SUCCESS ingest → `RESOLVED` (no new “normalisiert” warning card in V2)
- Device-quality system observations (`driving-assessment-device-quality:v1`) → **excluded** from `TECHNICAL_OBSERVATION_ACTIVE`

### B. Technische Beobachtung

| Layer | Old path | V2 hook |
|-------|----------|---------|
| CRUD | `TechnicalObservationsService` create / resolve / dismiss / convert | `syncTechnicalObservationActive` / `syncTechnicalObservationResolved` |
| Rental health | `rental-health` complaints module + health alerts | V1 unchanged |

**Fingerprint (per observation):**

```
{orgId}|TECHNICAL_OBSERVATION_ACTIVE|VEHICLE|{vehicleId}|technical_observation_active:{observationId}|v1
```

**Resolution:** resolve / dismiss / convert → SUCCESS ingest → `RESOLVED`. Re-process same active observation → update, `occurrenceCount++`.

### C. Vehicle health aggregation

- “1 aktiver Gesundheitshinweis” / “2 aktive …” = **UI group subtitle** (`actionQueueGrouping.ts`), not a persistent notification.
- `suppressGenericHealthFallbacks()` drops `health_review_required` when concrete `vehicle_health` issues exist.
- **No V2 aggregate event type** — concrete V2 notifications are source of truth; UI may group by vehicle.

### D. Station Shortage

| Layer | Old path | V2 hook |
|-------|----------|---------|
| Detector | `StationShortageDetector` (English insight title/message for V1) | `metrics.stationName` + V2 German template keys |
| Publish | `BusinessInsightsService.runForOrganization` → `publishInsights` | `syncStationShortagesFromInsights` after bridge |

**Fingerprint:**

```
{orgId}|STATION_SHORTAGE|STATION|{stationId}|shortage|v1
```

**Template params:** `stationName`, `available`, `totalVehicles`, `threshold` (i18n keys `notification.title/body.stationShortage`).

**Resolution:** station absent from current detector output → SUCCESS ingest → `RESOLVED`.

### E. Vehicle health (Rental Health V1) — V4.9.365

| Layer | Old path | V2 hook |
|-------|----------|---------|
| Module state | `RentalHealthService.getVehicleHealth` → frontend `useVehicleHealthAlerts` | `projectVehicleHealthWarnings` → `syncVehicleHealthWarnings` |
| DTC | `VehicleDtcEvent` + DIMO poll | Per-code `ACTIVE_DTC`; realtime via `DimoDtcProcessor.emitDtcHealthNotifications` |
| Batch | — | `BusinessInsightsService` after each eval run (fleet sweep-resolve) |

**Fingerprints:**

```
{orgId}|ACTIVE_DTC|VEHICLE|{vehicleId}|active_dtc:{dtcCode}|v1
{orgId}|TIRE_CRITICAL|VEHICLE|{vehicleId}|tires_critical|v1
{orgId}|BRAKE_CRITICAL|VEHICLE|{vehicleId}|brakes_critical|v1
{orgId}|BATTERY_CRITICAL|VEHICLE|{vehicleId}|battery_critical|v1
```

**Resolution:** module returns good/unknown/n_a, or DTC cleared → SUCCESS ingest → `RESOLVED`. Frontend bridge (`mergeV2NotificationsWithVehicleHealth`) dedupes against API rows during transition.

---

## V1 vs V2 comparison

| Concern | V1 (unchanged) | V2 (shadow) |
|---------|----------------|-------------|
| Driving assessment degraded | `DashboardInsight` + normalized operational issue | Single `Notification` row per vehicle fingerprint |
| Recovering | Insight INFO + queue `success`/`resolved` styling | Same fingerprint → `RESOLVED` (no extra warning) |
| Technical observation | Health alert + runtime reason dedupe in frontend | One `Notification` per `observationId` |
| Generic health hint | Runtime `health_review_required` (suppressed when concrete) | Not emitted |
| Station shortage | Legacy insight loop in `actionQueueBuilder` | Registry candidate with DE template keys + `OPEN_STATION` CTA |

---

## Remaining problematic producers (not phase 1)

- Other BI detectors (pickup overdue, compliance, …) — some still V1-only insights
- Operational issues / blocked vehicle / maintenance — not hooked
- DIMO webhook / trip analysis event types (except DTC poll → ACTIVE_DTC)
- Service compliance / complaints / OEM alerts — Rental Health modules without dedicated V2 event types yet
- Driving assessment **BI** path still publishes RECOVERING as V1 INFO (frontend handles); V2 uses runtime recovery only

---

## Tests

- `backend/src/modules/notifications/adapters/notification-producers-phase1.spec.ts` — WOB L 7503 + station shortage + vehicle health
- `backend/src/modules/notifications/adapters/rental-health-notification.spec.ts` — projector + adapter
- `frontend/src/rental/components/dashboard/notificationEngine.wob-l7503.test.ts` — V1 queue regression (unchanged)

**WOB L 7503 expectations (V2):**

1. One open `DRIVING_ASSESSMENT_DEVICE_QUALITY` for `veh-wob-l-7503`
2. One open `TECHNICAL_OBSERVATION_ACTIVE` for real observation (not device-quality auto obs)
3. No third generic health notification
4. After `NORMAL`, driving-assessment row `RESOLVED`, stable id on re-ingest
