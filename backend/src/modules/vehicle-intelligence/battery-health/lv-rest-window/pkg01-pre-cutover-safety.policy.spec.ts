import { BatteryMeasurementQuality, BatteryMeasurementType } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { M3_1_PKG01_ENQUEUED_IDENTITIES_PRODUCTION } from './fixtures/m3-1-pkg01-enqueued-identities-production';
import {
  simulatePkg01Reactivation,
  type Pkg01VehicleMeasurementSnapshot,
} from './pkg01-pre-cutover-safety.policy';
import {
  isCanonicalRestAssessmentHandoffEligible,
  isRestAssessmentHandoffReconciliationTerminalCandidate,
} from './lv-rest-assessment-handoff.policy';

const vehicleSnapshots = JSON.parse(
  readFileSync(
    join(__dirname, 'fixtures/m3-1-pkg01-vehicle-measurements-production.json'),
    'utf8',
  ),
) as Pkg01VehicleMeasurementSnapshot[];

describe('pkg01-pre-cutover-safety.policy (M3.1 production forensic)', () => {
  const T0 = new Date('2026-09-03T11:08:02.000Z');
  const T0_PLUS_1H = new Date('2026-09-03T12:08:02.000Z');
  const AUDIT_NOW = new Date('2026-09-03T20:38:00.000Z');

  it('documents production PKG-01 ENQUEUED inventory size', () => {
    expect(M3_1_PKG01_ENQUEUED_IDENTITIES_PRODUCTION).toHaveLength(24);
    const contaminated = M3_1_PKG01_ENQUEUED_IDENTITIES_PRODUCTION.filter((row) =>
      row.quality.startsWith('CONTAMINATED_'),
    );
    const missed = M3_1_PKG01_ENQUEUED_IDENTITIES_PRODUCTION.filter(
      (row) => row.quality === BatteryMeasurementQuality.MISSED,
    );
    expect(contaminated).toHaveLength(23);
    expect(missed).toHaveLength(1);
  });

  it('rejects contaminated/missed measurements from canonical handoff eligibility', () => {
    for (const identity of M3_1_PKG01_ENQUEUED_IDENTITIES_PRODUCTION) {
      const measurement = {
        type: identity.type as BatteryMeasurementType,
        quality: identity.quality as BatteryMeasurementQuality,
        provenance: { sourceObservationId: identity.sourceObservationId },
      };
      expect(isCanonicalRestAssessmentHandoffEligible(measurement)).toBe(false);
      expect(isRestAssessmentHandoffReconciliationTerminalCandidate(measurement)).toBe(
        true,
      );
    }
  });

  it('simulates zero customer publications after quality gate at T0+1h (pre-cutover risk window)', () => {
    const result = simulatePkg01Reactivation({
      identities: M3_1_PKG01_ENQUEUED_IDENTITIES_PRODUCTION,
      vehicleSnapshots,
      now: T0_PLUS_1H,
      publicationEnabled: true,
    });

    expect(result.wouldRepairCount).toBe(0);
    expect(result.wouldTerminalizeCount).toBe(24);
    expect(result.wouldAssessCount).toBe(0);
    expect(result.wouldCreatePublicationHandoffCount).toBe(0);
    expect(result.wouldCreateCustomerPublicationCount).toBe(0);
    expect(result.unresolvedCount).toBe(0);
    expect(
      result.perIdentity.every((row) => row.category === 'SAFE_TERMINAL'),
    ).toBe(true);
  });

  it('simulates zero customer publications after quality gate at audit-now', () => {
    const result = simulatePkg01Reactivation({
      identities: M3_1_PKG01_ENQUEUED_IDENTITIES_PRODUCTION,
      vehicleSnapshots,
      now: AUDIT_NOW,
      publicationEnabled: true,
    });

    expect(result.wouldCreateCustomerPublicationCount).toBe(0);
    expect(result.wouldRepairCount).toBe(0);
    expect(result.wouldTerminalizeCount).toBe(24);
  });

  it('proves historical defect: contaminated sourceObservationId was handoff-eligible before VALID quality gate', () => {
    const contaminated = M3_1_PKG01_ENQUEUED_IDENTITIES_PRODUCTION[0];
    const legacyEligible =
      typeof contaminated.sourceObservationId === 'string' &&
      contaminated.sourceObservationId.length > 0;
    expect(legacyEligible).toBe(true);
    expect(contaminated.quality.startsWith('CONTAMINATED_')).toBe(true);
    expect(
      isCanonicalRestAssessmentHandoffEligible({
        type: contaminated.type as BatteryMeasurementType,
        quality: contaminated.quality as BatteryMeasurementQuality,
        provenance: { sourceObservationId: contaminated.sourceObservationId },
      }),
    ).toBe(false);
  });
});
