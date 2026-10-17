# PDI P1B.7 — Nest operator CLI (manual intake)

Single-device scope: DIMO **192922**, serial **R1-865918076209847**, idempotency `p1b7-intake-token-192922`.

## Authorization model

| Layer | Proof |
|-------|--------|
| Server access | SSH as `synqdrive-admin` (Hostinger VPS ops identity) |
| Application actor | Real `User` row with `platformRole=MASTER_ADMIN` via `--actor-email` or `--actor-user-id` |
| Execution gate | `PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED=true` plus `--execute --confirm-p1b7-manual-intake` |
| Owner scope | Frozen payload in `pdi-p1b7-manual-intake-operator.lib.ts` (not overridable by CLI) |
| Attestation | `--operator-attestation="..."` stored in Activity `metaJson` |

This does **not** mint a JWT and does **not** expose a new HTTP route. HTTP Master Admin + MFA remains the product path.

## Service parity

- `PhysicalDeviceInventoryService.manualIntake` (domain `MANUAL_INTAKE` audit inside service transaction)
- `AuditService.record` CREATE / `ADMIN_OPERATION` (same description pattern as controller)

## Commands

```bash
cd /opt/synqdrive/current/backend
set -a && source /opt/synqdrive/shared/backend.env && set +a

# Dry run (default)
npx ts-node -r tsconfig-paths/register scripts/ops/pdi-p1b7-manual-intake-operator.ts \
  --actor-email=admin@synqdrive.de \
  --operator-attestation="Owner authorized PDI P1B.7 Gate B manual intake DIMO 192922"

# Execute (after deploy of script + owner confirmation)
PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED=true \
  npx ts-node -r tsconfig-paths/register scripts/ops/pdi-p1b7-manual-intake-operator.ts \
  --execute --confirm-p1b7-manual-intake \
  --actor-email=admin@synqdrive.de \
  --operator-attestation="Owner authorized PDI P1B.7 Gate B manual intake DIMO 192922"
```

Requires `PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED=true` (read at execute; not overridden by this script).

No verify, install, or vehicle assignment.
