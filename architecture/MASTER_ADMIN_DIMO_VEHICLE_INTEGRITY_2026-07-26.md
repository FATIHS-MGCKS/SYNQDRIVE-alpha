# Master Admin — DIMO Vehicle Integrity (Phase 2E.2)

**Date:** 2026-07-26  
**Version:** V4.9.892  
**Status:** Analysis complete — no code changes

## Summary

Full DIMO integration integrity audit: `dimo_vehicle_id`, `token_id`, `organization_id`, import, sync, disconnect, reconnect.

## Key findings

- **`dimo_vehicles` identity:** Strong (`external_id` + `token_id` unique).
- **Tenant binding:** Weak — no UNIQUE on `vehicles.dimo_vehicle_id`.
- **`registerFromDimo`:** No already-registered guard — cross-org duplicate binding possible.
- **Webhooks:** `findFirst` by `tokenId` — ambiguous if duplicates exist.
- **Deregister:** Preserves mirror; does not revoke consent; missing `@Roles('MASTER_ADMIN')`.

## Artifacts

- `docs/remediation/dimo-vehicle-integrity.md` — risk register D1–D12 + operator SQL audit queries

## Invariant

> A DIMO vehicle must never belong to multiple organizations simultaneously.

**Not enforced today** — remediation in Phase 2E.3.
