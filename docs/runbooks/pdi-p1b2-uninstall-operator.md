# PDI P1B.2 — pilot-safe uninstall operator CLI

Controlled production uninstall path: **INSTALLED → PENDING_RETURN** only. Return-to-stock (`PENDING_RETURN → AVAILABLE`) remains a **separate** Master Admin API or future operator step with `physicalReturnConfirmed`.

## Lifecycle policy

| Step | Allowed in pilot |
|------|------------------|
| Uninstall (physical removal attestation) | `INSTALLED` → `PENDING_RETURN` only |
| Direct `INSTALLED` → `AVAILABLE` on uninstall | **Blocked** when `PHYSICAL_DEVICE_INVENTORY_P1B2_PILOT_SAFE_UNINSTALL=true` |
| Return to stock | Separate `return-to-stock` after warehouse confirmation |

## Authorization

| Layer | Proof |
|-------|--------|
| SSH | `synqdrive-admin` on VPS |
| Actor | ACTIVE `MASTER_ADMIN` via `--actor-email` or `--actor-user-id` |
| Execute gate | `PDI_P1B2_UNINSTALL_OPERATOR_ENABLED=true` (process only) |
| Pilot policy | `PHYSICAL_DEVICE_INVENTORY_P1B2_PILOT_SAFE_UNINSTALL=true` (process only) |
| P1B.2 writes | `PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED=true` |
| Scope | CLI flags per device (no frozen production IDs) |
| Attestation | `--operator-attestation` (physical removal, min 16 chars) |

**Never** persist operator or pilot flags in `backend.env`.

## Bootstrap isolation

Minimal Nest context (`PdiP1b2UninstallOperatorBootstrapModule`): `PrismaService`, `PhysicalDeviceInventoryService`, `AuditService` only — no HTTP, schedulers, or BullMQ.

## T−0 (read-only)

```bash
cd /opt/synqdrive/current/backend
set -a && source /opt/synqdrive/shared/backend.env && set +a

PHYSICAL_DEVICE_INVENTORY_P1B2_PILOT_SAFE_UNINSTALL=true \
  npx ts-node -r tsconfig-paths/register scripts/ops/pdi-p1b2-uninstall-operator.ts \
  --physical-device-id=<uuid> \
  --vehicle-id=<uuid> \
  --assignment-id=<uuid> \
  --idempotency-key=<unique-key> \
  --uninstall-reason="..." \
  --actor-email=admin@synqdrive.de \
  --operator-attestation="Owner authorized physical removal of device serial ..."
```

Confirm `preflight.ok=true`, device `INSTALLED`, assignment/vehicle/org match, idempotency key unused on other devices.

## Execute (exactly one attempt per owner directive)

```bash
PDI_P1B2_UNINSTALL_OPERATOR_ENABLED=true \
PHYSICAL_DEVICE_INVENTORY_P1B2_PILOT_SAFE_UNINSTALL=true \
PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED=true \
  npx ts-node -r tsconfig-paths/register scripts/ops/pdi-p1b2-uninstall-operator.ts \
  --execute --confirm-p1b2-uninstall \
  ... (same scope flags)
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Hard failure or unclear outcome after error |
| 2 | Dry-run preflight blocking |
| 3 | Domain committed, activity audit failed — **do not re-execute**; reconcile `activity_logs` and `physical_device_inventory_audit_events` |

## Reconciliation (read-only)

On timeout or lost connection:

1. Query `physical_device_inventory_audit_events` for `UNINSTALL` + `idempotency_key`.
2. Verify device `PENDING_RETURN`, assignment `effective_to` set, no duplicate audit for same key on another device.
3. If committed, do **not** run execute again with a new key.

## STOP rules

- No automatic retry on exit 3 or ambiguous commit.
- No return-to-stock in the same operator invocation.
- No DIMO/VO/VDC mutation expected (`providerBindingMutated: false` in domain audit).
