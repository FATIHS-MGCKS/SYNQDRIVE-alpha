import {
  gateRentalAnalysisListQualitativeFields,
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
    expect(gated?.vehicleStressSummary?.summary).toBeNull();
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

describe('rental-driving-analysis API publish gate (F6 text leak)', () => {
  const richPayload = {
    vehicleStressSummary: {
      drivingStressScore: 77,
      summary: 'Vehicle stress classified as high for the rental period.',
    },
    overallAssessment: {
      level: 'high_stress',
      title: 'High vehicle stress',
      shortSummary: 'Vehicle stress classified as high for the rental period.',
    },
    watchpoints: [
      'Elevated vehicle stress (77) during rental period.',
      'Elevated harsh event rate (8 per 100 km).',
      'At least one error code was recorded during the rental period.',
    ],
    recommendations: [
      'Review tire wear — high overall vehicle stress.',
      'Preliminary analysis only — await complete trip analysis before operational decisions.',
    ],
    eventSummary: {
      drivingEventsCount: 12,
      abuseDetectionCount: 1,
      errorCodeOccurred: true,
      eventHighlights: [
        'High braking stress — inspect brake condition after rental.',
        'Elevated harsh event rate (8 per 100 km).',
      ],
    },
    wearImpactAssessment: {
      overallWearImpact: 'high',
      summary: 'Elevated wear impact from normalized vehicle load and driver conduct.',
      affectedAreas: [
        {
          area: 'general_vehicle_stress',
          impact: 'high',
          reason: 'Distance-weighted vehicle stress load',
        },
      ],
    },
  };

  const pristine = JSON.parse(JSON.stringify(richPayload));

  it.each(['COMPLETE', 'PARTIAL'] as const)('preserves payload content for %s', (status) => {
    expect(gateRentalAnalysisPayloadForApi(richPayload, status)).toEqual(richPayload);
  });

  it.each(['PROVISIONAL', 'NOT_ASSESSABLE', 'FAILED'] as const)(
    'strips score-derived text for %s',
    (status) => {
      const gated = gateRentalAnalysisPayloadForApi(richPayload, status) as typeof richPayload;
      expect(gated.watchpoints).toEqual([
        'Elevated harsh event rate (8 per 100 km).',
        'At least one error code was recorded during the rental period.',
      ]);
      expect(gated.recommendations).toEqual([
        'Preliminary analysis only — await complete trip analysis before operational decisions.',
      ]);
      expect(gated.eventSummary?.eventHighlights).toEqual([
        'Elevated harsh event rate (8 per 100 km).',
      ]);
      expect(gated.eventSummary?.drivingEventsCount).toBe(12);
      expect(gated.eventSummary?.abuseDetectionCount).toBe(1);
      expect(gated.overallAssessment?.title).toBeNull();
      expect(gated.overallAssessment?.shortSummary).toBeNull();
      expect(gated.wearImpactAssessment?.summary).toBeNull();
      expect(gated.wearImpactAssessment?.affectedAreas).toEqual([]);
      expect(gated.vehicleStressSummary?.summary).toBeNull();
      expect(gated.watchpoints.join(' ')).not.toMatch(/\(\d+\)/);
    },
  );

  it('does not mutate persisted payload object', () => {
    gateRentalAnalysisPayloadForApi(richPayload, 'FAILED');
    expect(richPayload).toEqual(pristine);
    expect(richPayload.watchpoints[0]).toContain('(77)');
  });
});

describe('rental-driving-analysis API publish gate (F7 rentalMetrics.vehicleLoad)', () => {
  const metricsPayload = {
    rentalMetrics: {
      version: 'rental-driving-metrics-v1',
      totals: { totalDistanceKm: 120, totalDurationHours: 2, tripCount: 3, assessableTripCount: 2 },
      harshEvents: { totalCount: 4, per100Km: { value: 3.2, reliability: 'RELIABLE', reasonCodes: [] } },
      driverConduct: {
        level: 'moderate',
        harshPer100Km: 3.2,
        abusePer100Km: 0,
        reliability: 'RELIABLE',
        reasons: ['SUFFICIENT_DISTANCE'],
      },
      vehicleLoad: {
        level: 'high',
        stressScore: 82,
        reliability: 'RELIABLE',
        reasons: ['SUFFICIENT_DISTANCE'],
      },
    },
  };

  it.each(['COMPLETE', 'PARTIAL'] as const)('preserves vehicleLoad for %s', (status) => {
    expect(gateRentalAnalysisPayloadForApi(metricsPayload, status)).toEqual(metricsPayload);
  });

  it.each(['PROVISIONAL', 'NOT_ASSESSABLE', 'FAILED'] as const)(
    'redacts vehicleLoad stress fields for %s',
    (status) => {
      const source = JSON.parse(JSON.stringify(metricsPayload));
      const gated = gateRentalAnalysisPayloadForApi(source, status) as typeof metricsPayload;
      expect(gated.rentalMetrics?.vehicleLoad?.stressScore).toBeNull();
      expect(gated.rentalMetrics?.vehicleLoad?.level).toBeNull();
      expect(gated.rentalMetrics?.vehicleLoad?.reliability).toBe('RELIABLE');
      expect(gated.rentalMetrics?.vehicleLoad?.reasons).toEqual(['SUFFICIENT_DISTANCE']);
      expect(gated.rentalMetrics?.driverConduct?.level).toBe('moderate');
      expect(gated.rentalMetrics?.harshEvents?.totalCount).toBe(4);
    },
  );

  it('does not mutate source rentalMetrics when gating', () => {
    const source = JSON.parse(JSON.stringify(metricsPayload));
    const pristine = JSON.parse(JSON.stringify(metricsPayload));
    gateRentalAnalysisPayloadForApi(source, 'PROVISIONAL');
    expect(source).toEqual(pristine);
    expect(source.rentalMetrics.vehicleLoad.stressScore).toBe(82);
  });
});

describe('rental-driving-analysis API list qualitative gate (F2)', () => {
  const row = {
    overallLevel: 'moderate',
    riskLevel: 'elevated',
    driverStyleCategory: 'sporty',
    wearImpact: 'high',
  };

  it.each(['COMPLETE', 'PARTIAL'] as const)(
    'preserves qualitative fields when %s',
    (status) => {
      expect(gateRentalAnalysisListQualitativeFields(status, row)).toEqual(row);
    },
  );

  it.each(['PROVISIONAL', 'NOT_ASSESSABLE', 'FAILED'] as const)(
    'nulls qualitative fields when %s',
    (status) => {
      expect(gateRentalAnalysisListQualitativeFields(status, row)).toEqual({
        overallLevel: null,
        riskLevel: null,
        driverStyleCategory: null,
        wearImpact: null,
      });
    },
  );
});