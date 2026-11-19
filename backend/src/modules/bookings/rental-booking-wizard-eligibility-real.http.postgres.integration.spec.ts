/**
 * P6-PR5E — Real internal rental eligibility enforcement via wizard HTTP + disposable PostgreSQL.
 */
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { BookingStatus, CustomerStatus, PrismaClient, UserPlatformRole } from '@prisma/client';
import * as request from 'supertest';
import { BOOKING_ELIGIBILITY_TRANSITION_CODE } from './booking-eligibility-gatekeeper/booking-eligibility-transition.policy';
import { createP6Pr5eWizardHttpApp } from './testing/p6-pr5e-bookings-http-nest.harness';
import {
  assertP6Pr5bPostgresReachable,
  P6_PR5B_OPT_IN_ENV,
} from './testing/p6-pr5b-disposable-postgres-preflight';
import {
  cleanupP6Pr5eWizardFixture,
  createP6Pr5ePricingQuote,
  seedP6Pr5eWizardOrg,
  supersedeP6Pr5eOrgRentalRules,
} from './testing/p6-pr5e-wizard-pg.harness';

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
    email: 'ma-p6-pr5e@test.local',
    platformRole: UserPlatformRole.MASTER_ADMIN,
    membershipRole: 'MASTER_ADMIN',
    organizationId: orgId,
  };
}

const DEFAULT_PRICING_INPUT = {
  manualAdjustmentCents: 0,
  manualDiscountCents: 0,
  selectedExtraOptionIds: [] as string[],
  selectedInsuranceOptionIds: [] as string[],
};

async function createWizardDraft(
  app: INestApplication,
  fixture: Awaited<ReturnType<typeof seedP6Pr5eWizardOrg>>,
  quoteId: string,
): Promise<string> {
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
      pricingInput: DEFAULT_PRICING_INPUT,
    })
    .expect(201);
  return draftRes.body.booking.id as string;
}

(LIVE ? describe : describe.skip)('P6-PR5E rental wizard eligibility (real services, PostgreSQL HTTP)', () => {
  jest.setTimeout(180_000);

  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.STATIONS_V2_FLAGS_TEST_DEFAULT = 'off';
    await assertP6Pr5bPostgresReachable();
    prisma = new PrismaClient();
    app = await createP6Pr5eWizardHttpApp(prisma, TestAuthGuard);
  }, 180_000);

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  it('TEST_1: eligible customer passes real gatekeeper preview and confirm', async () => {
    const fixture = await seedP6Pr5eWizardOrg(prisma);
    const quote = await createP6Pr5ePricingQuote(prisma, fixture);
    try {
      const bookingId = await createWizardDraft(app, fixture, quote.quoteId);

      const previewRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/eligibility-preview`)
        .query({ paymentIntent: 'pay_on_pickup', targetStatus: 'CONFIRMED' })
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);

      expect(['ELIGIBLE', 'ELIGIBLE_WITH_WARNINGS']).toContain(previewRes.body.status);
      expect(previewRes.body.canConfirm).toBe(true);
      expect(previewRes.body.previewFingerprint).toBeTruthy();
      expect(previewRes.body.rentalEligibility?.status).toBe('ELIGIBLE');

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

      const row = await prisma.booking.findFirstOrThrow({
        where: { id: bookingId, organizationId: fixture.orgId },
      });
      expect(row.status).toBe(BookingStatus.CONFIRMED);
    } finally {
      await cleanupP6Pr5eWizardFixture(prisma, fixture.orgId);
      await prisma.organization.delete({ where: { id: fixture.orgBId } }).catch(() => undefined);
    }
  });

  it('TEST_2: BLOCKED customer denied on confirm without payment side effects', async () => {
    const fixture = await seedP6Pr5eWizardOrg(prisma);
    const quote = await createP6Pr5ePricingQuote(prisma, fixture);
    try {
      const bookingId = await createWizardDraft(app, fixture, quote.quoteId);

      const previewRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/eligibility-preview`)
        .query({ paymentIntent: 'pay_on_pickup', targetStatus: 'CONFIRMED' })
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);

      const fingerprint = previewRes.body.previewFingerprint as string;

      await prisma.customer.update({
        where: { id: fixture.customerId },
        data: { status: CustomerStatus.BLOCKED },
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

      const paymentRequestCount = await prisma.bookingPaymentRequest.count({
        where: { organizationId: fixture.orgId, bookingId },
      });
      expect(paymentRequestCount).toBe(0);

      const paidInvoiceCount = await prisma.orgInvoice.count({
        where: { organizationId: fixture.orgId, bookingId, status: 'PAID' },
      });
      expect(paidInvoiceCount).toBe(0);
    } finally {
      await cleanupP6Pr5eWizardFixture(prisma, fixture.orgId);
      await prisma.organization.delete({ where: { id: fixture.orgBId } }).catch(() => undefined);
    }
  });

  it('TEST_3: restrictive rental rule rejects customer via real BookingRentalEligibilityService', async () => {
    const fixture = await seedP6Pr5eWizardOrg(prisma, {
      rentalRules: { minimumAgeYears: 99, minimumLicenseHoldingMonths: 0 },
    });
    const quote = await createP6Pr5ePricingQuote(prisma, fixture);
    try {
      const bookingId = await createWizardDraft(app, fixture, quote.quoteId);

      const previewRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/eligibility-preview`)
        .query({ paymentIntent: 'pay_on_pickup', targetStatus: 'CONFIRMED' })
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);

      expect(previewRes.body.canConfirm).toBe(false);
      expect(previewRes.body.rentalEligibility?.status).not.toBe('ELIGIBLE');

      const confirmRes = await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/confirm`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          status: 'CONFIRMED',
          paymentIntent: 'pay_on_pickup',
          eligibilityPreviewFingerprint: previewRes.body.previewFingerprint,
        })
        .expect(409);

      expect(confirmRes.body.code).toBe(BOOKING_ELIGIBILITY_TRANSITION_CODE.NOT_ELIGIBLE);
    } finally {
      await cleanupP6Pr5eWizardFixture(prisma, fixture.orgId);
      await prisma.organization.delete({ where: { id: fixture.orgBId } }).catch(() => undefined);
    }
  });

  it('TEST_4: published rule change invalidates fingerprint while customer stays eligible (18 → 19)', async () => {
    const fixture = await seedP6Pr5eWizardOrg(prisma, {
      rentalRules: { minimumAgeYears: 18, minimumLicenseHoldingMonths: 0 },
    });
    const quote = await createP6Pr5ePricingQuote(prisma, fixture);
    try {
      const bookingId = await createWizardDraft(app, fixture, quote.quoteId);

      const previewRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/eligibility-preview`)
        .query({ paymentIntent: 'pay_on_pickup', targetStatus: 'CONFIRMED' })
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);

      expect(previewRes.body.canConfirm).toBe(true);
      expect(previewRes.body.status).toBe('ELIGIBLE');
      const fingerprint = previewRes.body.previewFingerprint as string;

      await supersedeP6Pr5eOrgRentalRules(prisma, fixture.orgId, fixture.userId, {
        minimumAgeYears: 19,
        minimumLicenseHoldingMonths: 0,
      });

      const confirmRes = await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/confirm`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          status: 'CONFIRMED',
          paymentIntent: 'pay_on_pickup',
          eligibilityPreviewFingerprint: fingerprint,
        })
        .expect(409);

      expect(confirmRes.body.code).toBe(BOOKING_ELIGIBILITY_TRANSITION_CODE.RULES_CHANGED);
      expect(confirmRes.body.previousFingerprint).toBe(fingerprint);
      expect(confirmRes.body.previewFingerprint).not.toBe(fingerprint);
      expect(confirmRes.body.eligibilityStatus).toBe('ELIGIBLE');

      const row = await prisma.booking.findFirstOrThrow({
        where: { id: bookingId, organizationId: fixture.orgId },
      });
      expect(row.status).toBe(BookingStatus.PENDING);
    } finally {
      await cleanupP6Pr5eWizardFixture(prisma, fixture.orgId);
      await prisma.organization.delete({ where: { id: fixture.orgBId } }).catch(() => undefined);
    }
  });

  it('TEST_5: cross-organization confirm denied (tenant isolation)', async () => {
    const fixture = await seedP6Pr5eWizardOrg(prisma);
    const quote = await createP6Pr5ePricingQuote(prisma, fixture);
    try {
      const bookingId = await createWizardDraft(app, fixture, quote.quoteId);

      const previewRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/eligibility-preview`)
        .query({ paymentIntent: 'pay_on_pickup', targetStatus: 'CONFIRMED' })
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);

      await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgBId)}/bookings/wizard-draft/${bookingId}/confirm`)
        .set(...authHeader(masterUser(fixture.orgBId, fixture.userId)))
        .send({
          status: 'CONFIRMED',
          paymentIntent: 'pay_on_pickup',
          eligibilityPreviewFingerprint: previewRes.body.previewFingerprint,
        })
        .expect(404);

      const row = await prisma.booking.findFirstOrThrow({
        where: { id: bookingId, organizationId: fixture.orgId },
      });
      expect(row.status).toBe(BookingStatus.PENDING);
    } finally {
      await cleanupP6Pr5eWizardFixture(prisma, fixture.orgId);
      await prisma.organization.delete({ where: { id: fixture.orgBId } }).catch(() => undefined);
    }
  });
});