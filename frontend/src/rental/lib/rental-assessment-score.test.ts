import { describe, expect, it } from 'vitest';
import {
  normalizePublishedRentalStressScore,
  publishesRentalDrivingStressScore,
  resolveRentalAnalysisStressScore,
} from './rental-assessment-score';

describe('publishesRentalDrivingStressScore (P6)', () => {
  it('allows COMPLETE and PARTIAL', () => {
    expect(publishesRentalDrivingStressScore('COMPLETE')).toBe(true);
    expect(publishesRentalDrivingStressScore('PARTIAL')).toBe(true);
  });

  it('blocks PROVISIONAL, NOT_ASSESSABLE, FAILED, and missing', () => {
    expect(publishesRentalDrivingStressScore('PROVISIONAL')).toBe(false);
    expect(publishesRentalDrivingStressScore('NOT_ASSESSABLE')).toBe(false);
    expect(publishesRentalDrivingStressScore('FAILED')).toBe(false);
    expect(publishesRentalDrivingStressScore(null)).toBe(false);
  });
});

describe('normalizePublishedRentalStressScore (F3)', () => {
  it('rejects NaN and non-finite values', () => {
    expect(normalizePublishedRentalStressScore(Number.NaN)).toBeNull();
    expect(normalizePublishedRentalStressScore(Number.POSITIVE_INFINITY)).toBeNull();
    expect(normalizePublishedRentalStressScore(Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it('accepts finite numbers', () => {
    expect(normalizePublishedRentalStressScore(42)).toBe(42);
    expect(normalizePublishedRentalStressScore(0)).toBe(0);
  });
});

describe('resolveRentalAnalysisStressScore', () => {
  const base = {
    id: 'a1',
    bookingId: 'b1',
    vehicleId: 'v1',
    bookingCustomerId: 'c1',
    periodStart: '',
    periodEnd: '',
    overallLevel: 'low',
    riskLevel: 'low',
    drivingScore: 81,
    drivingStressScore: 81,
    payload: {
      vehicleStressSummary: { drivingStressScore: 81 },
    },
  };

  it('returns numeric score only for COMPLETE or PARTIAL', () => {
    expect(
      resolveRentalAnalysisStressScore({
        ...base,
        assessmentStatus: 'COMPLETE',
      } as any),
    ).toBe(81);
    expect(
      resolveRentalAnalysisStressScore({
        ...base,
        assessmentStatus: 'PARTIAL',
      } as any),
    ).toBe(81);
    expect(
      resolveRentalAnalysisStressScore({
        ...base,
        assessmentStatus: 'PROVISIONAL',
      } as any),
    ).toBeNull();
  });

  it('does not fabricate score when underlying score exists but status blocks publish', () => {
    expect(
      resolveRentalAnalysisStressScore({
        ...base,
        assessmentStatus: 'NOT_ASSESSABLE',
        drivingScore: 99,
      } as any),
    ).toBeNull();
  });

  it('does not publish non-finite scores even when status allows', () => {
    expect(
      resolveRentalAnalysisStressScore({
        ...base,
        assessmentStatus: 'COMPLETE',
        drivingScore: Number.NaN,
        payload: { vehicleStressSummary: { drivingStressScore: Number.NaN } },
      } as any),
    ).toBeNull();
    expect(
      resolveRentalAnalysisStressScore({
        ...base,
        assessmentStatus: 'PARTIAL',
        payload: { vehicleStressSummary: { drivingStressScore: Number.POSITIVE_INFINITY } },
      } as any),
    ).toBeNull();
  });
});