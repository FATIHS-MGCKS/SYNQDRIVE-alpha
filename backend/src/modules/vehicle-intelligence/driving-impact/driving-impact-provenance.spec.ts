import {
  buildDrivingImpactSourceProvenance,
  computeHealthEligibility,
  resolvePrimarySource,
} from './driving-impact-provenance';

describe('driving-impact-provenance', () => {
  const baseInput = {
    hardwareProfile: 'LTE_R1',
    capabilityVersion: 'cap-preflight-v1',
    modelVersion: 'v1.1.0',
    estimatedProxyEventCount: 0,
    contextOnlyEventCount: 0,
    hasMeasuredRouteContext: true,
    measurementCoverage: 0.85,
  };

  it('builds pure native provenance', () => {
    const provenance = buildDrivingImpactSourceProvenance({
      ...baseInput,
      nativeEventCount: 12,
      hfEventCount: 0,
    });

    expect(provenance.primarySource).toBe('PROVIDER_CLASSIFIED');
    expect(provenance.providerClassifiedShare).toBeGreaterThan(0);
    expect(provenance.reconstructedShare).toBe(0);
    expect(provenance.nativeEventCount).toBe(12);
    expect(provenance.hfEventCount).toBe(0);
    expect(provenance.provenanceMaturity).toBe('FULL');
  });

  it('builds pure HF reconstructed provenance', () => {
    const provenance = buildDrivingImpactSourceProvenance({
      ...baseInput,
      hardwareProfile: 'SMART5',
      nativeEventCount: 0,
      hfEventCount: 18,
    });

    expect(provenance.primarySource).toBe('RECONSTRUCTED');
    expect(provenance.reconstructedShare).toBeGreaterThan(0);
    expect(provenance.providerClassifiedShare).toBe(0);
    expect(provenance.healthEligibility).not.toBe('NONE');
  });

  it('labels mixed native + HF trips transparently', () => {
    const provenance = buildDrivingImpactSourceProvenance({
      ...baseInput,
      nativeEventCount: 8,
      hfEventCount: 6,
    });

    expect(provenance.primarySource).toBe('MIXED');
    expect(provenance.providerClassifiedShare).toBeGreaterThan(0);
    expect(provenance.reconstructedShare).toBeGreaterThan(0);
    const shareSum =
      provenance.measuredShare +
      provenance.providerClassifiedShare +
      provenance.reconstructedShare +
      provenance.estimatedProxyShare +
      provenance.contextOnlyShare;
    expect(shareSum).toBeCloseTo(1, 2);
  });

  it('never leaves primarySource empty on new writes', () => {
    const provenance = buildDrivingImpactSourceProvenance({
      ...baseInput,
      nativeEventCount: 0,
      hfEventCount: 0,
      hasMeasuredRouteContext: false,
      measurementCoverage: null,
      capabilityVersion: null,
    });

    expect(provenance.primarySource).toBeTruthy();
    expect(resolvePrimarySource({
      nativeEventCount: 0,
      hfEventCount: 0,
      measuredShare: 0,
      estimatedProxyShare: 0,
    })).toBe('STRESS_ONLY');
    expect(provenance.provenanceMaturity).toBe('PARTIAL');
  });

  it('reduces health eligibility when estimated proxy dominates', () => {
    expect(
      computeHealthEligibility({
        measuredShare: 0.1,
        providerClassifiedShare: 0.1,
        reconstructedShare: 0.2,
        estimatedProxyShare: 0.6,
        measurementCoverage: 0.4,
        nativeEventCount: 2,
        hfEventCount: 4,
      }),
    ).toBe('LOW');
  });
});
