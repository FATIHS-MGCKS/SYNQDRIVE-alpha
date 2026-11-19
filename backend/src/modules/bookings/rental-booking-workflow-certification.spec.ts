/**
 * P6-PR5 — Rental booking workflow certification harness.
 */
import { ConflictException } from '@nestjs/common';
import { VehicleStatus } from '@prisma/client';
import { BookingWizardDraftService } from './booking-wizard-draft.service';
import { BookingWizardPaymentFlowService } from './booking-wizard-payment-flow.service';
import { BookingsHandoverService } from './bookings-handover.service';
import { BookingPickupGateService } from './booking-pickup-gate/booking-pickup-gate.service';
import { PickupGateBlockedException } from './booking-pickup-gate/booking-pickup-gate.errors';
import { WIZARD_DRAFT_MARKER } from './booking-wizard-draft.util';
import { buildEligibilityPreviewFingerprint } from './booking-wizard-eligibility.util';
import { testGateResult } from './booking-eligibility-gatekeeper/booking-eligibility-test.fixtures';

export const RENTAL_WORKFLOW_CERTIFICATION_STEPS = [
  'wizard_draft',
  'pricing_eligibility',
  'wizard_confirm',
  'payment_intent',
  'invoice_consistency',
  'document_prerequisites',
  'pickup_gate',
  'pickup_handover',
  'booking_active',
  'return_handover',
  'booking_completed',
  'rda_recompute',
] as const;

function createHandoverHarness(bookingStatus: 'CONFIRMED' | 'ACTIVE') {
  const bookingId = 'bk-cert-1';
  const orgId = 'org-cert';
  const vehicleId = 'veh-cert-1';
  const enqueueRda = jest.fn().mockResolvedValue({ enqueued: true });
  const tx = {
    bookingHandoverProtocol: {
      create: jest.fn().mockImplementation(async ({ data }) => ({
        id: 'proto-1',
        bookingId,
        vehicleId,
        kind: data.kind,
        performedAt: data.performedAt ?? new Date(),
        performedByUserId: data.performedByUserId ?? null,
        performedByName: data.performedByName ?? null,
        odometerKm: data.odometerKm,
        fuelPercent: data.fuelPercent,
        fuelFull: data.fuelFull ?? false,
        exteriorClean: data.exteriorClean ?? true,
        interiorClean: data.interiorClean ?? true,
        tiresSeasonOk: data.tiresSeasonOk ?? true,
        warningLightsOn: data.warningLightsOn ?? false,
        warningLightsNotes: data.warningLightsNotes ?? null,
        notes: data.notes ?? null,
        customerSignatureName: data.customerSignatureName,
        customerSignatureDataUrl: data.customerSignatureDataUrl,
        staffSignatureName: data.staffSignatureName ?? null,
        staffSignatureDataUrl: data.staffSignatureDataUrl ?? null,
        documentsAcknowledged: data.documentsAcknowledged ?? true,
        damageIds: data.damageIds ?? [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findUnique: jest.fn().mockImplementation(async ({ where }) => {
        if (where.bookingId_kind?.kind === 'PICKUP' && bookingStatus === 'ACTIVE') {
          return { odometerKm: 10000 };
        }
        return null;
      }),
    },
    booking: {
      update: jest.fn().mockImplementation(async ({ data }) => ({
        id: bookingId,
        status: data.status,
        vehicleId,
      })),
      count: jest.fn().mockResolvedValue(0),
    },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue({ status: VehicleStatus.AVAILABLE }),
      update: jest.fn(),
    },
    vehicleDamage: { updateMany: jest.fn() },
    vehicleComplaint: { create: jest.fn() },
  };
  const svc = new BookingsHandoverService(
    {
      booking: {
        findFirst: jest.fn().mockResolvedValue({
          id: bookingId,
          vehicleId,
          customerId: 'cust-1',
          status: bookingStatus,
          startDate: new Date('2026-09-01T10:00:00.000Z'),
          endDate: new Date('2026-09-05T10:00:00.000Z'),
          pickupStationId: 'st-1',
          returnStationId: 'st-1',
        }),
      },
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: vehicleId, registryLifecycle: 'ACTIVE' }) },
      bookingHandoverProtocol: { findUnique: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn(async (cb: (c: typeof tx) => Promise<unknown>) => cb(tx)),
    } as never,
    {
      enqueuePickupProtocol: jest.fn().mockResolvedValue(undefined),
      enqueueReturnDocuments: jest.fn().mockResolvedValue(undefined),
    } as never,
    { scheduleEmit: jest.fn() } as never,
    {
      onPickupHandoverCompleted: jest.fn().mockResolvedValue(undefined),
      onReturnHandoverCompleted: jest.fn().mockResolvedValue(undefined),
    } as never,
    { invalidate: jest.fn().mockResolvedValue(undefined) } as never,
    { invalidate: jest.fn().mockResolvedValue(undefined) } as never,
    { assertPickupAllowed: jest.fn().mockResolvedValue({ allowed: true, overrideUsed: false }) } as never,
    { appendInTransaction: jest.fn() } as never,
    { assertAllowedForPickup: jest.fn() } as never,
    { processPickupPrecheck: jest.fn() } as never,
    {
      resolve: jest.fn().mockResolvedValue({ bypassScope: true }),
      assertStationReadable: jest.fn(),
    } as never,
    { deleteDraftsForBooking: jest.fn().mockResolvedValue(undefined) } as never,
    { enqueueForBooking: enqueueRda } as never,
  );
  return { svc, tx, orgId, bookingId, enqueueRda };
}

describe('P6-PR5 rental booking workflow certification', () => {
  const orgId = 'org-cert';
  const bookingId = 'bk-cert-1';
  const vehicleId = 'veh-cert-1';

  const eligibleGate = testGateResult({
    organizationId: orgId,
    customerId: 'cust-1',
    vehicleId,
    bookingId,
    sourceRuleIds: ['org:' + orgId],
    evaluatedAt: '2026-09-01T10:00:00.000Z',
    domains: {
      customer: { evaluated: true, canProceedForStage: true, result: null },
      verification: { evaluated: true, result: null },
      rentalRules: { evaluated: true, result: null },
      vehicle: { evaluated: true, vehicleFound: true, vehicleId },
      vehicleReadiness: { evaluated: true, skipped: false, blocked: false },
      pricingDeposit: { evaluated: false, skipped: true },
    },
  });

  const handoverPayload = {
    odometerKm: 10000,
    fuelPercent: 90,
    customerSignatureName: 'Cust',
    customerSignatureDataUrl: 'data:image/png;base64,a',
    staffSignatureName: 'Staff',
    staffSignatureDataUrl: 'data:image/png;base64,b',
    documentsAcknowledged: true,
  };
  const actor = { userId: 'op-1', displayName: 'Op', membershipRole: 'WORKER' };

  it('steps 1–3: wizard eligibility preview and confirm', async () => {
    const bookingsUpdate = jest.fn().mockResolvedValue({ id: bookingId, status: 'CONFIRMED' });
    const eligibilityEnforcement = {
      previewEvaluation: jest.fn().mockResolvedValue(eligibleGate),
      assertAllowed: jest.fn().mockResolvedValue(eligibleGate),
    };
    const draftRow = {
      id: bookingId,
      organizationId: orgId,
      customerId: 'cust-1',
      vehicleId,
      status: 'PENDING',
      notes: WIZARD_DRAFT_MARKER,
      paymentIntent: 'pay_on_pickup',
      startDate: new Date('2026-09-01T10:00:00.000Z'),
      endDate: new Date('2026-09-05T10:00:00.000Z'),
    };
    const wizard = new BookingWizardDraftService(
      {
        booking: {
          findFirst: jest.fn().mockResolvedValue(draftRow),
        },
      } as never,
      { update: bookingsUpdate } as never,
      {} as never,
      {} as never,
      { getBundleView: jest.fn().mockResolvedValue({ documents: [] }) } as never,
      {} as never,
      {} as never,
      { syncOnBookingConfirmed: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      { maybeAutoSendFrozenBookingDocuments: jest.fn().mockResolvedValue({ sent: false }) } as never,
      { getCheckoutContext: jest.fn() } as never,
      { executePaymentLinkFlow: jest.fn() } as never,
      eligibilityEnforcement as never,
      { assertValidForTransition: jest.fn() } as never,
      { freezeDepositOnSnapshot: jest.fn().mockResolvedValue(undefined) } as never,
    );

    const preview = await wizard.getEligibilityPreview(orgId, bookingId, { targetStatus: 'CONFIRMED' });
    const fingerprint = buildEligibilityPreviewFingerprint(eligibleGate);
    expect(preview.previewFingerprint).toBe(fingerprint);

    await wizard.confirmDraft(orgId, bookingId, {
      status: 'CONFIRMED',
      eligibilityPreviewFingerprint: fingerprint,
    });
    expect(bookingsUpdate).toHaveBeenCalled();
  });

  it('steps 4–5: payment intent without marking invoice paid', async () => {
    const flow = new BookingWizardPaymentFlowService(
      {
        createRentalPaymentRequest: jest.fn().mockResolvedValue({ request: { id: 'pr-cert', status: 'OPEN' } }),
      } as never,
      {
        createCheckoutSessionForPaymentRequest: jest
          .fn()
          .mockResolvedValue({ checkoutUrl: 'https://checkout.test' }),
      } as never,
      { isEnabled: jest.fn().mockReturnValue(false), maybeEnqueueAfterCheckout: jest.fn() } as never,
    );
    const result = await flow.executePaymentLinkFlow({
      organizationId: orgId,
      bookingId,
      actor: { id: 'user-1', organizationId: orgId },
    });
    expect(result.paymentRequestCreated).toBe(true);
    expect(result.checkoutCreated).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/"status":"PAID"/);
  });

  it('steps 7–11: pickup ACTIVE then return COMPLETED with RDA enqueue', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-02T12:00:00.000Z'));

    const pickupHarness = createHandoverHarness('CONFIRMED');
    const pickup = await pickupHarness.svc.createHandover(
      pickupHarness.orgId,
      pickupHarness.bookingId,
      'PICKUP',
      handoverPayload,
      actor,
    );
    expect(pickup.booking.status).toBe('ACTIVE');

    const returnHarness = createHandoverHarness('ACTIVE');
    const returned = await returnHarness.svc.createHandover(
      returnHarness.orgId,
      returnHarness.bookingId,
      'RETURN',
      { ...handoverPayload, odometerKm: 10120 },
      actor,
    );
    expect(returned.booking.status).toBe('COMPLETED');
    expect(returnHarness.enqueueRda).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'BOOKING_COMPLETED' }),
    );
    jest.useRealTimers();
  });

  describe('negative contracts', () => {
    it('blocks pickup when document bundle incomplete', async () => {
      const evaluation = {
        allowed: false,
        hardBlocks: [{ code: 'BUNDLE_INCOMPLETE', message: 'Missing documents' }],
        softBlocks: [],
        requirements: [],
        overrideUsed: false,
      };
      const gate = new BookingPickupGateService(
        {} as never,
        { evaluateForBooking: jest.fn() } as never,
        { appendBlocked: jest.fn().mockResolvedValue(undefined) } as never,
      );
      jest.spyOn(gate, 'evaluatePickupGate').mockResolvedValue(evaluation as never);
      await expect(
        gate.assertPickupAllowed({
          organizationId: orgId,
          bookingId,
          actor: { userId: 'u', displayName: 'U', membershipRole: 'ORG_MEMBER' },
          payload: { documentsAcknowledged: true },
        }),
      ).rejects.toBeInstanceOf(PickupGateBlockedException);
    });

    it('payment flow failure does not invoke checkout when payment request fails', async () => {
      const checkout = jest.fn();
      const flow = new BookingWizardPaymentFlowService(
        { createRentalPaymentRequest: jest.fn().mockRejectedValue(new Error('no snapshot')) } as never,
        { createCheckoutSessionForPaymentRequest: checkout } as never,
        { isEnabled: jest.fn(), maybeEnqueueAfterCheckout: jest.fn() } as never,
      );
      const result = await flow.executePaymentLinkFlow({
        organizationId: orgId,
        bookingId,
        actor: { id: 'u', organizationId: orgId },
      });
      expect(result.paymentRequestCreated).toBe(false);
      expect(checkout).not.toHaveBeenCalled();
    });

    it('rejects duplicate pickup protocol when booking not yet ACTIVE', async () => {
      const duplicatePickupHarness = createHandoverHarness('CONFIRMED');
      const findUnique = duplicatePickupHarness.svc['prisma'].bookingHandoverProtocol
        .findUnique as jest.Mock;
      findUnique.mockImplementation(async ({ where }: { where: { bookingId_kind?: { kind: string } } }) =>
        where.bookingId_kind?.kind === 'PICKUP' ? { id: 'proto-x', kind: 'PICKUP' } : null,
      );
      await expect(
        duplicatePickupHarness.svc.createHandover(orgId, bookingId, 'PICKUP', handoverPayload, actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});