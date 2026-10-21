# PDI P1B.7 — Nest operator CLI (Gate D retrospective install)

Single-device scope: physical device **89c6c76d-bbcf-40a1-9370-5edfc159cbd4**, DIMO **192922**, serial **R1-865918076209847**, vehicle **19fedd4b-c4e8-4de8-a125-dab293326e7e**, install idempotency `p1b7-install-token-192922`.

Prerequisites in production: Gate B intake complete, Gate C identity verification complete (`VERIFIED`, Gate C audit `p1b7-verify-token-192922`), device `AVAILABLE`, zero active INSTALL assignments.

## Authorization model

| Layer | Proof |
|-------|--------|
| Server access | SSH as `synqdrive-admin` (Hostinger VPS ops identity) |
| Application actor | Real **ACTIVE** `MASTER_ADMIN` user via `--actor-email` or `--actor-user-id` (smoke acceptance account rejected) |
| Execution gate | `PDI_P1B7_INSTALL_OPERATOR_ENABLED=true` plus `--execute --confirm-p1b7-install` |
| Owner scope | Frozen payload in `pdi-p1b7-install-operator.lib.ts` (not overridable by CLI) |
| Attestation | `--operator-attestation="..."` stored in Activity `metaJson` |

This does **not** mint a JWT and does **not** expose a new HTTP route. HTTP Master Admin + MFA remains the product path.

**Do not** set `PDI_P1B7_INSTALL_OPERATOR_ENABLED` in `backend.env` or any persistent config — enable only in the shell for a single deliberate execute attempt.

## Service parity

- `PhysicalDeviceInventoryService.installOnVehicle` (domain `INSTALL` audit inside service transaction; `providerBindingMutated: false`, `vehicleDataSourceLinksMutated: false`)
- `AuditService.record` UPDATE / `ADMIN_OPERATION` (same description pattern as controller)
- `effectiveFrom` is set at execute time inside the service transaction — **not** backdated to the historical physical install date
- Frozen `installNotes` document retrospective registration semantics without inventing a physical install date

## P1B feature flags

| Flag | Gate D install |
|------|----------------|
| `PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED=true` | **Required** at execute |
| `PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED` | May remain **false** — install is P1B.1 |

**Warning:** With P1B.2 OFF, later uninstall, return-to-stock, and related lifecycle writes remain blocked until P1B.2 is enabled. Plan post-install operations accordingly.

## Commands

```bash
cd /opt/synqdrive/current/backend
set -a && source /opt/synqdrive/shared/backend.env && set +a

# Read-only preflight (default — no writes)
npx ts-node -r tsconfig-paths/register scripts/ops/pdi-p1b7-install-operator.ts \
  --actor-email=admin@synqdrive.de \
  --operator-attestation="Owner authorized PDI P1B.7 Gate D install preflight DIMO 192922"

# Execute (after deploy of script + explicit Gate D owner confirmation — exactly one attempt per owner directive)
PDI_P1B7_INSTALL_OPERATOR_ENABLED=true \
  npx ts-node -r tsconfig-paths/register scripts/ops/pdi-p1b7-install-operator.ts \
  --execute --confirm-p1b7-install \
  --actor-email=admin@synqdrive.de \
  --operator-attestation="Owner authorized PDI P1B.7 Gate D install DIMO 192922"
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success (dry-run OK or execute + activity audit recorded) |
| 1 | Hard failure (gates, preflight on execute, service error) |
| 2 | Dry-run preflight blocking (fail-closed preview) |
| 3 | **Partial success** — domain install committed, activity audit failed; **do not retry execute**; preserve stdout and verify `physical_device_assignments`, `physical_device_inventory_audit_events`, and `activity_logs` manually |

No autonomous retry on exit 3.

## Idempotency

- Key: `p1b7-install-token-192922`
- Safe replay: same device, same vehicle, same frozen DTO — service returns existing assignment; CLI reports `idempotentReplay: true`
- **Never** reuse this key for another device or vehicle — service rejects with idempotency payload mismatch
- Do not interpret an already-installed device without matching idempotency replay as a fresh success narrative

## Post-execution audit (evidence checklist)

1. `physical_devices.status` = `INSTALLED` for `89c6c76d-bbcf-40a1-9370-5edfc159cbd4`
2. Exactly one active `INSTALL` assignment on the authorized vehicle
3. `physical_device_inventory_audit_events` row `INSTALL` with install idempotency key and persisted `installNotes`
4. `activity_logs` UPDATE / `ADMIN_OPERATION` with route `pdi-p1b7-install-operator.ts` and Gate D `metaJson`
5. DIMO mirror, VO bindings, and VDC links unchanged (no new outbox mutations from install)
6. `identityStatus` remains `VERIFIED`

## Partial failure (exit 3)

If activity audit fails after domain commit:

- Capture full CLI JSON stdout/stderr and shell history
- Record domain audit id and assignment id from the database
- Do **not** run execute again to “fix” activity logging
- Escalate for manual activity log reconciliation if required

## No automatic repair

This operator does not correct serial mismatches, missing Gate C audits, occupied vehicles, or wrong org/vehicle bindings. Resolve blockers out of band, then re-run **dry-run** only until `preflight.ok` is true.
