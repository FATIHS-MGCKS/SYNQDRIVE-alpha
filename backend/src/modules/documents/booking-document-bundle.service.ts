import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Booking,
  BookingDeposit,
  BookingDocumentBundle,
  BookingHandoverProtocol,
  Customer,
  GeneratedDocument,
  Organization,
  RentalContract,
  Vehicle,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { InvoicesService } from '@modules/invoices/invoices.service';
import { GeneratedDocumentsService } from './generated-documents.service';
import { LegalDocumentsService } from './legal-documents.service';
import { LegalDocumentResolverService } from './legal-document-resolver.service';
import { DocumentNumberingService } from './document-numbering.service';
import { DOCUMENT_RENDERER, DocumentRenderer, RenderableDocument } from './renderers/render-model';
import {
  BUNDLE_STATUS,
  DOCUMENT_ORIGIN,
  DOCUMENT_STATUS,
  DOCUMENT_TITLE_DE,
  DOCUMENT_TYPE,
  DocumentType,
  legalDocumentTitleDe,
} from './documents.constants';
import {
  BookingInfo,
  CustomerInfo,
  OrgInfo,
  VehicleInfo,
  bookingRef,
} from './templates/template-helpers';
import { formatStationAddress, stationToDocumentInfo } from '@modules/stations/station.types';
import { Station } from '@prisma/client';
import { buildBookingInvoiceDocument, InvoiceLineItem } from './templates/booking-invoice.template';
import { buildDepositReceiptDocument } from './templates/deposit-receipt.template';
import { buildRentalContractDocument } from './templates/rental-contract.template';
import { buildPickupHandoverDocument, HandoverContext } from './templates/pickup-handover.template';
import { buildReturnHandoverDocument } from './templates/return-handover.template';
import { buildFinalInvoiceDocument, FinalInvoiceLineItem } from './templates/final-invoice.template';
import { TaskAutomationService } from '@modules/tasks/task-automation.service';
import {
  bookingDocumentPackageDedupKey,
  documentPhaseForBookingStatus,
} from './booking-document-phase.util';
import { BookingDocumentOrgLegalNotificationService } from './booking-document-org-legal-notification.service';
import { LegalDocumentOperationalNotificationService } from './notifications/legal-document-operational-notification.service';
import { sanitizeAutomationError } from '@modules/tasks/outbox/task-automation-outbox-error.util';
import {
  BUNDLE_LEGAL_DOCUMENT_SLOT_TYPES,
  BUNDLE_GENERATED_POINTER_FIELD,
  bundlePointerValue,
  canonicalBundleLegalSlotType,
  resolveBundlePointerField,
  type BundleLegalDocumentSlotType,
} from './booking-document-bundle-pointer.mapping';
import {
  BookingDocumentBundlePointerMappingError,
  BookingDocumentBundleResolverConflictError,
} from './booking-document-bundle.errors';
import { BookingDocumentBundleMonitoringService } from './booking-document-bundle-monitoring.service';
import { BookingDocumentCompletenessService } from './booking-document-completeness.service';
import { RentalContractService } from './rental-contract.service';
import {
  completenessLegalMissingDocumentTypes,
  completenessToBundleViewWarnings,
  completenessToLegacyMissingLegalLabels,
} from './booking-document-completeness.engine';
import type { BundleCompletenessResult } from './booking-document-completeness.types';

const TEMPLATE_VERSION = '1';

type BookingWithRelations = Booking & {
  customer: Customer;
  vehicle: Vehicle;
  organization: Organization;
  pickupStation?: Station | null;
  returnStation?: Station | null;
};

export interface BundleLegalPointerView {
  termsAttached: boolean;
  privacyAttached: boolean;
  consumerAttached: boolean;
  /** @deprecated Use consumerAttached — kept for API compatibility */
  withdrawalAttached: boolean;
  termsDocumentId: string | null;
  privacyDocumentId: string | null;
  consumerDocumentId: string | null;
  missing: DocumentType[];
}

export interface BundleView {
  bundle: {
    id: string;
    bookingId: string;
    status: string;
    generatedAt: string | null;
    lastError: string | null;
  };
  documents: ReturnType<GeneratedDocumentsService['toDto']>[];
  legal: BundleLegalPointerView;
  missingLegalDocuments: string[];
  warnings: string[];
  completeness: BundleCompletenessResult;
}

/**
 * Orchestrates the per-booking document bundle. Business modules own the data;
 * this service renders, stores, versions and tracks documents. Generation is
 * idempotent (existing non-void documents are reused unless `force`), never
 * blocks the booking/handover flow (callers fire-and-forget), and degrades to a
 * PARTIAL bundle (with a clear warning) when required org legal texts are missing.
 */
@Injectable()
export class BookingDocumentBundleService {
  private readonly logger = new Logger(BookingDocumentBundleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly generatedDocs: GeneratedDocumentsService,
    private readonly legalDocs: LegalDocumentsService,
    private readonly legalResolver: LegalDocumentResolverService,
    private readonly numbering: DocumentNumberingService,
    private readonly invoices: InvoicesService,
    @Inject(DOCUMENT_RENDERER) private readonly renderer: DocumentRenderer,
    private readonly taskAutomation: TaskAutomationService,
    private readonly orgLegalNotification: BookingDocumentOrgLegalNotificationService,
    private readonly operationalNotifications: LegalDocumentOperationalNotificationService,
    private readonly bundleMonitoring: BookingDocumentBundleMonitoringService,
    private readonly bundleCompleteness: BookingDocumentCompletenessService,
    private readonly rentalContract: RentalContractService,
  ) {}

  private get generationEnabled(): boolean {
    return this.config.get<boolean>('documents.generationEnabled', true);
  }

  private runBackgroundTask(label: string, work: Promise<void>): void {
    void work.catch((err: unknown) => {
      this.logger.error(`${label}: ${sanitizeAutomationError(err)}`);
    });
  }

  // ── bundle lifecycle ───────────────────────────────────────────────────

  async getOrCreateBundle(orgId: string, bookingId: string): Promise<BookingDocumentBundle> {
    const existing = await this.prisma.bookingDocumentBundle.findUnique({ where: { bookingId } });
    if (existing) {
      if (existing.organizationId !== orgId) throw new NotFoundException('Booking not found');
      return existing;
    }
    // Verify the booking belongs to the org before creating a bundle for it.
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: { id: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    try {
      return await this.prisma.bookingDocumentBundle.create({
        data: { organizationId: orgId, bookingId, status: BUNDLE_STATUS.PENDING },
      });
    } catch {
      // Concurrent create — fetch the row the other request inserted.
      const row = await this.prisma.bookingDocumentBundle.findUnique({ where: { bookingId } });
      if (!row) throw new NotFoundException('Booking not found');
      return row;
    }
  }

  async getBundleView(orgId: string, bookingId: string): Promise<BundleView> {
    const bundle = await this.getOrCreateBundle(orgId, bookingId);
    const documents = await this.generatedDocs.listForBooking(orgId, bookingId);
    const completeness = await this.bundleCompleteness.evaluateForBooking(orgId, bookingId, {
      generationError: bundle.lastError,
    });

    const missing = completenessLegalMissingDocumentTypes(completeness);
    const termsAttached = completeness.legal.terms.present;
    const consumerAttached = completeness.legal.consumer.present;
    const privacyAttached = completeness.legal.privacy.present;
    const warnings = completenessToBundleViewWarnings(completeness);

    return {
      bundle: {
        id: bundle.id,
        bookingId: bundle.bookingId,
        status: bundle.status,
        generatedAt: bundle.generatedAt ? bundle.generatedAt.toISOString() : null,
        lastError: bundle.lastError,
      },
      documents: documents.map((d) => this.generatedDocs.toDto(d)),
      legal: {
        termsAttached,
        privacyAttached,
        consumerAttached,
        withdrawalAttached: consumerAttached,
        termsDocumentId: bundle.termsDocumentId,
        privacyDocumentId: bundle.privacyDocumentId,
        consumerDocumentId: bundle.withdrawalDocumentId,
        missing,
      },
      missingLegalDocuments: completenessToLegacyMissingLegalLabels(completeness),
      warnings,
      completeness,
    };
  }

  /**
   * Generates the documents required at the CONFIRMED stage: booking invoice,
   * deposit receipt, rental contract, plus attaches the active AGB + Widerruf.
   * Idempotent — reuses existing documents. Returns the refreshed bundle view.
   */
  async generateInitialBundle(
    orgId: string,
    bookingId: string,
    userId?: string | null,
  ): Promise<BundleView> {
    const lockKey = `bundle-gen:${bookingId}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_lock(hashtext(${lockKey}))`;
    try {
      return await this.generateInitialBundleLocked(orgId, bookingId, userId);
    } finally {
      await this.prisma.$executeRaw`SELECT pg_advisory_unlock(hashtext(${lockKey}))`;
    }
  }

  private async generateInitialBundleLocked(
    orgId: string,
    bookingId: string,
    userId?: string | null,
  ): Promise<BundleView> {
    const bundle = await this.getOrCreateBundle(orgId, bookingId);
    if (!this.generationEnabled) {
      return this.getBundleView(orgId, bookingId);
    }

    const booking = await this.loadBooking(orgId, bookingId);
    let lastError: string | null = null;

    try {
      await this.attachLegalDocuments(orgId, bundle, booking, userId);
    } catch (err) {
      lastError = this.shortError(err);
      this.logger.warn(
        `generateInitialBundle(${bookingRef(bookingId)}) legal attach error: ${lastError}`,
      );
    }

    try {
      await this.ensureBookingInvoice(orgId, bundle, booking, userId, false);
      await this.ensureDepositReceipt(orgId, bundle, booking, userId, false);
      await this.ensureRentalContract(orgId, bundle, booking, userId, false);
    } catch (err) {
      const renderError = this.shortError(err);
      lastError = lastError ? `${lastError}; ${renderError}` : renderError;
      this.logger.warn(`generateInitialBundle(${bookingRef(bookingId)}) error: ${renderError}`);
    }

    await this.refreshBundleStatus(orgId, bookingId, booking.status, lastError);
    return this.getBundleView(orgId, bookingId);
  }

  /** Regenerate a single document type (creates a NEW document + updates the pointer). */
  async regenerate(
    orgId: string,
    bookingId: string,
    documentType: string,
    userId?: string | null,
  ): Promise<BundleView> {
    const bundle = await this.getOrCreateBundle(orgId, bookingId);
    const booking = await this.loadBooking(orgId, bookingId);

    switch (documentType) {
      case DOCUMENT_TYPE.BOOKING_INVOICE:
        await this.ensureBookingInvoice(orgId, bundle, booking, userId, true);
        break;
      case DOCUMENT_TYPE.DEPOSIT_RECEIPT:
        await this.ensureDepositReceipt(orgId, bundle, booking, userId, true);
        break;
      case DOCUMENT_TYPE.RENTAL_CONTRACT:
        await this.ensureRentalContract(orgId, bundle, booking, userId, true);
        break;
      case DOCUMENT_TYPE.TERMS_AND_CONDITIONS:
      case DOCUMENT_TYPE.CONSUMER_INFORMATION:
      case DOCUMENT_TYPE.WITHDRAWAL_INFORMATION:
      case DOCUMENT_TYPE.PRIVACY_POLICY:
        await this.attachLegalDocuments(orgId, bundle, booking, userId, true);
        break;
      case DOCUMENT_TYPE.FINAL_INVOICE:
        await this.generateFinalInvoiceAndDocument(orgId, bookingId, userId, true);
        break;
      default:
        // Handover protocols are regenerated via their own handover-bound path;
        // a regenerate here would lack a protocol id. Surface a clear message.
        throw new NotFoundException(`Document type ${documentType} cannot be regenerated here`);
    }

    await this.refreshBundleStatus(orgId, bookingId, booking.status, null);
    return this.getBundleView(orgId, bookingId);
  }

  // ── individual document generators ───────────────────────────────────────

  async generatePickupProtocolDocument(
    orgId: string,
    bookingId: string,
    handoverProtocolId: string,
    userId?: string | null,
  ): Promise<GeneratedDocument | null> {
    if (!this.generationEnabled) return null;
    const bundle = await this.getOrCreateBundle(orgId, bookingId);
    const booking = await this.loadBooking(orgId, bookingId);
    const protocol = await this.loadProtocol(orgId, bookingId, handoverProtocolId);
    if (!protocol) return null;

    const ctx: HandoverContext = this.handoverContext(booking, protocol);
    const doc = await this.renderAndStore({
      orgId,
      booking,
      documentType: DOCUMENT_TYPE.HANDOVER_PICKUP,
      renderable: buildPickupHandoverDocument({ ...ctx, documentNumber: await this.numbering.nextNumber(orgId, DOCUMENT_TYPE.HANDOVER_PICKUP) }),
      userId,
      links: { handoverProtocolId: protocol.id },
      snapshot: { kind: 'HANDOVER_PICKUP', odometerKm: protocol.odometerKm },
    });
    await this.setBundlePointer(bundle, DOCUMENT_TYPE.HANDOVER_PICKUP, doc.id);
    await this.refreshBundleStatus(orgId, bookingId, booking.status, null);
    return doc;
  }

  async generateReturnProtocolDocument(
    orgId: string,
    bookingId: string,
    handoverProtocolId: string,
    userId?: string | null,
  ): Promise<GeneratedDocument | null> {
    if (!this.generationEnabled) return null;
    const bundle = await this.getOrCreateBundle(orgId, bookingId);
    const booking = await this.loadBooking(orgId, bookingId);
    const protocol = await this.loadProtocol(orgId, bookingId, handoverProtocolId);
    if (!protocol) return null;

    const pickup = await this.prisma.bookingHandoverProtocol.findFirst({
      where: { bookingId, kind: 'PICKUP' },
      select: { odometerKm: true },
    });
    const base = this.handoverContext(booking, protocol);
    const doc = await this.renderAndStore({
      orgId,
      booking,
      documentType: DOCUMENT_TYPE.HANDOVER_RETURN,
      renderable: buildReturnHandoverDocument({
        ...base,
        documentNumber: await this.numbering.nextNumber(orgId, DOCUMENT_TYPE.HANDOVER_RETURN),
        pickupOdometerKm: pickup?.odometerKm ?? null,
        kmDriven: booking.kmDriven ?? (pickup ? protocol.odometerKm - pickup.odometerKm : null),
      }),
      userId,
      links: { handoverProtocolId: protocol.id },
      snapshot: { kind: 'HANDOVER_RETURN', odometerKm: protocol.odometerKm },
    });
    await this.setBundlePointer(bundle, DOCUMENT_TYPE.HANDOVER_RETURN, doc.id);
    await this.refreshBundleStatus(orgId, bookingId, booking.status, null);
    return doc;
  }

  /** Final invoice (Schlussrechnung) + PDF after return. Reuses an existing final invoice unless forced. */
  async generateFinalInvoiceAndDocument(
    orgId: string,
    bookingId: string,
    userId?: string | null,
    force = false,
  ): Promise<GeneratedDocument | null> {
    if (!this.generationEnabled) return null;
    const bundle = await this.getOrCreateBundle(orgId, bookingId);
    const existing = await this.existingBundleDoc(orgId, bundle, DOCUMENT_TYPE.FINAL_INVOICE);
    if (existing && !force) return existing;

    const booking = await this.loadBooking(orgId, bookingId);
    const deposit = await this.prisma.bookingDeposit.findUnique({ where: { bookingId } });
    const originalInvoice = await this.prisma.orgInvoice.findFirst({
      where: { organizationId: orgId, bookingId, type: 'OUTGOING_BOOKING' },
      orderBy: { createdAt: 'asc' },
    });

    const returnProto = await this.prisma.bookingHandoverProtocol.findFirst({
      where: { bookingId, kind: 'RETURN' },
      select: { odometerKm: true },
    });
    const pickupProto = await this.prisma.bookingHandoverProtocol.findFirst({
      where: { bookingId, kind: 'PICKUP' },
      select: { odometerKm: true },
    });

    const kmDriven =
      booking.kmDriven ??
      (returnProto && pickupProto ? returnProto.odometerKm - pickupProto.odometerKm : null);
    const extraKm =
      booking.kmIncluded != null && kmDriven != null ? Math.max(0, kmDriven - booking.kmIncluded) : 0;

    const lineItems: FinalInvoiceLineItem[] = [];
    if (extraKm > 0) {
      const extraKmPriceCents =
        booking.vehicle?.extraKmPrice != null
          ? Math.round(booking.vehicle.extraKmPrice * 100)
          : booking.dailyRateCents != null
            ? Math.max(10, Math.round(booking.dailyRateCents * 0.15))
            : 25;
      const extraTotal = extraKm * extraKmPriceCents;
      lineItems.push({
        description: `Mehrkilometer (${extraKm} km)`,
        totalCents: extraTotal,
      });
    }
    const chargesTotalCents = lineItems.reduce((s, l) => s + l.totalCents, 0);
    const depositReceivedCents =
      deposit && (deposit.status === 'RECEIVED' || deposit.status === 'PARTIALLY_USED')
        ? deposit.amountCents
        : 0;
    const retainedCents = deposit?.retainedAmountCents ?? 0;
    const refundCents = depositReceivedCents > 0 ? Math.max(0, depositReceivedCents - retainedCents) : 0;
    const balanceCents = chargesTotalCents - retainedCents; // >0 owed, <0 refund

    // Persist an OUTGOING_FINAL OrgInvoice (direct create — keeps invoice CRUD
    // intact and avoids the booking-invoice task side effect).
    const finalInvoice = await this.upsertFinalInvoice(orgId, booking, originalInvoice?.id ?? null, chargesTotalCents);

    const cur = (booking.currency || 'EUR').toUpperCase();
    const renderable = buildFinalInvoiceDocument({
      org: this.orgInfo(booking.organization),
      customer: this.customerInfo(booking.customer),
      vehicle: this.vehicleInfo(booking.vehicle),
      booking: this.bookingInfo(booking),
      documentNumber: await this.numbering.nextNumber(orgId, DOCUMENT_TYPE.FINAL_INVOICE),
      originalInvoiceRef: originalInvoice ? `#${originalInvoice.invoiceNumber}` : null,
      currency: cur,
      pickupOdometerKm: pickupProto?.odometerKm ?? null,
      returnOdometerKm: returnProto?.odometerKm ?? null,
      kmIncluded: booking.kmIncluded ?? null,
      kmDriven,
      extraKm,
      lineItems,
      chargesTotalCents,
      depositReceivedCents,
      retainedCents,
      refundCents,
      balanceCents,
    });

    const doc = await this.renderAndStore({
      orgId,
      booking,
      documentType: DOCUMENT_TYPE.FINAL_INVOICE,
      renderable,
      userId,
      links: { invoiceId: finalInvoice.id },
      snapshot: { kind: 'FINAL_INVOICE', chargesTotalCents, depositReceivedCents, retainedCents, refundCents, balanceCents },
    });
    if (existing && force) await this.generatedDocs.voidDocument(orgId, existing.id);
    await this.setBundlePointer(bundle, DOCUMENT_TYPE.FINAL_INVOICE, doc.id);
    await this.refreshBundleStatus(orgId, bookingId, booking.status, null);
    return doc;
  }

  // ── ensure-* (idempotent) ────────────────────────────────────────────────

  private async ensureBookingInvoice(
    orgId: string,
    bundle: BookingDocumentBundle,
    booking: BookingWithRelations,
    userId: string | null | undefined,
    force: boolean,
  ): Promise<void> {
    const existing = await this.existingBundleDoc(orgId, bundle, DOCUMENT_TYPE.BOOKING_INVOICE);
    if (existing && !force) return;

    // Reuse the booking invoice the bookings flow already created; create one
    // via the existing service only if absent. Never create a duplicate.
    let invoice = await this.prisma.orgInvoice.findFirst({
      where: { organizationId: orgId, bookingId: booking.id, type: 'OUTGOING_BOOKING' },
      orderBy: { createdAt: 'asc' },
    });
    if (!invoice) {
      await this.invoices.bootstrapBookingInvoice(orgId, {
          id: booking.id,
          customerId: booking.customerId,
          vehicleId: booking.vehicleId,
          totalPriceCents: booking.totalPriceCents,
          dailyRateCents: booking.dailyRateCents,
          startDate: booking.startDate,
          endDate: booking.endDate,
          currency: booking.currency,
          kmIncluded: booking.kmIncluded,
        });
      invoice = await this.prisma.orgInvoice.findFirst({
        where: { organizationId: orgId, bookingId: booking.id, type: 'OUTGOING_BOOKING' },
        orderBy: { createdAt: 'asc' },
      });
    }

    const cur = (invoice?.currency || booking.currency || 'EUR').toUpperCase();
    const totalCents = invoice?.totalCents ?? booking.totalPriceCents ?? 0;
    const subtotalCents = invoice?.subtotalCents ?? Math.round(totalCents / 1.19);
    const taxCents = invoice?.taxCents ?? totalCents - subtotalCents;
    const lineItems = this.parseInvoiceLineItems(invoice?.lineItems, totalCents);

    const renderable = buildBookingInvoiceDocument({
      org: this.orgInfo(booking.organization),
      customer: this.customerInfo(booking.customer),
      vehicle: this.vehicleInfo(booking.vehicle),
      booking: this.bookingInfo(booking),
      documentNumber: await this.numbering.nextNumber(orgId, DOCUMENT_TYPE.BOOKING_INVOICE),
      invoiceNumberLabel: invoice ? `#${invoice.invoiceNumber}` : null,
      invoiceDate: invoice?.invoiceDate ?? new Date(),
      dueDate: invoice?.dueDate ?? null,
      lineItems,
      subtotalCents,
      taxCents,
      totalCents,
      currency: cur,
    });

    const doc = await this.renderAndStore({
      orgId,
      booking,
      documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
      renderable,
      userId,
      links: { invoiceId: invoice?.id ?? null },
      snapshot: { kind: 'BOOKING_INVOICE', invoiceId: invoice?.id ?? null, totalCents },
    });
    if (existing && force) await this.generatedDocs.voidDocument(orgId, existing.id);
    await this.setBundlePointer(bundle, DOCUMENT_TYPE.BOOKING_INVOICE, doc.id);
    if (invoice?.id) {
      await this.prisma.orgInvoice.update({
        where: { id: invoice.id },
        data: { generatedDocumentId: doc.id },
      });
    }
  }

  private async ensureDepositReceipt(
    orgId: string,
    bundle: BookingDocumentBundle,
    booking: BookingWithRelations,
    userId: string | null | undefined,
    force: boolean,
  ): Promise<void> {
    const existing = await this.existingBundleDoc(orgId, bundle, DOCUMENT_TYPE.DEPOSIT_RECEIPT);
    if (existing && !force) return;

    const deposit = await this.getOrCreateDeposit(orgId, booking);
    const cur = (deposit.currency || booking.currency || 'EUR').toUpperCase();
    const renderable = buildDepositReceiptDocument({
      org: this.orgInfo(booking.organization),
      customer: this.customerInfo(booking.customer),
      vehicle: this.vehicleInfo(booking.vehicle),
      booking: this.bookingInfo(booking),
      documentNumber: await this.numbering.nextNumber(orgId, DOCUMENT_TYPE.DEPOSIT_RECEIPT),
      amountCents: deposit.amountCents,
      currency: cur,
      status: deposit.status,
      paymentMethod: deposit.paymentMethod,
      receivedAt: deposit.receivedAt,
    });

    const doc = await this.renderAndStore({
      orgId,
      booking,
      documentType: DOCUMENT_TYPE.DEPOSIT_RECEIPT,
      renderable,
      userId,
      links: { depositId: deposit.id },
      snapshot: { kind: 'DEPOSIT_RECEIPT', amountCents: deposit.amountCents, status: deposit.status },
    });
    if (existing && force) await this.generatedDocs.voidDocument(orgId, existing.id);
    await this.prisma.bookingDeposit.update({ where: { id: deposit.id }, data: { receiptDocumentId: doc.id } });
    await this.setBundlePointer(bundle, DOCUMENT_TYPE.DEPOSIT_RECEIPT, doc.id);
  }

  private async ensureRentalContract(
    orgId: string,
    bundle: BookingDocumentBundle,
    booking: BookingWithRelations,
    userId: string | null | undefined,
    force: boolean,
  ): Promise<void> {
    const existing = await this.existingBundleDoc(orgId, bundle, DOCUMENT_TYPE.RENTAL_CONTRACT);
    const contract = await this.getOrCreateContract(orgId, booking);

    if (this.rentalContract.shouldSkipLegalSnapshotUpdate(contract) && existing && !force) {
      return;
    }
    if (existing && !force) return;

    const { refs, resolution, frozenAt } = await this.rentalContract.resolveLegalRefsForGeneration(
      orgId,
      booking.id,
      bundle,
      contract,
    );
    const legalRefs = this.rentalContract.toLegalRefsForRendering(refs);
    const pointerIds = this.rentalContract.toContractPointerIds(refs);
    const refsBySlot = new Map(refs.map((ref) => [ref.slot, ref]));
    const cur = (booking.currency || 'EUR').toUpperCase();
    const extraKmPriceCents = booking.vehicle.extraKmPrice != null ? Math.round(booking.vehicle.extraKmPrice * 100) : null;

    const renderSnapshot = {
      kind: 'RENTAL_CONTRACT',
      org: this.orgInfo(booking.organization),
      customer: this.customerInfo(booking.customer),
      vehicle: this.vehicleInfo(booking.vehicle),
      booking: this.bookingInfo(booking),
      legal: {
        terms: refsBySlot.get('TERMS')
          ? { id: refsBySlot.get('TERMS')!.legalDocumentId, versionLabel: refsBySlot.get('TERMS')!.versionLabel }
          : null,
        withdrawal: refsBySlot.get('CONSUMER')
          ? { id: refsBySlot.get('CONSUMER')!.legalDocumentId, versionLabel: refsBySlot.get('CONSUMER')!.versionLabel }
          : null,
        privacy: refsBySlot.get('PRIVACY')
          ? { id: refsBySlot.get('PRIVACY')!.legalDocumentId, versionLabel: refsBySlot.get('PRIVACY')!.versionLabel }
          : null,
      },
      generatedAt: new Date().toISOString(),
    };

    const renderable = buildRentalContractDocument({
      org: this.orgInfo(booking.organization),
      customer: this.customerInfo(booking.customer),
      vehicle: this.vehicleInfo(booking.vehicle),
      booking: this.bookingInfo(booking),
      documentNumber: contract.contractNumber ?? (await this.numbering.nextNumber(orgId, DOCUMENT_TYPE.RENTAL_CONTRACT)),
      depositAmountCents: (await this.prisma.bookingDeposit.findUnique({ where: { bookingId: booking.id } }))?.amountCents ?? null,
      extraKmPriceCents,
      currency: cur,
      legalRefs,
    });

    const contractNumber = renderable.documentNumber ?? null;
    const doc = await this.renderAndStore({
      orgId,
      booking,
      documentType: DOCUMENT_TYPE.RENTAL_CONTRACT,
      renderable,
      userId,
      documentNumber: contractNumber,
      links: { rentalContractId: contract.id },
      snapshot: renderSnapshot,
    });
    if (existing && force) await this.generatedDocs.voidDocument(orgId, existing.id);

    const legalRefsSnapshot = this.rentalContract.shouldSkipLegalSnapshotUpdate(contract)
      ? contract.legalRefsSnapshot
      : this.rentalContract.buildImmutableSnapshot(orgId, booking.id, refs, resolution, frozenAt);

    await this.prisma.rentalContract.update({
      where: { id: contract.id },
      data: {
        contractNumber,
        status: 'GENERATED',
        generatedAt: new Date(),
        generatedDocumentId: doc.id,
        termsDocumentId: pointerIds.termsDocumentId,
        withdrawalDocumentId: pointerIds.withdrawalDocumentId,
        privacyDocumentId: pointerIds.privacyDocumentId,
        snapshot: renderSnapshot as object,
        ...(this.rentalContract.shouldSkipLegalSnapshotUpdate(contract)
          ? {}
          : {
              legalRefsSnapshot: legalRefsSnapshot as object,
              legalSnapshotFrozenAt: frozenAt,
            }),
      },
    });
    await this.setBundlePointer(bundle, DOCUMENT_TYPE.RENTAL_CONTRACT, doc.id);
  }

  private async attachLegalDocuments(
    orgId: string,
    bundle: BookingDocumentBundle,
    booking: BookingWithRelations,
    userId: string | null | undefined,
    force = false,
  ): Promise<void> {
    const resolution = await this.legalResolver.resolveForBooking(orgId, booking.id);

    if (resolution.conflicts.length > 0) {
      const conflicts = resolution.conflicts.map((c) => ({
        documentType: c.documentType,
        code: c.reason,
        message: `Scope conflict between ${c.documentAId} and ${c.documentBId}`,
      }));
      this.bundleMonitoring.recordResolverConflict({
        organizationId: orgId,
        bookingId: booking.id,
        conflicts,
      });
      throw new BookingDocumentBundleResolverConflictError(orgId, booking.id, conflicts);
    }

    const selectionByType = new Map(
      resolution.selectedDocuments.map((selection) => [selection.documentType, selection]),
    );

    for (const slotType of BUNDLE_LEGAL_DOCUMENT_SLOT_TYPES) {
      const selection = selectionByType.get(slotType);
      if (!selection) {
        const missing = resolution.missingMandatoryDocuments.find(
          (m) => m.documentType === slotType,
        );
        if (missing) {
          this.bundleMonitoring.recordMissingMandatorySelection({
            organizationId: orgId,
            bookingId: booking.id,
            documentType: slotType,
            reason: missing.reason,
          });
        }
        continue;
      }

      const frozenPointerId = bundlePointerValue(bundle, slotType);
      if (frozenPointerId && !force) {
        const frozenDoc = await this.prisma.generatedDocument.findFirst({
          where: { id: frozenPointerId, organizationId: orgId, status: { not: DOCUMENT_STATUS.VOID } },
        });
        if (frozenDoc) {
          continue;
        }
      }

      const legal = await this.prisma.organizationLegalDocument.findFirst({
        where: { id: selection.legalDocumentId, organizationId: orgId },
      });
      if (!legal) {
        this.bundleMonitoring.recordMissingMandatorySelection({
          organizationId: orgId,
          bookingId: booking.id,
          documentType: slotType,
          reason: 'resolved_legal_document_not_found',
        });
        continue;
      }

      const consumerTypes =
        slotType === DOCUMENT_TYPE.CONSUMER_INFORMATION
          ? [DOCUMENT_TYPE.CONSUMER_INFORMATION, DOCUMENT_TYPE.WITHDRAWAL_INFORMATION]
          : [slotType];

      const existingActive = await this.prisma.generatedDocument.findFirst({
        where: {
          organizationId: orgId,
          bookingId: booking.id,
          documentType: { in: consumerTypes },
          status: { not: DOCUMENT_STATUS.VOID },
          legalDocumentId: legal.id,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existingActive && !force) {
        await this.setBundlePointer(bundle, slotType, existingActive.id, { force: false });
        continue;
      }

      const existing = await this.existingBundleDoc(orgId, bundle, slotType);
      if (existing && !force && existing.legalDocumentId === legal.id) {
        await this.setBundlePointer(bundle, slotType, existing.id, { force: false });
        continue;
      }

      const ref = await this.prisma.generatedDocument.create({
        data: {
          organizationId: orgId,
          documentType: legal.documentType,
          legalVariant: legal.legalVariant,
          origin: DOCUMENT_ORIGIN.STATIC_LEGAL,
          status: DOCUMENT_STATUS.GENERATED,
          bookingId: booking.id,
          customerId: booking.customerId,
          vehicleId: booking.vehicleId,
          legalDocumentId: legal.id,
          title: legal.title || legalDocumentTitleDe(legal.documentType, legal.legalVariant),
          fileName: legal.fileName,
          mimeType: legal.mimeType,
          storageProvider: legal.storageProvider,
          objectKey: legal.objectKey,
          sizeBytes: legal.sizeBytes,
          checksum: legal.checksum,
          legalVersionLabel: legal.versionLabel,
          generatedAt: new Date(),
          generatedByUserId: userId ?? null,
          metadata: {
            language: legal.language,
            jurisdiction: legal.jurisdictionCountry,
            checksum: legal.checksum,
            legalDocumentId: legal.id,
            resolverVersion: resolution.resolverVersion,
            selectionReason: selection.selectionReason,
          },
          snapshot: {
            kind: 'STATIC_LEGAL',
            legalDocumentId: legal.id,
            versionLabel: legal.versionLabel,
            language: legal.language,
            checksum: legal.checksum,
            resolvedAt: resolution.evaluatedAt,
          },
        },
      });
      if (existing && force) await this.generatedDocs.voidDocument(orgId, existing.id);
      await this.setBundlePointer(bundle, slotType, ref.id, { force });
    }
  }

  // ── status ─────────────────────────────────────────────────────────────

  private async refreshBundleStatus(
    orgId: string,
    bookingId: string,
    bookingStatus: string,
    lastError: string | null,
  ): Promise<void> {
    const bundle = await this.prisma.bookingDocumentBundle.findUnique({ where: { bookingId } });
    if (!bundle) return;

    const completeness = await this.bundleCompleteness.evaluateForBooking(orgId, bookingId, {
      generationError: lastError ?? bundle.lastError,
    });
    const status = completeness.legacyBundleStatus;
    const warning =
      completeness.blockingReasons.find((r) => r.blocking)?.message ??
      completeness.nonBlockingWarnings[0]?.message ??
      (completeness.orgConfigurationGaps.length > 0
        ? 'Rechtliche Dokumente fehlen in Administration. Das Buchungsdokumentenpaket ist unvollständig.'
        : null);

    await this.prisma.bookingDocumentBundle.update({
      where: { id: bundle.id },
      data: {
        status,
        lastError: warning,
        generatedAt: status === BUNDLE_STATUS.COMPLETE ? new Date() : bundle.generatedAt,
      },
    });

    void this.syncMissingDocumentTasks(orgId, bookingId, bookingStatus, completeness).catch((err) =>
      this.logger.warn(`syncMissingDocumentTasks(${bookingId}) failed: ${this.shortError(err)}`),
    );
  }

  /** Outbox/worker replay — reloads bundle state and syncs document-package tasks. */
  async resyncBookingDocumentTasks(orgId: string, bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: { status: true },
    });
    if (!booking) {
      throw new Error(`Booking ${bookingId} not found for org ${orgId}`);
    }
    await this.syncMissingDocumentTasks(orgId, bookingId, booking.status);
  }

  /** Materialize a single DOCUMENT_REVIEW task per booking document phase. */
  private async syncMissingDocumentTasks(
    orgId: string,
    bookingId: string,
    bookingStatus: string,
    completeness?: BundleCompletenessResult,
  ): Promise<void> {
    const bundle = await this.prisma.bookingDocumentBundle.findUnique({ where: { bookingId } });
    if (!bundle || bundle.organizationId !== orgId) return;

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: { id: true, vehicleId: true, customerId: true },
    });
    if (!booking) return;

    const evaluation =
      completeness ??
      (await this.bundleCompleteness.evaluateForBooking(orgId, bookingId, {
        generationError: bundle.lastError,
      }));

    void this.orgLegalNotification
      .syncOrgMissingLegalTemplates(orgId, evaluation.orgConfigurationGaps)
      .catch(() => {});

    void this.operationalNotifications
      .syncBundleCompleteness({
        organizationId: orgId,
        bookingId,
        bookingRef: bookingRef(bookingId),
        completeness: evaluation,
      })
      .catch(() => {});

    if (!documentPhaseForBookingStatus(bookingStatus)) {
      this.runBackgroundTask(
        `taskAutomation.supersedeBookingDocumentPackageTasks(${bookingId})`,
        this.taskAutomation.supersedeBookingDocumentPackageTasks(orgId, bookingId),
      );
      return;
    }

    const activeKeys: string[] = [];

    for (const phaseResult of evaluation.phases) {
      const dedupKey = bookingDocumentPackageDedupKey(phaseResult.phase, bookingId);
      activeKeys.push(dedupKey);
      await this.taskAutomation.syncBookingDocumentPackageTask(orgId, {
        bookingId: booking.id,
        vehicleId: booking.vehicleId,
        customerId: booking.customerId,
        phase: phaseResult.phase,
        dedupKey,
        missingDocuments: phaseResult.missingDocuments,
      });
    }

    this.runBackgroundTask(
      `taskAutomation.closeStaleDocumentPackageTasksForBooking(${bookingId})`,
      this.taskAutomation.closeStaleDocumentPackageTasksForBooking(orgId, bookingId, activeKeys),
    );
  }

  // ── helpers ───────────────────────────────────────────────────────────

  private async existingBundleDoc(
    orgId: string,
    bundle: BookingDocumentBundle,
    documentType: DocumentType,
  ): Promise<GeneratedDocument | null> {
    const pointerId = bundlePointerValue(bundle, documentType);
    if (pointerId) {
      const doc = await this.prisma.generatedDocument.findFirst({
        where: { id: pointerId, organizationId: orgId },
      });
      if (doc && doc.status !== DOCUMENT_STATUS.VOID) return doc;
    }
    const slotType = canonicalBundleLegalSlotType(documentType);
    const lookupTypes =
      slotType === DOCUMENT_TYPE.CONSUMER_INFORMATION
        ? [DOCUMENT_TYPE.CONSUMER_INFORMATION, DOCUMENT_TYPE.WITHDRAWAL_INFORMATION]
        : [documentType];
    return this.prisma.generatedDocument.findFirst({
      where: {
        organizationId: orgId,
        bookingId: bundle.bookingId,
        documentType: { in: lookupTypes },
        status: { not: DOCUMENT_STATUS.VOID },
      },
      orderBy: { createdAt: 'desc' },
    }).then((doc) => doc ?? null);
  }

  private async setBundlePointer(
    bundle: BookingDocumentBundle,
    documentType: DocumentType,
    documentId: string,
    options: { force?: boolean } = {},
  ): Promise<boolean> {
    const field = resolveBundlePointerField(documentType);
    if (!field) {
      this.bundleMonitoring.recordPointerMappingMissing({
        organizationId: bundle.organizationId,
        bookingId: bundle.bookingId,
        documentType,
      });
      throw new BookingDocumentBundlePointerMappingError(documentType);
    }

    const current = bundle[field] as string | null;
    if (current === documentId) return false;
    if (current && !options.force) {
      return false;
    }

    await this.prisma.bookingDocumentBundle.update({
      where: { id: bundle.id },
      data: { [field]: documentId },
    });
    (bundle as unknown as Record<string, string | null>)[field] = documentId;
    return true;
  }

  private async renderAndStore(args: {
    orgId: string;
    booking: BookingWithRelations;
    documentType: DocumentType;
    renderable: RenderableDocument;
    userId?: string | null;
    documentNumber?: string | null;
    links?: Partial<{
      invoiceId: string | null;
      handoverProtocolId: string | null;
      rentalContractId: string | null;
      depositId: string | null;
    }>;
    snapshot?: Record<string, unknown>;
  }): Promise<GeneratedDocument> {
    const { orgId, booking, documentType, renderable } = args;
    const fileName = `${documentType.toLowerCase()}-${bookingRef(booking.id)}.pdf`;
    const buffer = await this.renderer.renderPdf({
      document: renderable,
      fileName,
      documentType,
      organizationId: orgId,
      bookingId: booking.id,
    });

    return this.generatedDocs.createFromPdf({
      organizationId: orgId,
      documentType,
      title: `${DOCUMENT_TITLE_DE[documentType]} · ${bookingRef(booking.id)}`,
      fileName,
      buffer,
      bookingId: booking.id,
      customerId: booking.customerId,
      vehicleId: booking.vehicleId,
      invoiceId: args.links?.invoiceId ?? null,
      handoverProtocolId: args.links?.handoverProtocolId ?? null,
      rentalContractId: args.links?.rentalContractId ?? null,
      depositId: args.links?.depositId ?? null,
      documentNumber: args.documentNumber ?? renderable.documentNumber ?? null,
      templateKey: documentType,
      templateVersion: TEMPLATE_VERSION,
      generatedByUserId: args.userId ?? null,
      snapshot: args.snapshot ?? null,
    });
  }

  private async getOrCreateDeposit(orgId: string, booking: BookingWithRelations): Promise<BookingDeposit> {
    const existing = await this.prisma.bookingDeposit.findUnique({ where: { bookingId: booking.id } });
    if (existing) return existing;

    const priceSnapshot = await this.prisma.bookingPriceSnapshot.findFirst({
      where: { organizationId: orgId, bookingId: booking.id, isCurrent: true },
      select: { depositAmountCents: true, currency: true },
    });

    const extras = booking.extrasJson as Record<string, unknown> | null;
    const depositFromExtras =
      typeof extras?.depositCents === 'number' && extras.depositCents > 0
        ? Math.round(extras.depositCents)
        : null;
    const amountCents =
      priceSnapshot?.depositAmountCents ??
      depositFromExtras ??
      (booking.totalPriceCents != null && booking.totalPriceCents > 0
        ? Math.round(booking.totalPriceCents * 0.2)
        : 25_000);
    try {
      return await this.prisma.bookingDeposit.create({
        data: {
          organizationId: orgId,
          bookingId: booking.id,
          customerId: booking.customerId,
          amountCents,
          currency: ((priceSnapshot?.currency ?? booking.currency) || 'EUR').toUpperCase(),
          status: 'REQUESTED',
          reason: priceSnapshot
            ? 'Aus Booking-Preis-Snapshot (kanonischer Deposit Resolver)'
            : depositFromExtras != null
              ? 'Aus Buchungsdaten'
              : 'Standard-Kaution (20 % des Buchungswerts)',
        },
      });
    } catch {
      const row = await this.prisma.bookingDeposit.findUnique({ where: { bookingId: booking.id } });
      if (row) return row;
      throw new NotFoundException('Deposit could not be created');
    }
  }

  private async getOrCreateContract(orgId: string, booking: BookingWithRelations): Promise<RentalContract> {
    const existing = await this.prisma.rentalContract.findUnique({ where: { bookingId: booking.id } });
    if (existing) return existing;
    try {
      return await this.prisma.rentalContract.create({
        data: {
          organizationId: orgId,
          bookingId: booking.id,
          customerId: booking.customerId,
          vehicleId: booking.vehicleId,
          status: 'DRAFT',
        },
      });
    } catch {
      const row = await this.prisma.rentalContract.findUnique({ where: { bookingId: booking.id } });
      if (row) return row;
      throw new NotFoundException('Contract could not be created');
    }
  }

  private async upsertFinalInvoice(
    orgId: string,
    booking: BookingWithRelations,
    originalInvoiceId: string | null,
    totalCents: number,
  ) {
    const existing = await this.prisma.orgInvoice.findFirst({
      where: { organizationId: orgId, bookingId: booking.id, type: 'OUTGOING_FINAL' },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;
    const subtotalCents = totalCents > 0 ? Math.round(totalCents / 1.19) : 0;
    return this.prisma.orgInvoice.create({
      data: {
        organizationId: orgId,
        type: 'OUTGOING_FINAL',
        customerId: booking.customerId,
        bookingId: booking.id,
        vehicleId: booking.vehicleId,
        title: `Schlussrechnung #${bookingRef(booking.id)}`,
        description: originalInvoiceId ? `Endabrechnung zur Buchung ${bookingRef(booking.id)}` : undefined,
        subtotalCents,
        taxCents: totalCents - subtotalCents,
        totalCents,
        currency: (booking.currency || 'EUR').toUpperCase(),
        status: 'DRAFT',
      },
    });
  }

  private async loadBooking(orgId: string, bookingId: string): Promise<BookingWithRelations> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      include: {
        customer: true,
        vehicle: true,
        organization: true,
        pickupStation: true,
        returnStation: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking as BookingWithRelations;
  }

  private async loadProtocol(
    orgId: string,
    bookingId: string,
    protocolId: string,
  ): Promise<BookingHandoverProtocol | null> {
    return this.prisma.bookingHandoverProtocol.findFirst({
      where: { id: protocolId, bookingId, organizationId: orgId },
    });
  }

  private handoverContext(booking: BookingWithRelations, protocol: BookingHandoverProtocol): HandoverContext {
    const damageIds = Array.isArray(protocol.damageIds) ? (protocol.damageIds as unknown[]) : [];
    return {
      org: this.orgInfo(booking.organization),
      customer: this.customerInfo(booking.customer),
      vehicle: this.vehicleInfo(booking.vehicle),
      booking: this.bookingInfo(booking),
      performedAt: protocol.performedAt,
      performedByName: protocol.performedByName,
      odometerKm: protocol.odometerKm,
      fuelPercent: protocol.fuelPercent,
      fuelFull: protocol.fuelFull,
      exteriorClean: protocol.exteriorClean,
      interiorClean: protocol.interiorClean,
      tiresSeasonOk: protocol.tiresSeasonOk,
      warningLightsOn: protocol.warningLightsOn,
      warningLightsNotes: protocol.warningLightsNotes,
      notes: protocol.notes,
      damageCount: damageIds.length,
      documentsAcknowledged: protocol.documentsAcknowledged,
      customerSignatureName: protocol.customerSignatureName,
      customerSignatureDataUrl: protocol.customerSignatureDataUrl,
      staffSignatureName: protocol.staffSignatureName,
      staffSignatureDataUrl: protocol.staffSignatureDataUrl,
    };
  }

  private parseInvoiceLineItems(raw: unknown, fallbackTotal: number): InvoiceLineItem[] {
    if (Array.isArray(raw)) {
      const items: InvoiceLineItem[] = [];
      for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const e = entry as Record<string, unknown>;
        const total = typeof e.totalCents === 'number' ? e.totalCents : Number(e.totalCents);
        if (!Number.isFinite(total)) continue;
        items.push({
          description: typeof e.description === 'string' ? e.description : 'Position',
          quantity: typeof e.quantity === 'number' ? e.quantity : undefined,
          unitPriceCents: typeof e.unitPriceCents === 'number' ? e.unitPriceCents : undefined,
          totalCents: total,
        });
      }
      if (items.length) return items;
    }
    return [{ description: 'Fahrzeugmiete', quantity: 1, unitPriceCents: fallbackTotal, totalCents: fallbackTotal }];
  }

  private orgInfo(org: Organization): OrgInfo {
    return {
      name: org.companyName,
      address: org.address,
      city: org.city,
      zip: org.zip,
      state: org.state,
      country: org.country,
      taxId: org.taxId,
      email: org.email,
      phone: org.phone,
      website: org.website,
      logoUrl: org.logoUrl,
    };
  }

  private customerInfo(c: Customer): CustomerInfo {
    return {
      firstName: c.firstName,
      lastName: c.lastName,
      company: c.company,
      email: c.email,
      phone: c.phone,
      address: c.address,
      city: c.city,
      zip: c.zip,
      country: c.country,
      licenseNumber: c.licenseNumber,
    };
  }

  private vehicleInfo(v: Vehicle): VehicleInfo {
    return {
      make: v.make,
      model: v.model,
      year: v.year,
      licensePlate: v.licensePlate,
      vin: v.vin,
      color: v.color,
    };
  }

  private bookingInfo(b: BookingWithRelations): BookingInfo {
    const pickupLocation =
      b.pickupAddressOverride?.trim() ||
      (b.pickupStation ? formatStationAddress(stationToDocumentInfo(b.pickupStation)) : null);
    const returnLocation =
      b.returnAddressOverride?.trim() ||
      (b.returnStation ? formatStationAddress(stationToDocumentInfo(b.returnStation)) : null);

    return {
      id: b.id,
      startDate: b.startDate,
      endDate: b.endDate,
      dailyRateCents: b.dailyRateCents,
      totalPriceCents: b.totalPriceCents,
      kmIncluded: b.kmIncluded,
      kmDriven: b.kmDriven,
      currency: b.currency,
      pickupLocation,
      returnLocation,
      pickupStationName: b.pickupStation?.name ?? null,
      returnStationName: b.returnStation?.name ?? null,
      pickupStationPhone: b.pickupStation?.phone ?? null,
      returnStationPhone: b.returnStation?.phone ?? null,
      pickupStationEmail: b.pickupStation?.email ?? null,
      returnStationEmail: b.returnStation?.email ?? null,
      pickupHandoverInstructions: b.pickupStation?.handoverInstructions ?? null,
      returnInstructions: b.returnStation?.returnInstructions ?? null,
    };
  }

  private shortError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]').slice(0, 300);
  }
}
