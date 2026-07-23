# Authorization Decision Engine (Prompt 13)

**Date:** 2026-07-23  
**Module:** `backend/src/modules/data-authorizations/authorization-decision-engine/`

## Overview

Fail-closed operational decision layer on top of `PolicyResolverService`. Every protected data access receives an explicit `ALLOW`, `DENY`, or `SHADOW_WOULD_DENY` with structured reason codes. No business logic duplication — policy evaluation remains in the resolver.

## Decision request contract

| Field | Required | Notes |
|-------|----------|-------|
| `organizationId` | yes | Tenant scope |
| `sourceSystem` | yes | Explicit enum |
| `dataCategory` | yes | Canonical category — unknown → DENY |
| `purpose` | yes | Known purpose enum |
| `action` | yes | See supported actions |
| `processorType` | yes | Explicit enum |
| `processorId` or `serviceIdentity` | one required | Unknown processor → DENY |
| `resourceType` | yes | Explicit enum |
| `resourceId` or `organizationWideScope` | conditional | Org-wide requires explicit flag |
| `correlationId` | yes | Traceability |
| `effectiveTimestamp` | optional | Defaults to now |

### Supported actions

`INGEST`, `READ`, `WRITE`, `DERIVE`, `PROFILE`, `EXPORT`, `SHARE`, `DELETE`, `NOTIFY`, `USE_FOR_AI`

Mapped to resolver actions without duplicating policy logic (e.g. `DERIVE` → `PROCESS`, `EXPORT` → `SHARE`).

## Decision result

| Field | Description |
|-------|-------------|
| `decision` | `ALLOW`, `DENY`, `SHADOW_WOULD_DENY` |
| `enforced` | `false` only for shadow |
| `isShadowMode` | Explicit shadow marker |
| `reasonCode` | Primary structured reason |
| `reasonCodes` | All applicable reasons |
| `resolverResult` | Full policy resolver output |
| `cacheHit` | Version-safe cache indicator |
| `auditEventId` | Append-only event ID when recorded |

## Reason codes

### Decision-layer (fail-closed)

| Code | Meaning |
|------|---------|
| `REQUEST_INVALID` | Malformed request |
| `MISSING_CORRELATION_ID` | No correlationId |
| `MISSING_PROCESSOR_IDENTITY` | No processorId/serviceIdentity |
| `MISSING_RESOURCE_SCOPE` | Resource binding incomplete |
| `UNKNOWN_DATA_CATEGORY` | Category not in canonical set |
| `UNKNOWN_PROCESSOR` | Processor identity not recognized |
| `UNKNOWN_ACTION` | Action not in supported enum |
| `RESOLVER_ERROR` | Resolver returned no result |
| `DATABASE_ERROR` | DB failure — never ALLOW in production |
| `POLICY_UNCLEAR` | CONFLICT or INCOMPLETE from resolver |
| `GLOBAL_DENY_SWITCH` | Emergency deny-all active |
| `DEVELOPMENT_BYPASS` | Dev-only bypass (never in production) |
| `POLICY_MATCH` | Successful policy match |

Plus all `POLICY_RESOLVER_REASON` codes propagated from resolver.

## Shadow mode

When resolver returns `SHADOW_WOULD_DENY`:

- `decision` = `SHADOW_WOULD_DENY`
- `enforced` = `false` — access is not blocked
- `isShadowMode` = `true` — never conflated with ALLOW
- Audit event type = `SHADOW_WOULD_DENY`
- Warning appended: *"Shadow mode: access permitted but would be denied under ENFORCE"*

## Cache behavior

- In-memory, version-stamped cache for high-frequency ingestion
- Key: request fingerprint (org, category, purpose, action, processor, scope)
- Value stamped with `policyFamilyId:version:policyId:activityId:legalBasisId`
- Only `ALLOW` decisions cached
- TTL default: 30s (`DATA_AUTH_DECISION_CACHE_TTL_MS`)
- Never cache: DENY, shadow, DB errors, global deny
- Revocation safety: short TTL + version stamp invalidation on policy version change

## Production behavior

| Condition | Result |
|-----------|--------|
| Missing required field | DENY |
| Resolver error / DB error | DENY |
| CONFLICT / INCOMPLETE policy | DENY |
| Unknown category/processor | DENY |
| `DATA_AUTH_DECISION_DEV_BYPASS=true` in production | **Startup failure** |
| `DATA_AUTH_DECISION_ENFORCEMENT_ENABLED=false` in production | **Startup failure** |
| `DATA_AUTH_DECISION_GLOBAL_DENY=true` | DENY all (logged warning) |
| Audit write failure in production | DENY |

## Configuration

| Env var | Default | Production |
|---------|---------|------------|
| `DATA_AUTH_DECISION_ENFORCEMENT_ENABLED` | true | must be true |
| `DATA_AUTH_DECISION_DEV_BYPASS` | false | must be false |
| `DATA_AUTH_DECISION_GLOBAL_DENY` | false | emergency only |
| `DATA_AUTH_DECISION_CACHE_ENABLED` | true | optional |
| `DATA_AUTH_DECISION_CACHE_TTL_MS` | 30000 | tune for ingestion |
| `DATA_AUTH_DECISION_AUDIT_ENABLED` | true | recommended |

## Integration

```
Caller → AuthorizationDecisionService.decide()
       → PolicyResolverService.resolve()
       → evaluateAuthorizationDecision() [pure]
       → AuthorizationDecisionEventsService.record() [append-only]
       → AuthorizationDecisionCache [optional]
```

`DataAuthorizationEnforcementService` delegates to `AuthorizationDecisionService`.

## Test results

| Suite | Scenarios |
|-------|-----------|
| `authorization-decision.engine.spec.ts` | ALLOW, shadow, conflict, DB error, global deny, dev bypass |
| `authorization-decision.fail-closed.spec.ts` | Missing fields, unknown category/processor, unclear policy |
| `authorization-decision.config-validator.spec.ts` | Production config guards |
| `authorization-decision-startup.service.spec.ts` | Startup failure on unsafe config |
| `authorization-decision.benchmark.spec.ts` | Cache hit <1ms/op baseline |

Full `data-authorizations` suite run after implementation.
