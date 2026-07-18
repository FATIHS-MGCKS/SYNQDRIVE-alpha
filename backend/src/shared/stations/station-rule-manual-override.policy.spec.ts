import { StationBookingRuleOutcome } from './station-booking-rules.contract';
import {
  STATION_RULE_MANUAL_OVERRIDE_MIN_REASON_LENGTH,
  StationRuleManualOverrideReasonCode,
} from './station-rule-manual-override.contract';
import {
  applyStationRuleManualOverrideToEvaluations,
  buildBookingRulesManualOverrideScope,
  buildStationRuleManualOverrideScopeFingerprint,
  validateStationRuleManualOverrideRequest,
} from './station-rule-manual-override.policy';

describe('station-rule-manual-override.policy', () => {
  const scope = buildBookingRulesManualOverrideScope({
    organizationId: 'org-1',
    pickupStationId: 'pickup-1',
    returnStationId: 'return-1',
    pickupDateTime: '2026-07-14T08:00:00.000Z',
    returnDateTime: '2026-07-17T08:00:00.000Z',
    bookingType: 'STANDARD',
    vehicleId: 'vehicle-1',
  });

  it('requires override for warning outcomes when no override is supplied', () => {
    const validation = validateStationRuleManualOverrideRequest({
      scope,
      evaluations: [
        {
          ruleId: 'pickup.outside_opening_hours',
          outcome: StationBookingRuleOutcome.WARNING,
          reason: { code: 'OUTSIDE_OPENING_HOURS', message: 'Outside hours' },
        },
      ],
    });

    expect(validation.valid).toBe(false);
    expect(validation.issues[0]?.code).toBe(
      StationRuleManualOverrideReasonCode.OVERRIDE_REQUIRED,
    );
  });

  it('rejects override for blocked outcomes', () => {
    const validation = validateStationRuleManualOverrideRequest({
      scope,
      manualOverride: { reason: 'A'.repeat(STATION_RULE_MANUAL_OVERRIDE_MIN_REASON_LENGTH) },
      actor: { userId: 'user-1', permission: 'stations.override_rules' },
      evaluations: [
        {
          ruleId: 'pickup.pickup_disabled',
          outcome: StationBookingRuleOutcome.BLOCKED,
          reason: { code: 'PICKUP_DISABLED', message: 'Disabled' },
        },
      ],
    });

    expect(validation.valid).toBe(false);
    expect(validation.issues[0]?.code).toBe(
      StationRuleManualOverrideReasonCode.OVERRIDE_BLOCKED_OUTCOME,
    );
  });

  it('invalidates override when station or time scope changes', () => {
    const fingerprint = buildStationRuleManualOverrideScopeFingerprint(scope);
    const changedScope = {
      ...scope,
      pickupDateTime: '2026-07-14T09:00:00.000Z',
    };

    expect(buildStationRuleManualOverrideScopeFingerprint(changedScope)).not.toBe(fingerprint);
  });

  it('applies override only to warning and manual-confirmation evaluations', () => {
    const evaluations = applyStationRuleManualOverrideToEvaluations(
      [
        {
          ruleId: 'pickup.capacity_warning',
          outcome: StationBookingRuleOutcome.WARNING,
          reason: { code: 'CAPACITY_WARNING', message: 'Near capacity' },
        },
        {
          ruleId: 'pickup.pickup_disabled',
          outcome: StationBookingRuleOutcome.BLOCKED,
          reason: { code: 'PICKUP_DISABLED', message: 'Disabled' },
        },
      ],
      'Operator approved capacity exception',
    );

    expect(evaluations[0]?.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(evaluations[1]?.outcome).toBe(StationBookingRuleOutcome.BLOCKED);
  });
});
