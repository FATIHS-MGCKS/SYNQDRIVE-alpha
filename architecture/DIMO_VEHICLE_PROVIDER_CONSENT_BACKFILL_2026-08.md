# DIMO Per-Vehicle Consent Ledger Backfill (2026-08)

## Context

After the DIMO `VehicleDataSourceLink` backfill (`dimo-link-backfill-prod-2026-08-25-1636d35`), six org vehicles have active DIMO mapping rows. Three (KS FH 660E, KS MS 661, KS MX 2024) still lack `vehicle_provider_consents` rows because `registerFromDimo()` records consent fire-and-forget **after** the registration transaction, and these vehicles predate or missed that write.

## Canonical contract

- **Consent ledger:** `VehicleProviderConsent` via `VehicleProviderConsentService.recordDimoConsent()`
- **Mapping ledger:** `VehicleDataSourceLink` via `DimoVehicleDataSourceLinkService`
- **Provider link state:** `ProviderLinkStateBuilder` requires mapping + ACTIVE consent + token + ACTIVE org auth for `ACTIVE`
- **Link.consentId:** optional FK for provenance; wired by link service/backfill, not by `recordDimoConsent()` alone

## Phase 1 (2026-08-26)

Read-only forensic + dry-run only. See `docs/audits/dimo-vehicle-provider-consent-backfill-phase1-2026-08.md`.

| Artifact | Role |
|----------|------|
| `dimo-provider-consent-backfill.service.ts` | Plan/apply with CREATE/NOOP/CONFLICT + atomic apply |
| `backfill-dimo-vehicle-provider-consents.ts` | Ops entry (`--dry-run` default, `--apply` gated) |

**Apply gate:** explicit `--vehicle-id` allowlist + `--org` scope + deterministic `runId`.

**Phase 1.2 apply semantics (2026-08-26):**

- **Authoritative mutation gate is transaction-local:** fleet identity index and per-target snapshots are re-read via `tx`, not `this.prisma`, before any write.
- **All-target preflight before first write:** validate every mutation plan, then CREATE/WIRE — never interleave validate→write per target.
- **Mutation targets:** `CREATE + WIRE_CONSENT_ID` and `NOOP + WIRE_CONSENT_ID` (existing ACTIVE consent, unwired link).
- **Apply counters:** `createdConsents`, `wiredConsentIds`, `mutatedVehicles`, `noopVehicles` (plus legacy `applied` = `mutatedVehicles`).
- Stale pre-transaction snapshots never authorize writes.

**Do not** infer consent from telemetry in `ProviderLinkStateBuilder`.

## Phase 2 production apply (2026-08-26)

Approved atomic apply executed for KS FH 660E, KS MS 661, KS MX 2024 only.

| Field | Value |
|-------|-------|
| runId | `dimo-consent-backfill-prod-2026-08-26-phase2` |
| createdConsents | 3 |
| wiredConsentIds | 3 |
| Production release | `20260826152600_v4994` |

Post-apply: all three targets `providerLinkState=ACTIVE`, P0.2 `AVAILABLE`. Idempotency dry-run `NOOP=3`. See `docs/audits/dimo-vehicle-provider-consent-backfill-phase1-2026-08.md` Phase 2 section.

**Status: CLOSED**
