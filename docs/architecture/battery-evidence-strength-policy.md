# Battery Evidence Strength Policy (V4.9.564)

Central cross-cutting policy for battery evidence tiers, capabilities, and conflict resolution.

## Tier hierarchy (strongest → weakest)

| Rank | Tier | Legacy `BatteryEvidenceStrength` |
|------|------|----------------------------------|
| 1 | `WORKSHOP_OR_BMS_VERIFIED` | `OVERRIDE` |
| 2 | `DOCUMENT_VERIFIED` | `OVERRIDE` |
| 3 | `PROVIDER_OEM_SOH` | `PRIMARY` |
| 4 | `QUALIFIED_TELEMETRY_STABLE` | `PRIMARY` |
| 5 | `QUALIFIED_TELEMETRY_PROVISIONAL` | `SUPPLEMENTARY` |
| 6 | `ESTIMATED` | `SUPPLEMENTARY` |
| 7 | `PROXY` | `DIAGNOSTIC` |
| 8 | `LIVE_TELEMETRY` | `DIAGNOSTIC` |
| 9 | `UNKNOWN` | `NONE` |

## Capability matrix

| Tier | Assessment | Publish | Readiness | Alert | Task | neverHardBlock |
|------|------------|---------|-----------|-------|------|----------------|
| WORKSHOP_OR_BMS_VERIFIED | ✓ | ✓ | ✓ | ✓ | ✓ | |
| DOCUMENT_VERIFIED | ✓ | ✓ | ✓ | ✓ | ✓ | |
| PROVIDER_OEM_SOH | ✓ | ✓ | ✓ | ✓ | ✓ | |
| QUALIFIED_TELEMETRY_STABLE | ✓ | ✓ | ✓ | ✓ | | |
| QUALIFIED_TELEMETRY_PROVISIONAL | ✓ | | | ✓ | | |
| ESTIMATED | ✓ | | | ✓ | | ✓ |
| PROXY | ✓ | | | ✓ | | ✓ |
| LIVE_TELEMETRY | | | | | | ✓ |
| UNKNOWN | | | | | | ✓ |

`PROXY` and `ESTIMATED` (shadow) never hard-block publication or readiness of stronger evidence.

## Diagnostic evidence (separate track)

`BatteryDiagnosticEvidenceKind.WARNING_LIGHT_DTC` — warning light / DTC signals:

- Do **not** compete in SOH/capacity conflict resolution
- May trigger alerts and tasks
- Never hard-block

## Conflict resolution

`resolveEvidenceConflict()` / `resolveHvSohEvidenceConflict()`:

1. Filter by scope (`LV` / `HV`) — cross-scope candidates are `outOfScope`
2. Route `diagnosticKind` candidates to parallel `diagnostics` track
3. Compute **effective tier score** = base rank − stale penalty (3) when observation is not decision-fresh
4. Winner = highest effective score within scope
5. Losers with traceability value (workshop/document/qualified) remain `supplementary`

**Rules:**

- Higher tier does **not** win blindly — freshness is applied via `BATTERY_FRESHNESS_THRESHOLDS_MS`
- Workshop findings stay traceable in `supplementary` even when superseded
- Proxy/shadow never veto stronger paths (`neverHardBlock`)

## Integration points

| Module | Usage |
|--------|-------|
| `battery-evidence-strength.policy.ts` | Central policy (source of truth) |
| `lv-evidence-selection.policy.ts` | LV measurement → tier → legacy strength |
| `hv-fallback-charge-session.policy.ts` | Fallback session tier mapping |
| `canonical-battery-health.service.ts` | HV SOH conflict resolution |

## API

- `BATTERY_EVIDENCE_STRENGTH_POLICY_VERSION` — bump on rule changes
- `resolveLvMeasurementEvidenceTier()` — LV messart → tier
- `resolveHvEvidenceSourceTier()` — HV source/quality → tier
- `getEvidenceCapabilities()` / `getDiagnosticEvidenceCapabilities()`
- `mapTierToLegacyEvidenceStrength()` — DB/API backward compat
