# Outbound Email — Document Delivery (2026-07-10)

## Scope

Transactional outbound email for booking document PDFs, org sender configuration, custom domain verification (Resend), audit trail, and administration UI.

## Data model

- `OrgEmailSettings` — mode (`SYNQDRIVE_DEFAULT` | `CUSTOM_DOMAIN`), from name, reply-to, HTML signature
- `OrgEmailDomain` — domain, DNS records JSON, provider domain id, verification status, active flag
- `OutboundEmail` — full send record with from/reply/to, status, provider message id
- `OutboundEmailAttachment` — links to `GeneratedDocument`
- `OutboundEmailEvent` — queued/sent/failed/delivered/bounced/etc.

Activity audit: `ActivityAction.SEND` + `ActivityEntity.OUTBOUND_EMAIL`.

## Provider

- `EMAIL_PROVIDER=auto`: Resend when `RESEND_API_KEY` set, else dev simulate (`SENT_SIMULATED`)
- Attachments read from private document storage (`DOCUMENTS_STORAGE.getObject`) — never public URLs

## From / Reply-To policy

1. **From**: `EMAIL_DEFAULT_FROM` unless `CUSTOM_DOMAIN` + verified active domain → `{fromLocalPart}@{domain}`
2. **Reply-To** chain: settings.replyTo → org.invoiceEmail → org.email → org.managerEmail → `EMAIL_DEFAULT_REPLY_TO`

## API

| Method | Path | Role |
|--------|------|------|
| POST | `/organizations/:orgId/bookings/:bookingId/documents/send-email` | ORG_ADMIN |
| GET/PUT | `/organizations/:orgId/email/settings` | read / ORG_ADMIN write |
| GET/POST | `/organizations/:orgId/email/domains` | read / ORG_ADMIN |
| POST | `.../domains/:id/verify` | ORG_ADMIN |
| POST | `.../domains/:id/activate` | ORG_ADMIN |
| GET | `/organizations/:orgId/email/history` | org-scoped |
| POST | `/webhooks/resend/outbound-email` | public webhook |

## Frontend

- `SendDocumentsEmailModal` — booking document send with attachment picker
- Administration tab **E-Mail & Versand** (`EmailVersandTab`)
- Entry points: `BookingDocumentsSection`, `InvoicesView` (when booking + generated PDF linked)

---

## Setup: Hostinger-Domain + Resend (Produktion)

SynqDrive versendet **transaktionale E-Mails mit PDF-Anhängen über [Resend](https://resend.com)** — nicht über Hostinger-SMTP direkt. Ihre Domain/E-Mail-Adresse kommt von **Hostinger**, die **API-Keys** von **Resend**.

### Schritt 1 — Domain bei Hostinger

1. Domain bei Hostinger kaufen/verwalten (z. B. `ihre-firma.de`).
2. Optional: Postfach `rechnung@ihre-firma.de` bei Hostinger anlegen — das nutzen Sie als **Reply-To** (Antworten der Kunden landen dort).
3. **Wichtig:** Für den Versand aus SynqDrive werden zusätzlich **DNS-Einträge** bei Hostinger gesetzt (SPF/DKIM von Resend), nicht Hostinger-SMTP in der App.

### Schritt 2 — Resend Account + API Key

1. Kostenlosen Account erstellen: [https://resend.com/signup](https://resend.com/signup)
2. Dashboard → **API Keys** → **Create API Key**
3. **Permission: Full access** (nicht „Sending access only“ — sonst schlägt Domain-Hinzufügen fehl)
4. Key kopieren (beginnt mit `re_…`) — **nur einmal sichtbar**
4. **Sicher übergeben** (nicht im Chat): siehe `docs/resend-setup.md`
5. Sync auf VPS:

```bash
bash backend/scripts/ops/sync-resend-env-to-vps.sh
ssh root@srv1374778.hstgr.cloud 'pm2 restart synqdrive --update-env'
```

Oder manuell in `/opt/synqdrive/shared/backend.env`:

```env
RESEND_API_KEY=re_xxxxxxxx
EMAIL_PROVIDER=resend
EMAIL_SIMULATE_ENABLED=false
EMAIL_DEFAULT_FROM=noreply@synqdrive.eu
EMAIL_DEFAULT_REPLY_TO=info@synqdrive.eu
```

Bis Ihre eigene Domain verifiziert ist, können Sie mit der Resend-Testdomain senden (nur an verifizierte Empfänger im Resend-Dashboard).

### Schritt 3 — Eigene Domain in SynqDrive verbinden

1. SynqDrive → **Administration → E-Mail & Versand**
2. Domain hinzufügen: `ihre-firma.de`, Absender-Präfix z. B. `dokumente` → `dokumente@ihre-firma.de`
3. SynqDrive zeigt **DNS-Einträge** (TXT/CNAME/MX)
4. Bei **Hostinger** → Domain → **DNS / DNS-Zone** → Einträge exakt wie angezeigt anlegen
5. In SynqDrive **DNS prüfen** → nach Verifizierung **Aktivieren**
6. Versandmodus auf **Eigene Domain** stellen, Reply-To auf `rechnung@ihre-firma.de`

### Schritt 4 — Webhook (optional, Zustellstatus)

1. Resend Dashboard → **Webhooks** → Endpoint:  
   `https://app.synqdrive.eu/api/v1/webhooks/resend/outbound-email`
2. Events: `email.delivered`, `email.bounced`, `email.complained`, `email.opened`
3. Signing Secret kopieren → `backend.env`:

```env
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxx
```

**Production:** `RESEND_WEBHOOK_SECRET` ist Pflicht — ohne Secret werden Webhooks abgelehnt.

### Was woher kommt — Kurzüberblick

| Was | Wo holen / konfigurieren | Wofür |
|-----|--------------------------|--------|
| **Plattform-noreply** (`noreply@synqdrive.eu`) | **Master Admin → Settings → E-Mail** (oder Env-Fallback) | Standard-Absender für Mandanten ohne eigene Domain |
| Domain `ihre-firma.de` | **Hostinger** + **Administration → E-Mail & Versand** (Mandant) | Eigener Absender pro Unternehmen |
| Postfach Reply-To | **Hostinger** (Mandant setzt in E-Mail & Versand) | Kunden-Antworten |
| `RESEND_API_KEY` | **Resend Dashboard** | API-Versand (serverseitig in `backend.env`) |
| DNS-Einträge | SynqDrive Mandanten-UI → **Hostinger DNS** | Domain-Verifizierung |
| `RESEND_WEBHOOK_SECRET` | **Resend Webhooks** | Zustell-/Bounce-Events |

### Webhook → Parent-Status

`applyWebhookEvent` aktualisiert `OutboundEmail.status`: `BOUNCED`/`COMPLAINED` → `FAILED`, `DELIVERED` hebt `SENDING` auf `SENT`. Doppelte Events desselben Typs werden ignoriert.

### Dokument-Status für Versand

Nur `GENERATED` und `SENT` (Re-Send) sind als PDF-Anhang erlaubt. `DRAFT`, `FAILED` und `VOID` werden abgelehnt.

---

- Primär: **Administration → E-Mail & Versand → Signatur (HTML)**
- Fallback: **Administration → Unternehmen → E-Mail-Signatur** (`Organization.emailSignature`)

