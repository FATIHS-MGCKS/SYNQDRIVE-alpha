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
| `dimo-provider-consent-backfill.service.ts` | Plan/apply with CREATE/NOOP/CONFLICT |
| `backfill-dimo-vehicle-provider-consents.ts` | Ops entry (`--dry-run` default, `--apply` gated) |

**Apply gate:** explicit `--vehicle-id` allowlist + `--org` scope + deterministic `runId`.

**Do not** infer consent from telemetry in `ProviderLinkStateBuilder`.
