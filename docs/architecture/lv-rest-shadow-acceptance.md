# LV REST Shadow Mode — Acceptance Criteria (Prompt 35/78)

Feature flag: `batteryV2RestShadowEnabled` (`BATTERY_V2_REST_SHADOW_ENABLED`, default `false`).

## Scope

REST_60M and REST_6H run **only** in shadow mode when the flag is enabled. Shadow mode persists diagnostic measurements without user-facing or operational side effects.

## Acceptance Criteria

| ID | Scenario | Expected behavior |
|----|----------|-------------------|
| **AC-SH01** | Flag `false` | No new REST target jobs scheduled (FSM, producer, reconciliation). Queued jobs exit without evaluation. |
| **AC-SH02** | Flag `true`, valid rest observation | REST measurement persisted with `context.shadowMode=true`, `evidenceEligible=false`, `publicationEligible=false`. |
| **AC-SH03** | Flag `true`, contaminated observation | Measurement persisted with contamination quality; no evidence, publication, alert, or task. |
| **AC-SH04** | Flag `true`, missed target | MISSED measurement persisted without fabricated numeric voltage. |
| **AC-SH05** | Flag `true`, wake after rest | `CONTAMINATED_BY_WAKE` counted in shadow summary `wakeContaminationCount`. |
| **AC-SH06** | Canonical health / rental readiness | REST shadow measurements do not change published SOH, rental readiness, or prominent health percent. |
| **AC-SH07** | Internal diagnostic API | `GET /vehicles/:vehicleId/battery-health/lv-rest-shadow-summary` returns rest window count, 60m/6h capture, quality distribution, wake contamination, last valid measurement. |
| **AC-SH08** | Metrics | Prometheus counters: `synqdrive_battery_v2_rest_shadow_total`, `synqdrive_battery_lv_rest_capture_total`, `synqdrive_battery_v2_rest_missed_total`, `synqdrive_battery_lv_rest_contamination_total`. |
| **AC-SH09** | Flag off after prior shadow data | Existing shadow measurements remain queryable; no new jobs until flag re-enabled. |

## Related architecture acceptance (Phase 2a)

From `battery-health-v2.md`:

- **AC01** — Wake contamination → `CONTAMINATED_BY_WAKE`; no REST evidence
- **AC02** — Missing LV data → `MISSED`
- **AC09** — REST_60M + REST_6H same timestamp → at most one VALID

Shadow mode satisfies AC01–AC02 and AC09 at the measurement layer; publication and evidence gates remain off until later rollout phases.

## Verification

```bash
cd backend && npm test -- --testPathPattern='lv-rest-shadow|battery-v2-rest-target|battery-rest-target-evaluate'
```

Manual (flag on, internal API):

```bash
curl -H "Authorization: Bearer …" \
  "https://app.synqdrive.eu/api/v1/vehicles/{vehicleId}/battery-health/lv-rest-shadow-summary"
```
