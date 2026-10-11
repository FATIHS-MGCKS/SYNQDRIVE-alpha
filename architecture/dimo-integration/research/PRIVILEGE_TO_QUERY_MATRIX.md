# R2 — Privilege to query matrix

| Source | Date |
|--------|------|
| Token Exchange API docs | 2026-10-11 |
| SynqDrive code | `dimo-auth.service.ts` @ `0633d0831` |

## SynqDrive default

```text
getVehicleJwt(tokenId, privileges = [1, 2, 3, 4, 5, 6])
```

Cache key includes privilege hash; partial sets supported at exchange API.

## Official documentation gap

DIMO docs describe `privileges` as **integer array** but do **not** enumerate ID→capability mapping in the fetched Token Exchange page (**UNKNOWN** for numeric semantics).

**Historical evidence:** Webhook signal catalog references strings like `privilege:GetNonLocationHistory` in Vehicle Triggers docs — not mapped to SynqDrive `[1..6]` in repository.

## Consumer requirements (INFERRED)

| Query family | Typical JWT | Notes |
|--------------|-------------|-------|
| signalsLatest / signals | Vehicle default | Bulk of telemetry |
| segments / events | Vehicle default | Trip + EED |
| availableSignals / dataSummary | Vehicle default | Preflight |
| Identity `vinVCLatest` | Vehicle default | category IDENTITY in gateway |
| Developer JWT | Triggers list/subscribe (ops) | Not vehicle-scoped |

## Partial privilege failure

No automatic query field pruning — static GraphQL may request unauthorized fields → provider errors (**INFERRED**).

## R2 recommendation

Obtain official privilege enum via DIMO SDK or Identity docs in R3; until then label matrix cells **UNKNOWN**.
