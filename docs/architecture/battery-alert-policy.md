# Battery Alert Policy (V4.9.566)

Central battery alert contract for `BatteryCriticalDetector` and canonical read adapters. Alerts require reliable evidence and semantic deduplication — no alerts from proxy, shadow, legacy scores, or missing data alone.

## Contract fields

Each `BatteryAlertContract` includes:

| Field | Description |
|-------|-------------|
| `ruleId` | Stable rule identifier (`battery.alert.*`) |
| `vehicleId` | Affected vehicle |
| `cause` | Concrete operational cause (German user-facing) |
| `evidenceTier` | `BatteryEvidenceStrengthTier` from P64 policy |
| `freshness` | `observedAt`, `observationState`, `decisionFresh`, `ageMs` |
| `dedupeKey` | `battery_alert:{vehicleId}:{ruleId}` |
| `severity` | `InsightSeverity` |
| `recommendedAction` | Suggested operator action |
| `autoResolveWhen` | Documented auto-resolve conditions |

## Rule IDs

| Rule ID | Source |
|---------|--------|
| `battery.alert.warning_light` | HM battery warning light active |
| `battery.alert.safety_dtc` | Safety-relevant battery DTC |
| `battery.alert.lv_publication_stable` | STABLE + VALID qualified LV publication |
| `battery.alert.workshop_finding` | Workshop override / `WORKSHOP_OR_BMS_VERIFIED` tier |
| `battery.alert.manual_measurement` | Confirmed manual or document measurement |

## Exclusions (never alert)

- Start proxy conspicuous
- REST shadow signal
- HV capacity shadow
- Legacy unverified publication / legacy scores alone
- Missing summary or weak truth sources (`LIVE_TELEMETRY`, `V2_SHADOW_DIAGNOSTIC`, `LEGACY_UNVERIFIED`)
- HV provider SOH alone

## Stable LV publication gate

Alerts on `battery.alert.lv_publication_stable` require:

- `truthSource === V2_PUBLICATION_STABLE`
- `publicationMaturity === STABLE`
- `decisionCapable === true`
- `restingMeasurementQuality === VALID`
- Evidence tier with `canTriggerAlert`

## Auto-resolve

`shouldAutoResolveBatteryAlert()` re-evaluates active rules for a vehicle. When the triggering rule no longer appears in `evaluateBatteryAlerts()`, the insight may auto-resolve via existing STATE insight publish/swap and fleet sweep.

| Rule | Auto-resolve when |
|------|-------------------|
| Warning light | `WARNING_LIGHT_CLEARED \| FALSE_POSITIVE` |
| Safety DTC | `DTC_CLEARED \| FALSE_POSITIVE` |
| LV publication | `PUBLICATION_GOOD \| BATTERY_MEASURED_OK \| BATTERY_REPLACED \| FALSE_POSITIVE` |
| Workshop | `WORKSHOP_RESOLVED \| BATTERY_REPLACED \| FALSE_POSITIVE` |
| Manual measurement | `BATTERY_MEASURED_OK \| BATTERY_REPLACED \| FALSE_POSITIVE` |

## Integration

| Module | Role |
|--------|------|
| `battery-alert.policy.ts` | `evaluateBatteryAlerts()`, `resolveBatteryAlertCandidate()`, `shouldAutoResolveBatteryAlert()` |
| `battery-evidence-strength.policy.ts` | `canTriggerAlert` capability gate |
| `battery-readiness.policy.ts` | Shared readiness input + safety DTC helpers |
| `battery-critical.detector.ts` | One `InsightCandidate` per alert with semantic `dedupeKey` |
| `canonical-battery-read.adapter.ts` | Re-exports alert resolver for module state |

Task catalog bridge retains `legacyDedupeKey: battery_critical:{vehicleId}` in detector metrics for existing `BATTERY_CHECK` task dedup.

## API

- `BATTERY_ALERT_POLICY_VERSION`
- `BATTERY_ALERT_RULE_IDS`
- `BATTERY_ALERT_AUTO_RESOLVE`
- `evaluateBatteryAlerts()`
- `resolveBatteryAlertCandidate()`
- `shouldAutoResolveBatteryAlert()`

Tests: `battery-alert.policy.spec.ts`, `battery-critical.detector.spec.ts`, `canonical-battery-read.adapter.spec.ts`.
