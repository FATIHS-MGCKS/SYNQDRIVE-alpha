# Fleet Connectivity Runtime Domain (2026-07-19)

## Summary

Introduces the canonical **Vehicle Connectivity Runtime** domain under
`backend/src/modules/vehicles/connectivity/domain/`.

No consumer migration in this change — types, reason codes, priority rules,
and validation invariants only.

## Dimensions (separated)

| Dimension | Type | Notes |
|-----------|------|-------|
| Provider Link | `ProviderLinkState` | ACTIVE, REAUTH_REQUIRED, REVOKED, NO_LINK, ERROR, UNKNOWN |
| Telemetry | `TelemetryFreshness` | **Reused** from `vehicle-state-interpreter` — no duplicate enum |
| Physical Device | `PhysicalDeviceState` | Includes NOT_APPLICABLE for OEM/synthetic |
| Data Coverage | `DataCoverageState` | GOOD / PARTIAL / INSUFFICIENT / UNKNOWN / NOT_APPLICABLE |
| Attention | `AttentionState` | NONE / WATCH / ACTION_REQUIRED / CRITICAL |
| Overall | `OverallConnectivityState` | Synthesized; precedence documented in priority module |

## Result object

`VehicleConnectivityRuntimeState` — machine codes only:

- Dimension states + `reasonCodes[]`
- Timestamps: `lastTelemetryAt`, `lastProviderObservedAt`, `lastReceivedAt`
- Binding / episode refs: `deviceBindingId`, `activeEpisodeId`
- `requiresAction`, `recommendedAction` (enum codes)
- `evidence` (structured technical facts)
- `calculatedAt`, `stateVersion`

User-facing labels remain frontend i18n responsibility.

## Overall state priority (highest first)

1. INTEGRATION_ERROR
2. AUTHORIZATION_REQUIRED
3. DEVICE_UNPLUGGED
4. OFFLINE
5. SOFT_OFFLINE
6. UNKNOWN / NO_ACTIVE_DATA_SOURCE
7. STANDBY
8. TELEMETRY_ACTIVE

## Next steps (not in this commit)

- `VehicleConnectivityRuntimeStateBuilder` (Prompt 4+)
- Consumer migration off legacy fleet-connectivity projections
- Persistent episode table linkage for `activeEpisodeId`
