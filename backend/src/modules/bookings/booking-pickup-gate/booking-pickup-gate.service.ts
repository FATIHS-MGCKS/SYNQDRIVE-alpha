import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingDocumentCompletenessService } from '@modules/documents/booking-document-completeness.service';
import {
  BUNDLE_COMPLETENESS_REASON_CODE,
  BUNDLE_COMPLETENESS_STATUS,
} from '@modules/documents/booking-document-completeness.constants';
import { BOOKING_DOCUMENT_GENERATION_STATUS } from '@modules/documents/booking-document-generation/booking-document-generation.constants';
import { DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import { CustomerEligibilityService } from '@modules/customers/customer-eligibility.service';
import {
  PICKUP_GATE_ALLOWED_SOURCE_STATUSES,
  PICKUP_GATE_CODE,
  PICKUP_GATE_EVENT_TYPE,
  PICKUP_GATE_NON_OVERRIDABLE_CODES,
  PICKUP_GATE_OUTCOME,
} from './booking-pickup-gate.constants';
import {
  PickupGateBlockedException,
  PickupGateOverrideDeniedException,
} from './booking-pickup-gate.errors';
import type {
  AssertPickupGateInput,
  PickupGateEvaluation,
  PickupGateRequirement,
} from './booking-pickup-gate.types';
import { BookingPickupGateAuditService } from './booking-pickup-gate-audit.service';

const ACTIVE_GENERATION_STATUSES = new Set<string>([
  BOOKING_DOCUMENT_GENERATION_STATUS.PENDING,
  BOOKING_DOCUMENT_GENERATION_STATUS.PROCESSING,
  BOOKING_DOCUMENT_GENERATION_STATUS.FAILED_RETRYABLE,
]);

const LEGAL_TYPES = [
  DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
  DOCUMENT_TYPE.CONSUMER_INFORMATION,
  DOCUMENT_TYPE.PRIVACY_POLICY,
] as const;

@Injectable()
export class BookingPickupGateService {
  private readonly logger = new Logger(BookingPickupGateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly completeness: BookingDocumentCompletenessService,
    private readonly customerEligibility: CustomerEligibilityService,
    private readonly audit: BookingPickupGateAuditService,
  ) {}

  async assertPickupAllowed(input: AssertPickupGateInput): Promise<PickupGateEvaluation> {
    const evaluation = await this.evaluatePickupGate(input);
    if (evaluation.allowed) {
      return evaluation;
    }

    const primaryCode =
      evaluation.hardBlocks[0]?.code ??
      evaluation.softBlocks[0]?.code ??
      PICKUP_GATE_CODE.BUNDLE_INCOMPLETE;

    await this.audit
      .appendBlocked({
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        eventType: PICKUP_GATE_EVENT_TYPE.BLOCKED,
        outcome: PICKUP_GATE_OUTCOME.BLOCKED,
        actor: input.actor,
        gateCode: primaryCode,
        missingRequirements: evaluation.requirements,
        correlationId: input.correlationId,
      })
      .catch((err) => {
        this.logger.warn(
          `Failed to append pickup gate blocked audit booking=${input.bookingId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    throw new PickupGateBlockedException({
      code: primaryCode,
      message: 'Pickup blocked — missing legal or document prerequisites',
      missingRequirements: evaluation.requirements,
      hardBlocks: evaluation.hardBlocks,
      softBlocks: evaluation.softBlocks,
      overrideAllowed: evaluation.softBlocks.length > 0 && evaluation.hardBlocks.length === 0,
    });
  }

  async evaluatePickupGate(input: AssertPickupGateInput): Promise<PickupGateEvaluation> {
    const requirements: PickupGateRequirement[] = [];

    this.assertActorNotManipulated(input, requirements);

    const booking = await this.prisma.booking.findFirst({
      where: { id: input.bookingId, organizationId: input.organizationId },
      select: {
        id: true,
        organizationId: true,
        customerId: true,
        vehicleId: true,
        status: true,
        startDate: true,
      },
    });
    if (!booking) {
      requirements.push(this.req(PICKUP_GATE_CODE.TENANT_MISMATCH, 'Booking not found for organization', false));
      return this.buildEvaluation(requirements, false);
    }

    if (!PICKUP_GATE_ALLOWED_SOURCE_STATUSES.includes(booking.status as 'CONFIRMED')) {
      requirements.push(
        this.req(
          PICKUP_GATE_CODE.WRONG_BOOKING_STATUS,
          `Pickup requires booking status CONFIRMED (current: ${booking.status})`,
          false,
        ),
      );
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: booking.customerId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!customer) {
      requirements.push(
        this.req(PICKUP_GATE_CODE.CUSTOMER_TENANT_MISMATCH, 'Customer does not belong to organization', false),
      );
    }

    const crossTenantDocs = await this.prisma.generatedDocument.count({
      where: {
        bookingId: input.bookingId,
        organizationId: { not: input.organizationId },
      },
    });
    if (crossTenantDocs > 0) {
      requirements.push(
        this.req(PICKUP_GATE_CODE.CROSS_TENANT_DOCUMENT, 'Generated documents span multiple tenants', false),
      );
    }

    const activeJobs = await this.prisma.bookingDocumentGenerationJob.count({
      where: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        status: { in: [...ACTIVE_GENERATION_STATUSES] },
      },
    });
    if (activeJobs > 0) {
      requirements.push(
        this.req(
          PICKUP_GATE_CODE.GENERATION_IN_PROGRESS,
          'Mandatory document generation is still in progress',
          false,
        ),
      );
    }

    const completeness = await this.completeness.evaluateForBooking(
      input.organizationId,
      input.bookingId,
    );

    if (completeness.status === BUNDLE_COMPLETENESS_STATUS.INTEGRITY_FAILED) {
      for (const reason of completeness.blockingReasons) {
        const code =
          reason.code === BUNDLE_COMPLETENESS_REASON_CODE.SCAN_NOT_PASSED
            ? PICKUP_GATE_CODE.MALWARE_BLOCKED
            : PICKUP_GATE_CODE.INTEGRITY_FAILED;
        requirements.push(
          this.req(code, reason.message, false, reason.documentType),
        );
      }
    }

    for (const reason of completeness.blockingReasons) {
      if (
        reason.code === BUNDLE_COMPLETENESS_REASON_CODE.INTEGRITY_CHECKSUM_MISMATCH ||
        reason.code === BUNDLE_COMPLETENESS_REASON_CODE.INTEGRITY_MISSING_OBJECT ||
        reason.code === BUNDLE_COMPLETENESS_REASON_CODE.INTEGRITY_STORAGE_ERROR ||
        reason.code === BUNDLE_COMPLETENESS_REASON_CODE.INTEGRITY_UNAVAILABLE ||
        reason.code === BUNDLE_COMPLETENESS_REASON_CODE.SCAN_NOT_PASSED
      ) {
        continue;
      }
      if (reason.code === BUNDLE_COMPLETENESS_REASON_CODE.RESOLVER_CONFLICT) {
        requirements.push(this.req(PICKUP_GATE_CODE.RESOLVER_CONFLICT, reason.message, false, reason.documentType));
        continue;
      }
      if (reason.blocking) {
        requirements.push(
          this.req(PICKUP_GATE_CODE.BUNDLE_INCOMPLETE, reason.message, true, reason.documentType),
        );
      }
    }

    if (!completeness.legal.terms.present) {
      requirements.push(
        this.req(PICKUP_GATE_CODE.TERMS_MISSING, 'Terms and conditions document missing', true, DOCUMENT_TYPE.TERMS_AND_CONDITIONS),
      );
    }
    if (!completeness.legal.consumer.present) {
      requirements.push(
        this.req(
          PICKUP_GATE_CODE.CONSUMER_INFO_MISSING,
          'Consumer information document missing',
          true,
          DOCUMENT_TYPE.CONSUMER_INFORMATION,
        ),
      );
    }
    if (!completeness.legal.privacy.present) {
      requirements.push(
        this.req(
          PICKUP_GATE_CODE.PRIVACY_POLICY_MISSING,
          'Privacy policy document missing',
          true,
          DOCUMENT_TYPE.PRIVACY_POLICY,
        ),
      );
    }

    const deliveryEvidence = await this.prisma.legalDocumentDeliveryEvidence.findMany({
      where: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        documentType: { in: [...LEGAL_TYPES] },
      },
      select: {
        documentType: true,
        presentedAt: true,
        acknowledgedAt: true,
      },
    });

    for (const legalType of LEGAL_TYPES) {
      const slot =
        legalType === DOCUMENT_TYPE.TERMS_AND_CONDITIONS
          ? completeness.legal.terms
          : legalType === DOCUMENT_TYPE.CONSUMER_INFORMATION
            ? completeness.legal.consumer
            : completeness.legal.privacy;
      if (!slot.required || !slot.present) continue;

      const evidence = deliveryEvidence.filter((row) => row.documentType === legalType);
      if (evidence.length === 0 || !evidence.some((row) => row.presentedAt)) {
        requirements.push(
          this.req(
            PICKUP_GATE_CODE.LEGAL_PRESENTATION_MISSING,
            `Legal text presentation not recorded for ${legalType}`,
            true,
            legalType,
          ),
        );
      }
      const acknowledged =
        evidence.some((row) => row.acknowledgedAt != null) ||
        input.payload.documentsAcknowledged === true ||
        this.hasCustomerSignature(input.payload);
      if (!acknowledged) {
        requirements.push(
          this.req(
            PICKUP_GATE_CODE.LEGAL_ACKNOWLEDGMENT_MISSING,
            `Legal text acknowledgment missing for ${legalType}`,
            true,
            legalType,
          ),
        );
      }
    }

    if (input.payload.documentsAcknowledged !== true) {
      requirements.push(
        this.req(
          PICKUP_GATE_CODE.DOCUMENTS_NOT_ACKNOWLEDGED,
          'Handover documents must be acknowledged by customer',
          true,
        ),
      );
    }

    if (!this.hasCustomerSignature(input.payload)) {
      requirements.push(
        this.req(PICKUP_GATE_CODE.SIGNATURE_MISSING, 'Customer signature required for pickup', true),
      );
    }

    for (const warning of completeness.nonBlockingWarnings) {
      if (warning.code === BUNDLE_COMPLETENESS_REASON_CODE.DELIVERY_PROOF_MISSING) {
        requirements.push(
          this.req(PICKUP_GATE_CODE.DELIVERY_PENDING, warning.message, true, warning.documentType),
        );
      }
    }

    const eligibility = await this.customerEligibility.evaluateForBooking(
      input.organizationId,
      booking.customerId,
      { requestedStatus: 'ACTIVE', startDate: booking.startDate },
    );
    if (!eligibility.canStartRental) {
      for (const reason of eligibility.stages.startPickup.blockingReasons) {
        const message =
          typeof reason === 'string'
            ? reason
            : typeof reason === 'object' && reason !== null && 'message' in reason
              ? String((reason as { message?: string }).message ?? 'Customer not eligible for pickup')
              : 'Customer not eligible for pickup';
        requirements.push(this.req(PICKUP_GATE_CODE.CUSTOMER_INELIGIBLE, message, true));
      }
    }

    const hardBlocks = requirements.filter((r) => !r.overridable);
    const softBlocks = requirements.filter((r) => r.overridable);

    if (requirements.length === 0) {
      return this.buildEvaluation(requirements, false, true);
    }

    if (hardBlocks.length > 0) {
      return this.buildEvaluation(requirements, false);
    }

    const overrideReason = input.overrideReason?.trim();
    if (!overrideReason) {
      requirements.push(
        this.req(
          PICKUP_GATE_CODE.OVERRIDE_REASON_REQUIRED,
          'Authorized override requires a mandatory reason',
          false,
        ),
      );
      return this.buildEvaluation(requirements, false);
    }

    const canOverride = input.hasOverridePermission === true;
    if (!canOverride) {
      requirements.push(
        this.req(
          PICKUP_GATE_CODE.OVERRIDE_DENIED,
          'Missing booking.override permission',
          false,
        ),
      );
      return this.buildEvaluation(requirements, false);
    }

    return this.buildEvaluation(requirements, true, true);
  }

  private assertActorNotManipulated(
    input: AssertPickupGateInput,
    requirements: PickupGateRequirement[],
  ): void {
    const clientUserId = input.payload.performedByUserId?.trim();
    const clientName = input.payload.performedByName?.trim();
    if (clientUserId) {
      requirements.push(
        this.req(
          PICKUP_GATE_CODE.ACTOR_MANIPULATION,
          clientUserId !== input.actor.userId
            ? 'performedByUserId does not match authenticated user'
            : 'performedByUserId must not be supplied by client',
          false,
        ),
      );
    }
    if (clientName) {
      requirements.push(
        this.req(
          PICKUP_GATE_CODE.ACTOR_MANIPULATION,
          'performedByName must not be supplied by client',
          false,
        ),
      );
    }
  }

  private hasCustomerSignature(payload: AssertPickupGateInput['payload']): boolean {
    const name = payload.customerSignatureName?.trim();
    const dataUrl = payload.customerSignatureDataUrl?.trim();
    return Boolean(name || dataUrl);
  }

  private req(
    code: (typeof PICKUP_GATE_CODE)[keyof typeof PICKUP_GATE_CODE],
    message: string,
    overridable: boolean,
    documentType?: string,
  ): PickupGateRequirement {
    return {
      code,
      message,
      overridable: overridable && !PICKUP_GATE_NON_OVERRIDABLE_CODES.has(code),
      documentType,
    };
  }

  private buildEvaluation(
    requirements: PickupGateRequirement[],
    overrideUsed: boolean,
    allowed = false,
  ): PickupGateEvaluation {
    const hardBlocks = requirements.filter((r) => !r.overridable);
    const softBlocks = requirements.filter((r) => r.overridable);
    return {
      allowed: allowed && hardBlocks.length === 0,
      overrideUsed,
      requirements,
      hardBlocks,
      softBlocks,
    };
  }
}
