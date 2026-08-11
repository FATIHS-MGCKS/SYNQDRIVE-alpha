import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

/**
 * Real-PostgreSQL harness for E4 tenant-integrity adversarial tests. Follows the
 * repository's existing live-DB pattern: env-gated, DB-probed, fixture create +
 * cleanup. It deliberately plants CROSS-TENANT (corrupt) relations that plain
 * `organizationId` filters would miss, so the repository's nested tenant proofs
 * are exercised against a real database rather than a mock.
 */
export const E4_PG_WINDOW = {
  start: new Date('2026-01-01T00:00:00.000Z'),
  endExclusive: new Date('2026-02-01T00:00:00.000Z'),
  mid: new Date('2026-01-15T00:00:00.000Z'),
};

export interface E4TenantFixture {
  readonly orgAId: string;
  readonly orgBId: string;
  readonly driverAId: string; // legitimate ORG_A assigned driver
  readonly driverBId: string; // ORG_B customer — must never appear in ORG_A analysis
  readonly contractCustomerAId: string; // ORG_A contract customer — never a driver
  readonly vehicleAId: string;
  readonly vehicleBId: string;
  readonly orgAInvoiceId: string;
  readonly orgBInvoiceId: string;
  readonly linkedServiceCaseId: string; // ORG_A service case linked to ORG_B invoice
  readonly dedupServiceCaseId: string; // ORG_A service case linked to ORG_A invoice
}

export async function probeE4Database(prisma: PrismaClient): Promise<boolean> {
  try {
    await prisma.organization.findFirst({ select: { id: true } });
    return true;
  } catch {
    return false;
  }
}

export async function createE4TenantFixture(prisma: PrismaClient): Promise<E4TenantFixture> {
  const tag = randomUUID().slice(0, 8);
  const orgAId = `e4pg-orgA-${tag}`;
  const orgBId = `e4pg-orgB-${tag}`;

  await prisma.organization.createMany({
    data: [
      { id: orgAId, companyName: `E4 PG Org A ${tag}`, businessType: 'RENTAL' },
      { id: orgBId, companyName: `E4 PG Org B ${tag}`, businessType: 'RENTAL' },
    ],
  });

  await prisma.organizationPaymentAccount.create({
    data: {
      organizationId: orgAId,
      provider: 'STRIPE',
      status: 'ACTIVE',
      chargesEnabled: true,
      defaultCurrency: 'EUR',
      lastSyncedAt: E4_PG_WINDOW.mid,
    },
  });

  const driverAId = `e4pg-driverA-${tag}`;
  const driverBId = `e4pg-driverB-${tag}`;
  const contractCustomerAId = `e4pg-custA-${tag}`;
  await prisma.customer.createMany({
    data: [
      { id: driverAId, organizationId: orgAId, firstName: 'Driver', lastName: `A-${tag}` },
      // ORG_B person — the adversarial foreign driver.
      { id: driverBId, organizationId: orgBId, firstName: 'Foreign', lastName: `B-${tag}` },
      { id: contractCustomerAId, organizationId: orgAId, firstName: 'Contract', lastName: `Cust-${tag}` },
    ],
  });

  const vehicleAId = `e4pg-vehA-${tag}`;
  const vehicleBId = `e4pg-vehB-${tag}`;
  await prisma.vehicle.createMany({
    data: [
      {
        id: vehicleAId,
        organizationId: orgAId,
        vin: `VINA${tag}`,
        make: 'Test',
        model: 'A',
        year: 2024,
        fuelType: 'GASOLINE',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      },
      {
        id: vehicleBId,
        organizationId: orgBId,
        vin: `VINB${tag}`,
        make: 'Test',
        model: 'B',
        year: 2024,
        fuelType: 'GASOLINE',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    ],
  });

  // ── Driver attribution adversarial bookings (cancellations dimension) ────────
  const cancelledBooking = (
    idSuffix: string,
    assignedDriverId: string | null,
  ) => ({
    id: `e4pg-bk-${idSuffix}-${tag}`,
    organizationId: orgAId,
    customerId: contractCustomerAId,
    vehicleId: vehicleAId,
    assignedDriverId,
    status: 'CANCELLED' as const,
    startDate: E4_PG_WINDOW.mid,
    endDate: E4_PG_WINDOW.mid,
    cancelledAt: E4_PG_WINDOW.mid,
  });

  const bookingData = [
    // 5 legitimate ORG_A assigned-driver cancellations → driverA should surface.
    ...Array.from({ length: 5 }, (_, i) => cancelledBooking(`a${i}`, driverAId)),
    // 5 cancellations whose assigned driver is an ORG_B person → foreign, must be
    // dropped (never contributes to any ORG_A driver factor).
    ...Array.from({ length: 5 }, (_, i) => cancelledBooking(`fb${i}`, driverBId)),
    // 3 cancellations with NO assigned driver, only a contract customer → the
    // contract customer must NEVER become the driver (no customer fallback).
    ...Array.from({ length: 3 }, (_, i) => cancelledBooking(`c${i}`, null)),
  ];
  await prisma.booking.createMany({ data: bookingData });

  // Utilization: a legitimate ORG_A ACTIVE booking on ORG_A vehicle, and an
  // adversarial ORG_A booking pointing at an ORG_B vehicle (foreign relation).
  await prisma.booking.createMany({
    data: [
      {
        id: `e4pg-util-valid-${tag}`,
        organizationId: orgAId,
        customerId: contractCustomerAId,
        vehicleId: vehicleAId,
        status: 'ACTIVE',
        startDate: E4_PG_WINDOW.start,
        endDate: E4_PG_WINDOW.endExclusive,
      },
      {
        id: `e4pg-util-foreign-${tag}`,
        organizationId: orgAId,
        customerId: contractCustomerAId,
        vehicleId: vehicleBId, // ORG_B vehicle referenced by an ORG_A booking
        status: 'ACTIVE',
        startDate: E4_PG_WINDOW.start,
        endDate: E4_PG_WINDOW.endExclusive,
      },
    ],
  });

  // ── Cost dedup / Task→Invoice adversarial graph ─────────────────────────────
  const orgAInvoiceId = `e4pg-invA-${tag}`;
  const orgBInvoiceId = `e4pg-invB-${tag}`;
  await prisma.orgInvoice.createMany({
    data: [
      {
        id: orgAInvoiceId,
        organizationId: orgAId,
        type: 'INCOMING_VENDOR',
        title: 'ORG_A vendor invoice',
        status: 'APPROVED',
        currency: 'EUR',
        totalCents: 3000,
        invoiceDate: E4_PG_WINDOW.mid,
      },
      {
        id: orgBInvoiceId,
        organizationId: orgBId,
        type: 'INCOMING_VENDOR',
        title: 'ORG_B vendor invoice',
        status: 'APPROVED',
        currency: 'EUR',
        totalCents: 999999, // must never appear in ORG_A cost
        invoiceDate: E4_PG_WINDOW.mid,
      },
    ],
  });

  const linkedServiceCaseId = `e4pg-scLinked-${tag}`;
  const dedupServiceCaseId = `e4pg-scDedup-${tag}`;
  await prisma.serviceCase.createMany({
    data: [
      {
        id: linkedServiceCaseId,
        organizationId: orgAId,
        vehicleId: vehicleAId,
        title: 'ORG_A repair linked to ORG_B invoice',
        category: 'REPAIR',
        status: 'COMPLETED',
        actualCostCents: 5000,
        completedAt: E4_PG_WINDOW.mid,
      },
      {
        id: dedupServiceCaseId,
        organizationId: orgAId,
        vehicleId: vehicleAId,
        title: 'ORG_A repair linked to ORG_A invoice',
        category: 'REPAIR',
        status: 'COMPLETED',
        actualCostCents: 3000,
        completedAt: E4_PG_WINDOW.mid,
      },
    ],
  });

  await prisma.orgTask.createMany({
    data: [
      {
        id: `e4pg-taskForeign-${tag}`,
        organizationId: orgAId,
        title: 'ORG_A task linking a foreign ORG_B invoice',
        activatesAt: E4_PG_WINDOW.mid,
        serviceCaseId: linkedServiceCaseId,
        invoiceId: orgBInvoiceId, // foreign invoice link — must not suppress ORG_A cost
      },
      {
        id: `e4pg-taskSame-${tag}`,
        organizationId: orgAId,
        title: 'ORG_A task linking an ORG_A invoice',
        activatesAt: E4_PG_WINDOW.mid,
        serviceCaseId: dedupServiceCaseId,
        invoiceId: orgAInvoiceId, // same-tenant link — legitimate dedup
      },
    ],
  });

  return {
    orgAId,
    orgBId,
    driverAId,
    driverBId,
    contractCustomerAId,
    vehicleAId,
    vehicleBId,
    orgAInvoiceId,
    orgBInvoiceId,
    linkedServiceCaseId,
    dedupServiceCaseId,
  };
}

export async function cleanupE4TenantFixture(
  prisma: PrismaClient,
  fixture: E4TenantFixture,
): Promise<void> {
  const orgs = [fixture.orgAId, fixture.orgBId];
  const where = { organizationId: { in: orgs } };
  // FK-safe deletion order.
  await prisma.orgTask.deleteMany({ where });
  await prisma.vehicleDamage.deleteMany({ where });
  await prisma.serviceCase.deleteMany({ where });
  await prisma.booking.deleteMany({ where });
  await prisma.orgInvoice.deleteMany({ where });
  await prisma.organizationPaymentAccount.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.vehicle.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
}
