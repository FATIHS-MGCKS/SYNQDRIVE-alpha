import { BadRequestException, ConflictException } from '@nestjs/common';
import { BookingWizardDraftService } from './booking-wizard-draft.service';
import { BookingEligibilityEnforcementService } from './booking-eligibility-gatekeeper/booking-eligibility-enforcement.service';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingsService } from './bookings.service';
import { WIZARD_DRAFT_MARKER } from './booking-wizard-draft.util';
import { BOOKING_ELIGIBILITY_TRANSITION_CODE } from './booking-eligibility-gatekeeper/booking-eligibility-transition.policy';
import { testGateResult } from './booking-eligibility-gatekeeper/booking-eligibility-test.fixtures';

describe('BookingWizardDraftService eligibility integration', () => {
  const prisma = {
    booking: {
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
    organizationMembership: { findFirst: jest.fn() },
  } as unknown as PrismaService;

  const eligibilityEnforcement = {
    previewEvaluation: jest.fn(),
    assertAllowed: jest.fn(),
  } as unknown as BookingEligibilityEnforcementService;

  const bookingsService = {
    create: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
  } as unknown as BookingsService;

  const bundleService = {
    getBundleView: jest.fn(),
    generateInitialBundle: jest.fn(),
  };

  const checkoutContextService = {
    getCheckoutContext: jest.fn(),
  };

  const bookingInvoiceLifecycle = {
    syncOnBookingConfirmed: jest.fn().mockResolvedValue(undefined),
  };

  const bookingLegalDocumentEmailService = {
    maybeAutoSendFrozenBookingDocuments: jest.fn().mockResolvedValue({ sent: false }),
  };

  const eligibilityApproval = {
    assertValidForTransition: jest.fn(),
    revokeActiveApprovals: jest.fn(),
    expireStale: jest.fn(),
  } as never;

  const bookingDepositSnapshot = {
    freezeDepositOnSnapshot: jest.fn().mockResolvedValue(undefined),
  } as never;

  const legalConfirmationEnforcement = {
    enforceAndRecordCheckoutConfirmation: jest.fn().mockResolvedValue({
      snapshots: [],
      acceptancesRecorded: 2,
    }),
  };

  const service = new BookingWizardDraftService(
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
    checkoutContextService as never,
    {} as never,
    eligibilityEnforcement,
    eligibilityApproval,
    bookingDepositSnapshot,
    {} as never,
    legalConfirmationEnforcement as never,
  );

  const draftBooking = {
    id: 'booking-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    vehicleId: 'veh-1',
    startDate: new Date('2026-07-01T10:00:00.000Z'),
    endDate: new Date('2026-07-05T10:00:00.000Z'),
    status: 'PENDING',
    notes: WIZARD_DRAFT_MARKER,
    paymentIntent: 'pay_on_pickup',
  };

  const eligibleGate = testGateResult({
    bookingId: 'booking-1',
    sourceRuleIds: ['org:org-1'],
    evaluatedAt: '2026-07-01T10:00:00.000Z',
    domains: {
      customer: { evaluated: true, canProceedForStage: true, result: null },
      verification: { evaluated: true, result: null },
      rentalRules: { evaluated: true, result: null },
      vehicle: { evaluated: true, vehicleFound: true, vehicleId: 'veh-1' },
      vehicleReadiness: { evaluated: true, skipped: false, blocked: false },
      pricingDeposit: { evaluated: false, skipped: true },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue(draftBooking);
    (eligibilityEnforcement.previewEvaluation as jest.Mock).mockResolvedValue(eligibleGate);
    (eligibilityEnforcement.assertAllowed as jest.Mock).mockResolvedValue(eligibleGate);
    (bookingsService.update as jest.Mock).mockResolvedValue({
      ...draftBooking,
      status: 'CONFIRMED',
      notes: 'Checkout notes',
    });
    (bundleService.getBundleView as jest.Mock).mockResolvedValue({ documents: [] });
    (checkoutContextService.getCheckoutContext as jest.Mock).mockResolvedValue({
      paymentLinkEligibility: { eligible: true, reasons: [] },
    });
  });

  it('returns gatekeeper-aligned preview for wizard drafts', async () => {
    const preview = await service.getEligibilityPreview('org-1', 'booking-1', {
      paymentIntent: 'pay_on_pickup',
      targetStatus: 'CONFIRMED',
    });

    expect(eligibilityEnforcement.previewEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'booking-1',
        targetStatus: 'CONFIRMED',
      }),
      expect.objectContaining({ command: 'preview' }),
    );
    expect(preview.isPreviewOnly).toBe(true);
    expect(preview.canConfirm).toBe(true);
    expect(preview.previewFingerprint).toHaveLength(64);
  });

  it('rejects confirm when preview fingerprint is stale', async () => {
    await expect(
      service.confirmDraft(
        'org-1',
        'booking-1',
        {
          status: 'CONFIRMED',
          eligibilityPreviewFingerprint: 'stale-fingerprint',
        },
        { userId: 'user-1' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(bookingsService.update).not.toHaveBeenCalled();
  });

  it('confirms through bookings update after fresh gatekeeper evaluation', async () => {
    const preview = await service.getEligibilityPreview('org-1', 'booking-1');

    const result = await service.confirmDraft(
      'org-1',
      'booking-1',
      {
        status: 'CONFIRMED',
        agbAccepted: true,
        privacyAccepted: true,
        eligibilityPreviewFingerprint: preview.previewFingerprint,
      },
      { userId: 'user-1' },
    );

    expect(
      (legalConfirmationEnforcement.enforceAndRecordCheckoutConfirmation as jest.Mock),
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        bookingId: 'booking-1',
        agbAccepted: true,
        privacyAccepted: true,
      }),
    );
    expect(bookingsService.update).toHaveBeenCalledWith(
      'org-1',
      'booking-1',
      expect.objectContaining({ status: 'CONFIRMED' }),
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(result.booking.status).toBe('CONFIRMED');
  });

  it('returns idempotent confirm result for already confirmed bookings', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      ...draftBooking,
      status: 'CONFIRMED',
      notes: 'Finalized booking',
    });
    (prisma.booking.findFirstOrThrow as jest.Mock).mockResolvedValue({
      ...draftBooking,
      status: 'CONFIRMED',
      notes: 'Finalized booking',
    });

    const result = await service.confirmDraft('org-1', 'booking-1', {
      status: 'CONFIRMED',
    });

    expect(result.idempotent).toBe(true);
    expect(bookingsService.update).not.toHaveBeenCalled();
  });

  it('blocks ineligible confirm with structured transition code', async () => {
    (eligibilityEnforcement.assertAllowed as jest.Mock).mockRejectedValue(
      new ConflictException({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.NOT_ELIGIBLE,
        message: 'blocked',
      }),
    );

    const preview = await service.getEligibilityPreview('org-1', 'booking-1');

    await expect(
      service.confirmDraft(
        'org-1',
        'booking-1',
        {
          status: 'CONFIRMED',
          eligibilityPreviewFingerprint: preview.previewFingerprint,
        },
        { userId: 'user-1' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects confirm for non-draft terminal bookings', async () => {
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
      ...draftBooking,
      status: 'CANCELLED',
      notes: 'cancelled',
    });

    await expect(
      service.confirmDraft('org-1', 'booking-1', { status: 'CONFIRMED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
