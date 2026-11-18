import {
  gateRentalAnalysisPayloadForApi,
  resolvePublishedRentalApiDrivingStressScore,
} from './rental-driving-analysis.api-response.util';

describe('rental-driving-analysis API publish gate (F4)', () => {
  const score = 77;
  const payload = {
    vehicleStressSummary: {
      drivingStressScore: 77,
      longitudinalStressScore: 40,
      stressLevel: 'moderate',
      summary: 'kept',
    },
  };

  it.each(['COMPLETE', 'PARTIAL'] as const)(
    'resolvePublishedRentalApiDrivingStressScore allows %s with finite score',
    (status) => {
      expect(resolvePublishedRentalApiDrivingStressScore(status, score)).toBe(77);
    },
  );

  it.each(['PROVISIONAL', 'NOT_ASSESSABLE', 'FAILED'] as const)(
    'resolvePublishedRentalApiDrivingStressScore blocks %s',
    (status) => {
      expect(resolvePublishedRentalApiDrivingStressScore(status, score)).toBeNull();
    },
  );

  it('rejects non-finite scores even when COMPLETE', () => {
    expect(resolvePublishedRentalApiDrivingStressScore('COMPLETE', Number.NaN)).toBeNull();
  });

  it('gates nested vehicleStressSummary numeric fields when status blocks publish', () => {
    const gated = gateRentalAnalysisPayloadForApi(payload, 'PROVISIONAL') as typeof payload;
    expect(gated?.vehicleStressSummary?.drivingStressScore).toBeNull();
    expect(gated?.vehicleStressSummary?.longitudinalStressScore).toBeNull();
    expect(gated?.vehicleStressSummary?.stressLevel).toBeNull();
    expect(gated?.vehicleStressSummary?.summary).toBe('kept');
  });

  it('leaves payload unchanged for COMPLETE', () => {
    expect(gateRentalAnalysisPayloadForApi(payload, 'COMPLETE')).toEqual(payload);
  });

  it('does not mutate source payload object', () => {
    const source = { ...payload, vehicleStressSummary: { ...payload.vehicleStressSummary } };
    gateRentalAnalysisPayloadForApi(source, 'FAILED');
    expect(source.vehicleStressSummary.drivingStressScore).toBe(77);
  });
});

describe('findAll / findById contract (via mapRecord gate helpers)', () => {
  const samplePayload = {
    vehicleStressSummary: { drivingStressScore: 88, stressLevel: 'high' },
  };

  it('simulates API row: blocked status yields null drivingStressScore and redacted payload', () => {
    const row = {
      assessmentStatus: 'NOT_ASSESSABLE' as const,
      drivingScore: 88,
      payload: samplePayload,
    };
    const apiScore = resolvePublishedRentalApiDrivingStressScore(
      row.assessmentStatus,
      row.drivingScore,
    );
    const apiPayload = gateRentalAnalysisPayloadForApi(row.payload, row.assessmentStatus);
    expect(apiScore).toBeNull();
    expect(
      (apiPayload as typeof samplePayload)?.vehicleStressSummary?.drivingStressScore,
    ).toBeNull();
  });
});