import { backfillRentalRuleRevisions } from './rental-rules-revision-backfill.util';
import { computeRentalRulesHash, buildNormalizedRentalRulesDocument } from './rental-rules-revision.util';

function makePrisma() {
  const revisions: Array<Record<string, unknown>> = [];
  return {
    organizationRentalRules: {
      findMany: jest.fn().mockResolvedValue([
        {
          organizationId: 'org-1',
          version: 2,
          isActive: true,
          minimumAgeYears: 21,
          minimumLicenseHoldingMonths: null,
          depositAmountCents: null,
          depositCurrency: 'EUR',
          creditCardRequired: null,
          foreignTravelPolicy: null,
          additionalDriverPolicy: null,
          youngDriverPolicy: null,
          insuranceRequirement: null,
          manualApprovalRequired: null,
          notes: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ]),
    },
    rentalVehicleCategory: { findMany: jest.fn().mockResolvedValue([]) },
    vehicleRentalRequirementOverride: { findMany: jest.fn().mockResolvedValue([]) },
    rentalRuleRevision: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }) => {
        revisions.push(data);
        return { id: 'rev-1', ...data };
      }),
    },
    __revisions: revisions,
  };
}

describe('rental-rules-revision-backfill.util', () => {
  it('creates ACTIVE initial revisions for existing organization rules', async () => {
    const prisma = makePrisma();
    const result = await backfillRentalRuleRevisions(prisma as never);

    expect(result.organization).toBe(1);
    expect(prisma.rentalRuleRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scopeType: 'ORGANIZATION',
          scopeId: 'org-1',
          version: 2,
          status: 'ACTIVE',
          effectiveTo: null,
          lockVersion: 1,
        }),
      }),
    );

    const created = prisma.__revisions[0]!;
    const doc = buildNormalizedRentalRulesDocument({
      scopeType: 'ORGANIZATION',
      row: {
        isActive: true,
        minimumAgeYears: 21,
        depositCurrency: 'EUR',
      },
    });
    expect(created.rulesHash).toBe(computeRentalRulesHash(created.normalizedRules as typeof doc));
  });

  it('skips scopes that already have a revision for the version', async () => {
    const prisma = makePrisma();
    prisma.rentalRuleRevision.findFirst.mockResolvedValue({ id: 'existing' });
    const result = await backfillRentalRuleRevisions(prisma as never);
    expect(result.organization).toBe(0);
    expect(result.skipped).toBe(1);
    expect(prisma.rentalRuleRevision.create).not.toHaveBeenCalled();
  });
});
