import {
  BusinessType,
  CustomerVerificationCheckKind,
  CustomerVerificationCheckStatus,
  CustomerVerificationProvider,
  OrgProductStatus,
  PrismaClient,
  ProductSlug,
  UserPlatformRole,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingDepositSnapshotService } from '@modules/deposit/booking-deposit-snapshot.service';
import { DepositResolverService } from '@modules/deposit/deposit-resolver.service';
import { PricingMigrationService } from '@modules/pricing/pricing-migration.service';
import { PricingQuoteService } from '@modules/pricing/pricing-quote.service';
import { PricingService } from '@modules/pricing/pricing.service';
import { createP6Pr5cRentalEffectiveRulesStub } from './p6-pr5c-rental-rules.stub';
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';
import { insertP6Pr5bTestUser } from './rental-booking-lifecycle-pg.harness';

export type P6Pr5cWizardFixture = {
  suffix: string;
  orgId: string;
  orgBId: string;
  userId: string;
  customerId: string;
  vehicleId: string;
  stationId: string;
  pickupAt: Date;
  returnAt: Date;
};

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createVehicle(prisma: PrismaClient, orgId: string, stationId: string): Promise<string> {
  const vehicleId = randomUUID();
  const vin = `VIN${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type,
      registry_lifecycle, status, station_id, created_at, updated_at
    ) VALUES (
      ${vehicleId}, ${orgId}, ${vin}, 'VW', 'Golf', 2022, 'GASOLINE'::"FuelType",
      'ACTIVE'::"VehicleRegistryLifecycle",
      ${VehicleStatus.AVAILABLE}::"VehicleStatus",
      ${stationId}, NOW(), NOW()
    )
  `;
  return vehicleId;
}

export async function seedP6Pr5cVerifiedCustomerDocuments(
  prisma: PrismaClient,
  orgId: string,
  customerId: string,
  userId: string,
): Promise<void> {
  const fileKey = `p6-pr5c/${customerId}/doc`;
  for (const type of ['ID_FRONT', 'LICENSE_FRONT'] as const) {
    await prisma.customerDocument.create({
      data: {
        organizationId: orgId,
        customerId,
        type,
        status: 'VERIFIED',
        fileKey: `${fileKey}/${type}`,
        uploadedByUserId: userId,
        reviewedByUserId: userId,
        reviewedAt: new Date(),
      },
    });
  }
  for (const kind of [
    CustomerVerificationCheckKind.ID_DOCUMENT,
    CustomerVerificationCheckKind.DRIVING_LICENSE,
  ]) {
    await prisma.customerVerificationCheck.create({
      data: {
        organizationId: orgId,
        customerId,
        provider: CustomerVerificationProvider.MANUAL,
        kind,
        status: CustomerVerificationCheckStatus.VERIFIED,
        checkedByUserId: userId,
        warnings: [],
      },
    });
  }
}

export async function seedP6Pr5cWizardOrg(
  prisma: PrismaClient,
  options: { rentalEntitlement?: OrgProductStatus; includeRentalEntitlement?: boolean } = {},
): Promise<P6Pr5cWizardFixture> {
  const suffix = uniqueSuffix();
  const org = await prisma.organization.create({
    data: {
      companyName: `P6-PR5C Wizard ${suffix}`,
      businessType: BusinessType.RENTAL,
      status: 'ACTIVE',
      defaultVatRate: 19,
    },
  });
  const orgB = await prisma.organization.create({
    data: {
      companyName: `P6-PR5C Foreign ${suffix}`,
      businessType: BusinessType.RENTAL,
      status: 'ACTIVE',
    },
  });

  const includeRental = options.includeRentalEntitlement !== false;
  if (includeRental) {
    await ensureOrganizationProductEntitlement(
      prisma,
      org.id,
      ProductSlug.RENTAL,
      options.rentalEntitlement ?? OrgProductStatus.ACTIVE,
    );
  }
  await ensureOrganizationProductEntitlement(prisma, orgB.id, ProductSlug.RENTAL);

  const userId = randomUUID();
  await insertP6Pr5bTestUser(
    prisma,
    userId,
    `p6-pr5c-${suffix}@test.local`,
    'P6 PR5C Operator',
    UserPlatformRole.MASTER_ADMIN,
  );

  const station = await prisma.station.create({
    data: {
      organizationId: org.id,
      name: `Station ${suffix}`,
      code: `ST-${suffix.slice(0, 6)}`,
      city: 'Berlin',
      country: 'DE',
    },
  });

  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - 30);
  const licenseIssued = new Date();
  licenseIssued.setFullYear(licenseIssued.getFullYear() - 5);
  const licenseExpiry = new Date('2032-12-31T00:00:00.000Z');

  const customer = await prisma.customer.create({
    data: {
      organizationId: org.id,
      firstName: 'Wizard',
      lastName: `Renter ${suffix}`,
      email: `renter-${suffix}@test.local`,
      dateOfBirth: dob,
      licenseIssuedAt: licenseIssued,
      licenseExpiry,
      licenseNumber: `LIC-${suffix.slice(0, 8)}`,
    },
  });

  await seedP6Pr5cVerifiedCustomerDocuments(prisma, org.id, customer.id, userId);

  const vehicleId = await createVehicle(prisma, org.id, station.id);

  const migration = new PricingMigrationService(prisma as unknown as PrismaService);
  await migration.ensureOrgPricing(org.id);

  const pickupAt = new Date();
  pickupAt.setDate(pickupAt.getDate() + 2);
  pickupAt.setUTCHours(10, 0, 0, 0);
  const returnAt = new Date(pickupAt);
  returnAt.setDate(returnAt.getDate() + 3);

  return {
    suffix,
    orgId: org.id,
    orgBId: orgB.id,
    userId,
    customerId: customer.id,
    vehicleId,
    stationId: station.id,
    pickupAt,
    returnAt,
  };
}

export async function createP6Pr5cPricingQuote(
  prisma: PrismaClient,
  fixture: P6Pr5cWizardFixture,
): Promise<{ quoteId: string; simulation: Awaited<ReturnType<PricingService['simulateBookingPrice']>> }> {
  const prismaSvc = prisma as unknown as PrismaService;
  const migration = new PricingMigrationService(prismaSvc);
  const rentalRules = createP6Pr5cRentalEffectiveRulesStub();
  const depositResolver = new DepositResolverService(prismaSvc, rentalRules as never);
  const depositSnapshot = new BookingDepositSnapshotService(prismaSvc);
  const pricing = new PricingService(prismaSvc, migration, depositResolver, depositSnapshot);
  const quotes = new PricingQuoteService(prisma as unknown as PrismaService, pricing);
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

export async function cleanupP6Pr5cWizardFixture(prisma: PrismaClient, orgId: string): Promise<void> {
  const bookings = await prisma.booking.findMany({
    where: { organizationId: orgId },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);
  if (bookingIds.length > 0) {
    await prisma.bookingPaymentRequest.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
    await prisma.orgInvoice.deleteMany({ where: { organizationId: orgId, bookingId: { in: bookingIds } } }).catch(() => undefined);
    await prisma.bookingPriceLineItem.deleteMany({
      where: { organizationId: orgId },
    }).catch(() => undefined);
    await prisma.bookingPriceSnapshot.deleteMany({ where: { organizationId: orgId, bookingId: { in: bookingIds } } }).catch(() => undefined);
    await prisma.pricingQuote.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
    await prisma.booking.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  }
  await prisma.customerVerificationCheck.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.customerDocument.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.customer.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.vehicle.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.station.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.organizationProduct.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
  await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}