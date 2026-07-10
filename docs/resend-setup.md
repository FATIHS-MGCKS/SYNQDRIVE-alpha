# Resend — Production Setup (SynqDrive)

## API-Key sicher übergeben (nicht im Chat)

**Nicht** den Key hier im Chat posten (Transkript/Logs). Stattdessen eine der Optionen:

### API-Key-Berechtigung (Resend Dashboard)

SynqDrive benötigt einen **Full Access**-Key — nicht „Sending access only“.

| Berechtigung | Versand (`POST /emails`) | Domain-Registrierung in SynqDrive (`POST /domains`) |
|--------------|--------------------------|-----------------------------------------------------|
| **Full Access** | ✅ | ✅ |
| Sending access only | ✅ | ❌ Fehler: *This API key is restricted to only send emails* |

1. Resend Dashboard → **API Keys** → Key anlegen oder bearbeiten
2. Permission: **Full access**
3. Key als Runtime Secret `RESEND_API_KEY` hinterlegen und auf VPS syncen (siehe unten)

**Stand 2026-07-10:** Produktions-Key auf Full Access umgestellt; Domain-Anlage in Administration → E-Mail & Versand funktioniert damit.

### Option A — Cursor Cloud Agent (empfohlen für uns)

1. [Cursor Dashboard → Cloud Agents → Secrets](https://cursor.com/dashboard/cloud-agents)
2. **Runtime Secret** anlegen: `RESEND_API_KEY` = `re_…` (**Full access**)
3. Optional: `RESEND_WEBHOOK_SECRET` = `whsec_…` (nach Webhook-Anlage in Resend, siehe unten)
4. Cloud Agent **neu starten**
5. Agent ausführen lassen:

```bash
bash backend/scripts/ops/sync-resend-env-to-vps.sh
ssh root@srv1374778.hstgr.cloud 'pm2 restart synqdrive --update-env'
```

### Option B — Direkt auf dem VPS (ohne Agent)

```bash
ssh root@srv1374778.hstgr.cloud
nano /opt/synqdrive/shared/backend.env
```

Block anhängen (Key eintragen):

```env
# Outbound email (Resend)
EMAIL_PROVIDER=resend
EMAIL_SIMULATE_ENABLED=false
RESEND_API_KEY=re_xxxxxxxx
EMAIL_DEFAULT_FROM=noreply@synqdrive.eu
EMAIL_DEFAULT_FROM_NAME=SynqDrive
EMAIL_DEFAULT_REPLY_TO=support@synqdrive.eu
```

```bash
pm2 restart synqdrive --update-env
```

Key danach in Resend rotieren, wenn er jemals unsicher geteilt wurde.

### Option C — Lokal `backend/.env` + Sync-Script

Key nur in `backend/.env` (nie committen), dann:

```bash
bash backend/scripts/ops/sync-resend-env-to-vps.sh
```

---

## Resend MCP (Cursor)

Projektdatei: `.cursor/mcp.json` — Server `resend` via `npx resend-mcp@2.10.1`.

- **Cloud Agent:** `RESEND_API_KEY` als Runtime Secret → MCP erbt die Variable
- **Lokal:** Key in `~/.cursor/mcp.json` unter `mcpServers.resend.env` oder global in Cursor Settings → MCP

Remote-Alternative (OAuth im Browser): `https://mcp.resend.com/mcp`

---

## FS Mobility — Domain neu einrichten (wichtig)

Die Domain `fs-mobility.de` wurde im **Simulationsmodus** registriert (`synqdrive-dev-verify`). Nach Resend-Aktivierung:

1. SynqDrive → Administration → E-Mail & Versand → Domain **entfernen**
2. Domain **neu hinzufügen** (`fs-mobility.de`, Absender z. B. `info`)
3. **Echte** DNS-Einträge (SPF/DKIM/…) bei Hostinger setzen — nicht nur ein TXT
4. **DNS prüfen** → **Aktivieren**
5. Versandmodus **Eigene Domain**, Reply-To `info@fs-mobility.de`, **Speichern**
6. Test senden — Status muss **`Gesendet`** sein (nicht „simuliert“)

---

## Resend Webhook (Zustellstatus & Engagement)

### Endpoint (Production)

```
https://app.synqdrive.eu/api/v1/webhooks/resend/outbound-email
```

Methode: **POST** · Auth: öffentlich, Signatur über **Svix** (`RESEND_WEBHOOK_SECRET`)

### Events in Resend aktivieren

Im Resend Dashboard → **Webhooks** → Endpoint anlegen und **genau diese Event-Typen** auswählen:

| Resend-Event (Dashboard) | SynqDrive-Verarbeitung |
|--------------------------|------------------------|
| `email.delivered` | Zustellung bestätigt → `OutboundEmail.status` SENT |
| `email.bounced` | Bounce → Status FAILED |
| `email.complained` | Spam-Beschwerde → Status FAILED |
| `email.opened` | Öffnung → Event in Historie (optional, kein Status-Downgrade) |

Andere Events (z. B. `email.sent`, `email.clicked`) werden ignoriert — müssen nicht aktiviert werden.

### Secret auf VPS

1. Nach Anlage des Webhooks: **Signing Secret** kopieren (`whsec_…`)
2. Als Cursor Runtime Secret `RESEND_WEBHOOK_SECRET` oder direkt in `backend.env`
3. Sync + Neustart:

```bash
bash backend/scripts/ops/sync-resend-env-to-vps.sh
ssh root@srv1374778.hstgr.cloud 'pm2 restart synqdrive --update-env'
```

**Production:** Ohne `RESEND_WEBHOOK_SECRET` lehnt SynqDrive eingehende Webhooks ab (fail-closed).
