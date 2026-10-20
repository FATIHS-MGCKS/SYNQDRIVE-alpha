# PDI P1B.7 — Nest operator CLI (Gate C identity verification)

Single-device scope: physical device **89c6c76d-bbcf-40a1-9370-5edfc159cbd4**, DIMO **192922**, serial **R1-865918076209847**, idempotency `p1b7-verify-token-192922`.

## Authorization model

| Layer | Proof |
|-------|--------|
| Server access | SSH as `synqdrive-admin` (Hostinger VPS ops identity) |
| Application actor | Real **ACTIVE** `MASTER_ADMIN` user via `--actor-email` or `--actor-user-id` (smoke acceptance account rejected) |
| Execution gate | `PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED=true` plus `--execute --confirm-p1b7-identity-verify` |
| Owner scope | Frozen payload in `pdi-p1b7-identity-verify-operator.lib.ts` (not overridable by CLI) |
| Attestation | `--operator-attestation="..."` stored in Activity `metaJson` |

This does **not** mint a JWT and does **not** expose a new HTTP route. HTTP Master Admin + MFA remains the product path.

## Service parity

- `PhysicalDeviceInventoryService.verifyIdentity` (domain `IDENTITY_VERIFICATION` audit inside service transaction; `provesPhysicalInstall: false`)
- `AuditService.record` UPDATE / `ADMIN_OPERATION` (same description pattern as controller)

## Commands

```bash
cd /opt/synqdrive/current/backend
set -a && source /opt/synqdrive/shared/backend.env && set +a

# Dry run (default)
npx ts-node -r tsconfig-paths/register scripts/ops/pdi-p1b7-identity-verify-operator.ts \
  --actor-email=admin@synqdrive.de \
  --operator-attestation="Owner authorized PDI P1B.7 Gate C identity verify DIMO 192922"

# Execute (after deploy of script + explicit Gate C owner confirmation)
PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED=true \
  npx ts-node -r tsconfig-paths/register scripts/ops/pdi-p1b7-identity-verify-operator.ts \
  --execute --confirm-p1b7-identity-verify \
  --actor-email=admin@synqdrive.de \
  --operator-attestation="Owner authorized PDI P1B.7 Gate C identity verify DIMO 192922"
```

Requires `PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED=true` (read at execute; not overridden by this script).

No install, no vehicle assignment, no DIMO/VO/VDC writes.
