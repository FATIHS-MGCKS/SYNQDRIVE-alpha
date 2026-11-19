import {
  isAdmissibleTripDrivingImpactStatus,
  isRentalTripImpactSettledForAssessment,
  isRentalTripWithAdmissibleTdiImpact,
  resolveRentalTripStressScore,
} from './rental-driving-analysis.tdi-quality';

describe('rental-driving-analysis TDI quality (P1-2 / P1-3 / F1)', () => {
  it.each(['COMPLETE', 'PARTIAL'] as const)('accepts admissible TDI status %s', (status) => {
    expect(isAdmissibleTripDrivingImpactStatus(status)).toBe(true);
  });

  it.each(['STALE', 'PENDING', 'FAILED', 'UNSUPPORTED'] as const)(
    'rejects inadmissible TDI status %s',
    (status) => {
      expect(isAdmissibleTripDrivingImpactStatus(status)).toBe(false);
    },
  );

  it('uses COMPLETE TDI score (A)', () => {
    expect(
      resolveRentalTripStressScore({
        tdiRow: { drivingStressScore: 61, analysisStatus: 'COMPLETE' },
        tripLegacyDrivingScore: 99,
        drivingImpactStatus: 'READY',
      }),
    ).toEqual({ score: 61, source: 'trip_driving_impact' });
  });

  it('uses PARTIAL TDI score (A)', () => {
    expect(
      resolveRentalTripStressScore({
        tdiRow: { drivingStressScore: 55, analysisStatus: 'PARTIAL' },
        tripLegacyDrivingScore: 20,
        drivingImpactStatus: 'READY',
      }),
    ).toEqual({ score: 55, source: 'trip_driving_impact' });
  });

  it('rejects STALE TDI and does not legacy-fallback (D)', () => {
    expect(
      resolveRentalTripStressScore({
        tdiRow: { drivingStressScore: 70, analysisStatus: 'STALE' },
        tripLegacyDrivingScore: 40,
        drivingImpactStatus: 'READY',
      }),
    ).toEqual({ score: null, source: 'none' });
  });

  it('returns null when admissible TDI has null score', () => {
    expect(
      resolveRentalTripStressScore({
        tdiRow: { drivingStressScore: null, analysisStatus: 'COMPLETE' },
        tripLegacyDrivingScore: 40,
        drivingImpactStatus: 'READY',
      }),
    ).toEqual({ score: null, source: 'trip_driving_impact' });
  });

  it('uses vehicle_trip_compat only when no TDI and impact PENDING (B)', () => {
    expect(
      resolveRentalTripStressScore({
        tdiRow: null,
        tripLegacyDrivingScore: 33,
        drivingImpactStatus: 'PENDING',
      }),
    ).toEqual({ score: 33, source: 'vehicle_trip_compat' });
  });

  it.each(['SKIPPED', 'FAILED'] as const)(
    'blocks legacy compat when no TDI and impact %s (F3)',
    (status) => {
      expect(
        resolveRentalTripStressScore({
          tdiRow: null,
          tripLegacyDrivingScore: 33,
          drivingImpactStatus: status,
        }),
      ).toEqual({ score: null, source: 'none' });
    },
  );

  it('blocks legacy compat for COMPLETED SKIPPED trip with legacy drivingScore (F3)', () => {
    expect(
      resolveRentalTripStressScore({
        tdiRow: null,
        tripLegacyDrivingScore: 44,
        drivingImpactStatus: 'SKIPPED',
      }),
    ).toEqual({ score: null, source: 'none' });
  });

  it('blocks compat when READY without TDI row (C)', () => {
    expect(
      resolveRentalTripStressScore({
        tdiRow: null,
        tripLegacyDrivingScore: 33,
        drivingImpactStatus: 'READY',
      }),
    ).toEqual({ score: null, source: 'none' });
  });

  it('returns none when no TDI and no legacy score', () => {
    expect(
      resolveRentalTripStressScore({
        tdiRow: undefined,
        tripLegacyDrivingScore: null,
        drivingImpactStatus: 'PENDING',
      }),
    ).toEqual({ score: null, source: 'none' });
  });

  describe('impact settlement (F1)', () => {
    it('READY + COMPLETE TDI is settled', () => {
      expect(
        isRentalTripImpactSettledForAssessment({
          drivingImpactStatus: 'READY',
          tdiAnalysisStatus: 'COMPLETE',
        }),
      ).toBe(true);
    });

    it('READY without TDI is not settled', () => {
      expect(
        isRentalTripImpactSettledForAssessment({
          drivingImpactStatus: 'READY',
          tdiAnalysisStatus: null,
        }),
      ).toBe(false);
    });

    it('READY + STALE is not settled', () => {
      expect(
        isRentalTripImpactSettledForAssessment({
          drivingImpactStatus: 'READY',
          tdiAnalysisStatus: 'STALE',
        }),
      ).toBe(false);
    });

    it('SKIPPED is settled without TDI', () => {
      expect(
        isRentalTripImpactSettledForAssessment({
          drivingImpactStatus: 'SKIPPED',
          tdiAnalysisStatus: null,
        }),
      ).toBe(true);
    });

    it('counts admissible ready impact only when TDI present', () => {
      expect(
        isRentalTripWithAdmissibleTdiImpact({
          tripStatus: 'COMPLETED',
          drivingImpactStatus: 'READY',
          tdiAnalysisStatus: 'COMPLETE',
        }),
      ).toBe(true);
      expect(
        isRentalTripWithAdmissibleTdiImpact({
          tripStatus: 'COMPLETED',
          drivingImpactStatus: 'READY',
          tdiAnalysisStatus: null,
        }),
      ).toBe(false);
    });
  });
});