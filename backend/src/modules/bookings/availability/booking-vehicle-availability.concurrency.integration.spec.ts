import { PrismaClient } from '@prisma/client';
import {
  attemptBookingCreate,
  cleanupBookingAvailabilityFixture,
  countBookingsForVehicle,
  createBookingAvailabilityFixture,
  probeBookingAvailabilityDatabase,
  type BookingAvailabilityFixture,
} from './testing/booking-availability.integration.harness';

const LIVE = process.env.BOOKING_AVAILABILITY_INTEGRATION === '1';
const PARALLEL_CREATES = 100;

(LIVE ? describe : describe.skip)(
  'Booking vehicle availability concurrency (DATABASE_URL)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let fixture: BookingAvailabilityFixture;

    const window = {
      startDate: new Date('2026-10-01T08:00:00.000Z'),
      endDate: new Date('2026-10-05T08:00:00.000Z'),
    };

    beforeAll(async () => {
      dbOk = await probeBookingAvailabilityDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
    }, 60_000);

    beforeEach(async () => {
      if (!dbOk) return;
      fixture = await createBookingAvailabilityFixture(prisma);
    });

    afterEach(async () => {
      if (!dbOk || !fixture) return;
      await cleanupBookingAvailabilityFixture(prisma, fixture);
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect().catch(() => undefined);
    });

    it(`${PARALLEL_CREATES} parallel identical creates — exactly one success`, async () => {
      const baseInput = {
        organizationId: fixture.org.id,
        customerId: fixture.customer.id,
        vehicleId: fixture.vehicle.id,
        startDate: window.startDate,
        endDate: window.endDate,
        turnaroundBufferMinutes: 0,
        status: 'CONFIRMED' as const,
      };

      const results = await Promise.all(
        Array.from({ length: PARALLEL_CREATES }, () => attemptBookingCreate(prisma, baseInput)),
      );

      const successes = results.filter((r) => r.ok);
      const rejections = results.filter((r) => !r.ok);

      expect(successes).toHaveLength(1);
      expect(rejections).toHaveLength(PARALLEL_CREATES - 1);
      expect(rejections.every((r) => r.code === 'BOOKING_CONFLICT')).toBe(true);

      const persisted = await countBookingsForVehicle(
        prisma,
        fixture.org.id,
        fixture.vehicle.id,
      );
      expect(persisted).toBe(1);

      const snapshots = await prisma.bookingPriceSnapshot.count({
        where: { organizationId: fixture.org.id },
      });
      expect(snapshots).toBe(0);
    }, 120_000);

    it('allows adjacent half-open windows when buffer is zero', async () => {
      const first = await attemptBookingCreate(prisma, {
        organizationId: fixture.org.id,
        customerId: fixture.customer.id,
        vehicleId: fixture.vehicle.id,
        startDate: new Date('2026-11-01T08:00:00.000Z'),
        endDate: new Date('2026-11-03T08:00:00.000Z'),
        turnaroundBufferMinutes: 0,
      });
      expect(first.ok).toBe(true);

      const second = await attemptBookingCreate(prisma, {
        organizationId: fixture.org.id,
        customerId: fixture.customer.id,
        vehicleId: fixture.vehicle.id,
        startDate: new Date('2026-11-03T08:00:00.000Z'),
        endDate: new Date('2026-11-05T08:00:00.000Z'),
        turnaroundBufferMinutes: 0,
      });
      expect(second.ok).toBe(true);

      const count = await countBookingsForVehicle(prisma, fixture.org.id, fixture.vehicle.id);
      expect(count).toBe(2);
    });

    it('rejects overlapping window when turnaround buffer applies', async () => {
      await prisma.tenantInsightPolicy.create({
        data: {
          organizationId: fixture.org.id,
          policyOverrides: { handoverBufferMin: 60 },
        },
      });

      const first = await attemptBookingCreate(prisma, {
        organizationId: fixture.org.id,
        customerId: fixture.customer.id,
        vehicleId: fixture.vehicle.id,
        startDate: new Date('2026-12-01T08:00:00.000Z'),
        endDate: new Date('2026-12-03T08:00:00.000Z'),
        turnaroundBufferMinutes: 60,
      });
      expect(first.ok).toBe(true);

      const adjacent = await attemptBookingCreate(prisma, {
        organizationId: fixture.org.id,
        customerId: fixture.customer.id,
        vehicleId: fixture.vehicle.id,
        startDate: new Date('2026-12-03T08:00:00.000Z'),
        endDate: new Date('2026-12-05T08:00:00.000Z'),
        turnaroundBufferMinutes: 60,
      });
      expect(adjacent.ok).toBe(false);
      if (!adjacent.ok) {
        expect(adjacent.code).toBe('BOOKING_CONFLICT');
      }
    });

    it('does not block availability for CANCELLED bookings', async () => {
      await prisma.booking.create({
        data: {
          organizationId: fixture.org.id,
          customerId: fixture.customer.id,
          vehicleId: fixture.vehicle.id,
          startDate: window.startDate,
          endDate: window.endDate,
          turnaroundBufferMinutes: 0,
          status: 'CANCELLED',
        },
      });

      const created = await attemptBookingCreate(prisma, {
        organizationId: fixture.org.id,
        customerId: fixture.customer.id,
        vehicleId: fixture.vehicle.id,
        startDate: window.startDate,
        endDate: window.endDate,
        turnaroundBufferMinutes: 0,
      });
      expect(created.ok).toBe(true);
    });
  },
);
