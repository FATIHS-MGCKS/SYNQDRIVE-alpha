# Didit — MCP, Webhooks & SynqDrive Production Setup

> SynqDrive uses Didit for **document-only** verification (ID, driving license, optional proof of address).
> **No** selfie, liveness, or face-match steps.
>
> Official MCP: [didit-protocol/mcp](https://github.com/didit-protocol/mcp) · Hosted endpoint: `https://mcp.didit.me/mcp`

## 1) Cursor — Didit MCP installieren

Project config: `.cursor/mcp.json` (already contains Didit).

1. **Cursor neu laden** (Developer: Reload Window) oder Cursor neu starten.
2. **Settings → MCP** → Server **didit** sollte erscheinen.
3. Beim ersten Tool-Call: **„Log in with Didit“** (OAuth) — der MCP handelt als dein Didit-User, nicht als API-Key.
4. Docs: [Didit MCP installation](https://docs.didit.me/integration/mcp/installation)

### Nützliche MCP-Prompts (nach Login)

```text
List my verification workflows and show which steps each contains.
Confirm none of them use liveness, face match, or selfie.
```

```text
List webhook destinations for my application and show URL + subscribed events.
```

```text
Create or update a webhook destination pointing to
https://app.synqdrive.eu/api/v1/webhooks/didit
for session status and decision events.
Return the webhook signing secret if a new destination was created.
```

```text
Show workflow IDs for document ID verification, driving license, and proof of address.
```

## 2) SynqDrive Backend — Environment (VPS)

Production reads **`/opt/synqdrive/shared/backend.env`** (not Cursor Cloud secrets).

Required variables (see `backend/.env.example`):

| Variable | Purpose |
|----------|---------|
| `DIDIT_ENABLED` | `true` |
| `DIDIT_API_KEY` | Application API key (Didit console → API keys) |
| `DIDIT_WEBHOOK_SECRET` | HMAC secret from Didit webhook destination |
| `DIDIT_WEBHOOK_PUBLIC_URL` | `https://app.synqdrive.eu/api/v1/webhooks/didit` |
| `DIDIT_WORKFLOW_ID_DOCUMENT` | Workflow UUID (document-only) |
| `DIDIT_WORKFLOW_ID_DRIVING_LICENSE` | Workflow UUID (license-only) |
| `DIDIT_WORKFLOW_ID_PROOF_OF_ADDRESS` | Optional PoA workflow UUID |

Sync from local `backend/.env` to VPS:

```bash
bash backend/scripts/ops/sync-didit-env-to-vps.sh
ssh root@srv1374778.hstgr.cloud 'pm2 restart synqdrive --update-env'
```

## 3) Didit Console — Webhook registrieren

SynqDrive endpoint (public, no auth header from Didit user):

```text
POST https://app.synqdrive.eu/api/v1/webhooks/didit
```

Backend verifies:

- Header `x-timestamp` (fresh within 300s)
- Header `x-signature-v2` (HMAC-SHA256 over canonical JSON body)

Supported `webhook_type` values: `status.updated`, `data.updated`.

**Important:** Copy the **webhook signing secret** from Didit into `DIDIT_WEBHOOK_SECRET` on the VPS (must match).

## 4) Workflows (document-only)

Each workflow in Didit must **exclude** LIVENESS, FACE_MATCH, and SELFIE.

If you only have one document workflow temporarily, you may set the same UUID for all three
`DIDIT_WORKFLOW_ID_*` vars — only after confirming the workflow steps in Didit console or via MCP.

## 5) Verify production

```bash
# On VPS — env present (values redacted)
grep '^DIDIT_' /opt/synqdrive/shared/backend.env | cut -d= -f1

# Webhook route alive (401 without Didit headers = expected)
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://app.synqdrive.eu/api/v1/webhooks/didit \
  -H 'Content-Type: application/json' -d '{}'
```

In SynqDrive UI: Customer → **Dokumentenprüfung** → consent → Didit session should open.

## 6) Architecture reference

- Backend: `backend/src/modules/customer-verification/providers/didit/*`
- Webhook: `DiditWebhookController` → `DiditWebhookService` → `applyDiditDecision`
- Frontend: `@didit-protocol/sdk-web` via `CustomerVerificationPanel`
- Target architecture: `docs/customer-verification-didit.md`
