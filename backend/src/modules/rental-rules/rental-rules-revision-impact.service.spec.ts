import { BadRequestException } from '@nestjs/common';
import { RentalEffectiveRulesService } from './rental-effective-rules.service';
import { RentalRulesRevisionImpactService } from './rental-rules-revision-impact.service';
import { RentalRulesRevisionService } from './rental-rules-revision.service';
import { organizationRevisionScope } from './rental-rules-revision-scope.util';
import { buildNormalizedRentalRulesDocument, computeRentalRulesHash } from './rental-rules-revision.util';

describe('RentalRulesRevisionImpactService', () => {
  const scope = organizationRevisionScope('org1');
  const activeDoc = buildNormalizedRentalRulesDocument({
    scopeType: 'ORGANIZATION',
    row: { minimumAgeYears: 21, isActive: true },
  });
  const draftDoc = buildNormalizedRentalRulesDocument({
    scopeType: 'ORGANIZATION',
    row: { minimumAgeYears: 25, isActive: true },
  });

  function build() {
    const prisma = {
      rentalRuleRevision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'draft-1',
          normalizedRules: draftDoc,
        }),
      },
      rentalVehicleCategory: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'cat1', name: 'Economy', _count: { vehicles: 1 } },
        ]),
      },
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'v1',
            vehicleName: 'Golf',
            make: 'VW',
            model: 'Golf',
            licensePlate: 'B-AB 1',
            rentalCategoryId: 'cat1',
            rentalCategory: { name: 'Economy' },
          },
          {
            id: 'v2',
            vehicleName: 'Van',
            make: 'Ford',
            model: 'Transit',
            licensePlate: 'B-CD 2',
            rentalCategoryId: null,
            rentalCategory: null,
          },
        ]),
      },
      vehicleRentalRequirementOverride: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      booking: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'b-pending', status: 'PENDING', notes: null },
          { id: 'b-draft', status: 'PENDING', notes: '[synq:wizard-draft]' },
          { id: 'b-confirmed', status: 'CONFIRMED', notes: null },
        ]),
      },
      bookingEligibilityApproval: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const revisions = {
      findActiveRevision: jest.fn().mockResolvedValue({
        id: 'active-1',
        normalizedRules: activeDoc,
        rulesHash: computeRentalRulesHash(activeDoc),
      }),
    } as unknown as RentalRulesRevisionService;

    const effectiveRules = {
      computeForVehicle: jest.fn().mockResolvedValue({
        minimumAgeYears: { value: 21, source: 'ORGANIZATION_DEFAULT', sourceName: 'Acme' },
      }),
      computeWithSimulatedDraftScope: jest.fn().mockResolvedValue({
        minimumAgeYears: { value: 25, source: 'ORGANIZATION_DEFAULT', sourceName: 'Acme' },
      }),
    } as unknown as RentalEffectiveRulesService;

    const service = new RentalRulesRevisionImpactService(
      prisma as never,
      revisions,
      effectiveRules,
    );

    return { service, prisma, effectiveRules };
  }

  it('builds diff, affected scopes, and booking buckets', async () => {
    const { service } = build();
    const analysis = await service.analyzePublishImpact(scope, 'draft-1');

    expect(analysis.diff.changedRules).toHaveLength(1);
    expect(analysis.affectedScopes.categories).toHaveLength(1);
    expect(analysis.affectedScopes.vehicles).toHaveLength(2);
    expect(analysis.affectedScopes.vehiclesWithoutCategory).toHaveLength(1);
    expect(analysis.bookingImpact.pending.count).toBe(1);
    expect(analysis.bookingImpact.wizardDraft.count).toBe(1);
    expect(analysis.bookingImpact.confirmed.count).toBe(1);
    expect(analysis.bookingImpact.confirmedBookingsUnchanged).toBe(true);
    expect(analysis.effectiveImpacts).toHaveLength(2);
  });

  it('requires change reason before publish', () => {
    const { service } = build();
    expect(() =>
      service.assertPublishPreconditions({
        analysis: {
          criticalImpact: { isCritical: false, requiresAcknowledgement: false, codes: [], messages: [] },
        } as never,
        changeReason: '   ',
      }),
    ).toThrow(BadRequestException);
  });

  it('requires acknowledgement for critical impact', () => {
    const { service } = build();
    expect(() =>
      service.assertPublishPreconditions({
        analysis: {
          criticalImpact: {
            isCritical: true,
            requiresAcknowledgement: true,
            codes: ['CONFIRMED_BOOKINGS_AFFECTED'],
            messages: ['confirmed'],
          },
        } as never,
        changeReason: 'Regulatory update',
        acknowledgeCriticalImpact: false,
      }),
    ).toThrow(BadRequestException);
  });
});
