# Resend — Production Setup (SynqDrive)

## API-Key sicher übergeben (nicht im Chat)

**Nicht** den Key hier im Chat posten (Transkript/Logs). Stattdessen eine der Optionen:

### Option A — Cursor Cloud Agent (empfohlen für uns)

1. [Cursor Dashboard → Cloud Agents → Secrets](https://cursor.com/dashboard/cloud-agents)
2. **Runtime Secret** anlegen: `RESEND_API_KEY` = `re_…` (**Full access**, nicht nur Sending)
3. Optional: `RESEND_WEBHOOK_SECRET` = `whsec_…` (nach Webhook-Anlage in Resend)
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

Block anhängen (Key eintragen — **Full access**, nicht nur Sending):

```env
# Outbound email (Resend)
EMAIL_PROVIDER=resend
EMAIL_SIMULATE_ENABLED=false
RESEND_API_KEY=re_xxxxxxxx
EMAIL_DEFAULT_FROM=noreply@synqdrive.eu
EMAIL_DEFAULT_FROM_NAME=SynqDrive
EMAIL_DEFAULT_REPLY_TO=info@synqdrive.eu
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

## SynqDrive Plattform-Domain (`synqdrive.eu`)

Standard-Versand für Mandanten im Modus **SynqDrive Standard-Absender**:

| Rolle | Adresse | Wo |
|-------|---------|-----|
| **Absender (From)** | `noreply@synqdrive.eu` | Resend (kein Hostinger-Postfach nötig) |
| **Antworten (Reply-To)** | `info@synqdrive.eu` | Hostinger-Postfach (empfängt Kundenantworten) |

### Einrichtung

1. Resend: Domain `synqdrive.eu` registrieren (1 Domain im Plan — `fs-mobility.de` ggf. entfernen)
2. DNS bei Hostinger mergen:

```bash
# Cloud Agent: Runtime Secret HOSTINGER_API_TOKEN + RESEND_API_KEY
bash backend/scripts/ops/sync-resend-dns-to-hostinger.sh
```

3. Plattform-Env + DB:

```bash
EMAIL_DEFAULT_FROM=noreply@synqdrive.eu \
EMAIL_DEFAULT_REPLY_TO=info@synqdrive.eu \
bash backend/scripts/ops/sync-resend-env-to-vps.sh
ssh root@srv1374778.hstgr.cloud 'pm2 restart synqdrive --update-env'
```

Master Admin → E-Mail: `noreply@synqdrive.eu` / Reply-To `info@synqdrive.eu`

**Wichtig:** Root-MX (`mx1.hostinger.com`) für `info@synqdrive.eu` bleibt unverändert. Resend nutzt nur Subdomain `send.*` + DKIM `resend._domainkey`.

---

Die Domain `fs-mobility.de` wurde im **Simulationsmodus** registriert (`synqdrive-dev-verify`). Nach Resend-Aktivierung:

1. SynqDrive → Administration → E-Mail & Versand → Domain **entfernen**
2. Domain **neu hinzufügen** (`fs-mobility.de`, Absender z. B. `info`)
3. **Echte** DNS-Einträge (SPF/DKIM/…) bei Hostinger setzen — nicht nur ein TXT
4. **DNS prüfen** → **Aktivieren**
5. Versandmodus **Eigene Domain**, Reply-To `info@fs-mobility.de`, **Speichern**
6. Test senden — Status muss **`Gesendet`** sein (nicht „simuliert“)

### Fehler „Internal server error“ beim Domain hinzufügen

Ursache in den Server-Logs oft: `This API key is restricted to only send emails`.  
→ Resend Dashboard → **API Keys** → neuen Key mit **Full access** erstellen → `RESEND_API_KEY` auf dem VPS ersetzen → `pm2 restart synqdrive --update-env`.

---

## Resend Webhook (optional, Zustellstatus)

Resend Dashboard → Webhooks →  
`https://app.synqdrive.eu/api/v1/webhooks/resend/outbound-email`  
Events: delivered, bounced, complained. Secret → `RESEND_WEBHOOK_SECRET` auf VPS.
