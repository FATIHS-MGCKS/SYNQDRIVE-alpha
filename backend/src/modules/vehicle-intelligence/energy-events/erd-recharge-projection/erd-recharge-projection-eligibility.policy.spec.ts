import {
  ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON,
  evaluateErdRechargeProjectionEligibility,
} from './erd-recharge-projection-eligibility.policy';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session-quality.status';

const ORG = 'org-1';
const VEH = 'veh-1';
const scope = { organizationId: ORG, vehicleId: VEH };

function baseSession(overrides: Record<string, unknown> = {}) {
  const startAt = new Date('2026-06-01T10:00:00.000Z');
  const endAt = new Date('2026-06-01T11:00:00.000Z');
  return {
    organizationId: ORG,
    vehicleId: VEH,
    source: 'DIMO_RECHARGE_SEGMENT',
    segmentFingerprint: 'dimo-recharge-1-1000',
    idempotencyKey: 'idem-1',
    startAt,
    endAt,
    isOngoing: false,
    metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
    ...overrides,
  };
}

describe('erd-recharge-projection-eligibility.policy', () => {
  it('accepts completed native session with valid boundaries', () => {
    expect(
      evaluateErdRechargeProjectionEligibility({ session: baseSession(), scope }),
    ).toEqual({ projectable: true });
  });

  it('rejects ongoing session', () => {
    const result = evaluateErdRechargeProjectionEligibility({
      session: baseSession({ isOngoing: true, endAt: null }),
      scope,
    });
    expect(result).toEqual({
      projectable: false,
      reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.ONGOING_SESSION,
    });
  });

  it('rejects missing endAt', () => {
    const result = evaluateErdRechargeProjectionEligibility({
      session: baseSession({ endAt: null, isOngoing: false }),
      scope,
    });
    expect(result).toEqual({
      projectable: false,
      reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.MISSING_END_AT,
    });
  });

  it('rejects invalid time boundary', () => {
    const startAt = new Date('2026-06-01T11:00:00.000Z');
    const result = evaluateErdRechargeProjectionEligibility({
      session: baseSession({ startAt, endAt: new Date('2026-06-01T10:00:00.000Z') }),
      scope,
    });
    expect(result).toEqual({
      projectable: false,
      reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.INVALID_TIME_BOUNDARY,
    });
  });

  it('rejects superseded fallback metadata', () => {
    const result = evaluateErdRechargeProjectionEligibility({
      session: baseSession({
        source: 'TELEMETRY_POLL_FALLBACK',
        metadata: {
          qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.CONFLICTING_SOURCES,
          supersededBySegmentFingerprint: 'native-fp',
        },
      }),
      scope,
    });
    expect(result).toEqual({
      projectable: false,
      reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.SUPERSEDED_FALLBACK,
    });
  });

  it('rejects organization mismatch', () => {
    const result = evaluateErdRechargeProjectionEligibility({
      session: baseSession({ organizationId: 'other-org' }),
      scope,
    });
    expect(result).toEqual({
      projectable: false,
      reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.ORGANIZATION_MISMATCH,
    });
  });

  it('rejects duration below HV minimum', () => {
    const startAt = new Date('2026-06-01T10:00:00.000Z');
    const endAt = new Date('2026-06-01T10:02:00.000Z');
    const result = evaluateErdRechargeProjectionEligibility({
      session: baseSession({ startAt, endAt }),
      scope,
    });
    expect(result).toEqual({
      projectable: false,
      reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.DURATION_BELOW_MINIMUM,
    });
  });

  it('rejects invalid quality status', () => {
    const result = evaluateErdRechargeProjectionEligibility({
      session: baseSession({
        metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.INVALID },
      }),
      scope,
    });
    expect(result).toEqual({
      projectable: false,
      reason: ERD_RECHARGE_PROJECTION_INELIGIBLE_REASON.QUALITY_INVALID,
    });
  });
});
