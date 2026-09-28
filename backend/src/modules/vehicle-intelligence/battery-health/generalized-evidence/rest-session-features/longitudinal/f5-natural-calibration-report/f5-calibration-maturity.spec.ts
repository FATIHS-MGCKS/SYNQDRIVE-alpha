import {
  computeF5CalibrationMaturityBlocks,
  computeF5NaturalEvidenceMaturity,
} from './f5-calibration-maturity';

describe('f5-calibration-maturity', () => {
  it('never emits VALIDATED', () => {
    const blocks = computeF5CalibrationMaturityBlocks({
      primaryRevisionCount: 7,
      primaryUniqueVehicles: 4,
      primaryUniqueOrgs: 1,
      maxRevisionsPerVehicle: 3,
      eligibleObservationCount: 48,
      assessmentGradeObservationCount: 48,
      chargeClassKnownPercent: 0,
      temperatureCoveragePercent: 58,
      maxRestAgeNullShare: 0.5,
      repeatabilityPairCount: 2,
    });
    for (const block of Object.values(blocks)) {
      expect(block.maturity).not.toBe('VALIDATED' as never);
      expect(block.canAdvanceToF6Now).toBe(false);
    }
  });

  it('marks all CAL collecting when primary empty', () => {
    const blocks = computeF5CalibrationMaturityBlocks({
      primaryRevisionCount: 0,
      primaryUniqueVehicles: 0,
      primaryUniqueOrgs: 0,
      maxRevisionsPerVehicle: 0,
      eligibleObservationCount: 0,
      assessmentGradeObservationCount: 0,
      chargeClassKnownPercent: null,
      temperatureCoveragePercent: null,
      maxRestAgeNullShare: 1,
      repeatabilityPairCount: 0,
    });
    expect(blocks['CAL-M3.3E-001'].maturity).toBe('COLLECTING');
    const nat = computeF5NaturalEvidenceMaturity({
      primaryRevisionCount: 0,
      primaryUniqueVehicles: 0,
      primaryUniqueOrgs: 0,
      maxRevisionsPerVehicle: 0,
      eligibleObservationCount: 0,
      assessmentGradeObservationCount: 0,
      chargeClassKnownPercent: null,
      temperatureCoveragePercent: null,
      maxRestAgeNullShare: 1,
      repeatabilityPairCount: 0,
    });
    expect(nat['NAT-M3.3F-001'].status).toBe('COLLECTING');
  });
});
