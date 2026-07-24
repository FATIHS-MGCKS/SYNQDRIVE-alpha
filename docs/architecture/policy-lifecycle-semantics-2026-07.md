# Policy Lifecycle Status Semantics (Prompt 28)

**Date:** 2026-07-24  
**Version:** V4.9.811

## Status meanings

| Status | Was ever operational? | Meaning |
|--------|----------------------|---------|
| **REJECTED** | No | Governance rejection during review — never became effective |
| **SUSPENDED** | Yes (was ACTIVE) | Temporary block — reversible with `data_processing.resume` |
| **REVOKED** | Yes | Explicit withdrawal after effectiveness — terminal, not reactivatable |
| **EXPIRED** | Yes | `validUntil` reached — terminal, historical evidence preserved |
| **SUPERSEDED** | Yes | Replaced by newer version (`supersededById`) — historical record kept |

REJECTED and REVOKED are **distinct terminal paths**. REJECTED must never appear as REVOKED.

## Reason codes

Each terminal/pause status has its own reason-code family in `policy-lifecycle-semantics.constants.ts`:

| Family | Example codes |
|--------|---------------|
| `POLICY_REJECTED_*` | `GOVERNANCE_REJECTION`, `INCOMPLETE_DOCUMENTATION`, `RISK_TOO_HIGH` |
| `POLICY_SUSPENDED_*` | `CONSENT_WITHDRAWN`, `INCIDENT_RESPONSE`, `OPERATOR_REQUEST` |
| `POLICY_REVOKED_*` | `OPERATOR_REVOCATION`, `LEGAL_OBLIGATION`, `DATA_BREACH` |
| `POLICY_EXPIRED_*` | `VALID_UNTIL_REACHED`, `SCHEDULED_CATCH_UP` |
| `POLICY_SUPERSEDED_*` | `NEW_VERSION_ACTIVATED`, `EXTENSION_NEW_VERSION` |
| `POLICY_RESUMED_*` | `SUSPENSION_LIFTED` |

## Automatic processes

### Expiry job (`PolicyLifecycleExpiryService`)

- Poll interval: `DATA_AUTH_POLICY_EXPIRY_POLL_MS` (default 60s)
- Disable: `DATA_AUTH_POLICY_EXPIRY_POLL_ENABLED=false`
- Finds `ACTIVE` or `SUSPENDED` policies where `validUntil <= now` (UTC)
- Transitions → `EXPIRED` with append-only lifecycle event
- **Idempotent** via in-memory + correlation idempotency key per `(entity, validUntil)`
- **Catch-up safe** after outages — processes all overdue rows each run
- **Cache invalidation** — `AuthorizationDecisionService.invalidateOrganizationCache`
- Blocks new decisions via `EXPIRED` status in Policy Resolver (no stale ALLOW cache)

### Scheduled activation guard

`PolicyLifecycleActivationGuardService` blocks activation when:

- Review cycle no longer APPROVED for current fingerprint/version
- No valid `LegalBasisAssessment` at activation time

Applies to processing activity and enforcement policy activation.

## Rollback rules

| Rule | Behavior |
|------|----------|
| New version source | Only `ACTIVE` or `SUSPENDED` |
| Forbidden sources | `REJECTED`, `REVOKED`, `SUPERSEDED`, `EXPIRED` — no auto-reactivation |
| Extension | `extendViaNewVersion` — only from `ACTIVE`; creates DRAFT successor with new `validUntil` |
| Historical evidence | Lifecycle events append-only; terminal rows immutable |

## API / UI semantics

Responses from lifecycle mutations include `statusSemantics`:

```json
{
  "status": "REJECTED",
  "statusSemantics": {
    "label": "Rejected",
    "description": "Governance rejection during review — never became operational.",
    "wasEverOperational": false,
    "isTerminal": true,
    "isReversible": false,
    "displayCategory": "terminal_never_active"
  }
}
```

`displayCategory` values: `pre_operational`, `operational`, `paused`, `terminal_never_active`, `terminal_was_active`.

## New endpoints

| Method | Path | Permission |
|--------|------|------------|
| POST | `.../processing-activities/:id/resume` | `data_processing.resume` |
| POST | `.../enforcement-policies/:id/resume` | `data_processing.resume` |
| POST | `.../processing-activities/:id/extend` | `data-authorization.manage` |

Resume lifts suspension-scoped deny-switch entries and transitions `SUSPENDED → ACTIVE`.

## Transition matrix updates

- Added: `SUSPENDED → EXPIRED`
- Forbidden (explicit): `REJECTED → REVOKED`, `REJECTED → ACTIVE`, `REVOKED → ACTIVE`, `DRAFT → ACTIVE`

## Test results

```
npm run test:data-auth:policy-lifecycle
→ 5 suites, 58 tests passing
```

Coverage includes: allowed/forbidden transitions, expiry job idempotency, cache invalidation, rollback guard, activation guard, reason codes, status semantics.
