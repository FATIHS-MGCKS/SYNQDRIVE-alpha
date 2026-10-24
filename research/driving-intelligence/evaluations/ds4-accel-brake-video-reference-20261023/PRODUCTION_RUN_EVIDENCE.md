# Produktionsnachweis — Motion-Core-Shadow-Läufe seit Deploy `579ee8b2` (2026-10-23)

Ergebnis: **nicht AUSSTEHEND.** Seit dem Release `20261023105624_v4994` (`579ee8b2fed06593d7d2aa57cffb6036dbf53a24`)
liefen auf Produktion **21 Motion-Core-Shadow-Läufe mit Status `SUCCEEDED`** und dem neuen Bundle
`DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_LEG_GATE_OBD_POINT_AUTH_V4`, darunter der Tiguan-Referenztrip `98d2a8e0`.
Alle Zugriffe waren **lesend** (SSH `synqdrive-admin`, `psql` SELECT, `pm2 logs`/`jlist`, `grep` auf Logdateien).
Keine Flags geändert, keine Jobs gestartet, keine Daten mutiert.

## 1. Auslöser und wirksamer Default (Code `579ee8b2`)

| Frage | Befund | Quelle |
| --- | --- | --- |
| Gibt es `DI_V0_MOTION_CORE_SHADOW_SCHEDULER_ENABLED`? | **Nein.** Die Variable existiert im Backend-Code nicht (`grep` über `backend/src` ohne Treffer); `<unset>` im Flag-Snapshot ist daher bedeutungslos. | `backend/src/**` |
| Was startet die Läufe? | `DiV0MotionCoreShadowScheduler.onModuleInit()` setzt bei `service.isConfigured()` ein `setInterval` mit `schedulerIntervalMs = 90_000` (90 s) **innerhalb des Nest-Prozesses**. Kein Cron, kein externer Job. | `motion-core-shadow-worker/di-v0-motion-core-shadow.scheduler.ts`, `di-v0-motion-core-shadow.config.ts` (`DI_V0_MOTION_CORE_SHADOW_TUNING`) |
| Wann ist `isConfigured()` wahr? | `isDiV0MotionCoreShadowWorkerRunnable` = `DI_V0_MOTION_CORE_SHADOW_ENABLED` **und** `DI_V0_MOTION_CORE_SHADOW_WORKER_ENABLED` **und** `DI_V0_MOTION_CORE_SHADOW_ENABLED_SINCE` gesetzt. Allowlists (`…_ORGANIZATION_ALLOWLIST`, `…_VEHICLE_ALLOWLIST`) steuern die Eignung der Trips, nicht den Scheduler. | `di-v0-motion-core-shadow-control-plane.ts` (`isDiV0MotionCoreShadowRunnable`), `di-v0-motion-core-shadow.config.ts` (`isDiV0MotionCoreShadowWorkerRunnable`) |
| Doppelte Ausführung auf zwei Replikaten? | Jeder Tick prüft `SchedulerLeaderGuardService.shouldRun('di_v0_motion_core_shadow_v1')`; nur der Leader arbeitet. | `di-v0-motion-core-shadow.scheduler.ts` (`LEADER_JOB`) |
| Was zählt ein Lauf als akzeptiert? | `eventAcceptedCount` = Ereignisse mit `quality !== 'ARTEFACT_SUSPECT'`; `DEGRADED`/`LIMITED` zählen als akzeptiert. | `di-v0-motion-core-shadow-processor.ts` (Z. 154–155) |

Auf Produktion sind in `/opt/synqdrive/current/backend/.env` genau diese Variablen vorhanden
(`DI_V0_MOTION_CORE_SHADOW_ENABLED`, `…_WORKER_ENABLED=true`, `…_ENABLED_SINCE`, `…_BATCH_LIMIT`,
`…_ORGANIZATION_ALLOWLIST`, `…_VEHICLE_ALLOWLIST`; nur Namen gelesen, keine Werte außer dem bereits dokumentierten
`WORKER_ENABLED=true`). Der Scheduler ist damit **implizit aktiv**; ein separates Scheduler-Flag ist weder vorhanden
noch nötig.

## 2. Beobachtete Läufe (lesend, DB `synqdrive`)

Prozesse nach Deploy: `synqdrive` (Port 3001, PID 2048483) und `synqdrive-b` (Port 3002, PID 2048737), beide
`release_sha=579ee8b2…`, Health 200 um 11:15:54Z. Leader-Election-Log (`/root/.pm2/logs/synqdrive-out.log`):

```
2026-10-23T11:14:55 [SchedulerLeaderElectionService] Scheduler leader election enabled owner=srv1374778:2048483:6c0b1b46 leaseMs=30000 …
2026-10-23T11:15:25 [SchedulerLeaderElectionService] Scheduler leadership acquired owner=srv1374778:2048483:6c0b1b46
```

Läufe nach Bundle (gesamte Tabelle `di_v0_motion_core_shadow_runs_v1`):

| Bundle | Status | Läufe | erster | letzter |
| --- | --- | --- | --- | --- |
| `…_LEG_GATE_OBD_POINT_AUTH_V4` (neu, 579ee8b2) | SUCCEEDED | **21** | 2026-10-23 11:16:26Z | 2026-10-23 11:25:25Z |
| `…_FABLE_REVIEW_RECOMMENDED` (vor Deploy) | SUCCEEDED | 19 | 2026-10-22 09:02:10Z | 2026-10-23 10:54:22Z |

Modulstart 11:14:54Z + 90 s Intervall ⇒ erster Tick ≈ 11:16:24Z; Leadership lag seit 11:15:25Z vor; erste Zeile
11:16:26Z. Die 21 Läufe verteilen sich auf 4 Fahrzeuge: 10 Läufe um 11:16:26–34Z, 10 Läufe um 11:17:55–11:18:04Z
(zwei Pässe, konsistent mit dem Default-Batch-Limit 10 — der Produktionswert von `…_BATCH_LIMIT` wurde nicht
gelesen), ein weiterer Lauf 11:25:25Z.

| created_at (UTC) | Trip | Fahrzeug | labels | `eventAcceptedCount` | `eventArtefactSuspectCount` | sparseComparable |
| --- | --- | --- | --- | --- | --- | --- |
| 11:16:26.355 | 7a7e062f | c10351f8 | 1320 | 29 | 0 | true |
| 11:16:26.527 | 448c948d | c10351f8 | 401 | 9 | 0 | true |
| 11:16:26.774 | 7800f2bf | 68868291 | 1110 | 11 | 0 | false |
| 11:16:26.912 | 77ccb254 | 68868291 | 752 | 12 | 0 | false |
| 11:16:27.828 | fb75bf6d | 19fedd4b | 1237 | 5 | 0 | true |
| 11:16:28.929 | 1fb80e36 | c10351f8 | 1360 | 16 | 0 | true |
| 11:16:30.641 | 184312f9 | c10351f8 | 1752 | 7 | 0 | true |
| 11:16:30.914 | ab5f49a7 | 68868291 | 1147 | 11 | 0 | false |
| **11:16:33.407** | **98d2a8e0** (TIG22) | 19fedd4b | 2094 | **20** | 0 | true |
| 11:16:34.061 | bb7885bd | c10351f8 | 985 | 23 | 0 | true |
| 11:17:55.669 | 63bbffce | 68868291 | 1459 | 11 | 0 | false |
| 11:17:55.707 | df818d91 | 68868291 | 180 | 0 | 0 | false |
| 11:17:58.075 | a01d3e74 | 68868291 | 3750 | 15 | 0 | false |
| 11:17:58.116 | 7f1ed7b9 | 19fedd4b | 67 | 7 | 0 | true |
| 11:17:59.386 | 2db7393f | c10351f8 | 1363 | 23 | 0 | true |
| 11:18:01.924 | 17990e02 | c10351f8 | 1841 | 12 | 0 | true |
| 11:18:02.555 | f02a4777 | 8c850ff1 | 837 | 4 | 0 | true |
| 11:18:03.757 | 3a9bad72 | c10351f8 | 1324 | 26 | 0 | true |
| 11:18:03.874 | 3bde7eb1 | 8c850ff1 | 284 | 7 | 0 | true |
| 11:18:04.049 | 37c2bebf | 68868291 | 637 | 5 | 0 | false |
| 11:25:25.169 | 000245af | 19fedd4b | 122 | 3 | 0 | true |

`summary_json` enthält nur `bundleVersion, contentFingerprint, eventAcceptedCount, eventArtefactSuspectCount,
intentKey, labelCount, limitations, processingMode, sparseComparable` — **keine** Trennung nach Beschleunigen/Bremsen
und **keine** Qualitätsaufschlüsselung (OK/DEGRADED/LIMITED). Für diese Auswertung wurde deshalb die vollständige
Payload des TIG22-Laufs gezogen.

## 3. Gesicherter Lauf (Tiguan-Referenztrip)

| Feld | Wert |
| --- | --- |
| `run_id` | `15cdc8ae-35b5-44a1-9c91-2cd9120d1546` |
| `trip_id` | `98d2a8e0-8b7d-4529-bf76-acee44d61fbe` |
| `created_at` | 2026-10-23T11:16:33.407Z |
| `shadow_bundle_version` | `DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_LEG_GATE_OBD_POINT_AUTH_V4` |
| `pinned_snapshot_hash` | `DI_V0_S4_EVIDENCE_V1:sha256:22e2a662…3504b3` (identisch mit dem versiegelten Replay-Container der Speed-Auswertung) |
| `eventAcceptedCount` / `eventArtefactSuspectCount` | 20 / 0 |
| Payload | `inputs/tiguan-20261022/prod_run_v4_20261023/di_v0_motion_core_shadow_payload.json` (1 099 811 Bytes, SHA-256 `ddcf32cd111ef21859e7df9f20915190efbe89aa416a22132e02c7d658712ccd`) |
| Metadaten | `inputs/tiguan-20261022/prod_run_v4_20261023/di_v0_motion_core_shadow_run_meta.json` |

**Parität:** Der Offline-Replay auf `579ee8b2` (Checkout dieses PR-Zweigs, DI-Verzeichnis sauber) erzeugt für diesen
Container **byte-identisch dieselben 20 Ereignisse** in der persistierten Sicht (Art, Beginn, Ende, Start-/Endgeschwindigkeit,
Δv, Qualität, Flags) — `summary.json → drives[TIG22].production.identical = true`. Gegenüber dem Vor-Deploy-Lauf
`8ec6306e` (Bundle `FABLE_REVIEW_RECOMMENDED`, 21 Ereignisse) fehlt genau ein Ereignis
(`ACCELERATION 18:49:12–18:49:18`), das der mit #2138 ausgelieferte C4-Stand nicht mehr erzeugt; neue Ereignisse
gibt es nicht.

## 4. Grenzen des Nachweises

- Persistierte Ereigniszeilen enthalten keine `durationS`/`meanAccelMps2`/`peakAccel1sMps2`
  (`mapMotionManoeuvreEventToPersisted`); vollständige Ereignisse stammen aus dem paritätsgeprüften Replay.
- Die pm2-Logs der letzten 200 Zeilen enthielten keine `motion-core shadow pass …`-Zeile (der Scheduler loggt nur
  bei `claimed > 0`, und die Zeilen waren zum Prüfzeitpunkt bereits aus dem Fenster gerollt); der Nachweis stützt
  sich auf die DB-Zeilen und die Leader-Election-Logzeilen.
- Es wurde nur geprüft, **dass** die Läufe erfolgen und was sie für TIG22 liefern — keine Bewertung der anderen
  20 Trips (keine Referenz vorhanden).
