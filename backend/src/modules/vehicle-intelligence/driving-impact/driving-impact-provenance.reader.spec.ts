import { readTripDrivingImpactProvenance } from './driving-impact-provenance.reader';

describe('readTripDrivingImpactProvenance', () => {
  it('reads new provenance columns when present', () => {
    const provenance = readTripDrivingImpactProvenance({
      modelVersion: 'v1.1.0',
      sourceSummaryJson: null,
      primarySource: 'MIXED',
      measuredShare: 0.1,
      providerClassifiedShare: 0.45,
      reconstructedShare: 0.45,
      estimatedProxyShare: 0,
      contextOnlyShare: 0,
      nativeEventCount: 5,
      hfEventCount: 5,
      measurementCoverage: 0.8,
      hardwareProfile: 'LTE_R1',
      capabilityVersion: 'cap-preflight-v1',
      healthEligibility: 'MEDIUM',
      provenanceMaturity: 'FULL',
      provenanceVersion: 'impact-provenance-v1',
    });

    expect(provenance.primarySource).toBe('MIXED');
    expect(provenance.nativeEventCount).toBe(5);
    expect(provenance.provenanceMaturity).toBe('FULL');
  });

  it('falls back to legacy sourceSummaryJson for old rows', () => {
    const provenance = readTripDrivingImpactProvenance({
      modelVersion: 'v1.1.0',
      sourceSummaryJson: {
        v3DrivingEventInput: 'HF_DERIVED',
        vehicleHardwareType: 'SMART5',
      },
      primarySource: null,
      measuredShare: null,
      providerClassifiedShare: null,
      reconstructedShare: null,
      estimatedProxyShare: null,
      contextOnlyShare: null,
      nativeEventCount: null,
      hfEventCount: null,
      measurementCoverage: null,
      hardwareProfile: null,
      capabilityVersion: null,
      healthEligibility: null,
      provenanceMaturity: null,
      provenanceVersion: null,
    });

    expect(provenance.primarySource).toBe('RECONSTRUCTED');
    expect(provenance.reconstructedShare).toBe(1);
    expect(provenance.provenanceMaturity).toBe('MINIMAL');
    expect(provenance.healthEligibility).toBe('LOW');
  });
});
