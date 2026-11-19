/**
 * P6-PR5B — Disposable PostgreSQL rental **handover** HTTP integration (Nest + Prisma).
 * Seeds CONFIRMED bookings; does not certify wizard → payment over HTTP.
 *
 * Opt-in:
 *   RENTAL_BOOKING_LIFECYCLE_POSTGRES_INTEGRATION=1
 *   DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/p6_pr5b_test_ci?schema=public
 */
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BookingStatus,
  OrgProductStatus,
  PrismaClient,
  UserPlatformRole,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS } from '@modules/rental-driving-analysis/rental-driving-analysis.recompute.types';
import { createP6Pr5bBookingsHttpApp } from './testing/p6-pr5b-bookings-http-nest.harness';
import {
  assertP6Pr5bPostgresReachable,
  P6_PR5B_OPT_IN_ENV,
} from './testing/p6-pr5b-disposable-postgres-preflight';
import {
  cleanupP6Pr5bRentalFixture,
  handoverPayload,
  insertP6Pr5bTestUser,
  seedP6Pr5bPickupReadyBooking,
} from './testing/rental-booking-lifecycle-pg.harness';

const LIVE = process.env[P6_PR5B_OPT_IN_ENV] === '1';

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user) throw new UnauthorizedException('Missing authentication token');
    return true;
  }
}

function authHeader(user: Record<string, unknown>): [string, string] {
  return ['x-test-user', JSON.stringify(user)];
}

function bookingsBase(orgId: string): string {
  return `/api/v1/organizations/${orgId}/bookings`;
}

(LIVE ? describe : describe.skip)('P6-PR5B rental booking lifecycle (PostgreSQL HTTP)', () => {
  jest.setTimeout(180_000);

  let app: INestApplication;
  let prisma: PrismaClient;
  let rdaEnqueue: jest.Mock;
  let isolationProof: Awaited<ReturnType<typeof assertP6Pr5bPostgresReachable>>;

  const masterUser = (orgId: string, userId: string) => ({
    id: userId,
    email: 'ma-p6-pr5b@test.local',
    platformRole: UserPlatformRole.MASTER_ADMIN,
    membershipRole: 'MASTER_ADMIN',
    organizationId: orgId,
  });

  beforeAll(async () => {
    process.env.STATIONS_V2_FLAGS_TEST_DEFAULT = 'off';
    isolationProof = await assertP6Pr5bPostgresReachable();
    prisma = new PrismaClient();
    rdaEnqueue = jest.fn().mockResolvedValue({ enqueued: false, reason: 'NO_ANCHOR_TRIP' });
    app = await createP6Pr5bBookingsHttpApp(prisma, rdaEnqueue, TestAuthGuard);
  }, 180_000);

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  it('records disposable DATABASE_URL isolation proof', () => {
    expect(isolationProof.optIn).toBe(true);
    expect(isolationProof.productionHostRejected).toBe(true);
    expect(['127.0.0.1', 'localhost', 'postgres']).toContain(isolationProof.hostname);
  });

  it('denies bookings HTTP when ACTIVE RENTAL entitlement is missing (403)', async () => {
    const orgId = randomUUID();
    await prisma.organization.create({
      data: { id: orgId, companyName: 'No Rental Org', businessType: 'RENTAL', status: 'ACTIVE' },
    });
    try {
      const userId = randomUUID();
      await insertP6Pr5bTestUser(
        prisma,
        userId,
        `no-rental-${userId}@test.local`,
        'No Rental',
        UserPlatformRole.MASTER_ADMIN,
      );

      await request(app.getHttpServer())
        .get(bookingsBase(orgId))
        .set(...authHeader(masterUser(orgId, userId)))
        .expect(403);
    } finally {
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    }
  });

  it('denies cross-organization booking read (tenant isolation)', async () => {
    const fixture = await seedP6Pr5bPickupReadyBooking(prisma);
    try {
      await request(app.getHttpServer())
        .get(`${bookingsBase(fixture.orgBId)}/${fixture.bookingId}`)
        .set(...authHeader(masterUser(fixture.orgBId, fixture.userId)))
        .expect(404);
    } finally {
      await cleanupP6Pr5bRentalFixture(prisma, fixture);
    }
  });

  it('blocks pickup handover when document bundle is missing prerequisites', async () => {
    const fixture = await seedP6Pr5bPickupReadyBooking(prisma);
    await prisma.bookingDocumentBundle.delete({ where: { bookingId: fixture.bookingId } });
    await prisma.legalDocumentDeliveryEvidence.deleteMany({
      where: { organizationId: fixture.orgId, bookingId: fixture.bookingId },
    });
    await prisma.generatedDocument.deleteMany({
      where: { organizationId: fixture.orgId, bookingId: fixture.bookingId },
    });
    try {
      await request(app.getHttpServer())
        .post(`${bookingsBase(fixture.orgId)}/${fixture.bookingId}/handover/pickup`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send(handoverPayload())
        .expect((res) => {
          expect([409, 422, 403]).toContain(res.status);
        });
    } finally {
      await cleanupP6Pr5bRentalFixture(prisma, fixture);
    }
  });

  it('completes CONFIRMED → ACTIVE → COMPLETED via HTTP handover with persistence asserts', async () => {
    const fixture = await seedP6Pr5bPickupReadyBooking(prisma);
    try {
      const pickupRes = await request(app.getHttpServer())
        .post(`${bookingsBase(fixture.orgId)}/${fixture.bookingId}/handover/pickup`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send(handoverPayload())
        .expect(201);

      expect(pickupRes.body.booking?.status).toBe(BookingStatus.ACTIVE);

      const afterPickup = await prisma.booking.findUniqueOrThrow({
        where: { id: fixture.bookingId },
      });
      expect(afterPickup.status).toBe(BookingStatus.ACTIVE);

      const vehicleAfterPickup = await prisma.vehicle.findFirstOrThrow({
        where: { id: fixture.vehicleId },
      });
      expect(vehicleAfterPickup.status).toBe(VehicleStatus.RENTED);

      const pickupProtocols = await prisma.bookingHandoverProtocol.count({
        where: { bookingId: fixture.bookingId, kind: 'PICKUP' },
      });
      expect(pickupProtocols).toBe(1);

      const pickupReplay = await request(app.getHttpServer())
        .post(`${bookingsBase(fixture.orgId)}/${fixture.bookingId}/handover/pickup`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send(handoverPayload())
        .expect(201);
      expect(pickupReplay.body.booking?.status).toBe(BookingStatus.ACTIVE);

      const pickupProtocolsAfterReplay = await prisma.bookingHandoverProtocol.count({
        where: { bookingId: fixture.bookingId, kind: 'PICKUP' },
      });
      expect(pickupProtocolsAfterReplay).toBe(1);

      rdaEnqueue.mockClear();
      const returnRes = await request(app.getHttpServer())
        .post(`${bookingsBase(fixture.orgId)}/${fixture.bookingId}/handover/return`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({ ...handoverPayload(), odometerKm: 12500 })
        .expect(201);

      expect(returnRes.body.booking?.status).toBe(BookingStatus.COMPLETED);

      const afterReturn = await prisma.booking.findUniqueOrThrow({
        where: { id: fixture.bookingId },
      });
      expect(afterReturn.status).toBe(BookingStatus.COMPLETED);

      const vehicleAfterReturn = await prisma.vehicle.findFirstOrThrow({
        where: { id: fixture.vehicleId },
      });
      expect(vehicleAfterReturn.status).toBe(VehicleStatus.AVAILABLE);

      expect(rdaEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: fixture.orgId,
          bookingId: fixture.bookingId,
          reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.BOOKING_COMPLETED,
        }),
      );
      const enqueueOutcome = await rdaEnqueue.mock.results[rdaEnqueue.mock.results.length - 1]?.value;
      expect(enqueueOutcome).toEqual(
        expect.objectContaining({ enqueued: false, reason: 'NO_ANCHOR_TRIP' }),
      );
    } finally {
      await cleanupP6Pr5bRentalFixture(prisma, fixture);
    }
  });

  it('does not roll back COMPLETED when RDA enqueue rejects after RETURN', async () => {
    const fixture = await seedP6Pr5bPickupReadyBooking(prisma);
    try {
      await request(app.getHttpServer())
        .post(`${bookingsBase(fixture.orgId)}/${fixture.bookingId}/handover/pickup`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send(handoverPayload())
        .expect(201);

      rdaEnqueue.mockRejectedValueOnce(new Error('queue unavailable'));

      await request(app.getHttpServer())
        .post(`${bookingsBase(fixture.orgId)}/${fixture.bookingId}/handover/return`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({ ...handoverPayload(), odometerKm: 12600 })
        .expect(201);

      const row = await prisma.booking.findUniqueOrThrow({ where: { id: fixture.bookingId } });
      expect(row.status).toBe(BookingStatus.COMPLETED);
    } finally {
      await cleanupP6Pr5bRentalFixture(prisma, fixture);
    }
  });

  it('rejects trial org product for bookings routes (403)', async () => {
    const fixture = await seedP6Pr5bPickupReadyBooking(prisma, {
      rentalEntitlement: OrgProductStatus.TRIAL,
    });
    try {
      await request(app.getHttpServer())
        .get(`${bookingsBase(fixture.orgId)}/${fixture.bookingId}`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(403);
    } finally {
      await prisma.organizationProduct.updateMany({
        where: { organizationId: fixture.orgId },
        data: { status: OrgProductStatus.ACTIVE },
      });
      await cleanupP6Pr5bRentalFixture(prisma, fixture);
    }
  });
});