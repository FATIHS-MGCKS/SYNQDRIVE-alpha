/**
 * P6-PR5C — Disposable PostgreSQL rental **wizard → confirm → payment intent** HTTP integration.
 * P6-PR5B handover suite remains in rental-booking-lifecycle.http.postgres.integration.spec.ts.
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
  OrgInvoiceStatus,
  PrismaClient,
  UserPlatformRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { BOOKING_ELIGIBILITY_TRANSITION_CODE } from './booking-eligibility-gatekeeper/booking-eligibility-transition.policy';
import { createP6Pr5cWizardHttpApp } from './testing/p6-pr5c-bookings-http-nest.harness';
import {
  assertP6Pr5bPostgresReachable,
  P6_PR5B_OPT_IN_ENV,
} from './testing/p6-pr5b-disposable-postgres-preflight';
import {
  cleanupP6Pr5cWizardFixture,
  createP6Pr5cPricingQuote,
  seedP6Pr5cWizardOrg,
  seedP6Pr5cVerifiedCustomerDocuments,
} from './testing/p6-pr5c-wizard-pg.harness';
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

function orgBase(orgId: string): string {
  return `/api/v1/organizations/${orgId}`;
}

function masterUser(orgId: string, userId: string) {
  return {
    id: userId,
    email: 'ma-p6-pr5c@test.local',
    platformRole: UserPlatformRole.MASTER_ADMIN,
    membershipRole: 'MASTER_ADMIN',
    organizationId: orgId,
  };
}

const P6_PR5C_DEFAULT_PRICING_INPUT = {
  manualAdjustmentCents: 0,
  manualDiscountCents: 0,
  selectedExtraOptionIds: [] as string[],
  selectedInsuranceOptionIds: [] as string[],
};

(LIVE ? describe : describe.skip)('P6-PR5C rental booking wizard (PostgreSQL HTTP)', () => {
  jest.setTimeout(180_000);

  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.STATIONS_V2_FLAGS_TEST_DEFAULT = 'off';
    await assertP6Pr5bPostgresReachable();
    prisma = new PrismaClient();
    app = await createP6Pr5cWizardHttpApp(prisma, TestAuthGuard);
  }, 180_000);

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  it('Step 1–5: pricing quote → wizard draft → checkout → eligibility → confirm (pay_on_pickup)', async () => {
    const fixture = await seedP6Pr5cWizardOrg(prisma);
    try {
      const simulateRes = await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/pricing/simulate`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          vehicleId: fixture.vehicleId,
          pickupAt: fixture.pickupAt.toISOString(),
          returnAt: fixture.returnAt.toISOString(),
          manualAdjustmentCents: 0,
          manualDiscountCents: 0,
          selectedExtraOptionIds: [],
          selectedInsuranceOptionIds: [],
        })
        .expect((res) => {
          expect([200, 201]).toContain(res.status);
        });

      expect(simulateRes.body.quoteId).toBeTruthy();
      expect(simulateRes.body.currency).toBeTruthy();
      const quoteId = simulateRes.body.quoteId as string;

      const quotePersisted = await prisma.pricingQuote.findFirst({
        where: { id: quoteId, organizationId: fixture.orgId },
      });
      expect(quotePersisted?.vehicleId).toBe(fixture.vehicleId);

      const draftRes = await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          vehicleId: fixture.vehicleId,
          customerId: fixture.customerId,
          startDate: fixture.pickupAt.toISOString(),
          endDate: fixture.returnAt.toISOString(),
          quoteId,
          pickupStationId: fixture.stationId,
          returnStationId: fixture.stationId,
          pricingInput: P6_PR5C_DEFAULT_PRICING_INPUT,
        })
        .expect(201);

      const bookingId = draftRes.body.booking.id as string;
      expect(draftRes.body.booking.status).toBe(BookingStatus.PENDING);

      const reloaded = await prisma.booking.findFirst({
        where: { id: bookingId, organizationId: fixture.orgId },
      });
      expect(reloaded?.status).toBe(BookingStatus.PENDING);
      expect(reloaded?.vehicleId).toBe(fixture.vehicleId);

      const consumedQuote = await prisma.pricingQuote.findFirst({
        where: { id: quoteId, organizationId: fixture.orgId },
      });
      expect(consumedQuote?.consumedByBookingId).toBe(bookingId);

      const checkoutRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/checkout-context`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);
      expect(checkoutRes.body.totalGrossCents).toBeGreaterThan(0);
      expect(checkoutRes.body.currency).toBeTruthy();

      const previewRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/eligibility-preview`)
        .query({ paymentIntent: 'pay_on_pickup', targetStatus: 'CONFIRMED' })
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);

      expect(previewRes.body.previewFingerprint).toBeTruthy();
      expect(['ELIGIBLE', 'ELIGIBLE_WITH_WARNINGS']).toContain(previewRes.body.status);

      const confirmRes = await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/confirm`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          agbAccepted: true,
          privacyAccepted: true,
          status: 'CONFIRMED',
          paymentIntent: 'pay_on_pickup',
          eligibilityPreviewFingerprint: previewRes.body.previewFingerprint,
        })
        .expect(201);

      expect(confirmRes.body.booking.status).toBe(BookingStatus.CONFIRMED);
      expect(confirmRes.body.paymentIntent).toBe('pay_on_pickup');
      expect(confirmRes.body.paymentFlow).toBeFalsy();

      const confirmedRow = await prisma.booking.findFirstOrThrow({
        where: { id: bookingId, organizationId: fixture.orgId },
      });
      expect(confirmedRow.status).toBe(BookingStatus.CONFIRMED);
      expect(confirmedRow.paymentIntent).toBe('PAY_ON_PICKUP');

      const invoice = await prisma.orgInvoice.findFirst({
        where: { organizationId: fixture.orgId, bookingId },
        orderBy: { createdAt: 'desc' },
      });
      expect(invoice).toBeTruthy();
      expect(invoice?.status).not.toBe(OrgInvoiceStatus.PAID);

      const dupConfirm = await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/confirm`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          status: 'CONFIRMED',
          paymentIntent: 'pay_on_pickup',
          eligibilityPreviewFingerprint: previewRes.body.previewFingerprint,
        })
        .expect(201);
      expect(dupConfirm.body.idempotent).toBe(true);

      const paymentRequestCount = await prisma.bookingPaymentRequest.count({
        where: { organizationId: fixture.orgId, bookingId },
      });
      expect(paymentRequestCount).toBe(0);
    } finally {
      await cleanupP6Pr5cWizardFixture(prisma, fixture.orgId);
      await prisma.organization.delete({ where: { id: fixture.orgBId } }).catch(() => undefined);
    }
  });

  it('blocks wizard draft when ACTIVE RENTAL entitlement is missing (403)', async () => {
    const fixture = await seedP6Pr5cWizardOrg(prisma, { includeRentalEntitlement: false });
    try {
      await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          vehicleId: fixture.vehicleId,
          customerId: fixture.customerId,
          startDate: fixture.pickupAt.toISOString(),
          endDate: fixture.returnAt.toISOString(),
          quoteId: randomUUID(),
        })
        .expect(403);
    } finally {
      await cleanupP6Pr5cWizardFixture(prisma, fixture.orgId);
    }
  });

  it('denies cross-organization wizard draft read (tenant isolation)', async () => {
    const fixture = await seedP6Pr5cWizardOrg(prisma);
    const quote = await createP6Pr5cPricingQuote(prisma, fixture);
    let bookingId = '';
    try {
      const draftRes = await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          vehicleId: fixture.vehicleId,
          customerId: fixture.customerId,
          startDate: fixture.pickupAt.toISOString(),
          endDate: fixture.returnAt.toISOString(),
          quoteId: quote.quoteId,
          pickupStationId: fixture.stationId,
          returnStationId: fixture.stationId,
          pricingInput: P6_PR5C_DEFAULT_PRICING_INPUT,
        })
        .expect(201);
      bookingId = draftRes.body.booking.id;

      await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgBId)}/bookings/wizard-draft/${bookingId}/checkout-context`)
        .set(...authHeader(masterUser(fixture.orgBId, fixture.userId)))
        .expect(404);
    } finally {
      await cleanupP6Pr5cWizardFixture(prisma, fixture.orgId);
      await prisma.organization.delete({ where: { id: fixture.orgBId } }).catch(() => undefined);
    }
  });

  it('blocks confirm when eligibility preview fingerprint is stale (RULES_CHANGED)', async () => {
    const fixture = await seedP6Pr5cWizardOrg(prisma);
    const quote = await createP6Pr5cPricingQuote(prisma, fixture);
    try {
      const draftRes = await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          vehicleId: fixture.vehicleId,
          customerId: fixture.customerId,
          startDate: fixture.pickupAt.toISOString(),
          endDate: fixture.returnAt.toISOString(),
          quoteId: quote.quoteId,
          pickupStationId: fixture.stationId,
          returnStationId: fixture.stationId,
          pricingInput: P6_PR5C_DEFAULT_PRICING_INPUT,
        })
        .expect(201);
      const bookingId = draftRes.body.booking.id;

      const previewRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/eligibility-preview`)
        .query({ paymentIntent: 'pay_on_pickup', targetStatus: 'CONFIRMED' })
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);

      expect(previewRes.body.status).toBe('ELIGIBLE');
      expect(previewRes.body.canConfirm).toBe(true);

      const confirmRes = await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/confirm`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          status: 'CONFIRMED',
          paymentIntent: 'pay_on_pickup',
          eligibilityPreviewFingerprint: 'stale-fingerprint-not-from-preview',
        })
        .expect(409);

      expect(confirmRes.body.code).toBe(BOOKING_ELIGIBILITY_TRANSITION_CODE.RULES_CHANGED);
      expect(confirmRes.body.previewFingerprint).toBe(previewRes.body.previewFingerprint);
      expect(confirmRes.body.previousFingerprint).toBe('stale-fingerprint-not-from-preview');

      const row = await prisma.booking.findFirstOrThrow({
        where: { id: bookingId, organizationId: fixture.orgId },
      });
      expect(row.status).toBe(BookingStatus.PENDING);
    } finally {
      await cleanupP6Pr5cWizardFixture(prisma, fixture.orgId);
      await prisma.organization.delete({ where: { id: fixture.orgBId } }).catch(() => undefined);
    }
  });

  it('blocks confirm when eligibility gate fails (NOT_ELIGIBLE)', async () => {
    const fixture = await seedP6Pr5cWizardOrg(prisma);
    const quote = await createP6Pr5cPricingQuote(prisma, fixture);
    try {
      const draftRes = await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          vehicleId: fixture.vehicleId,
          customerId: fixture.customerId,
          startDate: fixture.pickupAt.toISOString(),
          endDate: fixture.returnAt.toISOString(),
          quoteId: quote.quoteId,
          pickupStationId: fixture.stationId,
          returnStationId: fixture.stationId,
          pricingInput: P6_PR5C_DEFAULT_PRICING_INPUT,
        })
        .expect(201);
      const bookingId = draftRes.body.booking.id;

      const previewRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/eligibility-preview`)
        .query({ paymentIntent: 'pay_on_pickup', targetStatus: 'CONFIRMED' })
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);
      const fingerprint = previewRes.body.previewFingerprint as string;

      await prisma.customerVerificationCheck.updateMany({
        where: { organizationId: fixture.orgId, customerId: fixture.customerId },
        data: { status: 'REJECTED' },
      });

      const rejectRes = await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/confirm`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          status: 'CONFIRMED',
          paymentIntent: 'pay_on_pickup',
          eligibilityPreviewFingerprint: fingerprint,
        })
        .expect(409);

      expect(rejectRes.body.code).toBe(BOOKING_ELIGIBILITY_TRANSITION_CODE.NOT_ELIGIBLE);

      const row = await prisma.booking.findFirstOrThrow({
        where: { id: bookingId, organizationId: fixture.orgId },
      });
      expect(row.status).toBe(BookingStatus.PENDING);
    } finally {
      await cleanupP6Pr5cWizardFixture(prisma, fixture.orgId);
      await prisma.organization.delete({ where: { id: fixture.orgBId } }).catch(() => undefined);
    }
  });

  it('rejects confirm with unknown quote on fresh draft path', async () => {
    const fixture = await seedP6Pr5cWizardOrg(prisma);
    try {
      await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          vehicleId: fixture.vehicleId,
          customerId: fixture.customerId,
          startDate: fixture.pickupAt.toISOString(),
          endDate: fixture.returnAt.toISOString(),
          quoteId: randomUUID(),
          pickupStationId: fixture.stationId,
          returnStationId: fixture.stationId,
          pricingInput: P6_PR5C_DEFAULT_PRICING_INPUT,
        })
        .expect(404);
    } finally {
      await cleanupP6Pr5cWizardFixture(prisma, fixture.orgId);
    }
  });
});