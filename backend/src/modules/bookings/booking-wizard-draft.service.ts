import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Booking, BookingStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { PermissionActor } from '@shared/auth/permission.util';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { InvoicesService } from '@modules/invoices/invoices.service';
import { BookingInvoiceLifecycleService } from '@modules/invoices/booking-invoice-lifecycle.service';
import { BookingDocumentEmailService } from '@modules/outbound-email/booking-document-email.service';
import { BookingLegalDocumentEmailService } from '@modules/outbound-email/booking-legal-document-email.service';
import { PricingService } from '@modules/pricing/pricing.service';
import {
  PricingQuoteService,
  requireQuoteId,
} from '@modules/pricing/pricing-quote.service';
import { PricingQuoteApplicationService } from '@modules/pricing/pricing-quote-application.service';
import { assertValidBookingWindow } from './booking-conflict.util';
import {
  isWizardDraftBooking,
  mergeWizardDraftNotes,
  stripWizardDraftMarker,
} from './booking-wizard-draft.util';
import type {
  BookingWizardDraftBodyDto,
  BookingWizardDraftConfirmDto,
  BookingWizardDraftUpdateDto,
} from './dto/booking-wizard-draft.dto';
import { BookingsService } from './bookings.service';
import {
  BOOKING_CHECKOUT_PAYMENT_INTENTS,
  type BookingCheckoutPaymentIntent,
  toPrismaBookingPaymentIntent,
} from './booking-payment-intent.types';
import { BookingWizardCheckoutContextService } from './booking-wizard-checkout-context.service';
import { BookingWizardPaymentFlowService } from './booking-wizard-payment-flow.service';
import { BookingDepositSnapshotService } from '@modules/deposit/booking-deposit-snapshot.service';
import type { WizardPaymentFlowResult } from './booking-wizard-payment-flow.service';
import { BookingEligibilityEnforcementService } from './booking-eligibility-gatekeeper/booking-eligibility-enforcement.service';
import {
  assertWizardPreviewFingerprintMatches,
  mapGatekeeperToWizardPreview,
  type BookingWizardEligibilityPreviewResult,
} from './booking-wizard-eligibility.util';
import { resolveGatekeeperPaymentIntent } from './booking-eligibility-gatekeeper/booking-eligibility-context.util';
import { BookingEligibilityApprovalService } from './booking-eligibility-approval/booking-eligibility-approval.service';
import { BookingForeignKeyScopeService } from './tenant-scope/booking-foreign-key-scope.service';

export interface BookingWizardConfirmResult {
  booking: Booking;
  bundle: Awaited<ReturnType<BookingDocumentBundleService['getBundleView']>>;
  autoSend: Awaited<ReturnType<BookingLegalDocumentEmailService['maybeAutoSendFrozenBookingDocuments']>>;
  paymentIntent: BookingCheckoutPaymentIntent | null;
  paymentFlow?: WizardPaymentFlowResult | null;
  idempotent?: boolean;
}

@Injectable()
export class BookingWizardDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
    private readonly pricingService: PricingService,
    private readonly pricingQuoteService: PricingQuoteService,
    private readonly pricingQuoteApplication: PricingQuoteApplicationService,
    private readonly bundleService: BookingDocumentBundleService,
    private readonly generatedDocuments: GeneratedDocumentsService,
    private readonly invoicesService: InvoicesService,
    private readonly bookingInvoiceLifecycle: BookingInvoiceLifecycleService,
    private readonly bookingDocumentEmailService: BookingDocumentEmailService,
    private readonly bookingLegalDocumentEmailService: BookingLegalDocumentEmailService,
    private readonly checkoutContextService: BookingWizardCheckoutContextService,
    private readonly paymentFlowService: BookingWizardPaymentFlowService,
    private readonly eligibilityEnforcement: BookingEligibilityEnforcementService,
    private readonly eligibilityApproval: BookingEligibilityApprovalService,
    private readonly bookingDepositSnapshot: BookingDepositSnapshotService,
    private readonly foreignKeyScope: BookingForeignKeyScopeService,
  ) {}

  async createOrRefreshDraft(
    orgId: string,
    body: BookingWizardDraftBodyDto,
    options?: { userId?: string | null },
  ) {
    if (body.existingBookingId) {
      return this.updateDraftQuote(
        orgId,
        body.existingBookingId,
        { quoteId: body.quoteId, pricingInput: body.pricingInput },
        options,
      );
    }

    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid booking dates');
    }
    try {
      assertValidBookingWindow(startDate, endDate);
    } catch {
      throw new BadRequestException('endDate must be after startDate');
    }

    const quoteId = requireQuoteId(body.quoteId);
    await this.foreignKeyScope.assertBookingForeignKeys(orgId, {
      customerId: body.customerId,
      vehicleId: body.vehicleId,
      stationIds: [body.pickupStationId, body.returnStationId],
    });

    const consumedBookingId = await this.pricingQuoteService.findConsumedBookingId(orgId, quoteId);
    if (consumedBookingId) {
      const consumed = await this.prisma.booking.findFirst({
        where: { id: consumedBookingId, organizationId: orgId },
      });
      if (consumed && isWizardDraftBooking(consumed)) {
        return this.refreshDraftBundle(orgId, consumed.id, options?.userId ?? null, consumed);
      }
      if (consumed) {
        const bundle = await this.bundleService.getBundleView(orgId, consumed.id);
        return { booking: consumed, bundle };
      }
    }

    const createPayload = {
      customer: { connect: { id: body.customerId } },
      vehicle: { connect: { id: body.vehicleId } },
      ...(body.pickupStationId ? { pickupStation: { connect: { id: body.pickupStationId } } } : {}),
      ...(body.returnStationId ? { returnStation: { connect: { id: body.returnStationId } } } : {}),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      quoteId,
      pricingInput: body.pricingInput,
      status: 'PENDING' as BookingStatus,
      notes: mergeWizardDraftNotes(body.notes),
    };

    const booking = await this.bookingsService.create(orgId, createPayload as never, {
      userId: options?.userId ?? null,
    });

    if (!isWizardDraftBooking(booking)) {
      throw new ConflictException('Wizard draft could not be created');
    }

    return this.refreshDraftBundle(orgId, booking.id, options?.userId ?? null, booking);
  }

  async updateDraftQuote(
    orgId: string,
    bookingId: string,
    body: BookingWizardDraftUpdateDto,
    options?: { userId?: string | null },
  ) {
    const booking = await this.requireWizardDraft(orgId, bookingId);
    const quoteId = requireQuoteId(body.quoteId);
    const pricingInput = body.pricingInput ?? {};

    const currentQuote = await this.prisma.pricingQuote.findFirst({
      where: { organizationId: orgId, consumedByBookingId: bookingId },
    });
    if (currentQuote?.id === quoteId) {
      return this.refreshDraftBundle(orgId, bookingId, options?.userId ?? null, booking);
    }

    await this.pricingQuoteApplication.repriceBookingWithQuote({
      organizationId: orgId,
      userId: options?.userId ?? null,
      bookingId,
      quoteId,
      vehicleId: booking.vehicleId,
      pickupAt: booking.startDate,
      returnAt: booking.endDate,
      pricingInput,
      bookingUpdate: {},
      releasePreviousQuote: !!currentQuote,
    });

    await this.regeneratePricingDocuments(orgId, bookingId, options?.userId ?? null);
    return this.refreshDraftBundle(orgId, bookingId, options?.userId ?? null);
  }

  async getCheckoutContext(orgId: string, bookingId: string) {
    await this.requireWizardDraft(orgId, bookingId);
    return this.checkoutContextService.getCheckoutContext(orgId, bookingId);
  }

  async getEligibilityPreview(
    orgId: string,
    bookingId: string,
    options?: {
      paymentIntent?: BookingCheckoutPaymentIntent;
      targetStatus?: BookingStatus;
      eligibilityApprovalId?: string | null;
      userId?: string | null;
    },
  ): Promise<BookingWizardEligibilityPreviewResult> {
    const draft = await this.requireWizardDraft(orgId, bookingId);
    const targetStatus: BookingStatus =
      options?.targetStatus === 'PENDING' ? 'PENDING' : 'CONFIRMED';
    const paymentIntent = this.resolvePaymentIntent(options?.paymentIntent);
    const gateResult = await this.eligibilityEnforcement.previewEvaluation(
      {
        organizationId: orgId,
        customerId: draft.customerId,
        vehicleId: draft.vehicleId,
        startDate: draft.startDate,
        endDate: draft.endDate,
        targetStatus,
        bookingId: draft.id,
        paymentIntent: resolveGatekeeperPaymentIntent(paymentIntent),
      },
      {
        userId: options?.userId ?? null,
        command: 'preview',
      },
    );

    let validatedApproval: ValidatedBookingEligibilityApproval | null = null;
    if (
      targetStatus === 'CONFIRMED' &&
      gateResult.status === 'MANUAL_APPROVAL_REQUIRED' &&
      options?.eligibilityApprovalId?.trim()
    ) {
      validatedApproval = await this.eligibilityApproval.assertValidForTransition({
        organizationId: orgId,
        bookingId: draft.id,
        approvalId: options.eligibilityApprovalId.trim(),
        gateResult,
        bookingContext: {
          organizationId: orgId,
          customerId: draft.customerId,
          vehicleId: draft.vehicleId,
          startDate: draft.startDate,
          endDate: draft.endDate,
          targetStatus,
          bookingId: draft.id,
          paymentIntent: resolveGatekeeperPaymentIntent(paymentIntent),
        },
      });
    }

    return mapGatekeeperToWizardPreview(gateResult, targetStatus, {
      validatedApproval,
    });
  }

  async confirmDraft(
    orgId: string,
    bookingId: string,
    body: BookingWizardDraftConfirmDto,
    options?: { userId?: string | null },
  ): Promise<BookingWizardConfirmResult> {
    const paymentIntent = body.paymentIntent ?? body.paymentMethod;
    const resolvedIntent = this.resolvePaymentIntent(paymentIntent);

    const existing = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
    });
    if (!existing) {
      throw new NotFoundException('Booking not found');
    }

    if (!isWizardDraftBooking(existing)) {
      if (existing.status === 'CONFIRMED' || existing.status === 'PENDING') {
        return this.buildIdempotentConfirmResult(orgId, bookingId, resolvedIntent, options?.userId ?? null);
      }
      throw new BadRequestException({
        message: 'Diese Buchung ist kein Checkout-Entwurf',
        code: 'BOOKING_NOT_WIZARD_DRAFT',
        bookingId,
      });
    }

    const targetStatus: BookingStatus = body.status === 'PENDING' ? 'PENDING' : 'CONFIRMED';
    const freshGateResult = await this.eligibilityEnforcement.assertAllowed(
      {
        organizationId: orgId,
        customerId: existing.customerId,
        vehicleId: existing.vehicleId,
        startDate: existing.startDate,
        endDate: existing.endDate,
        targetStatus,
        bookingId: existing.id,
        notes: stripWizardDraftMarker(existing.notes) || null,
        paymentIntent: resolveGatekeeperPaymentIntent(resolvedIntent),
      },
      {
        userId: options?.userId ?? null,
        command: 'confirm',
        eligibilityApprovalId: body.eligibilityApprovalId,
      },
    );
    if (!freshGateResult) {
      throw new ConflictException({
        code: 'BOOKING_ELIGIBILITY_TECHNICAL_ERROR',
        message: 'Rental eligibility could not be evaluated for confirmation.',
      });
    }
    assertWizardPreviewFingerprintMatches(body.eligibilityPreviewFingerprint, freshGateResult);

    if (resolvedIntent === 'payment_link') {
      const context = await this.checkoutContextService.getCheckoutContext(orgId, bookingId);
      if (!context.paymentLinkEligibility.eligible) {
        throw new BadRequestException({
          message: 'Payment link is not available for this booking',
          code: 'PAYMENT_LINK_NOT_ELIGIBLE',
          reasons: context.paymentLinkEligibility.reasons,
        });
      }
    }

    const booking = await this.bookingsService.update(orgId, bookingId, {
      status: targetStatus,
      notes: stripWizardDraftMarker(existing.notes) || null,
      paymentIntent: toPrismaBookingPaymentIntent(resolvedIntent),
    }, {
      userId: options?.userId ?? null,
      eligibilityApprovalId: body.eligibilityApprovalId,
    });

    await this.bookingDepositSnapshot.freezeDepositOnSnapshot(orgId, bookingId);

    await this.bookingInvoiceLifecycle
      .syncOnBookingConfirmed(orgId, bookingId, {
        paymentIntent: resolvedIntent,
        userId: options?.userId ?? null,
      })
      .catch((err) => {
        console.error('[BookingWizardDraft] invoice sync failed', err);
      });

    let paymentFlow: WizardPaymentFlowResult | null = null;
    if (resolvedIntent === 'payment_link') {
      const actor: PermissionActor = {
        id: options?.userId ?? undefined,
        organizationId: orgId,
      };
      const context = await this.checkoutContextService.getCheckoutContext(orgId, bookingId);
      paymentFlow = await this.paymentFlowService.executePaymentLinkFlow({
        organizationId: orgId,
        bookingId,
        actor,
        recipientEmail: context.recipientEmail ?? undefined,
      });
    }

    const bundle = await this.bundleService.getBundleView(orgId, bookingId);
    const autoSend = await this.bookingLegalDocumentEmailService.maybeAutoSendFrozenBookingDocuments(
      orgId,
      bookingId,
      options?.userId ?? null,
    );

    return {
      booking,
      bundle,
      autoSend,
      paymentIntent: resolvedIntent,
      paymentFlow,
    };
  }

  private async buildIdempotentConfirmResult(
    orgId: string,
    bookingId: string,
    paymentIntent: BookingCheckoutPaymentIntent,
    userId: string | null,
  ): Promise<BookingWizardConfirmResult> {
    const booking = await this.prisma.booking.findFirstOrThrow({
      where: { id: bookingId, organizationId: orgId },
    });
    const bundle = await this.bundleService.getBundleView(orgId, bookingId);
    const autoSend = await this.bookingLegalDocumentEmailService.maybeAutoSendFrozenBookingDocuments(
      orgId,
      bookingId,
      userId,
    );
    return {
      booking,
      bundle,
      autoSend,
      paymentIntent,
      paymentFlow: null,
      idempotent: true,
    };
  }

  async abortDraft(orgId: string, bookingId: string) {
    await this.requireWizardDraft(orgId, bookingId);
    await this.generatedDocuments.voidAllForBooking(orgId, bookingId);
    await this.prisma.$transaction(async (tx) => {
      await this.pricingQuoteService.releaseQuoteFromWizardDraft(tx, orgId, bookingId);
    });
    const booking = await this.bookingsService.cancel(orgId, bookingId);
    return { booking, aborted: true };
  }

  private resolvePaymentIntent(
    value: BookingCheckoutPaymentIntent | undefined,
  ): BookingCheckoutPaymentIntent {
    if (!value || !BOOKING_CHECKOUT_PAYMENT_INTENTS.includes(value)) {
      return 'pay_on_pickup';
    }
    return value;
  }

  private async requireWizardDraft(orgId: string, bookingId: string): Promise<Booking> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (!isWizardDraftBooking(booking)) {
      throw new BadRequestException({
        message: 'Diese Buchung ist kein Checkout-Entwurf',
        code: 'BOOKING_NOT_WIZARD_DRAFT',
        bookingId,
      });
    }
    return booking;
  }

  private async refreshDraftBundle(
    orgId: string,
    bookingId: string,
    userId: string | null,
    booking?: Booking,
  ) {
    const row =
      booking ??
      (await this.prisma.booking.findFirstOrThrow({
        where: { id: bookingId, organizationId: orgId },
      }));

    await this.invoicesService.bootstrapBookingInvoice(orgId, {
        id: row.id,
        customerId: row.customerId,
        vehicleId: row.vehicleId,
        totalPriceCents: row.totalPriceCents,
        dailyRateCents: row.dailyRateCents,
        startDate: row.startDate,
        endDate: row.endDate,
        currency: row.currency,
        kmIncluded: row.kmIncluded,
      });

    const bundle = await this.bundleService.generateInitialBundle(orgId, bookingId, userId);
    return { booking: row, bundle };
  }

  private async regeneratePricingDocuments(orgId: string, bookingId: string, userId: string | null) {
    for (const type of ['BOOKING_INVOICE', 'RENTAL_CONTRACT', 'DEPOSIT_RECEIPT'] as const) {
      try {
        await this.bundleService.regenerate(orgId, bookingId, type, userId);
      } catch {
        /* best-effort */
      }
    }
  }
}
