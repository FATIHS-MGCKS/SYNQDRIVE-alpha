import { Injectable, Logger } from '@nestjs/common';
import {
  BookingPreparationArtifactStatus,
  BookingPreparationArtifactType,
  BookingStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingDocumentCompletenessService } from '@modules/documents/booking-document-completeness.service';
import { BOOKING_DOCUMENT_GENERATION_STATUS } from '@modules/documents/booking-document-generation/booking-document-generation.constants';
import { DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import { BOOKING_DOMAIN_EVENT_CONSUMER_IDS } from '../outbox/consumers/booking-domain-event-consumer.constants';
import {
  bookingPreparationDedupKey,
  bookingReturnDedupKey,
} from '@modules/tasks/automation/task-automation-rule.util';
import {
  BOOKING_PREPARATION_ALL_ARTIFACT_TYPES,
  BOOKING_PREPARATION_ARTIFACT_LABELS_DE,
  BOOKING_PREPARATION_ARTIFACT_STATUSES,
  BOOKING_PREPARATION_ARTIFACT_TYPES,
  BOOKING_PREPARATION_PICKUP_BLOCKING_ARTIFACTS,
  BOOKING_PREPARATION_RECOVERY_ACTIONS,
} from './booking-preparation.constants';
import { BookingPreparationStateRepository } from './booking-preparation-state.repository';
import type {
  BookingPreparationArtifactDto,
  BookingPreparationSnapshotDto,
} from './booking-preparation.types';

type BookingRow = {
  id: string;
  organizationId: string;
  status: BookingStatus;
  paymentIntent: string | null;
};

@Injectable()
export class BookingPreparationStateService {
  private readonly logger = new Logger(BookingPreparationStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: BookingPreparationStateRepository,
    private readonly completeness: BookingDocumentCompletenessService,
  ) {}

  async getSnapshot(orgId: string, bookingId: string): Promise<BookingPreparationSnapshotDto> {
    await this.reconcile(orgId, bookingId);
    const rows = await this.repo.findByBooking(orgId, bookingId);
    const rowByType = new Map(rows.map((r) => [r.artifactType, r]));
    const artifacts = BOOKING_PREPARATION_ALL_ARTIFACT_TYPES.map((artifactType) =>
      this.toArtifactDto(artifactType, rowByType.get(artifactType)),
    );

    const requiredArtifacts = artifacts.filter((a) => a.required);
    const missingRequired = requiredArtifacts.filter(
      (a) => a.status !== BOOKING_PREPARATION_ARTIFACT_STATUSES.READY &&
        a.status !== BOOKING_PREPARATION_ARTIFACT_STATUSES.NOT_REQUIRED,
    );
    const failed = requiredArtifacts.filter(
      (a) => a.status === BOOKING_PREPARATION_ARTIFACT_STATUSES.FAILED,
    );
    const processing = requiredArtifacts.filter(
      (a) =>
        a.status === BOOKING_PREPARATION_ARTIFACT_STATUSES.PROCESSING ||
        a.status === BOOKING_PREPARATION_ARTIFACT_STATUSES.PENDING ||
        a.status === BOOKING_PREPARATION_ARTIFACT_STATUSES.RETRY_SCHEDULED,
    );

    const blocksPickup = artifacts.some(
      (a) => a.blocksPickup && a.required && a.status !== BOOKING_PREPARATION_ARTIFACT_STATUSES.READY,
    );
    const blocksReturn = artifacts.some(
      (a) => a.blocksReturn && a.required && a.status !== BOOKING_PREPARATION_ARTIFACT_STATUSES.READY,
    );

    const pickupBlockReasons = artifacts
      .filter(
        (a) =>
          a.blocksPickup &&
          a.required &&
          a.status !== BOOKING_PREPARATION_ARTIFACT_STATUSES.READY &&
          a.status !== BOOKING_PREPARATION_ARTIFACT_STATUSES.NOT_REQUIRED,
      )
      .map((a) => `${a.label}: ${this.statusLabelDe(a.status)}${a.lastError ? ` — ${a.lastError}` : ''}`);

    let overallStatus: BookingPreparationArtifactStatus = 'READY';
    if (failed.length > 0) overallStatus = 'FAILED';
    else if (processing.length > 0) overallStatus = 'PROCESSING';
    else if (missingRequired.length > 0) overallStatus = 'PENDING';

    const updatedAt = rows.reduce(
      (max, row) => (row.updatedAt > max ? row.updatedAt : max),
      rows[0]?.updatedAt ?? new Date(),
    );

    return {
      bookingId,
      organizationId: orgId,
      overallStatus,
      isOperationallyReady: missingRequired.length === 0 && failed.length === 0,
      missingRequiredCount: missingRequired.length,
      failedCount: failed.length,
      processingCount: processing.length,
      blocksPickup,
      blocksReturn,
      pickupBlockReasons,
      artifacts,
      updatedAt: updatedAt.toISOString(),
    };
  }

  async reconcile(orgId: string, bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: {
        id: true,
        organizationId: true,
        status: true,
        paymentIntent: true,
      },
    });
    if (!booking) return;

    const [
      priceSnapshot,
      invoice,
      paymentRequests,
      docJobs,
      tasks,
      consumerReceipts,
      outboundEmails,
      rentalContract,
      bundle,
    ] = await Promise.all([
      this.prisma.bookingPriceSnapshot.findUnique({ where: { bookingId } }),
      this.prisma.orgInvoice.findFirst({
        where: { organizationId: orgId, bookingId, type: 'OUTGOING_BOOKING' },
      }),
      this.prisma.bookingPaymentRequest.findMany({
        where: { organizationId: orgId, bookingId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.bookingDocumentGenerationJob.findMany({
        where: { organizationId: orgId, bookingId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.orgTask.findMany({
        where: { organizationId: orgId, bookingId },
        select: { id: true, status: true, dedupKey: true, title: true },
      }),
      this.prisma.bookingDomainEventConsumerReceipt.findMany({
        where: {
          outboxEvent: { aggregateId: bookingId, organizationId: orgId },
        },
        orderBy: { processedAt: 'desc' },
        take: 50,
      }),
      this.prisma.outboundEmail.findMany({
        where: { organizationId: orgId, bookingId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, status: true, sourceType: true, sendIdempotencyKey: true },
      }),
      this.prisma.rentalContract.findUnique({ where: { bookingId } }),
      this.prisma.bookingDocumentBundle.findUnique({ where: { bookingId } }),
    ]);

    const completeness = bundle
      ? await this.completeness.evaluateForBooking(orgId, bookingId).catch(() => null)
      : null;

    const receiptByConsumer = new Map(
      consumerReceipts.map((r) => [r.consumerId, r]),
    );

    await this.upsertDerived(orgId, booking, BOOKING_PREPARATION_ARTIFACT_TYPES.PRICING, {
      required: !this.isTerminalBooking(booking.status),
      blocksPickup: false,
      ...this.derivePricing(booking, priceSnapshot),
    });

    await this.upsertDerived(orgId, booking, BOOKING_PREPARATION_ARTIFACT_TYPES.INVOICE, {
      required: !this.isTerminalBooking(booking.status),
      blocksPickup: true,
      ...this.deriveFromConsumerAndSource({
        consumerReceipt: receiptByConsumer.get(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.INVOICE),
        readyWhen: Boolean(invoice),
        processingWhen: this.hasActiveDocJob(docJobs, ['INITIAL_BUNDLE', 'FINAL_INVOICE']),
      }),
    });

    await this.upsertDerived(orgId, booking, BOOKING_PREPARATION_ARTIFACT_TYPES.PAYMENT, {
      required: this.paymentRequired(booking, paymentRequests),
      blocksPickup: false,
      ...this.derivePayment(booking, paymentRequests, receiptByConsumer.get(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.PAYMENT_LINK)),
    });

    await this.upsertDerived(orgId, booking, BOOKING_PREPARATION_ARTIFACT_TYPES.LEGAL_DOCUMENTS, {
      required: this.documentsRequired(booking.status),
      blocksPickup: true,
      ...this.deriveLegalDocuments(booking, completeness, docJobs, receiptByConsumer.get(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.DOCUMENT_BUNDLE)),
    });

    await this.upsertDerived(orgId, booking, BOOKING_PREPARATION_ARTIFACT_TYPES.RENTAL_AGREEMENT, {
      required: this.documentsRequired(booking.status),
      blocksPickup: true,
      ...this.deriveRentalAgreement(booking, rentalContract, docJobs, receiptByConsumer.get(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.RENTAL_AGREEMENT)),
    });

    await this.upsertDerived(orgId, booking, BOOKING_PREPARATION_ARTIFACT_TYPES.PICKUP_TASK, {
      required: booking.status === 'CONFIRMED' || booking.status === 'ACTIVE',
      blocksPickup: false,
      ...this.derivePickupTask(booking, tasks, receiptByConsumer.get(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.PICKUP_RETURN_TASKS)),
    });

    await this.upsertDerived(orgId, booking, BOOKING_PREPARATION_ARTIFACT_TYPES.RETURN_TASK, {
      required: booking.status === 'ACTIVE' || booking.status === 'COMPLETED',
      blocksPickup: false,
      blocksReturn: booking.status === 'ACTIVE',
      ...this.deriveReturnTask(booking, tasks, receiptByConsumer.get(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.PICKUP_RETURN_TASKS)),
    });

    await this.upsertDerived(orgId, booking, BOOKING_PREPARATION_ARTIFACT_TYPES.CUSTOMER_EMAIL, {
      required: booking.status === 'CONFIRMED',
      blocksPickup: false,
      ...this.deriveEmailArtifact(
        receiptByConsumer.get(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.CUSTOMER_EMAIL),
        outboundEmails.find((e) => e.sourceType === 'BOOKING_DOCUMENTS'),
      ),
    });

    await this.upsertDerived(orgId, booking, BOOKING_PREPARATION_ARTIFACT_TYPES.INTERNAL_NOTIFICATION, {
      required: booking.status === 'CONFIRMED' || booking.status === 'PENDING',
      blocksPickup: false,
      ...this.deriveEmailArtifact(
        receiptByConsumer.get(BOOKING_DOMAIN_EVENT_CONSUMER_IDS.INTERNAL_EMAIL),
        outboundEmails.find((e) => e.sendIdempotencyKey?.startsWith('booking-internal:')),
      ),
    });
  }

  async markFromConsumer(input: {
    organizationId: string;
    bookingId: string;
    artifactType: BookingPreparationArtifactType;
    status: BookingPreparationArtifactStatus;
    lastError?: string | null;
    lastErrorCode?: string | null;
    sourceRef?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: input.bookingId, organizationId: input.organizationId },
      select: { status: true },
    });
    if (!booking) return;

    const blocksPickup = BOOKING_PREPARATION_PICKUP_BLOCKING_ARTIFACTS.has(input.artifactType);
    await this.repo.upsertArtifact({
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      artifactType: input.artifactType,
      status: input.status,
      required: true,
      blocksPickup,
      lastError: input.lastError ?? null,
      lastErrorCode: input.lastErrorCode ?? null,
      sourceRef: input.sourceRef ?? null,
      metadata: (input.metadata ?? null) as Prisma.InputJsonValue | null,
      lastAttemptAt: new Date(),
      readyAt: input.status === 'READY' ? new Date() : null,
    });
  }

  async markRetryScheduled(
    orgId: string,
    bookingId: string,
    artifactType: BookingPreparationArtifactType,
    actorUserId?: string | null,
  ) {
    const existing = await this.repo.findArtifact(orgId, bookingId, artifactType);
    await this.repo.upsertArtifact({
      organizationId: orgId,
      bookingId,
      artifactType,
      status: 'RETRY_SCHEDULED',
      required: existing?.required ?? true,
      blocksPickup: existing?.blocksPickup ?? BOOKING_PREPARATION_PICKUP_BLOCKING_ARTIFACTS.has(artifactType),
      blocksReturn: existing?.blocksReturn ?? false,
      retryCount: (existing?.retryCount ?? 0) + 1,
      nextRetryAt: new Date(),
      lastAttemptAt: new Date(),
      metadata: { actorUserId: actorUserId ?? null },
    });
  }

  private async upsertDerived(
    orgId: string,
    booking: BookingRow,
    artifactType: BookingPreparationArtifactType,
    input: {
      required: boolean;
      blocksPickup: boolean;
      blocksReturn?: boolean;
      status: BookingPreparationArtifactStatus;
      lastError?: string | null;
      lastErrorCode?: string | null;
      sourceRef?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    const status = input.required
      ? input.status
      : BOOKING_PREPARATION_ARTIFACT_STATUSES.NOT_REQUIRED;

    await this.repo.upsertArtifact({
      organizationId: orgId,
      bookingId: booking.id,
      artifactType,
      status,
      required: input.required,
      blocksPickup: input.required ? input.blocksPickup : false,
      blocksReturn: input.required ? (input.blocksReturn ?? false) : false,
      lastError: input.lastError ?? null,
      lastErrorCode: input.lastErrorCode ?? null,
      sourceRef: input.sourceRef ?? null,
      metadata: (input.metadata ?? null) as Prisma.InputJsonValue | null,
      readyAt: status === 'READY' ? new Date() : null,
      lastAttemptAt: new Date(),
    });
  }

  private derivePricing(
    booking: BookingRow,
    priceSnapshot: { id: string } | null,
  ): {
    status: BookingPreparationArtifactStatus;
    lastError?: string | null;
  } {
    if (this.isTerminalBooking(booking.status)) {
      return { status: 'NOT_REQUIRED' };
    }
    if (priceSnapshot) return { status: 'READY' };
    return { status: 'PENDING', lastError: 'Preis-Snapshot fehlt' };
  }

  private deriveFromConsumerAndSource(input: {
    consumerReceipt?: { status: string; lastError: string | null; id: string };
    readyWhen: boolean;
    processingWhen: boolean;
  }) {
    if (input.readyWhen) return { status: 'READY' as const, sourceRef: input.consumerReceipt?.id };
    if (input.consumerReceipt?.status === 'FAILED') {
      return {
        status: 'FAILED' as const,
        lastError: input.consumerReceipt.lastError,
        sourceRef: input.consumerReceipt.id,
      };
    }
    if (input.processingWhen || input.consumerReceipt?.status === 'SUCCEEDED') {
      return { status: 'PROCESSING' as const, sourceRef: input.consumerReceipt?.id };
    }
    return { status: 'PENDING' as const };
  }

  private derivePayment(
    booking: BookingRow,
    paymentRequests: Array<{ id: string; status: string; sendEmailOnLink: boolean }>,
    receipt?: { status: string; lastError: string | null; id: string },
  ) {
    if (!this.paymentRequired(booking, paymentRequests)) {
      return { status: 'NOT_REQUIRED' as const };
    }
    const latest = paymentRequests[0];
    if (!latest) return { status: 'PENDING' as const };
    if (['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(latest.status)) {
      return { status: 'READY' as const, sourceRef: latest.id };
    }
    if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(latest.status)) {
      return {
        status: 'FAILED' as const,
        lastError: `Zahlungsanfrage ${latest.status}`,
        sourceRef: latest.id,
      };
    }
    if (receipt?.status === 'FAILED') {
      return {
        status: 'FAILED' as const,
        lastError: receipt.lastError,
        sourceRef: receipt.id,
      };
    }
    return { status: 'PROCESSING' as const, sourceRef: latest.id };
  }

  private deriveLegalDocuments(
    booking: BookingRow,
    completeness: Awaited<ReturnType<BookingDocumentCompletenessService['evaluateForBooking']>> | null,
    docJobs: Array<{ status: string; jobType: string }>,
    receipt?: { status: string; lastError: string | null; id: string },
  ) {
    if (!this.documentsRequired(booking.status)) return { status: 'NOT_REQUIRED' as const };
    const legalTypes = [
      DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      DOCUMENT_TYPE.CONSUMER_INFORMATION,
      DOCUMENT_TYPE.PRIVACY_POLICY,
    ];
    const missingLegal = completeness?.missingItems?.filter((m: { documentType: string }) =>
      legalTypes.includes(m.documentType as typeof DOCUMENT_TYPE.TERMS_AND_CONDITIONS),
    );
    if (completeness && (!missingLegal || missingLegal.length === 0)) {
      return { status: 'READY' as const };
    }
    const failedJob = docJobs.find((j) => j.status === BOOKING_DOCUMENT_GENERATION_STATUS.FAILED_FINAL);
    if (failedJob || receipt?.status === 'FAILED') {
      return {
        status: 'FAILED' as const,
        lastError: receipt?.lastError ?? 'Dokumentenerzeugung fehlgeschlagen',
        sourceRef: receipt?.id,
      };
    }
    if (this.hasActiveDocJob(docJobs, ['INITIAL_BUNDLE'])) {
      return { status: 'PROCESSING' as const };
    }
    return {
      status: 'PENDING' as const,
      lastError: missingLegal?.[0]?.reason ?? 'Rechtliche Dokumente unvollständig',
    };
  }

  private deriveRentalAgreement(
    booking: BookingRow,
    rentalContract: { id: string; generatedDocumentId: string | null } | null,
    docJobs: Array<{ status: string; jobType: string }>,
    receipt?: { status: string; lastError: string | null; id: string },
  ) {
    if (!this.documentsRequired(booking.status)) return { status: 'NOT_REQUIRED' as const };
    if (rentalContract?.generatedDocumentId) return { status: 'READY' as const, sourceRef: rentalContract.id };
    if (receipt?.status === 'FAILED') {
      return {
        status: 'FAILED' as const,
        lastError: receipt.lastError,
        sourceRef: receipt.id,
      };
    }
    if (this.hasActiveDocJob(docJobs, ['INITIAL_BUNDLE', 'REGENERATE'])) {
      return { status: 'PROCESSING' as const };
    }
    return { status: 'PENDING' as const, lastError: 'Mietvertrag noch nicht erzeugt' };
  }

  private derivePickupTask(
    booking: BookingRow,
    tasks: Array<{ status: string; dedupKey: string | null }>,
    receipt?: { status: string; lastError: string | null; id: string },
  ) {
    if (booking.status !== 'CONFIRMED' && booking.status !== 'ACTIVE') {
      return { status: 'NOT_REQUIRED' as const };
    }
    const prepKey = bookingPreparationDedupKey(booking.id);
    const prepTask = tasks.find((t) => t.dedupKey === prepKey);
    if (prepTask && !['CANCELLED', 'FAILED'].includes(prepTask.status)) {
      return { status: 'READY' as const };
    }
    if (receipt?.status === 'FAILED') {
      return { status: 'FAILED' as const, lastError: receipt.lastError, sourceRef: receipt.id };
    }
    if (booking.status === 'CONFIRMED') {
      return {
        status: (prepTask ? 'PROCESSING' : 'PENDING') as BookingPreparationArtifactStatus,
        lastError: prepTask ? null : 'Pickup-Aufgabe fehlt',
      };
    }
    return { status: 'READY' as const };
  }

  private deriveReturnTask(
    booking: BookingRow,
    tasks: Array<{ status: string; dedupKey: string | null }>,
    receipt?: { status: string; lastError: string | null; id: string },
  ) {
    if (booking.status !== 'ACTIVE' && booking.status !== 'COMPLETED') {
      return { status: 'NOT_REQUIRED' as const };
    }
    const returnKey = bookingReturnDedupKey(booking.id);
    const returnTask = tasks.find((t) => t.dedupKey === returnKey);
    if (returnTask && !['CANCELLED', 'FAILED'].includes(returnTask.status)) {
      return { status: 'READY' as const };
    }
    if (receipt?.status === 'FAILED') {
      return { status: 'FAILED' as const, lastError: receipt.lastError, sourceRef: receipt.id };
    }
    if (booking.status === 'ACTIVE') {
      return {
        status: (returnTask ? 'PROCESSING' : 'PENDING') as BookingPreparationArtifactStatus,
        lastError: returnTask ? null : 'Rückgabe-Aufgabe fehlt',
      };
    }
    return { status: 'READY' as const };
  }

  private deriveEmailArtifact(
    receipt?: { status: string; lastError: string | null; id: string; metadata: unknown },
    outbound?: { id: string; status: string } | null,
  ) {
    if (outbound && ['SENT', 'SENT_SIMULATED', 'DELIVERED'].includes(outbound.status)) {
      return { status: 'READY' as const, sourceRef: outbound.id };
    }
    if (receipt?.status === 'SKIPPED') return { status: 'NOT_REQUIRED' as const, sourceRef: receipt.id };
    if (receipt?.status === 'FAILED') {
      return { status: 'FAILED' as const, lastError: receipt.lastError, sourceRef: receipt.id };
    }
    if (receipt?.status === 'SUCCEEDED') return { status: 'READY' as const, sourceRef: receipt.id };
    return { status: 'PENDING' as const };
  }

  private toArtifactDto(
    artifactType: BookingPreparationArtifactType,
    row?: {
      status: BookingPreparationArtifactStatus;
      required: boolean;
      blocksPickup: boolean;
      blocksReturn: boolean;
      lastError: string | null;
      lastErrorCode: string | null;
      lastAttemptAt: Date | null;
      readyAt: Date | null;
      retryCount: number;
      nextRetryAt: Date | null;
    },
  ): BookingPreparationArtifactDto {
    const status = row?.status ?? BOOKING_PREPARATION_ARTIFACT_STATUSES.PENDING;
    const recoverable =
      status === BOOKING_PREPARATION_ARTIFACT_STATUSES.FAILED ||
      status === BOOKING_PREPARATION_ARTIFACT_STATUSES.RETRY_SCHEDULED;

    return {
      artifactType,
      label: BOOKING_PREPARATION_ARTIFACT_LABELS_DE[artifactType],
      status,
      required: row?.required ?? true,
      blocksPickup: row?.blocksPickup ?? BOOKING_PREPARATION_PICKUP_BLOCKING_ARTIFACTS.has(artifactType),
      blocksReturn: row?.blocksReturn ?? false,
      lastError: row?.lastError ?? null,
      lastErrorCode: row?.lastErrorCode ?? null,
      lastAttemptAt: row?.lastAttemptAt?.toISOString() ?? null,
      readyAt: row?.readyAt?.toISOString() ?? null,
      retryCount: row?.retryCount ?? 0,
      nextRetryAt: row?.nextRetryAt?.toISOString() ?? null,
      recoverable,
      recoveryAction: this.recoveryActionFor(artifactType),
    };
  }

  private recoveryActionFor(artifactType: BookingPreparationArtifactType) {
    switch (artifactType) {
      case BOOKING_PREPARATION_ARTIFACT_TYPES.INVOICE:
        return BOOKING_PREPARATION_RECOVERY_ACTIONS.RETRY_INVOICE;
      case BOOKING_PREPARATION_ARTIFACT_TYPES.LEGAL_DOCUMENTS:
      case BOOKING_PREPARATION_ARTIFACT_TYPES.RENTAL_AGREEMENT:
        return BOOKING_PREPARATION_RECOVERY_ACTIONS.RETRY_DOCUMENT;
      case BOOKING_PREPARATION_ARTIFACT_TYPES.CUSTOMER_EMAIL:
      case BOOKING_PREPARATION_ARTIFACT_TYPES.INTERNAL_NOTIFICATION:
        return BOOKING_PREPARATION_RECOVERY_ACTIONS.RETRY_EMAIL;
      case BOOKING_PREPARATION_ARTIFACT_TYPES.PICKUP_TASK:
      case BOOKING_PREPARATION_ARTIFACT_TYPES.RETURN_TASK:
        return BOOKING_PREPARATION_RECOVERY_ACTIONS.REBUILD_TASKS;
      default:
        return null;
    }
  }

  private statusLabelDe(status: BookingPreparationArtifactStatus): string {
    switch (status) {
      case 'READY':
        return 'bereit';
      case 'FAILED':
        return 'fehlgeschlagen';
      case 'PROCESSING':
        return 'in Bearbeitung';
      case 'RETRY_SCHEDULED':
        return 'Wiederholung geplant';
      case 'NOT_REQUIRED':
        return 'nicht erforderlich';
      default:
        return 'ausstehend';
    }
  }

  private isTerminalBooking(status: BookingStatus): boolean {
    return status === 'CANCELLED' || status === 'NO_SHOW';
  }

  private documentsRequired(status: BookingStatus): boolean {
    return status === 'PENDING' || status === 'CONFIRMED' || status === 'ACTIVE' || status === 'COMPLETED';
  }

  private paymentRequired(
    booking: BookingRow,
    paymentRequests: Array<{ id: string }>,
  ): boolean {
    return Boolean(booking.paymentIntent) || paymentRequests.length > 0;
  }

  private hasActiveDocJob(
    jobs: Array<{ status: string; jobType: string }>,
    types: string[],
  ): boolean {
    return jobs.some(
      (j) =>
        types.includes(j.jobType) &&
        [
          BOOKING_DOCUMENT_GENERATION_STATUS.PENDING,
          BOOKING_DOCUMENT_GENERATION_STATUS.PROCESSING,
          BOOKING_DOCUMENT_GENERATION_STATUS.FAILED_RETRYABLE,
        ].includes(j.status as typeof BOOKING_DOCUMENT_GENERATION_STATUS.PENDING),
    );
  }
}
