# Vehicle Detail Page — Request Control, Abort & Backoff (2026-07)

| Feld | Wert |
|------|------|
| **Audit-Datum** | 2026-07-24 |
| **Prompt** | 19/36 — Request Control, Abort und Backoff |
| **Vorgänger** | [`vehicle-detail-page-polling-lifecycle-2026-07.md`](./vehicle-detail-page-polling-lifecycle-2026-07.md) |

---

## Ziel

Robuste GPS- und Telemetrie-Requests auf der Vehicle Detail Page: kontrollierte Abbrüche, keine überlappenden Requests, keine veralteten Antworten nach Fahrzeugwechsel, exponentielles Backoff mit Jitter, keine Retry-Stürme, nutzerfreundliche Fehlermeldungen.

---

## Architektur

| Komponente | Pfad |
|------------|------|
| Request-Koordinator (Single-Flight, Generation-Binding) | `frontend/src/rental/lib/vehicle-telemetry-request-coordinator.ts` |
| Fehlerklassifikation + Abort/Timeout-Signale | `frontend/src/rental/lib/vehicle-telemetry-request-error.ts` |
| Backoff-Konstanten + Jitter | `frontend/src/rental/lib/vehicle-telemetry-retry.ts` |
| Nutzer-Meldungen (DE, ohne API-Text) | `frontend/src/rental/lib/telemetry-user-messages.ts` |
| HTTP-Metadaten (`ApiHttpError`, Retry-After) | `frontend/src/lib/api.ts` |
| Hook-Integration | `frontend/src/rental/hooks/useLiveVehicleTelemetry.ts` |

### Request-Lebenszyklus

1. `coordinator.bind(orgId, vehicleId)` bei Fahrzeugwechsel → Generation++, alle Kanäle abbrechen.
2. Polling-Loop ruft `coordinator.run({ channel, binding, execute(signal) })` auf.
3. Pro Kanal maximal **ein** in-flight Request; parallele Aufrufe werden verworfen.
4. `execute` übergibt `AbortSignal` an `api.vehicles.telemetry` / `liveGps`.
5. Timeout via kombiniertem Signal (Parent-Abort + Fetch-Timeout).
6. Antwort wird nur angewendet, wenn `binding.generation` noch gültig und Store an `orgId`/`vehicleId` gebunden ist.
7. Bei Fehler: Klassifikation → Backoff-Delay für nächsten Poll-Tick; Nutzerfehler erst ab `ERROR_SURFACE_AFTER` (2) aufeinanderfolgende Fehler.

### Abbruch-Matrix

| Ereignis | Verhalten |
|----------|-----------|
| Fahrzeugwechsel | `bind()` → `abortAll()`, Generation bump |
| Unmount / `vehicleId` null | `reset()` + Timer clear |
| Tab-/Gate-Schließung | `abortChannel('dashboard' \| 'gps')` + Loop-ID bump |
| Timeout | Retry mit Backoff (nicht als Nutzer-Abort) |
| Parent-Abort | Kein Store-Update, kein Fehler-Flackern |

### Retry-Policy

| Status / Fehler | Retry | Backoff |
|-----------------|-------|---------|
| 401 / Session expired | Nein | — |
| 403 Permission / Data-Auth | Nein | Access-Block → Gates schließen |
| 404 | Nein | — |
| 429 | Ja | `Retry-After` wenn vorhanden, sonst exponentiell + Jitter |
| 5xx | Ja | Exponentiell + Jitter (max 60s) |
| Offline / Network | Ja | Exponentiell + Jitter |
| Timeout | Ja | Exponentiell + Jitter |
| Abort (Gate/Vehicle) | Nein | Normal-Intervall |

`MAX_ATTEMPTS = 4` — danach normaler Poll-Intervall statt weiterer Backoff-Eskalation.

---

## Tests

| Datei | Abdeckung |
|-------|-----------|
| `vehicle-telemetry-retry.test.ts` | Retry-After, Jitter, Status-Klassifikation |
| `vehicle-telemetry-request-error.test.ts` | 401/403/404/429/500/offline/session, Timeout-Signal |
| `vehicle-telemetry-request-coordinator.test.ts` | Stale binding, Single-Flight, 403, 500 backoff, Abort |
| `useLiveVehicleTelemetry.request-control.test.ts` | Fahrzeugwechsel, Gate-Abort, 429 Retry-After, Unmount, Nutzer-Meldungen, Recovery |
| `useLiveVehicleTelemetry.polling-lifecycle.test.ts` | Regression Polling-Lifecycle (mit AbortSignal) |

---

**SynqDrive Code → Changes / Architektur:** nicht aktualisiert (externes Workspace).
