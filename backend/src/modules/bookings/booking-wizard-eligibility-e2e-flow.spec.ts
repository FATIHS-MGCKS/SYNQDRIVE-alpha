/**
 * E2E-style flow: wizard draft eligibility preview → confirm gatekeeper → idempotent replay.
 */
import { ConflictException } from '@nestjs/common';
import { BookingWizardDraftService } from './booking-wizard-draft.service';
import { BookingEligibilityGatekeeperService } from './booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.service';
import { BookingEligibilityEnforcementService } from './booking-eligibility-gatekeeper/booking-eligibility-enforcement.service';
import { BookingEligibilityAuditLogger } from './booking-eligibility-gatekeeper/booking-eligibility-audit.logger';
import { testGateResult } from './booking-eligibility-gatekeeper/booking-eligibility-test.fixtures';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingsService } from './bookings.service';
import { WIZARD_DRAFT_MARKER } from './booking-wizard-draft.util';
import { buildEligibilityPreviewFingerprint } from './booking-wizard-eligibility.util';

describe('Booking wizard eligibility E2E flow', () => {
  const prisma = {
    booking: {
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
    bookingAllowedDriver: { count: jest.fn() },
    bookingDeposit: { findFirst: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
  } as unknown as PrismaService;

  const gatekeeper = {
    evaluate: jest.fn(),
  } as unknown as BookingEligibilityGatekeeperService;

  const auditLogger = {
    logEvaluation: jest.fn(),
  } as unknown as BookingEligibilityAuditLogger;

  const enforcement = new BookingEligibilityEnforcementService(
    prisma,
    gatekeeper,
    auditLogger,
  );

  const eligibilityEnforcement = {
    previewEvaluation: jest.fn(),
    assertAllowed: jest.fn(),
  } as unknown as BookingEligibilityEnforcementService;

  const bookingsService = {
    update: jest.fn(),
  } as unknown as BookingsService;

  const bundleService = {
    getBundleView: jest.fn().mockResolvedValue({ documents: [] }),
  };

  const bookingInvoiceLifecycle = {
    syncOnBookingConfirmed: jest.fn().mockResolvedValue(undefined),
  };

  const bookingLegalDocumentEmailService = {
    maybeAutoSendFrozenBookingDocuments: jest.fn().mockResolvedValue({ sent: false }),
  };

  const wizardDraftService = new BookingWizardDraftService(
    prisma,
    bookingsService,
    {} as never,
    {} as never,
    bundleService as never,
    {} as never,
    {} as never,
    bookingInvoiceLifecycle as never,
    {} as never,
    bookingLegalDocumentEmailService as never,
    {
      getCheckoutContext: jest.fn().mockResolvedValue({
        paymentLinkEligibility: { eligible: true, reasons: [] },
      }),
    } as never,
    {} as never,
    eligibilityEnforcement,
  );

  const draft = {
    id: 'booking-e2e',
    organizationId: 'org-e2e',
    customerId: 'cust-e2e',
    vehicleId: 'veh-e2e',
    startDate: new Date('2026-08-01T10:00:00.000Z'),
    endDate: new Date('2026-08-04T10:00:00.000Z'),
    status: 'PENDING',
    notes: WIZARD_DRAFT_MARKER,
    paymentIntent: 'pay_on_pickup',
  };

  const eligibleGate = testGateResult({
    organizationId: 'org-e2e',
    customerId: 'cust-e2e',
    vehicleId: 'veh-e2e',
    bookingId: 'booking-e2e',
    sourceRuleIds: ['org:org-e2e'],
    evaluatedAt: '2026-08-01T10:00:00.000Z',
    domains: {
      customer: { evaluated: true, canProceedForStage: true, result: null },
      verification: { evaluated: true, result: null },
      rentalRules: { evaluated: true, result: null },
      vehicle: { evaluated: true, vehicleFound: true, vehicleId: 'veh-e2e' },
      vehicleReadiness: { evaluated: true, skipped: false, blocked: false },
      pricingDeposit: { evaluated: false, skipped: true },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue(draft);
    (prisma.bookingAllowedDriver.count as jest.Mock).mockResolvedValue(0);
    (prisma.bookingDeposit.findFirst as jest.Mock).mockResolvedValue(null);
    (eligibilityEnforcement.previewEvaluation as jest.Mock).mockResolvedValue(eligibleGate);
    (eligibilityEnforcement.assertAllowed as jest.Mock).mockResolvedValue(eligibleGate);
    (gatekeeper.evaluate as jest.Mock).mockResolvedValue(eligibleGate);
    (bookingsService.update as jest.Mock).mockImplementation(async () => ({
      ...draft,
      status: 'CONFIRMED',
      notes: 'Confirmed booking',
    }));
  });

  it('preview and confirm use the same gatekeeper engine and fingerprint contract', async () => {
    const preview = await wizardDraftService.getEligibilityPreview('org-e2e', 'booking-e2e', {
      targetStatus: 'CONFIRMED',
    });

    expect(preview.engineVersion).toBe('1.0.0');
    expect(preview.previewFingerprint).toBe(buildEligibilityPreviewFingerprint(eligibleGate));

    const confirmed = await wizardDraftService.confirmDraft(
      'org-e2e',
      'booking-e2e',
      {
        status: 'CONFIRMED',
        eligibilityPreviewFingerprint: preview.previewFingerprint,
      },
      { userId: 'dispatcher-1' },
    );

    expect(confirmed.booking.status).toBe('CONFIRMED');
    expect(eligibilityEnforcement.previewEvaluation).toHaveBeenCalledTimes(1);
    expect(eligibilityEnforcement.assertAllowed).toHaveBeenCalledTimes(1);

    const enforcementResult = await enforcement.assertAllowedForBooking(
      'org-e2e',
      'booking-e2e',
      'CONFIRMED',
      { userId: 'dispatcher-1' },
    );
    expect(enforcementResult?.status).toBe('ELIGIBLE');
  });

  it('detects race conditions when rules change between preview and confirm', async () => {
    const preview = await wizardDraftService.getEligibilityPreview('org-e2e', 'booking-e2e');
    (eligibilityEnforcement.assertAllowed as jest.Mock).mockRejectedValue(
      new ConflictException({
        code: 'BOOKING_ELIGIBILITY_NOT_ELIGIBLE',
        message: 'Rules changed',
      }),
    );

    await expect(
      wizardDraftService.confirmDraft('org-e2e', 'booking-e2e', {
        status: 'CONFIRMED',
        eligibilityPreviewFingerprint: preview.previewFingerprint,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('double submit returns idempotent confirm without duplicate update', async () => {
    const preview = await wizardDraftService.getEligibilityPreview('org-e2e', 'booking-e2e');
    await wizardDraftService.confirmDraft('org-e2e', 'booking-e2e', {
      status: 'CONFIRMED',
      eligibilityPreviewFingerprint: preview.previewFingerprint,
    });

    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      ...draft,
      status: 'CONFIRMED',
      notes: 'Confirmed booking',
    });
    (prisma.booking.findFirstOrThrow as jest.Mock).mockResolvedValue({
      ...draft,
      status: 'CONFIRMED',
      notes: 'Confirmed booking',
    });

    const replay = await wizardDraftService.confirmDraft('org-e2e', 'booking-e2e', {
      status: 'CONFIRMED',
    });

    expect(replay.idempotent).toBe(true);
    expect(bookingsService.update).toHaveBeenCalledTimes(1);
  });
});
