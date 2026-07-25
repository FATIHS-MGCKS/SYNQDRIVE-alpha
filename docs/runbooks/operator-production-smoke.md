# Operator App — Production Smoke Runbook

| Field | Value |
|-------|-------|
| **Purpose** | Close GAP-043-001 — authenticated write-path validation on production |
| **Owner** | `[PLACEHOLDER — QA / DevOps]` |
| **Target** | `https://app.synqdrive.eu` |
| **Last updated** | 2026-07-25 |

## Prerequisites

Provision an **isolated Operator smoke tenant** (never use production customer PII):

| Asset | Requirement |
|-------|-------------|
| Organization | Dedicated smoke org (slug e.g. `operator-smoke-prod`) |
| Station | At least one station assigned to smoke WORKER |
| User | Clerk user with WORKER role + station scope |
| Vehicle | AVAILABLE test vehicle at smoke station |
| Customer | Synthetic test customer |
| Booking | CONFIRMED booking eligible for pickup |

Store credentials in secure ops vault — **not in git**.

### Environment variables (VPS `backend.env` — optional)

```bash
# Example — set only after tenant provisioned
OPERATOR_SMOKE_ORG_ID=<uuid>
OPERATOR_SMOKE_STATION_ID=<uuid>
OPERATOR_SMOKE_BOOKING_ID=<uuid>
```

## Read-only smoke (no credentials)

```bash
BASE=https://app.synqdrive.eu
curl -sS -o /dev/null -w "%{http_code}\n" "$BASE/operator"
curl -sS -o /dev/null -w "%{http_code}\n" "$BASE/api/v1/health"
curl -sS -o /dev/null -w "%{http_code}\n" "$BASE/api/v1/organizations/fake-org/bookings/today/pickups"
# Expect: 200, 200, 401
```

## Write-path smoke (authenticated)

Execute with Clerk JWT for smoke WORKER. Use API or Playwright against **smoke tenant only**.

| # | Test | Endpoint / action | Pass criteria |
|---|------|-------------------|---------------|
| W-01 | Draft create | `PUT …/handover/draft` | 200 + `updatedAt` |
| W-02 | Draft reload | `GET …/handover/draft` | Payload matches |
| W-03 | Refresh resume | Repeat GET after PUT | Same draft |
| W-04 | Test upload | Document intake `operator_app` | Extraction queued |
| W-05 | Test damage | Create damage on vehicle | Linked to handover |
| W-06 | Test signature | Handover payload with sig URLs | Stored on protocol |
| W-07 | Pickup complete | `POST …/handover/pickup` | Booking ACTIVE |
| W-08 | Idempotency replay | Repeat pickup POST | Same protocol, no duplicate |
| W-09 | Return complete | `POST …/handover/return` | Booking COMPLETED |
| W-10 | Audit events | Activity / protocol rows | Present |
| W-11 | Notification dedup | Check outbox counts | No duplicate flood |
| W-12 | Immutable completion | PATCH booking status | 4xx |
| W-13 | Booking deep link | `GET /operator/bookings/:id` | Shell loads |
| W-14 | Vehicle deep link | `GET /operator/vehicles/:id` | Shell loads |

## Cleanup

- Cancel or complete smoke booking via app APIs
- Delete smoke handover drafts: `DELETE …/handover/draft?kind=PICKUP|RETURN`
- **Do not** run ad-hoc SQL deletes on production

## Automated preflight

```bash
bash backend/scripts/ops/operator-production-smoke-preflight.sh
```

## Mitigation until tenant exists

- Playwright E2E with `org-operator-e2e` mocks (`npm run test:operator:e2e`)
- VPS read-only audit (Prompt 42)
