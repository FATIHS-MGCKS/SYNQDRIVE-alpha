# Data Processing — E2E Flow Tests (Prompt 40)

## Scope

End-to-end Playwright coverage for the **Data Processing & Approvals** hub, creation wizard, lifecycle actions, and **mocked enforcement simulation**. All tests use synthetic org `org-dp-flow-e2e` and in-memory API mocks — no production data, no live DIMO/provider services.

## Test files

| File | Role |
|------|------|
| `frontend/e2e/data-processing-flow-fixtures.ts` | Stateful mock API, wizard helpers, enforcement simulator |
| `frontend/e2e/data-processing-flow.spec.ts` | Desktop serial suite — scenarios 1–20, 23–30 |
| `frontend/e2e/data-processing-flow-responsive.spec.ts` | Mobile wizard DE/EN + Axe at 320px (21–22) |
| `frontend/e2e/data-processing-a11y.spec.ts` | Existing hub Axe scans (complements 22) |

## Run

```bash
cd frontend
npm run test:data-processing:e2e
```

Artifacts on failure: `frontend/test-results/`, `frontend/e2e/playwright-report/`, traces (`retain-on-failure`), screenshots, video.

JSON summary: `frontend/e2e/artifacts/data-processing/playwright-results.json`

## Scenario map (30)

| # | Scenario | Test |
|---|----------|------|
| 1–9 | Draft → legal basis → scope → review → privacy/security → approval → schedule → activate | `flow.spec` test 1 |
| 10–11 | Allowed / denied data access | `flow.spec` test 2 |
| 12–13 | DIMO ProviderGrant + provider conflict | `flow.spec` test 3 |
| 14–15 | Consent grant + withdrawal | `flow.spec` test 4 |
| 16–18 | Deny-switch, queue block, revocation complete | `flow.spec` test 5 |
| 19 | KPI + filters | `flow.spec` test 6 |
| 20 | Foreign tenant 403 | `flow.spec` test 7 |
| 21 | Mobile wizard DE/EN | `flow-responsive.spec` |
| 22 | Accessibility (Axe + overflow) | `flow-responsive.spec` + `data-processing-a11y.spec` |
| 23 | Historical version unchanged | `flow.spec` test 8 |
| 24 | Enforcement coverage state | `flow.spec` test 9 |
| 25 | Expired policy blocks access | `flow.spec` test 10 |
| 26 | Missing DPIA blocks activation | `flow.spec` test 11 |
| 27 | Missing DPA blocks external sharing | `flow.spec` test 12 |
| 28 | AI/MCP access denied (purpose mismatch) | `flow.spec` test 13 |
| 29–30 | Revocation invalidates session + audit timeline | `flow.spec` test 14 |

## Mock architecture

- **Route pattern:** `**/api/v1/**` with org guard (`org-dp-flow-e2e` vs `org-dp-foreign-e2e` → 403).
- **Register:** list vs detail routing order fixed (detail before list).
- **Enforcement:** `simulateAuthorizationCheck()` mirrors fail-closed rules (deny-switch, scope, purpose, DPA, provider conflict, expiry).
- **Lifecycle:** policy-lifecycle approve/schedule/activate/revoke + review-workflow decisions.

## Results (2026-07-24)

- **desktop-1280:** 14/14 passed
- **mobile-375 / mobile-320:** 3/3 passed (wizard DE/EN + Axe)
- **Total executed:** 17 Playwright tests (19 project runs with skips)

## Known gaps

- **Real backend enforcement:** E2E uses in-process simulator; PostgreSQL integration tests (`test:data-auth:postgres`) cover DB invariants separately.
- **DIMO live provider:** Provider grant UI flow is API-mocked; no DIMO MCP in E2E.
- **Queue worker block:** Asserted via mock flags + coverage degraded state, not a live BullMQ worker.
- **Session/token invalidation:** Mock sets `sessionInvalidated`; no browser cookie assertion.
- **fleet-map / rental-health proxy 500:** Unmocked rental dashboard calls log HTTP 500 in console; hub tests still pass.

## Test artifacts

| Path | Content |
|------|---------|
| `frontend/test-results/` | Per-test screenshots, video, trace zip |
| `frontend/e2e/playwright-report/` | HTML report |
| `frontend/e2e/artifacts/data-processing/playwright-results.json` | CI JSON reporter output |
