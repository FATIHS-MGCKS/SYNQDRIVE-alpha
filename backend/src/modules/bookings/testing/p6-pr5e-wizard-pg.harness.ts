import type { PrismaClient } from '@prisma/client';
import { RentalRuleRevisionStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingDepositSnapshotService } from '@modules/deposit/booking-deposit-snapshot.service';
import { DepositResolverService } from '@modules/deposit/deposit-resolver.service';
import { PricingMigrationService } from '@modules/pricing/pricing-migration.service';
import { PricingQuoteService } from '@modules/pricing/pricing-quote.service';
import { PricingService } from '@modules/pricing/pricing.service';
import { RentalEffectiveRulesService } from '@modules/rental-rules/rental-effective-rules.service';
import {
  buildNormalizedRentalRulesDocument,
  computeRentalRulesHash,
} from '@modules/rental-rules/rental-rules-revision.util';
import {
  cleanupP6Pr5cWizardFixture,
  seedP6Pr5cWizardOrg,
  type P6Pr5cWizardFixture,
} from './p6-pr5c-wizard-pg.harness';

export type P6Pr5eOrgRentalRuleSeed = {
  minimumAgeYears: number;
  minimumLicenseHoldingMonths?: number;
  depositAmountCents?: number;
};

export type P6Pr5eWizardFixture = P6Pr5cWizardFixture;

export async function seedP6Pr5eWizardOrg(
  prisma: PrismaClient,
  options: Parameters<typeof seedP6Pr5cWizardOrg>[1] & {
    rentalRules?: P6Pr5eOrgRentalRuleSeed;
  } = {},
): Promise<P6Pr5eWizardFixture> {
  const fixture = await seedP6Pr5cWizardOrg(prisma, options);
  await prisma.customer.update({
    where: { id: fixture.customerId },
    data: { idVerified: true, licenseVerified: true },
  });
  await seedP6Pr5ePublishedOrgRentalRules(
    prisma,
    fixture.orgId,
    fixture.userId,
    options.rentalRules ?? { minimumAgeYears: 18, minimumLicenseHoldingMonths: 0, depositAmountCents: 50_000 },
  );
  return fixture;
}

export async function seedP6Pr5ePublishedOrgRentalRules(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  rules: P6Pr5eOrgRentalRuleSeed,
): Promise<void> {
  const minimumLicenseHoldingMonths = rules.minimumLicenseHoldingMonths ?? 0;
  const depositAmountCents = rules.depositAmountCents ?? 50_000;

  await prisma.organizationRentalRules.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      isActive: true,
      minimumAgeYears: rules.minimumAgeYears,
      minimumLicenseHoldingMonths,
      depositAmountCents,
      depositCurrency: 'EUR',
      version: 1,
    },
    update: {
      isActive: true,
      minimumAgeYears: rules.minimumAgeYears,
      minimumLicenseHoldingMonths,
      depositAmountCents,
    },
  });

  const existingActive = await prisma.rentalRuleRevision.findFirst({
    where: {
      organizationId: orgId,
      scopeType: 'ORGANIZATION',
      scopeId: orgId,
      status: RentalRuleRevisionStatus.ACTIVE,
      effectiveTo: null,
    },
  });
  if (existingActive) {
    return;
  }

  const doc = buildNormalizedRentalRulesDocument({
    scopeType: 'ORGANIZATION',
    row: {
      minimumAgeYears: rules.minimumAgeYears,
      minimumLicenseHoldingMonths,
      depositAmountCents,
      depositCurrency: 'EUR',
      creditCardRequired: false,
      foreignTravelPolicy: 'ALLOWED',
      additionalDriverPolicy: 'ALLOWED',
      youngDriverPolicy: 'ALLOWED',
      insuranceRequirement: null,
      manualApprovalRequired: false,
      notes: null,
      isActive: true,
    },
  });

  await prisma.rentalRuleRevision.create({
    data: {
      organizationId: orgId,
      scopeType: 'ORGANIZATION',
      scopeId: orgId,
      version: 1,
      status: RentalRuleRevisionStatus.ACTIVE,
      normalizedRules: doc as object,
      rulesHash: computeRentalRulesHash(doc),
      effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      effectiveTo: null,
      createdBy: userId,
      publishedBy: userId,
      publishedAt: new Date(),
      changeReason: 'P6-PR5E disposable fixture',
    },
  });
}

export async function supersedeP6Pr5eOrgRentalRules(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  rules: P6Pr5eOrgRentalRuleSeed,
): Promise<void> {
  const minimumLicenseHoldingMonths = rules.minimumLicenseHoldingMonths ?? 0;
  const depositAmountCents = rules.depositAmountCents ?? 50_000;
  const now = new Date();

  const active = await prisma.rentalRuleRevision.findFirst({
    where: {
      organizationId: orgId,
      scopeType: 'ORGANIZATION',
      scopeId: orgId,
      status: RentalRuleRevisionStatus.ACTIVE,
      effectiveTo: null,
    },
    orderBy: { version: 'desc' },
  });

  if (active) {
    await prisma.rentalRuleRevision.update({
      where: { id: active.id },
      data: {
        status: RentalRuleRevisionStatus.RETIRED,
        effectiveTo: now,
      },
    });
  }

  const nextVersion = (active?.version ?? 0) + 1;
  const doc = buildNormalizedRentalRulesDocument({
    scopeType: 'ORGANIZATION',
    row: {
      minimumAgeYears: rules.minimumAgeYears,
      minimumLicenseHoldingMonths,
      depositAmountCents,
      depositCurrency: 'EUR',
      creditCardRequired: false,
      foreignTravelPolicy: 'ALLOWED',
      additionalDriverPolicy: 'ALLOWED',
      youngDriverPolicy: 'ALLOWED',
      insuranceRequirement: null,
      manualApprovalRequired: false,
      notes: null,
      isActive: true,
    },
  });

  await prisma.rentalRuleRevision.create({
    data: {
      organizationId: orgId,
      scopeType: 'ORGANIZATION',
      scopeId: orgId,
      version: nextVersion,
      status: RentalRuleRevisionStatus.ACTIVE,
      normalizedRules: doc as object,
      rulesHash: computeRentalRulesHash(doc),
      effectiveFrom: now,
      effectiveTo: null,
      createdBy: userId,
      publishedBy: userId,
      publishedAt: now,
      changeReason: 'P6-PR5E rule change',
      supersedesRevisionId: active?.id ?? null,
    },
  });

  await prisma.organizationRentalRules.update({
    where: { organizationId: orgId },
    data: {
      minimumAgeYears: rules.minimumAgeYears,
      minimumLicenseHoldingMonths,
      depositAmountCents,
      version: nextVersion,
    },
  });
}

export async function createP6Pr5ePricingQuote(
  prisma: PrismaClient,
  fixture: P6Pr5eWizardFixture,
): Promise<{ quoteId: string; simulation: Awaited<ReturnType<PricingService['simulateBookingPrice']>> }> {
  const prismaSvc = prisma as unknown as PrismaService;
  const migration = new PricingMigrationService(prismaSvc);
  const rentalRules = new RentalEffectiveRulesService(prismaSvc);
  const depositResolver = new DepositResolverService(prismaSvc, rentalRules);
  const depositSnapshot = new BookingDepositSnapshotService(prismaSvc);
  const pricing = new PricingService(prismaSvc, migration, depositResolver, depositSnapshot);
  const quotes = new PricingQuoteService(prismaSvc, pricing);
  const simulation = await pricing.simulateBookingPrice(fixture.orgId, {
    vehicleId: fixture.vehicleId,
    pickupAt: fixture.pickupAt.toISOString(),
    returnAt: fixture.returnAt.toISOString(),
    manualAdjustmentCents: 0,
    manualDiscountCents: 0,
    selectedExtraOptionIds: [],
    selectedInsuranceOptionIds: [],
  });
  const quote = await quotes.createQuote({
    organizationId: fixture.orgId,
    createdByUserId: fixture.userId,
    vehicleId: fixture.vehicleId,
    pickupAt: fixture.pickupAt,
    returnAt: fixture.returnAt,
    pricingInput: {
      manualAdjustmentCents: 0,
      manualDiscountCents: 0,
      selectedExtraOptionIds: [],
      selectedInsuranceOptionIds: [],
    },
    simulation,
  });
  return { quoteId: quote.quoteId, simulation };
}

export async function cleanupP6Pr5eWizardFixture(prisma: PrismaClient, orgId: string): Promise<void> {
  await prisma.rentalRuleRevision.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.organizationRentalRules.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await cleanupP6Pr5cWizardFixture(prisma, orgId);
}