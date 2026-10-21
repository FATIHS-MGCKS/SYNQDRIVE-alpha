import { BatteryGroundTruthVerificationStatus } from '@prisma/client';
import {
  isHvH2GroundTruthActiveAtEvaluationAt,
  isHvH2GroundTruthKnowableAtEvaluationAt,
} from './m3-3-hv-h2-ground-truth-asof.util';

describe('M3.3-HV-H2 ground truth as-of authority', () => {
  const evaluationAt = new Date('2026-06-15T12:00:00.000Z');

  it('excludes GT created after evaluationAt', () => {
    expect(
      isHvH2GroundTruthKnowableAtEvaluationAt(
        { createdAt: new Date('2026-07-01T00:00:00.000Z') },
        evaluationAt,
      ),
    ).toBe(false);
  });

  it('revocation after evaluationAt does not remove historical active state', () => {
    expect(
      isHvH2GroundTruthActiveAtEvaluationAt(
        {
          verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          revocations: [{ revokedAt: new Date('2026-08-01T00:00:00.000Z') }],
          supersededByGroundTruthEvents: [],
        },
        evaluationAt,
      ),
    ).toBe(true);
  });

  it('revocation before evaluationAt removes historical active state', () => {
    expect(
      isHvH2GroundTruthActiveAtEvaluationAt(
        {
          verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          revocations: [{ revokedAt: new Date('2026-06-01T00:00:00.000Z') }],
          supersededByGroundTruthEvents: [],
        },
        evaluationAt,
      ),
    ).toBe(false);
  });

  it('supersession after evaluationAt does not remove prior historical authority', () => {
    expect(
      isHvH2GroundTruthActiveAtEvaluationAt(
        {
          verificationStatus: BatteryGroundTruthVerificationStatus.SUPERSEDED,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          revocations: [],
          supersededByGroundTruthEvents: [{ createdAt: new Date('2026-09-01T00:00:00.000Z') }],
        },
        evaluationAt,
      ),
    ).toBe(true);
  });

  it('supersession before evaluationAt removes prior historical authority', () => {
    expect(
      isHvH2GroundTruthActiveAtEvaluationAt(
        {
          verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          revocations: [],
          supersededByGroundTruthEvents: [{ createdAt: new Date('2026-06-01T00:00:00.000Z') }],
        },
        evaluationAt,
      ),
    ).toBe(false);
  });
});
