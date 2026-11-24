# V2B-PR5 — Provider-only billing / outbox parity

**Operation:** `SYNQDRIVE_VEHICLES_V2B_PR5_PROVIDER_ONLY_BILLING_OUTBOX_PARITY`  
**Base:** `origin/main` @ `a7ac2867cee11ba6d11ba1f58643ef5506ec8062` (includes [#2519](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2519), [#2517](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2517) MAUX/FEUX sidebar)  
**PR:** [#2520](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2520) closeout certification  
**Prerequisite:** VO-DEC-2B-002 manual registration retirement; PG-03 HM_ONLY canonical  
**Flags:** `VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED` default OFF; `VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL` not armable  

## Provider billing parity matrix (repository truth)

| Path | Vehicle authority | Activation TX / outbox | Legacy `onVehicleProvisioned` at register | Billable quantity via outbox processor |
|------|-------------------|------------------------|-------------------------------------------|----------------------------------------|
| DIMO canonical (`register-from-dimo` / P2) | Onboarding activation service | Yes — single `VEHICLE_ACTIVATED` per case | No | Yes — `vehicle-registry:{eventId}:billing-activate:v1` |
| HM_ONLY canonical (flag ON / PG harness) | Same | Yes | No | Same as DIMO |
| HM_ONLY legacy (flag OFF) | `HighMobilityRegistrationService` inline TX | **No** | **No** | **EXPECTED_LEGACY_GAP_PRESERVED** (not full canonical billing parity) |
| Manual HTTP create (retired) | None — 409 | No | No | No |
| Integration harness row | Test-only harness | No | Optional (tests only, default off) | No |
| Existing legacy fleet edit | `vehicle.update` | No new outbox | No | No retroactive billing |

## PG-05 certification (`V2B_PROVIDER_BILLING_PARITY_PG=1`)

| Case | Assertion |
|------|-----------|
| PG-05-A | DIMO: one outbox, duplicate processor passes → one `VEHICLE_CONNECTED` quantity event |
| PG-05-B | HM canonical matches registry billing idempotency namespace |
| PG-05-C | HM legacy (flag OFF): vehicle row only; zero outbox and billing |
| PG-05-D | Sequential duplicate canonical register → one outbox |
| PG-05-E | HM legacy reconnect → Conflict; no billing |
| PG-05-F | Cross-tenant canonical → no org-B outbox/billing |
| PG-05-G | Non-billable org → outbox present, zero quantity after process |
| PG-05-H | Pre-existing harness vehicle → edit OK; no new outbox/billing |
| PG-05-I | Manual registration retirement contract |
| PG-05-J | DIMO idempotent retry → single outbox |
| PG-05-K | DIMO canonical end-to-end: durable billing before outbox publish → processor retry invokes billing again → one ledger row, delta +1, PUBLISHED |
| PG-05-L | HM canonical: pre-billing validation failure (transient lifecycle) → retry → one `VEHICLE_CONNECTED`, delta +1 |

**Quantity authority:** assertions use `billing_quantity_events.quantityBefore` / `quantityAfter` / `delta` (not subscription item projection sync).

**Crash-recovery cross-reference:** VO5B-AB1 case E covers synthetic outbox + pre-written billing; PG-05-K binds the same recovery semantics to canonical DIMO activation outbox.

## PR #2518 evidence disposition

Open docs-only [#2518](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2518) (`cursor/v2b-pr3-pg03-ci-evidence-44c2`) records post-merge PG-03 CI narrative @ stale `af05edf53` base. **Unique content:** runner communication-loss classification for a single CI run. **Superseded on main/2520:** PG-03 18/18 and VO-5B gate evidence re-run on current SHAs. **Action:** retain #2518 open; no auto-merge; provenance cited here only.

## Owner decisions (unchanged — not inferred)

| ID | State |
|----|--------|
| OWN-1 | SUPERSEDED_BY_OWNER_DECISION |
| OWN-2 | NOT_APPLICABLE_AFTER_REMOVAL |
| OWN-3 | OWNER_APPROVAL_REQUIRED (HM readiness waivers) |
| OWN-4 | OWNER_APPROVAL_REQUIRED (no retroactive billing policy attestation) |
| OWN-5 | OWNER_APPROVAL_REQUIRED (flag soak / arm order) |
| OWN-6 | OWNER_APPROVAL_REQUIRED (optional registry repair migration) |

## Runtime note (HM legacy flag OFF)

`HighMobilityRegistrationService` legacy inline create removed obsolete `dimoConnectionStatus` field (not in Prisma schema) and sets `registryLifecycle: ACTIVE` (schema default) so the default-OFF path remains executable for **flag-OFF regression certification only** — **no** billing outbox, **no** new registration authority, **no** entitlement policy change. Classified **EXPECTED_LEGACY_GAP_PRESERVED**, not full canonical billing parity.

## Cutover / production

- **MERGE_READINESS:** engineering when CI green; does not arm flags.
- **BILLING_CUTOVER_READINESS:** NO_GO — single-rail and HM canonical remain default OFF.
- **PRODUCTION_ACTIVATION:** NO_GO.