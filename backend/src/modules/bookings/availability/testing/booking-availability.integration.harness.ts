import { randomUUID } from 'crypto';
import {
  PrismaClient,
  type Booking,
  type Customer,
  type Organization,
  type Vehicle,
} from '@prisma/client';

export type BookingAvailabilityFixture = {
  suffix: string;
  org: Organization;
  customer: Customer;
  vehicle: Vehicle;
};

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createBookingAvailabilityFixture(
  prisma: PrismaClient,
): Promise<BookingAvailabilityFixture> {
  const suffix = uniqueSuffix();

  const org = await prisma.organization.create({
    data: {
      companyName: `Booking Availability Test Org ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
  });

  const customer = await prisma.customer.create({
    data: {
      organizationId: org.id,
      firstName: 'Test',
      lastName: `Driver ${suffix}`,
      email: `driver-${suffix}@example.test`,
    },
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix.replace(/[^a-zA-Z0-9]/g, '').slice(0, 14)}`,
      make: 'Test',
      model: 'Vehicle',
      year: 2024,
      fuelType: 'GASOLINE',
    },
  });

  return { suffix, org, customer, vehicle };
}

export async function cleanupBookingAvailabilityFixture(
  prisma: PrismaClient,
  fixture: BookingAvailabilityFixture,
): Promise<void> {
  const orgId = fixture.org.id;
  await prisma.bookingPriceSnapshot.deleteMany({ where: { organizationId: orgId } });
  await prisma.booking.deleteMany({ where: { organizationId: orgId } });
  await prisma.vehicle.deleteMany({ where: { organizationId: orgId } });
  await prisma.customer.deleteMany({ where: { organizationId: orgId } });
  await prisma.tenantInsightPolicy.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}

export async function probeBookingAvailabilityDatabase(): Promise<boolean> {
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

export type AttemptBookingCreateInput = {
  organizationId: string;
  customerId: string;
  vehicleId: string;
  startDate: Date;
  endDate: Date;
  turnaroundBufferMinutes?: number;
  status?: 'PENDING' | 'CONFIRMED' | 'ACTIVE';
};

export type AttemptBookingCreateResult =
  | { ok: true; booking: Booking }
  | { ok: false; code: string; message: string };

/**
 * Mirrors the transactional create path in BookingsService.create:
 * advisory lock → buffer-aware conflict check → insert.
 */
export async function attemptBookingCreate(
  prisma: PrismaClient,
  input: AttemptBookingCreateInput,
): Promise<AttemptBookingCreateResult> {
  const turnaroundBufferMinutes = input.turnaroundBufferMinutes ?? 0;
  const status = input.status ?? 'CONFIRMED';

  try {
    const booking = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${`booking-vehicle:${input.organizationId}:${input.vehicleId}`})
        )
      `;

      const rows = await tx.$queryRaw<
        Array<{ id: string }>
      >`
        SELECT b.id
        FROM bookings b
        WHERE b.organization_id = ${input.organizationId}
          AND b.vehicle_id = ${input.vehicleId}
          AND b.status IN ('PENDING', 'CONFIRMED', 'ACTIVE')
          AND b.start_date < (
            ${input.endDate}::timestamptz
            + make_interval(mins => ${turnaroundBufferMinutes})
          )
          AND ${input.startDate}::timestamptz < (
            b.end_date + make_interval(mins => b.turnaround_buffer_minutes)
          )
        LIMIT 1
      `;

      if (rows[0]) {
        throw Object.assign(new Error('BOOKING_CONFLICT'), { code: 'BOOKING_CONFLICT' });
      }

      return tx.booking.create({
        data: {
          organizationId: input.organizationId,
          customerId: input.customerId,
          vehicleId: input.vehicleId,
          startDate: input.startDate,
          endDate: input.endDate,
          turnaroundBufferMinutes,
          status,
        },
      });
    });

    return { ok: true, booking };
  } catch (error) {
    const prismaCode = (error as { code?: string })?.code;
    if (prismaCode === '23P01') {
      return { ok: false, code: 'BOOKING_CONFLICT', message: 'exclusion_violation' };
    }
    if ((error as Error).message === 'BOOKING_CONFLICT') {
      return { ok: false, code: 'BOOKING_CONFLICT', message: 'application_conflict_check' };
    }
    throw error;
  }
}

export async function countBookingsForVehicle(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
): Promise<number> {
  return prisma.booking.count({
    where: { organizationId, vehicleId, status: { in: ['PENDING', 'CONFIRMED', 'ACTIVE'] } },
  });
}

export function uniqueAttemptId(): string {
  return randomUUID();
}
