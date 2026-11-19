/**
 * P6-PR5D — Disposable PostgreSQL rental wizard **payment_link** confirmation +
 * BookingPaymentRequest persistence (Stripe checkout boundary mocked only).
 */
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BookingPaymentPurpose,
  BookingPaymentRequestStatus,
  BookingStatus,
  OrgInvoiceStatus,
  PrismaClient,
  UserPlatformRole,
} from '@prisma/client';
import * as request from 'supertest';
import {
  createP6Pr5cWizardHttpApp,
  P6_PR5C_STRIPE_CHECKOUT_MOCK,
} from './testing/p6-pr5c-bookings-http-nest.harness';
import {
  assertP6Pr5bPostgresReachable,
  P6_PR5B_OPT_IN_ENV,
} from './testing/p6-pr5b-disposable-postgres-preflight';
import {
  cleanupP6Pr5cWizardFixture,
  createP6Pr5cPricingQuote,
  seedP6Pr5cWizardOrg,
  type P6Pr5cWizardFixture,
} from './testing/p6-pr5c-wizard-pg.harness';
import {
  cleanupP6Pr5dPaymentArtifacts,
  seedP6Pr5dPaymentsEnabledConnectNotReady,
  seedP6Pr5dPaymentsReady,
} from './testing/p6-pr5d-payment-link-pg.harness';

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
    email: 'ma-p6-pr5d@test.local',
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

async function wizardDraftWithQuote(
  app: INestApplication,
  fixture: P6Pr5cWizardFixture,
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
      pricingInput: P6_PR5C_DEFAULT_PRICING_INPUT,
    })
    .expect(201);
  return draftRes.body.booking.id as string;
}

(LIVE ? describe : describe.skip)('P6-PR5D rental wizard payment_link (PostgreSQL HTTP)', () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
    (P6_PR5C_STRIPE_CHECKOUT_MOCK.createCheckoutSessionForPaymentRequest as jest.Mock).mockRejectedValue(
      new Error('P6-PR5D_STRIPE_CHECKOUT_BOUNDARY_MOCK'),
    );
  });

  it('persists BookingPaymentRequest on payment_link confirm; Stripe checkout fails closed', async () => {
    const fixture = await seedP6Pr5cWizardOrg(prisma);
    const { stripeConnectedAccountId } = await seedP6Pr5dPaymentsReady(prisma, fixture.orgId);
    const quote = await createP6Pr5cPricingQuote(prisma, fixture);
    try {
      const bookingId = await wizardDraftWithQuote(app, fixture, quote.quoteId);

      const checkoutRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/checkout-context`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);
      expect(checkoutRes.body.paymentLinkEligibility.eligible).toBe(true);
      expect(checkoutRes.body.paymentLinkEligibility.reasons).toHaveLength(0);

      const previewRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/eligibility-preview`)
        .query({ paymentIntent: 'payment_link', targetStatus: 'CONFIRMED' })
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);
      expect(['ELIGIBLE', 'ELIGIBLE_WITH_WARNINGS']).toContain(previewRes.body.status);

      const confirmRes = await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/confirm`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          agbAccepted: true,
          privacyAccepted: true,
          status: 'CONFIRMED',
          paymentIntent: 'payment_link',
          eligibilityPreviewFingerprint: previewRes.body.previewFingerprint,
        })
        .expect(201);

      expect(confirmRes.body.booking.status).toBe(BookingStatus.CONFIRMED);
      expect(confirmRes.body.paymentIntent).toBe('payment_link');
      expect(confirmRes.body.paymentFlow?.paymentRequestCreated).toBe(true);
      expect(confirmRes.body.paymentFlow?.checkoutCreated).toBe(false);
      expect(confirmRes.body.paymentFlow?.partialFailures?.some((f: { step: string }) => f.step === 'checkout')).toBe(true);

      const booking = await prisma.booking.findFirstOrThrow({
        where: { id: bookingId, organizationId: fixture.orgId },
      });
      expect(booking.status).toBe(BookingStatus.CONFIRMED);
      expect(booking.paymentIntent).toBe('PAYMENT_LINK');

      const requests = await prisma.bookingPaymentRequest.findMany({
        where: { organizationId: fixture.orgId, bookingId },
      });
      expect(requests).toHaveLength(1);
      const paymentRequest = requests[0]!;
      expect(paymentRequest.organizationId).toBe(fixture.orgId);
      expect(paymentRequest.bookingId).toBe(bookingId);
      expect(paymentRequest.customerId).toBe(fixture.customerId);
      expect(paymentRequest.purpose).toBe(BookingPaymentPurpose.RENTAL_PAYMENT);
      expect(paymentRequest.amountCents).toBeGreaterThan(0);
      expect(paymentRequest.currency).toBeTruthy();
      expect(paymentRequest.invoiceId).toBeTruthy();
      expect(paymentRequest.idempotencyKey).toBe(`wizard-confirm:${bookingId}:payment-request`);
      expect(paymentRequest.stripeConnectedAccountId).toBe(stripeConnectedAccountId);
      expect(paymentRequest.status).not.toBe(BookingPaymentRequestStatus.PAID);
      expect([BookingPaymentRequestStatus.OPEN, BookingPaymentRequestStatus.DRAFT]).toContain(
        paymentRequest.status,
      );

      const invoice = await prisma.orgInvoice.findFirst({
        where: { organizationId: fixture.orgId, bookingId },
        orderBy: { createdAt: 'desc' },
      });
      expect(invoice).toBeTruthy();
      expect(invoice?.status).not.toBe(OrgInvoiceStatus.PAID);

      expect(P6_PR5C_STRIPE_CHECKOUT_MOCK.createCheckoutSessionForPaymentRequest).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupP6Pr5dPaymentArtifacts(prisma, fixture.orgId);
      await cleanupP6Pr5cWizardFixture(prisma, fixture.orgId);
      await prisma.organization.delete({ where: { id: fixture.orgBId } }).catch(() => undefined);
    }
  });

  it('idempotent confirm preserves single payment request and Stripe call count', async () => {
    const fixture = await seedP6Pr5cWizardOrg(prisma);
    await seedP6Pr5dPaymentsReady(prisma, fixture.orgId);
    const quote = await createP6Pr5cPricingQuote(prisma, fixture);
    try {
      const bookingId = await wizardDraftWithQuote(app, fixture, quote.quoteId);
      const previewRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/eligibility-preview`)
        .query({ paymentIntent: 'payment_link', targetStatus: 'CONFIRMED' })
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);

      await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/confirm`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          status: 'CONFIRMED',
          paymentIntent: 'payment_link',
          eligibilityPreviewFingerprint: previewRes.body.previewFingerprint,
        })
        .expect(201);

      const stripeCallsAfterFirst = (
        P6_PR5C_STRIPE_CHECKOUT_MOCK.createCheckoutSessionForPaymentRequest as jest.Mock
      ).mock.calls.length;
      const firstRequest = await prisma.bookingPaymentRequest.findFirstOrThrow({
        where: { organizationId: fixture.orgId, bookingId },
      });

      const dupRes = await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/confirm`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          status: 'CONFIRMED',
          paymentIntent: 'payment_link',
          eligibilityPreviewFingerprint: previewRes.body.previewFingerprint,
        })
        .expect(201);
      expect(dupRes.body.idempotent).toBe(true);

      const requestCount = await prisma.bookingPaymentRequest.count({
        where: { organizationId: fixture.orgId, bookingId },
      });
      expect(requestCount).toBe(1);

      const invoiceCount = await prisma.orgInvoice.count({
        where: { organizationId: fixture.orgId, bookingId },
      });
      expect(invoiceCount).toBe(1);

      const secondRequest = await prisma.bookingPaymentRequest.findFirstOrThrow({
        where: { organizationId: fixture.orgId, bookingId },
      });
      expect(secondRequest.id).toBe(firstRequest.id);

      expect(
        (P6_PR5C_STRIPE_CHECKOUT_MOCK.createCheckoutSessionForPaymentRequest as jest.Mock).mock.calls.length,
      ).toBe(stripeCallsAfterFirst);
    } finally {
      await cleanupP6Pr5dPaymentArtifacts(prisma, fixture.orgId);
      await cleanupP6Pr5cWizardFixture(prisma, fixture.orgId);
      await prisma.organization.delete({ where: { id: fixture.orgBId } }).catch(() => undefined);
    }
  });

  it('blocks payment_link confirm when Connect account is not charge-ready', async () => {
    const fixture = await seedP6Pr5cWizardOrg(prisma);
    await seedP6Pr5dPaymentsEnabledConnectNotReady(prisma, fixture.orgId);
    const quote = await createP6Pr5cPricingQuote(prisma, fixture);
    try {
      const bookingId = await wizardDraftWithQuote(app, fixture, quote.quoteId);

      const checkoutRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/checkout-context`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);
      expect(checkoutRes.body.paymentLinkEligibility.eligible).toBe(false);
      expect(checkoutRes.body.paymentLinkEligibility.reasons).toContain('CONNECT_ACCOUNT_NOT_READY');

      const previewRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/eligibility-preview`)
        .query({ paymentIntent: 'payment_link', targetStatus: 'CONFIRMED' })
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);

      await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/confirm`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          status: 'CONFIRMED',
          paymentIntent: 'payment_link',
          eligibilityPreviewFingerprint: previewRes.body.previewFingerprint,
        })
        .expect(400);

      const row = await prisma.booking.findFirstOrThrow({
        where: { id: bookingId, organizationId: fixture.orgId },
      });
      expect(row.status).toBe(BookingStatus.PENDING);

      const paymentRequestCount = await prisma.bookingPaymentRequest.count({
        where: { organizationId: fixture.orgId, bookingId },
      });
      expect(paymentRequestCount).toBe(0);
    } finally {
      await cleanupP6Pr5dPaymentArtifacts(prisma, fixture.orgId);
      await cleanupP6Pr5cWizardFixture(prisma, fixture.orgId);
      await prisma.organization.delete({ where: { id: fixture.orgBId } }).catch(() => undefined);
    }
  });

  it('blocks payment_link confirm when org payments feature is disabled', async () => {
    const fixture = await seedP6Pr5cWizardOrg(prisma);
    const quote = await createP6Pr5cPricingQuote(prisma, fixture);
    try {
      const bookingId = await wizardDraftWithQuote(app, fixture, quote.quoteId);

      const checkoutRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/checkout-context`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);
      expect(checkoutRes.body.paymentLinkEligibility.eligible).toBe(false);
      expect(checkoutRes.body.paymentLinkEligibility.reasons).toContain('ORG_PAYMENTS_DISABLED');

      const previewRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/eligibility-preview`)
        .query({ paymentIntent: 'payment_link', targetStatus: 'CONFIRMED' })
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);

      await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/confirm`)
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .send({
          status: 'CONFIRMED',
          paymentIntent: 'payment_link',
          eligibilityPreviewFingerprint: previewRes.body.previewFingerprint,
        })
        .expect(400);

      expect(
        await prisma.bookingPaymentRequest.count({
          where: { organizationId: fixture.orgId, bookingId },
        }),
      ).toBe(0);
    } finally {
      await cleanupP6Pr5cWizardFixture(prisma, fixture.orgId);
      await prisma.organization.delete({ where: { id: fixture.orgBId } }).catch(() => undefined);
    }
  });

  it('denies cross-organization payment_link confirm (tenant isolation)', async () => {
    const fixture = await seedP6Pr5cWizardOrg(prisma);
    await seedP6Pr5dPaymentsReady(prisma, fixture.orgId);
    const quote = await createP6Pr5cPricingQuote(prisma, fixture);
    try {
      const bookingId = await wizardDraftWithQuote(app, fixture, quote.quoteId);
      const previewRes = await request(app.getHttpServer())
        .get(`${orgBase(fixture.orgId)}/bookings/wizard-draft/${bookingId}/eligibility-preview`)
        .query({ paymentIntent: 'payment_link', targetStatus: 'CONFIRMED' })
        .set(...authHeader(masterUser(fixture.orgId, fixture.userId)))
        .expect(200);

      await request(app.getHttpServer())
        .post(`${orgBase(fixture.orgBId)}/bookings/wizard-draft/${bookingId}/confirm`)
        .set(...authHeader(masterUser(fixture.orgBId, fixture.userId)))
        .send({
          status: 'CONFIRMED',
          paymentIntent: 'payment_link',
          eligibilityPreviewFingerprint: previewRes.body.previewFingerprint,
        })
        .expect(404);

      expect(
        await prisma.bookingPaymentRequest.count({
          where: { organizationId: fixture.orgId, bookingId },
        }),
      ).toBe(0);

      const row = await prisma.booking.findFirstOrThrow({
        where: { id: bookingId, organizationId: fixture.orgId },
      });
      expect(row.status).toBe(BookingStatus.PENDING);
    } finally {
      await cleanupP6Pr5dPaymentArtifacts(prisma, fixture.orgId);
      await cleanupP6Pr5cWizardFixture(prisma, fixture.orgId);
      await prisma.organization.delete({ where: { id: fixture.orgBId } }).catch(() => undefined);
    }
  });
});