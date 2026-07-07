# DIMO Vehicle Triggers — Webhooks & SynqDrive Setup

> SynqDrive empfängt DIMO Vehicle Triggers über **einen** Webhook-Endpunkt.
> **Registrierung, Bedingungen, Cooldowns und Fahrzeug-Zuweisungen** werden in der **DIMO Developer Console** verwaltet — nicht in der SynqDrive-UI.
>
> Backend-Endpunkt (Production): `https://app.synqdrive.eu/api/v1/webhooks/dimo`

---

## 1) Architektur in Kurzform

```
DIMO Developer Console
  ├─ Trigger „OBD unplugged“     (vss.obdIsPluggedIn == 0)
  ├─ Trigger „OBD plugged in“    (vss.obdIsPluggedIn == 1)   ← Spam-Risiko
  └─ Trigger „High RPM“          (vss.powertrainCombustionEngineSpeed > 5000)
           │
           ▼  POST dimo.trigger (CloudEvent)
SynqDrive  POST /api/v1/webhooks/dimo
           ├─ OBD  → DeviceConnectionWebhookService → dimo_device_connection_events
           └─ RPM  → RpmWebhookCandidateService      → rpm_webhook_candidates
```

| Trigger-Typ | Zweck in SynqDrive | Spam-Risiko |
|-------------|-------------------|-------------|
| **OBD unplugged** | Manipulation / Tamper-Evidenz | mittel (Flutter bei losem Stecker) |
| **OBD plugged in** | optional, meist redundant | **hoch** (feuert dauernd bei `== 1`) |
| **High RPM** | Missbrauchs-Evidenz-Anker (>5000 rpm) | niedrig (Cooldown 10s, echte Fahrbedingung) |

**Wichtig:** Alle Trigger teilen sich dieselbe URL. Unterschieden wird im Backend anhand von `metricName`, `signal.name` und `displayName` / `webhookName`.

---

## 2) SynqDrive Backend — Environment (VPS)

Production liest **`/opt/synqdrive/shared/backend.env`**.

| Variable | Zweck |
|----------|--------|
| `DIMO_WEBHOOK_VERIFICATION_TOKEN` | **Pflicht** — DIMO URL-Verifikation + Trigger-Auth |
| `DIMO_WEBHOOK_SECRET` | Optional — HMAC (`x-dimo-signature`), falls konfiguriert |
| `DIMO_TRIGGER_BOOTSTRAP_ENABLED` | Standard: `false` — **kein** Auto-Setup beim Start |
| `DIMO_OBD_PLUG_IN_WEBHOOK_ENABLED` | Standard: `false` — Plug-in nur via Snapshot, nicht via Webhook |

Health-Check:

```bash
curl -s https://app.synqdrive.eu/api/v1/webhooks/dimo/health | jq
```

Erwartung: `verificationConfigured: true`.

Nach Env-Änderung:

```bash
ssh root@srv1374778.hstgr.cloud 'pm2 restart synqdrive --update-env'
```

---

## 3) DIMO Developer Console — Webhook-Ziel registrieren

1. [DIMO Developer Console](https://console.dimo.org/) → **Vehicle Triggers** (bzw. Webhooks / Signals).
2. Ziel-URL für **alle** Trigger:

   ```text
   https://app.synqdrive.eu/api/v1/webhooks/dimo
   ```

3. Bei der URL-Verifikation sendet DIMO `{ "verification": "test" }`.
   SynqDrive antwortet mit dem Plain-Text-Token aus `DIMO_WEBHOOK_VERIFICATION_TOKEN`.

---

## 4) Empfohlene Trigger-Konfiguration

### 4.1 OBD unplugged — **behalten**

| Feld | Empfehlung |
|------|------------|
| Metric | `vss.obdIsPluggedIn` |
| Bedingung | `valueNumber == 0` |
| Cooldown | **30–60 s** (falls in Console einstellbar; Minimum sinnvoll erhöhen) |
| Display name | z. B. `OBD Device unplugged` |

**Warum:** Ausstecken ist das sicherheitsrelevante Event. SynqDrive speichert nur echte Zustandswechsel und filtert Phantom-„wieder eingesteckt“-Impulse (≤120s nach Unplug ohne DIMO-Bestätigung).

### 4.2 OBD plugged in — **deaktivieren** (SynqDrive-Default)

| Feld | Aktuell (problematisch) | Empfehlung |
|------|-------------------------|------------|
| Bedingung | `valueNumber == 1` | **Trigger in DIMO Console deaktivieren** |
| Cooldown | `0` | — |
| SynqDrive | `DIMO_OBD_PLUG_IN_WEBHOOK_ENABLED=false` (Default) | Plug-in-Webhooks werden mit `plug_in_webhook_disabled` ignoriert |

**Warum:** `== 1` mit Cooldown 0 feuert **jedes Mal**, wenn das Gerät eingesteckt ist — nicht nur beim Einstecken. Das erzeugt HTTP-Spam (hunderte Webhooks/Tag), obwohl SynqDrive die meisten ignoriert (`no_state_change`, `baseline_already_plugged`).

**Eingesteckt / Wieder verbunden erkennen:**
- Snapshot/Polling (`obdIsPluggedIn` in `VehicleLatestState`) + `DimoVehicle.connectionStatus`
- Nach einem persistierten **Unplug**-Event materialisiert `DimoSnapshotProcessor` bei bestätigtem Reconnect ein `OBD_DEVICE_PLUGGED_IN`-Event (`source: dimo_snapshot`) — ohne DIMO plug-in Webhook.

### 4.3 High RPM — **behalten**

| Feld | Empfehlung |
|------|------------|
| Metric | `vss.powertrainCombustionEngineSpeed` |
| Bedingung | `valueNumber > 5000` |
| Cooldown | **10 s** (passt zu SynqDrive-Dedup-Bucket) |
| Display name | z. B. `High RPM Trigger` |

**Warum:** SynqDrive speichert nur Werte ≥ 5000 rpm als `rpm_webhook_candidates` (Evidenz-Anker, keine automatischen Misuse-Cases). Nur für **LTE_R1 + Verbrenner** relevant.

---

## 5) Fahrzeuge zuweisen

In der Console jeden Trigger nur Fahrzeugen zuweisen, die:

- einen gültigen DIMO `tokenId` haben, und
- für den Trigger-Typ sinnvoll sind (z. B. RPM nur ICE/LTE_R1).

**Aktuell registrierte Fahrzeuge** (Beispiel Prod, Stand 2026-07-07) — alle drei Trigger teilen dieselbe Asset-Liste:

| tokenId | Kennzeichen (Beispiel) |
|---------|------------------------|
| 186946 | — |
| 187336 | KS MX 2024 |
| 187361 | KS MS 661 |
| 187784 | — |
| 189118 | — |
| 190497 | WOB L 9755 |

Prüfen per API (auf VPS, Credentials aus `backend.env`):

```bash
# Webhook-Liste inkl. metricName, condition, coolDownPeriod
cd /opt/synqdrive/current/backend && source /opt/synqdrive/shared/backend.env
# → kleines Node/curl-Skript gegen https://vehicle-triggers-api.dimo.zone/v1/webhooks
```

Assets pro Trigger:

```http
GET /v1/webhooks/{webhookId}
Authorization: Bearer {developer_jwt}
→ Array von did:erc721:137:0x…:{tokenId}
```

---

## 6) Was SynqDrive mit eingehenden Webhooks macht

### OBD (`vss.obdIsPluggedIn`)

1. Routing über Signal/Metric + optional `displayName` („unplugged“ / „plugged in“).
2. **State-Change-Gating** — wiederholte gleiche Zustände → ignoriert.
3. **Impulsfilter** — kurzes Re-Plug nach Unplug ohne DIMO `CONNECTED` → ignoriert.
4. Persistenz: `dimo_device_connection_events` (nur echte Wechsel).
5. UI: Vehicle Detail → Konnektivität; Read-Model reconciled mit `DimoVehicle.connectionStatus`.

### RPM (`vss.powertrainCombustionEngineSpeed`)

1. Routing über Signal/Metric.
2. Schwelle: **5000 rpm** (Backend-Default = DIMO-Trigger).
3. Dedup: 10s-Bucket (wie DIMO-Cooldown).
4. Persistenz: `rpm_webhook_candidates` (Status `RECEIVED` → optional Context-Enrichment).
5. UI: Data Analyse / Trip RPM-Kandidaten — **Evidenz**, kein Auto-Alert.

### Nicht unterstützt / blockiert

- `throttle`, `engineLoad` → bewusst blockiert (kein Engine-Webhook-Intake).

---

## 7) Monitoring & Troubleshooting

### Logs (VPS)

```bash
# Alle empfangenen Trigger heute
grep "$(date -u +%Y-%m-%d)" /root/.pm2/logs/synqdrive-out.log \
  | grep "DIMO webhook routed:"

# OBD-Persistenz (nur bei echtem Zustandswechsel)
grep "Device connection event" /root/.pm2/logs/synqdrive-out.log | tail -20

# RPM-Persistenz (nur ≥5000 rpm)
grep "RPM webhook candidate" /root/.pm2/logs/synqdrive-out.log | tail -20
```

### DB-Checks

```bash
cd /opt/synqdrive/current/backend && source /opt/synqdrive/shared/backend.env
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const obd = await p.dimoDeviceConnectionEvent.count();
  const rpm = await p.rpmWebhookCandidate.count();
  console.log({ obd, rpm });
  await p.\$disconnect();
})();
"
```

### Typische Muster

| Symptom | Wahrscheinliche Ursache | Maßnahme |
|---------|-------------------------|----------|
| Viele Webhooks, 0 DB-Einträge OBD | „Plugged in“-Trigger spammt; SynqDrive filtert korrekt | „Plugged in“ deaktivieren |
| Burst 1 Webhook/Sekunde | Kontakt-Flutter am OBD-Stecker | Hardware prüfen; Unplug-Cooldown erhöhen |
| Webhooks, aber 0 RPM-Kandidaten | RPM nie >5000 (Telemetrie prüfen) oder `valueNumber` nicht geparst | Telemetrie checken; Parser-Fix (valueNumber) |
| Gar keine Webhooks | URL/Token falsch | `DIMO_WEBHOOK_VERIFICATION_TOKEN`, Console-URL, Health-Endpoint |

### Telemetrie gegenprüfen (RPM)

Für ein Fahrzeug mit `tokenId` z. B. 187361:

- DIMO Telemetry: `powertrainCombustionEngineSpeed` im relevanten Zeitfenster
- Wenn max. RPM < 5000 → RPM-Trigger **sollte nicht** feuern
- Wenn dennoch viele Webhooks → eher OBD-Trigger

---

## 8) Was SynqDrive **nicht** automatisch macht

| Thema | Status |
|-------|--------|
| Trigger in DIMO Console anlegen | ❌ manuell |
| Fahrzeuge an Trigger binden | ❌ manuell |
| `DIMO_TRIGGER_BOOTSTRAP_ENABLED=false` (Default) | Kein Auto-Subscribe beim Deploy |
| SynqDrive-UI für DIMO-Trigger | ❌ nicht vorhanden |
| `DimoTriggersService` im Code | ✅ vorhanden, nur Ops/optional Bootstrap |

Bootstrap (`DIMO_TRIGGER_BOOTSTRAP_ENABLED=true`) registriert nur ein **Basis-Set** (`obdDTCList`, `speed`, `isIgnitionOn`, `obdIsPluggedIn`) — **nicht** eure Console-Trigger mit getrennten Bedingungen und **nicht** High-RPM `> 5000`.

**Empfehlung:** Console manuell pflegen; Bootstrap aus lassen.

---

## 9) Checkliste — optimale Prod-Konfiguration

- [ ] `DIMO_WEBHOOK_VERIFICATION_TOKEN` auf VPS gesetzt
- [ ] `GET /api/v1/webhooks/dimo/health` → `verificationConfigured: true`
- [ ] Alle Trigger zeigen auf `https://app.synqdrive.eu/api/v1/webhooks/dimo`
- [ ] **OBD unplugged** aktiv, Cooldown ≥ 30s wenn möglich
- [ ] **OBD plugged in** deaktiviert oder Fahrzeuge entfernt
- [ ] **High RPM** aktiv: `> 5000`, Cooldown 10s, nur LTE_R1-ICE-Fahrzeuge
- [ ] Keine `throttle` / `engineLoad` Trigger auf SynqDrive-URL
- [ ] Nach Console-Änderungen: Burst-Monitoring in PM2-Logs 24h beobachten

---

## 10) Verwandte Code-Pfade

| Pfad | Rolle |
|------|--------|
| `backend/src/modules/dimo/dimo-webhook.controller.ts` | Empfang + Routing |
| `backend/src/modules/dimo/dimo-webhook-payload.util.ts` | Payload-Normalisierung |
| `backend/src/modules/dimo/device-connection-webhook.service.ts` | OBD-Intake + Anti-Spam |
| `backend/src/modules/dimo/rpm-webhook-candidate.service.ts` | RPM-Intake |
| `backend/src/modules/dimo/dimo-triggers.service.ts` | Optionaler API-Client (Ops) |
| `architecture/DIMO_DEVICE_CONNECTION_RECONCILE_2026-07-06.md` | OBD-Flutter-Reconcile |
