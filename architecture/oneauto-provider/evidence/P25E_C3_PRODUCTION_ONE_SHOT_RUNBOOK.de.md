# One Auto — Produktions-One-Shot-Attestation (OE_VIN_LOOKUP_EU)

**Isoliertes CLI.** Kein Master Admin, kein `ONEAUTO_ENABLED`, keine BullMQ/Prisma, keine automatische Registry-Promotion.

## 1. Produktions-API-Key konfigurieren

Key **niemals** als CLI-Argument übergeben. Nur Runtime-Umgebung (lokal oder geschützte Shell):

```bash
export ONEAUTO_PRODUCTION_ATTESTATION_API_KEY='<vom Owner bereitgestellt>'
```

## 2. Autorisierte VIN bereitstellen

Nur eine vom Owner freigegebene echte VIN (kein OpenAPI-Beispiel ohne Vendor-Bestätigung):

```bash
export ONEAUTO_PRODUCTION_ATTESTATION_VIN='<17-stellige VIN>'
```

## 3. Offline-Preflight (Pflicht)

Im Repository-Root, Backend:

```bash
cd backend
npm run ops:oneauto:sandbox-attestation:offline
```

Erwartung: JSON-Array aller Fixtures, **kein** Netzwerk, `attemptedOutboundRequests: 0` bei Preflight-Fehlern, `attestationEnvironment: OFFLINE`.

Einzel-Fixture:

```bash
npx ts-node scripts/ops/oneauto-p25e-c-sandbox-attestation.ts --fixture http-200-success-true --json
```

## 4. Billing-Risiko prüfen

- Produktions-Host: `api.oneautoapi.com`
- Endpoint: `GET /ezyvin/vinlookup/?vehicle_identification_number=…`
- **Ein** Request kann kostenpflichtig sein — auch bei `success: false` oder HTTP-Fehler (`billingStatus: UNKNOWN` in Evidence).
- One-Auto-Antworten zur Sandbox/PrePay-Billing abwarten oder intern dokumentieren.

## 5. Explizite Owner-Freigaben setzen

Alle Werte müssen **`1`** sein (keine Freigabe allein durch gesetzten API-Key):

```bash
export ONEAUTO_PRODUCTION_ATTESTATION_OWNER_AUTHORIZED=1
export ONEAUTO_PRODUCTION_ATTESTATION_VIN_USE_AUTHORIZED=1
export ONEAUTO_PRODUCTION_ATTESTATION_BILLING_ACK=1
export ONEAUTO_PRODUCTION_ATTESTATION_ONE_GET_CONFIRMED=1
```

## 6. Genau einen Produktions-GET ausführen

```bash
cd backend
npx ts-node scripts/ops/oneauto-p25e-c-sandbox-attestation.ts --live-production --json \
  > /tmp/oneauto-production-attestation-evidence.json
```

- Exit-Code `0` nur bei `attestationQualified: true` (HTTP 200 und `success===true`).
- Maximal **ein** outbound GET (`attemptedOutboundRequests` ≤ 1).
- Keine Retries, kein Polling, keine Callback-Query-Parameter.

## 7. Redacted Evidence prüfen

Evidence enthält **keinen** API-Key, **keine** volle VIN, **keinen** Raw-Body — nur u. a.:

- `recordedAtUtc`, `attestationEnvironment: PRODUCTION`, `targetHostname`, `httpStatus`, `envelopeSuccess`, `diagnosticCategory`, `evidenceSha256`, `vinSha256Prefix`

Evidence **nicht** automatisch committen. Optional manuell anhand `architecture/oneauto-provider/evidence/P25E_C_ATTESTATION_TEMPLATE.md` archivieren.

## Verboten

- Sandbox-Host in Produktions-Modus
- Custom `ONEAUTO_BASE_URL` / Host-Overrides
- API-Key in Logs oder Git
- Automatische `EXECUTION_VERIFIED`-Promotion aus Evidence

## Owner ohne Terminal (Cursor Cloud Agent / Composer)

**Bevorzugt:** Geheimnisse **nicht** in Composer-Chat und **nicht** ins Repository.

1. **Cursor Dashboard** → [Cloud Agents Environment](https://cursor.com/dashboard/cloud-agents/environments/e/176ce4e1-74cc-11f1-a8a0-cafc5ef88358) → Tab **Secrets**.
2. **Runtime Secret** anlegen (Wert nur in der Dashboard-UI einfügen):
   - `ONEAUTO_PRODUCTION_ATTESTATION_API_KEY`
   - `ONEAUTO_PRODUCTION_ATTESTATION_VIN` (empfohlen ebenfalls Runtime Secret)
3. **Environment Variable** (nicht geheim, Wert `1`):
   - `ONEAUTO_PRODUCTION_ATTESTATION_OWNER_AUTHORIZED`
   - `ONEAUTO_PRODUCTION_ATTESTATION_VIN_USE_AUTHORIZED`
   - `ONEAUTO_PRODUCTION_ATTESTATION_BILLING_ACK`
   - `ONEAUTO_PRODUCTION_ATTESTATION_ONE_GET_CONFIRMED`
4. Cloud Agent **neu starten**, damit Secrets injiziert werden.
5. Composer bitten: Offline-Preflight ausführen (`bash .cursor/scripts/oneauto-p25e-attestation-offline-preflight.sh`).
6. Status prüfen ohne Werte anzuzeigen: `bash .cursor/scripts/oneauto-p25e-attestation-secrets-status.sh`
7. Produktions-One-Shot **erst** in einem separaten, explizit autorisierten Schritt — nicht in derselben Nachricht wie die Key-Eingabe.

**Optional (nur lokale Shell mit TTY):** `bash .cursor/scripts/oneauto-p25e-attestation-secrets-capture.sh` schreibt nach `~/.config/synqdrive/oneauto-attestation.env` (Modus `600`). Entfernen: `bash .cursor/scripts/oneauto-p25e-attestation-secrets-wipe.sh`

Composer/Agent **druckt Secret-Werte nicht** (Runtime Secrets sind für den Agent-Transcript redacted); Evidence bleibt redacted.
