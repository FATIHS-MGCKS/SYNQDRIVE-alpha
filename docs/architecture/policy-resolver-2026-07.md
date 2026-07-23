# Central Policy Resolver (Prompt 12)

**Date:** 2026-07-23  
**Module:** `backend/src/modules/data-authorizations/policy-resolver/`

## Resolver contract

### Input (`PolicyResolverInput`)

| Field | Required | Notes |
|-------|----------|-------|
| `organizationId` | yes | Tenant scope |
| `sourceSystem` | yes | Explicit enum — no empty wildcard |
| `dataCategory` | yes | `PrivacyProcessingDataCategory` |
| `purpose` | yes | `PrivacyProcessingPurpose` — empty ≠ ANY |
| `action` | yes | `READ`, `WRITE`, `INGEST`, `SHARE`, `PROCESS` |
| `processorType` | yes | Explicit enum required |
| `processorId` | yes | Non-empty string |
| `resourceType` | yes | `VEHICLE`, `CUSTOMER`, `BOOKING`, `STATION`, `ORGANIZATION`, `CONNECTED_VEHICLES`, `NONE` |
| `resourceId` | conditional | Required when resource type demands it |
| `vehicleId` / `customerId` / `bookingId` / `stationId` | optional | Scope anchors |
| `dataSubjectReference` | optional | Required when consent gate applies |
| `effectiveTimestamp` | optional | Defaults to now |

### Output (`PolicyResolverResult`)

| Field | Description |
|-------|-------------|
| `decisionCandidate` | `ALLOW`, `DENY`, `SHADOW_WOULD_DENY`, `INCOMPLETE`, `CONFLICT` |
| `matchedPolicy` | Winning enforcement policy metadata |
| `policyVersion` | `versionNumber` of matched policy |
| `processingActivity` | Status snapshot |
| `legalBasisStatus` | Status + type + consent requirement |
| `consentStatus` | `NOT_APPLICABLE` when not required |
| `providerGrantStatus` | Provider technical access |
| `dataSharingStatus` | Partner sharing authorization |
| `dpaStatus` | Data processing agreement |
| `scopeMatch` | Boolean + scope type + detail |
| `blockingReasons` | Structured reason codes |
| `warnings` | Non-blocking notices |
| `evaluatedAt` | ISO timestamp |
| `resolverVersion` | `1.0.0` |
| `conflictingPolicyIds` | Present on `CONFLICT` |

## Evaluation stack

Read-only, no DB mutations:

1. Input validation (explicit enums, no silent ANY)
2. Candidate load (`findMany`, tenant-scoped)
3. Category + purpose exact match
4. Scope match (relational junction IDs)
5. Policy temporal validity + lifecycle status
6. Deterministic priority selection
7. ProcessingActivity operational check
8. Legal basis ACTIVE + valid window
9. Consent (when legal basis requires)
10. ProviderAccessGrant (DIMO / PROVIDER_PLATFORM paths)
11. DataSharingAuthorization (SHARE / EXTERNAL_PARTNER / PARTNER_ACCESS)
12. DPA gate (EXTERNAL_PARTNER)
13. DPIA gate (high-risk category+purpose matrix)
14. Third-country transfer mechanism gate
15. Enforcement mode application (`OFF` / `SHADOW` / `ENFORCE`)

## Priority logic

Scope specificity score (higher wins):

| Scope | Score |
|-------|-------|
| VEHICLE | 500 |
| BOOKING | 400 |
| CUSTOMER | 300 |
| STATION | 250 |
| CONNECTED_VEHICLES | 200 |
| ORGANIZATION | 100 |

Tie-breakers: `versionNumber` desc → `pathId` asc → `id` asc.

**Equal top score with different policy IDs → `CONFLICT` / HTTP-equivalent `POLICY_CONFLICT`.**

No `findFirst`. No silent fallback inside resolver.

## Error / reason codes

| Code | Meaning |
|------|---------|
| `NO_MATCHING_POLICY` | No candidate matches category/purpose/scope |
| `POLICY_CONFLICT` | Multiple equally specific policies |
| `POLICY_SUSPENDED` | Policy suspended |
| `POLICY_REVOKED` | Policy revoked |
| `POLICY_EXPIRED` | Validity window ended |
| `POLICY_NOT_YET_VALID` | `validFrom` in future |
| `PROCESSING_ACTIVITY_INACTIVE` | Activity not ACTIVE |
| `LEGAL_BASIS_MISSING` | No assessment for activity |
| `LEGAL_BASIS_NOT_ACTIVE` | No ACTIVE valid assessment |
| `CONSENT_REQUIRED` / `CONSENT_MISSING` | Consent basis without grant |
| `CONSENT_WITHDRAWN` / `CONSENT_EXPIRED` | Consent invalid |
| `PROVIDER_GRANT_MISSING` / `EXPIRED` / `REVOKED` | Provider access |
| `DATA_SHARING_MISSING` / `UNAUTHORIZED` / `EXPIRED` | Partner sharing |
| `SCOPE_MISMATCH` | Resource not in policy scope |
| `TENANT_MISMATCH` | Cross-org data |
| `DPIA_REQUIRED` / `DPIA_MISSING` | High-risk processing |
| `DPA_REQUIRED` / `DPA_MISSING` / `DPA_NOT_ACTIVE` | External processor |
| `TRANSFER_MECHANISM_REQUIRED` | Non-EEA without safeguard |
| `INCOMPLETE_POLICY_DATASET` | Missing linked entities |
| `INPUT_INVALID` | Invalid resolver input |

## Integration

- `PolicyResolverService.resolve()` — central entry
- `DataAuthorizationEnforcementService.resolve()` — delegates to resolver
- `assertDataAuthorization()` — resolver ALLOW first; legacy `OrgDataAuthorization` fallback when no match

## Tests

```
npm test -- --testPathPattern="policy-resolver"
→ 15 engine tests passing
```

Scenarios covered: valid access, missing legal basis, missing consent, expired provider grant, scope mismatch, foreign tenant, multiple policy conflict, suspended/revoked/future policy, missing DPIA, missing DPA, third-country transfer without mechanism, SHADOW/OFF modes.
