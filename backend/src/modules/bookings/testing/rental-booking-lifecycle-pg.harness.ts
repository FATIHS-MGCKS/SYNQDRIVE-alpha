import {
  BookingStatus,
  BusinessType,
  OrgProductStatus,
  PrismaClient,
  ProductSlug,
  UserPlatformRole,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { DOCUMENT_STATUS, DOCUMENT_TYPE, LEGAL_STATUS } from '@modules/documents/documents.constants';
import { ensureOrganizationProductEntitlement } from '@modules/vehicle-onboarding/testing/org-product-test.harness';
import {
  BUNDLE_GENERATED_POINTER_FIELD,
  BUNDLE_LEGAL_POINTER_FIELD,
} from '@modules/documents/booking-document-bundle-pointer.mapping';
import type { DocumentType } from '@modules/documents/documents.constants';

export type P6Pr5bRentalFixture = {
  suffix: string;
  orgId: string;
  orgBId: string;
  userId: string;
  customerId: string;
  vehicleId: string;
  stationId: string;
  bookingId: string;
};

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Raw insert avoids Prisma client columns absent on partially-migrated disposable DBs. */
export async function insertP6Pr5bTestUser(
  prisma: PrismaClient,
  userId: string,
  email: string,
  name: string,
  platformRole: UserPlatformRole,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO users (id, email, name, status, platform_role, created_at, updated_at)
    VALUES (
      ${userId}, ${email}, ${name}, 'ACTIVE'::"UserStatus",
      ${platformRole}::"UserPlatformRole", NOW(), NOW()
    )
  `;
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

async function createOrgLegalDoc(
  prisma: PrismaClient,
  orgId: string,
  documentType: string,
  suffix: string,
) {
  return prisma.organizationLegalDocument.create({
    data: {
      organizationId: orgId,
      documentType,
      title: `${documentType} ${suffix}`,
      versionLabel: `v-${suffix}`,
      language: 'de',
      status: LEGAL_STATUS.ACTIVE,
      fileName: `${documentType.toLowerCase()}.pdf`,
      mimeType: 'application/pdf',
      storageProvider: 'local',
      objectKey: `organizations/${orgId}/legal/${documentType}-${suffix}.pdf`,
      checksum: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
      sizeBytes: 128,
      scanStatus: 'SCAN_PASSED',
      integrityStatus: 'VERIFIED',
      jurisdictionCountry: 'DE',
    },
  });
}

async function createGeneratedForBooking(
  prisma: PrismaClient,
  params: {
    orgId: string;
    bookingId: string;
    customerId: string;
    vehicleId: string;
    documentType: DocumentType;
    legalDocumentId?: string;
    suffix: string;
  },
) {
  const deliveryProofSatisfied =
    params.documentType === DOCUMENT_TYPE.BOOKING_INVOICE ? { sentAt: new Date() } : {};
  return prisma.generatedDocument.create({
    data: {
      organizationId: params.orgId,
      bookingId: params.bookingId,
      customerId: params.customerId,
      vehicleId: params.vehicleId,
      documentType: params.documentType,
      title: `${params.documentType} ${params.suffix}`,
      fileName: `${params.documentType}.pdf`,
      objectKey: `organizations/${params.orgId}/bookings/${params.bookingId}/${params.documentType}.pdf`,
      status: DOCUMENT_STATUS.GENERATED,
      legalDocumentId: params.legalDocumentId ?? null,
      generatedAt: new Date(),
      ...deliveryProofSatisfied,
    },
  });
}

export async function seedP6Pr5bPickupReadyBooking(
  prisma: PrismaClient,
  options: { rentalEntitlement?: OrgProductStatus } = {},
): Promise<P6Pr5bRentalFixture> {
  const suffix = uniqueSuffix();
  const org = await prisma.organization.create({
    data: {
      companyName: `P6-PR5B Rental ${suffix}`,
      businessType: BusinessType.RENTAL,
      status: 'ACTIVE',
    },
  });
  const orgB = await prisma.organization.create({
    data: {
      companyName: `P6-PR5B Foreign ${suffix}`,
      businessType: BusinessType.RENTAL,
      status: 'ACTIVE',
    },
  });

  await ensureOrganizationProductEntitlement(
    prisma,
    org.id,
    ProductSlug.RENTAL,
    options.rentalEntitlement ?? OrgProductStatus.ACTIVE,
  );
  await ensureOrganizationProductEntitlement(prisma, orgB.id, ProductSlug.RENTAL);

  const userId = randomUUID();
  await insertP6Pr5bTestUser(
    prisma,
    userId,
    `p6-pr5b-${suffix}@test.local`,
    'P6 PR5B Operator',
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

  const customer = await prisma.customer.create({
    data: {
      organizationId: org.id,
      firstName: 'Test',
      lastName: `Renter ${suffix}`,
    },
  });

  const vehicleId = await createVehicle(prisma, org.id, station.id);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 1);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 3);

  const booking = await prisma.booking.create({
    data: {
      organizationId: org.id,
      customerId: customer.id,
      vehicleId,
      pickupStationId: station.id,
      returnStationId: station.id,
      startDate,
      endDate,
      status: BookingStatus.CONFIRMED,
      paymentIntent: 'PAY_ON_PICKUP',
    },
  });

  const legalTerms = await createOrgLegalDoc(prisma, org.id, DOCUMENT_TYPE.TERMS_AND_CONDITIONS, suffix);
  const legalConsumer = await createOrgLegalDoc(
    prisma,
    org.id,
    DOCUMENT_TYPE.CONSUMER_INFORMATION,
    suffix,
  );
  const legalPrivacy = await createOrgLegalDoc(prisma, org.id, DOCUMENT_TYPE.PRIVACY_POLICY, suffix);

  const genByType: Partial<Record<DocumentType, string>> = {};
  const confirmedTypes = [
    DOCUMENT_TYPE.BOOKING_INVOICE,
    DOCUMENT_TYPE.DEPOSIT_RECEIPT,
    DOCUMENT_TYPE.RENTAL_CONTRACT,
    DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
    DOCUMENT_TYPE.CONSUMER_INFORMATION,
    DOCUMENT_TYPE.PRIVACY_POLICY,
  ] as const;

  for (const docType of confirmedTypes) {
    const legalId =
      docType === DOCUMENT_TYPE.TERMS_AND_CONDITIONS
        ? legalTerms.id
        : docType === DOCUMENT_TYPE.CONSUMER_INFORMATION
          ? legalConsumer.id
          : docType === DOCUMENT_TYPE.PRIVACY_POLICY
            ? legalPrivacy.id
            : undefined;
    const gen = await createGeneratedForBooking(prisma, {
      orgId: org.id,
      bookingId: booking.id,
      customerId: customer.id,
      vehicleId,
      documentType: docType,
      legalDocumentId: legalId,
      suffix,
    });
    genByType[docType] = gen.id;
  }

  const bundleData: Record<string, string | Date> = {
    organizationId: org.id,
    bookingId: booking.id,
    status: 'COMPLETE',
    generatedAt: new Date(),
  };
  for (const [docType, field] of Object.entries(BUNDLE_GENERATED_POINTER_FIELD)) {
    const genId = genByType[docType as DocumentType];
    if (genId) bundleData[field] = genId;
  }
  for (const [docType, field] of Object.entries(BUNDLE_LEGAL_POINTER_FIELD)) {
    const genId = genByType[docType as DocumentType];
    if (genId) bundleData[field] = genId;
  }
  await prisma.bookingDocumentBundle.create({ data: bundleData as never });

  for (const docType of [
    DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
    DOCUMENT_TYPE.CONSUMER_INFORMATION,
    DOCUMENT_TYPE.PRIVACY_POLICY,
  ]) {
    const legalId =
      docType === DOCUMENT_TYPE.TERMS_AND_CONDITIONS
        ? legalTerms.id
        : docType === DOCUMENT_TYPE.CONSUMER_INFORMATION
          ? legalConsumer.id
          : legalPrivacy.id;
    const genId = genByType[docType]!;
    await prisma.legalDocumentDeliveryEvidence.create({
      data: {
        organizationId: org.id,
        bookingId: booking.id,
        customerId: customer.id,
        legalDocumentId: legalId,
        generatedDocumentId: genId,
        documentType: docType,
        versionLabel: `v-${suffix}`,
        language: 'de',
        checksum: legalTerms.checksum,
        presentedAt: new Date(),
        deliveryChannel: 'PORTAL',
        deliveryStatus: 'PRESENTED',
        recipientSnapshot: { customerId: customer.id },
        requestId: randomUUID(),
      },
    });
  }

  return {
    suffix,
    orgId: org.id,
    orgBId: orgB.id,
    userId,
    customerId: customer.id,
    vehicleId,
    stationId: station.id,
    bookingId: booking.id,
  };
}

export async function cleanupP6Pr5bRentalFixture(
  prisma: PrismaClient,
  fixture: P6Pr5bRentalFixture,
): Promise<void> {
  const orgIds = [fixture.orgId, fixture.orgBId];
  await prisma.bookingHandoverProtocol.deleteMany({ where: { bookingId: fixture.bookingId } });
  await prisma.legalDocumentDeliveryEvidence.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.bookingDocumentBundle.deleteMany({ where: { bookingId: fixture.bookingId } });
  await prisma.generatedDocument.deleteMany({
    where: { organizationId: fixture.orgId, bookingId: fixture.bookingId },
  });
  await prisma.organizationLegalDocument.deleteMany({
    where: { organizationId: fixture.orgId },
  });
  await prisma.booking.deleteMany({ where: { id: fixture.bookingId } });
  await prisma.$executeRaw`DELETE FROM vehicles WHERE id = ${fixture.vehicleId}`;
  await prisma.customer.deleteMany({ where: { id: fixture.customerId } });
  await prisma.station.deleteMany({ where: { id: fixture.stationId } });
  await prisma.organizationProduct.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: fixture.userId } });
}

export async function probeP6Pr5bPostgresDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

export function handoverPayload() {
  return {
    odometerKm: 12000,
    fuelPercent: 80,
    fuelFull: false,
    exteriorClean: true,
    interiorClean: true,
    tiresSeasonOk: true,
    warningLightsOn: false,
    documentsAcknowledged: true,
    customerSignatureName: 'Test Customer',
    customerSignatureDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    staffSignatureName: 'Staff',
    staffSignatureDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    damageIds: [] as string[],
  };
}