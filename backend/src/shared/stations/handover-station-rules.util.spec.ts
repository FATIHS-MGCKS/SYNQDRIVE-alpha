import { StationBookingRuleOutcome } from '@shared/stations/station-booking-rules.contract';
import { assessHandoverStationRulesPersistence } from './handover-station-rules.util';
import type { HandoverStationRulesResult } from './handover-station-rules.contract';

function baseResult(
  overrides: Partial<HandoverStationRulesResult> = {},
): HandoverStationRulesResult {
  return {
    version: 1,
    evaluatedAt: '2026-07-18T10:00:00.000Z',
    kind: 'PICKUP',
    actualStationId: 'station-1',
    plannedStationId: 'station-1',
    outcome: StationBookingRuleOutcome.ALLOWED,
    reasons: [],
    evaluations: [],
    evaluatedInstant: {
      instantUtc: '2026-07-18T08:00:00.000Z',
      localDate: '2026-07-18',
      localTime: '10:00',
      timezone: 'Europe/Berlin',
    },
    manualOverrideRequired: false,
    manualOverrideApplied: false,
    manualOverrideAudit: null,
    replacesBookingTimeEvaluation: true,
    ...overrides,
  };
}

describe('handover-station-rules.util', () => {
  it('blocks handover completion on BLOCKED outcome', () => {
    const assessment = assessHandoverStationRulesPersistence(
      baseResult({ outcome: StationBookingRuleOutcome.BLOCKED }),
    );
    expect(assessment.allowed).toBe(false);
    expect(assessment.code).toBe('HANDOVER_STATION_RULES_BLOCKED');
  });

  it('requires override for manual confirmation outcomes', () => {
    const assessment = assessHandoverStationRulesPersistence(
      baseResult({
        outcome: StationBookingRuleOutcome.MANUAL_CONFIRMATION_REQUIRED,
        manualOverrideRequired: true,
      }),
    );
    expect(assessment.allowed).toBe(false);
    expect(assessment.code).toBe('HANDOVER_STATION_RULES_MANUAL_OVERRIDE_REQUIRED');
  });
});
