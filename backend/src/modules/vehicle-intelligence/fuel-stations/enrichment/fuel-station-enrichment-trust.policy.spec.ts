import { isTrustedFuelStationAssignment } from './fuel-station-enrichment-trust.policy';

describe('fuel-station-enrichment-trust.policy', () => {
  it('MATCHED HIGH is trusted', () => {
    expect(isTrustedFuelStationAssignment({ resolutionStatus: 'MATCHED', matchConfidence: 'HIGH' })).toBe(true);
  });

  it('MATCHED MEDIUM is trusted', () => {
    expect(isTrustedFuelStationAssignment({ resolutionStatus: 'MATCHED', matchConfidence: 'MEDIUM' })).toBe(true);
  });

  it('MATCHED LOW is not trusted', () => {
    expect(isTrustedFuelStationAssignment({ resolutionStatus: 'MATCHED', matchConfidence: 'LOW' })).toBe(false);
  });

  it('AMBIGUOUS is not trusted', () => {
    expect(isTrustedFuelStationAssignment({ resolutionStatus: 'AMBIGUOUS', matchConfidence: 'HIGH' })).toBe(false);
  });

  it('NOT_FOUND is not trusted', () => {
    expect(isTrustedFuelStationAssignment({ resolutionStatus: 'NOT_FOUND', matchConfidence: null })).toBe(false);
  });
});
