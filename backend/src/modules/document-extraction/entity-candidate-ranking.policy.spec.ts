import { CONFIDENCE_LEVELS, NEGATIVE_REASON_CODES } from './entity-candidate-ranking.types';
import {
  adaptBookingCandidatesForRanking,
  adaptCustomerCandidatesForRanking,
  adaptDriverCandidatesForRanking,
  adaptPartnerCandidatesForRanking,
  adaptVehicleCandidatesForRanking,
} from './entity-candidate-ranking.adapters';
import {
  applyEntityCandidateRankingPolicy,
  resolveConfidenceLevel,
} from './entity-candidate-ranking.policy';

describe('entity-candidate-ranking.policy', () => {
  it('ranks vehicle candidate with high confidence and machine-readable reasons', () => {
    const result = applyEntityCandidateRankingPolicy({
      documentType: 'FINE',
      items: adaptVehicleCandidatesForRanking([
        {
          vehicleId: 'veh-1',
          confidence: 0.96,
          matchReasons: ['VIN_EXACT'],
          conflicts: [],
          rank: 1,
          confirmationRequired: true,
        },
      ]),
    });

    const vehicle = result.candidates.find((row) => row.entityType === 'VEHICLE');
    expect(vehicle?.ranking.confidenceLevel).toBe(CONFIDENCE_LEVELS.HIGH);
    expect(vehicle?.ranking.positiveReasons).toEqual(['VIN_EXACT']);
    expect(vehicle?.ranking.autoSelectEligibility).toBe(true);
    expect(result.rankingVersion).toBe('1.0.0');
  });

  it('blocks preselection when multiple booking candidates are above threshold', () => {
    const result = applyEntityCandidateRankingPolicy({
      documentType: 'FINE',
      items: adaptBookingCandidatesForRanking([
        {
          bookingId: 'book-1',
          confidence: 0.9,
          matchReasons: ['DATE_OVERLAP'],
          conflicts: [],
          temporalOverlap: true,
          rank: 1,
          confirmationRequired: true,
        },
        {
          bookingId: 'book-2',
          confidence: 0.88,
          matchReasons: ['DATE_OVERLAP'],
          conflicts: [],
          temporalOverlap: true,
          rank: 2,
          confirmationRequired: true,
        },
      ]),
    });

    expect(result.preselectionBlocked).toBe(true);
    expect(
      result.candidates.every((candidate) => !candidate.ranking.autoSelectEligibility),
    ).toBe(true);
    expect(
      result.candidates.some((candidate) =>
        candidate.ranking.negativeReasons.includes(
          NEGATIVE_REASON_CODES.MULTIPLE_ABOVE_THRESHOLD,
        ),
      ),
    ).toBe(true);
  });

  it('applies document-type weighting for invoice partner candidates', () => {
    const result = applyEntityCandidateRankingPolicy({
      documentType: 'INVOICE',
      items: adaptPartnerCandidatesForRanking([
        {
          vendorId: 'vendor-1',
          confidence: 0.8,
          matchReasons: ['NAME_EXACT'],
          conflicts: [],
          rank: 1,
          confirmationRequired: true,
          displayLabel: 'Werkstatt WM',
          partnerKind: 'WORKSHOP',
          vendorCategory: 'WORKSHOP',
        },
      ]),
    });

    const partner = result.candidates.find((row) => row.entityType === 'PARTNER');
    expect(partner?.ranking.score).toBe(0.96);
    expect(resolveConfidenceLevel(0.96)).toBe(CONFIDENCE_LEVELS.HIGH);
  });

  it('marks customer candidate with context conflict as not auto-select eligible', () => {
    const result = applyEntityCandidateRankingPolicy({
      documentType: 'INVOICE',
      uploadContextResolverStatus: 'CONFLICT',
      items: adaptCustomerCandidatesForRanking([
        {
          customerId: 'cust-1',
          confidence: 0.92,
          matchReasons: ['EMAIL_EXACT'],
          conflicts: [],
          rank: 1,
          confirmationRequired: true,
          displayLabel: 'Kunde MM',
        },
      ]),
    });

    expect(result.preselectionBlocked).toBe(true);
    expect(result.candidates[0].ranking.autoSelectEligibility).toBe(false);
    expect(result.candidates[0].ranking.negativeReasons).toContain(
      NEGATIVE_REASON_CODES.CONTEXT_CONFLICT,
    );
  });

  it('surfaces driver blocker conflicts in negative reasons', () => {
    const result = applyEntityCandidateRankingPolicy({
      documentType: 'FINE',
      items: adaptDriverCandidatesForRanking([
        {
          driverCustomerId: 'driver-1',
          confidence: 0.9,
          matchReasons: ['LICENSE_EXACT'],
          conflicts: [
            {
              code: 'AMBIGUOUS_DRIVER_POOL',
              field: 'driver',
              message: 'Mehrere zugelassene Fahrer',
              severity: 'WARNING',
            },
          ],
          rank: 1,
          confirmationRequired: true,
          displayLabel: 'Fahrer AF',
          driverRole: 'PRIMARY',
        },
      ]),
    });

    expect(result.candidates[0].ranking.negativeReasons).toContain(
      NEGATIVE_REASON_CODES.WARNING_CONFLICT,
    );
  });

  it('does not auto-select weak vendor name-only partner candidate', () => {
    const result = applyEntityCandidateRankingPolicy({
      documentType: 'INVOICE',
      items: adaptPartnerCandidatesForRanking([
        {
          vendorId: 'vendor-1',
          confidence: 0.9,
          matchReasons: ['NAME_NORMALIZED'],
          conflicts: [],
          rank: 1,
          confirmationRequired: true,
          displayLabel: 'Werkstatt WM',
          partnerKind: 'WORKSHOP',
          vendorCategory: 'WORKSHOP',
        },
      ]),
    });

    expect(result.candidates[0].ranking.autoSelectEligibility).toBe(false);
    expect(result.candidates[0].ranking.negativeReasons).toContain(
      NEGATIVE_REASON_CODES.WEAK_SIGNAL_ONLY,
    );
  });
});
