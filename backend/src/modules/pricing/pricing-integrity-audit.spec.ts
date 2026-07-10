import { PricingIntegrityAuditService } from './pricing-integrity-audit.service';
import { PricingQuoteService } from './pricing-quote.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('PricingIntegrityAuditService', () => {
  const orgId = 'org-1';
  const groupId = 'group-1';
  const versionId = 'ver-1';
  const rateId = 'rate-1';

  function buildService(overrides: Partial<Record<string, jest.Mock>> = {}) {
    const prisma = {
      organization: { findMany: jest.fn().mockResolvedValue([{ id: orgId }]) },
      priceTariffGroup: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: groupId,
            name: 'Sedan',
            isActive: true,
            priceBookId: 'book-1',
          },
        ]),
      },
      priceTariffVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: versionId,
            tariffGroupId: groupId,
            versionNumber: 1,
            status: 'ACTIVE',
            validFrom: new Date('2026-01-01'),
            validTo: null,
            rate: {
              id: rateId,
              dailyRateCents: 5900,
              weeklyRateCents: 0,
              monthlyRateCents: 0,
              extraKmPriceCents: 22,
              depositAmountCents: 17700,
            },
            mileagePackages: [],
            tariffGroup: { id: groupId, name: 'Sedan', isActive: true },
          },
        ]),
      },
      vehicleTariffAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      priceBook: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'book-1', currency: 'EUR', isActive: true, name: 'Default' },
        ]),
      },
      bookingPriceSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      pricingQuote: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          vehicleTariffAssignment: {
            findUnique: jest.fn().mockResolvedValue({ isActive: true }),
            update: jest.fn().mockResolvedValue({}),
          },
        };
        await fn(tx);
      }),
      booking: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };

    const quoteService = {
      expireStaleQuotes: jest.fn().mockResolvedValue(0),
    } as unknown as PricingQuoteService;

    const service = new PricingIntegrityAuditService(
      prisma as unknown as PrismaService,
      quoteService,
    );

    return { service, prisma, quoteService };
  }

  it('flags possible migration deposit as info, not error', async () => {
    const { service } = buildService();
    const report = await service.runAudit(orgId);
    const migration = report.checks.find((c) => c.checkId === 'possible_migration_deposit');
    expect(migration?.count).toBe(1);
    expect(migration?.severity).toBe('info');
    expect(report.summary.errors).toBe(0);
  });

  it('does not treat 17700 deposit alone as invalid money', async () => {
    const { service } = buildService();
    const report = await service.runAudit(orgId);
    const invalidMoney = report.checks.find((c) => c.checkId === 'invalid_money_amounts');
    expect(invalidMoney?.count).toBe(0);
  });

  it('detects multiple ACTIVE versions per group', async () => {
    const { service, prisma } = buildService();
    prisma.priceTariffVersion.findMany.mockResolvedValue([
      {
        id: 'v1',
        tariffGroupId: groupId,
        versionNumber: 1,
        status: 'ACTIVE',
        validFrom: new Date('2026-01-01'),
        validTo: null,
        rate: { id: 'r1', dailyRateCents: 1000, weeklyRateCents: 0, monthlyRateCents: 0, extraKmPriceCents: 0, depositAmountCents: 1000 },
        mileagePackages: [],
        tariffGroup: { id: groupId, name: 'Sedan', isActive: true },
      },
      {
        id: 'v2',
        tariffGroupId: groupId,
        versionNumber: 2,
        status: 'ACTIVE',
        validFrom: new Date('2026-02-01'),
        validTo: null,
        rate: { id: 'r2', dailyRateCents: 1000, weeklyRateCents: 0, monthlyRateCents: 0, extraKmPriceCents: 0, depositAmountCents: 1000 },
        mileagePackages: [],
        tariffGroup: { id: groupId, name: 'Sedan', isActive: true },
      },
    ]);

    const report = await service.runAudit(orgId);
    const check = report.checks.find((c) => c.checkId === 'multiple_active_versions');
    expect(check?.count).toBe(1);
    expect(report.summary.errors).toBeGreaterThan(0);
  });

  it('repair requires confirm flag', async () => {
    const { service } = buildService();
    const report = await service.runRepair({
      organizationId: orgId,
      dryRun: true,
      confirmed: false,
    });
    expect(report.actions).toHaveLength(0);
    expect(report.skipped.some((s) => s.reason.includes('confirm'))).toBe(true);
  });

  it('repair dry-run proposes expiring stale quotes', async () => {
    const { service, prisma } = buildService();
    prisma.pricingQuote.findMany.mockResolvedValue([
      {
        id: 'q1',
        status: 'ACTIVE',
        expiresAt: new Date('2020-01-01'),
        consumedByBookingId: null,
        tariffVersionId: versionId,
      },
    ]);
    prisma.pricingQuote.count.mockResolvedValue(1);

    const report = await service.runRepair({
      organizationId: orgId,
      dryRun: true,
      confirmed: true,
    });

    expect(report.actions.some((a) => a.actionId === 'expire_stale_quotes')).toBe(true);
    expect(report.auditLog.length).toBeGreaterThan(0);
  });
});
