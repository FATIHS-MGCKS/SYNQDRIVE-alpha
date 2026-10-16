# PDI P1B.7 Gate B — Operator manual intake (production)

Owner-authorized **single** `manual-intake` for DIMO token **192922**. No verify/install.

## Canonical API (from backend)

| Step | Method | Path |
|------|--------|------|
| Login | `POST` | `/api/v1/auth/login` |
| Login body | | `{ "email": string, "password": string, "organizationId"?: uuid }` (`LoginDto` in `backend/src/shared/dto/auth.dto.ts`) |
| Intake | `POST` | `/api/v1/admin/physical-device-inventory/devices/manual-intake` |
| Intake body | | `ManualIntakePhysicalDeviceDto` — `modelCode`, `serialNumber?`, `imei?`, `warehouseLocation` (required), `ownerOrganizationId?`, `intakeNotes?`, `idempotencyKey?` |

Production base URL: `https://app.synqdrive.eu/api/v1`

Auth: `Authorization: Bearer <accessToken>` from login response field `accessToken` (alias `token`).

Master Admin MFA master flag **off** → mutating intake uses password login only (no step-up when `IAM_MFA_MASTER_ADMIN_ENABLED` unset).

## Operator script

Path: `backend/scripts/ops/pdi-p1b7-gate-b-operator-intake.sh`

- Prompts for email (default `admin@synqdrive.de`) and password (**silent**).
- Does **not** print passwords, bearer tokens, or full login JSON.
- Optional SSH read-only preflight when `SYNQDRIVE_SSH_HOST` is set (serial + idempotency rows + SHA).
- API preflight: authenticated list search must return `total=0`.
- Redacted mutation preview + requires typing `YES` before POST.
- **One** intake POST; on timeout/ambiguous response **no** auto-retry.
- Read-only GET device detail postcheck.

### Exact local execution

From repository root on an **owner-controlled** machine (with `curl` and `jq`):

```bash
chmod +x backend/scripts/ops/pdi-p1b7-gate-b-operator-intake.sh

# Optional stronger preflight (SSH read-only to production VPS):
export SYNQDRIVE_SSH_HOST=srv1374778.hstgr.cloud
export SYNQDRIVE_SSH_USER=synqdrive-admin

# Do NOT export password into shell history; the script prompts securely.
bash backend/scripts/ops/pdi-p1b7-gate-b-operator-intake.sh
```

Approved payload constants (override only if owner re-authorizes):

| Variable | Default |
|----------|---------|
| `PDI_DIMO_TOKEN` | `192922` |
| `PDI_VEHICLE_ID` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| `PDI_ORG_ID` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `PDI_MODEL` | `RUPTELA_R1` |
| `PDI_SERIAL` | `R1-865918076209847` |
| `PDI_WAREHOUSE_LOCATION` | `Lager` |
| `PDI_IDEMPOTENCY_KEY` | `p1b7-intake-token-192922` |

**Warehouse:** `Lager` = administrative inventory label (`Lagerort` in UI), not physical depot proof. Owner physical install is recorded only in `intakeNotes`.

## UI alternative

Master Admin → Physical Device Inventory → manual intake with the same field values (idempotency key if exposed in UI).

## After success

Read-only expectations: one device, `AVAILABLE`, `NEEDS_CLARIFICATION`, `imei` null, no active vehicle assignment, `MANUAL_INTAKE` audit. Gate C (verify) requires **separate** owner authorization.
