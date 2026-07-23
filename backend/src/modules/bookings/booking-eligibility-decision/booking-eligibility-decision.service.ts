import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingEligibilityDecisionEventType, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { findPublishedRevision } from '@modules/rental-rules/rental-rules-revision-resolver.util';
import {
  buildBookingEligibilityDataVersion,
  buildBookingEligibilityRuleRevision,
} from '../booking-eligibility-approval/booking-eligibility-approval.util';
import { BOOKING_ELIGIBILITY_DECISION_ERROR_CODE } from './booking-eligibility-decision.constants';
import type {
  AppendBookingEligibilityDecisionInput,
  AppendManualApprovalDecisionInput,
  AppendRecheckDecisionInput,
  BookingEligibilityDecisionView,
} from './booking-eligibility-decision.types';
import {
  assertNoPiiInDerivedFacts,
  buildDataSourcesFromGateResult,
  buildDerivedFactsFromGateResult,
  buildRulesHashFromRevisions,
  resolveRecheckAt,
  serializeGateReasons,
} from './booking-eligibility-decision.util';

type Tx = Prisma.TransactionClient;

@Injectable()
export class BookingEligibilityDecisionService {
  constructor(private readonly prisma: PrismaService) {}

  async listForBooking(
    organizationId: string,
    bookingId: string,
  ): Promise<BookingEligibilityDecisionView[]> {
    await this.assertBooking(organizationId, bookingId);
    const rows = await this.prisma.bookingEligibilityDecision.findMany({
      where: { organizationId, bookingId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.mapRow(row));
  }

  async getById(
    organizationId: string,
    bookingId: string,
    decisionId: string,
  ): Promise<BookingEligibilityDecisionView> {
    const row = await this.prisma.bookingEligibilityDecision.findFirst({
      where: { id: decisionId, organizationId, bookingId },
    });
    if (!row) {
      throw new NotFoundException({
        code: BOOKING_ELIGIBILITY_DECISION_ERROR_CODE.NOT_FOUND,
        message: 'Eligibility decision snapshot not found.',
      });
    }
    return this.mapRow(row);
  }

  async appendFromGateResult(
    input: AppendBookingEligibilityDecisionInput,
    tx?: Tx,
  ): Promise<BookingEligibilityDecisionView> {
    if (!input.bookingId?.trim()) {
      throw new BadRequestException({
        code: BOOKING_ELIGIBILITY_DECISION_ERROR_CODE.BOOKING_REQUIRED,
        message: 'Booking id is required to persist an eligibility decision snapshot.',
      });
    }

    const { ruleRevisionIds, rulesHash } = await this.resolveRuleRevisionContext(
      input.organizationId,
      input.gateResult.vehicleId,
      input.gateResult.domains.rentalRules.result?.effectiveRules.rentalCategoryId ?? null,
    );

    const derivedFacts = buildDerivedFactsFromGateResult(input.gateResult);
    assertNoPiiInDerivedFacts(derivedFacts);

    const client = tx ?? this.prisma;
    const created = await client.bookingEligibilityDecision.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        eventType: input.eventType,
        decisionStatus: input.gateResult.status,
        reasonCodes: input.gateResult.reasonCodes,
        blockingReasons: serializeGateReasons(input.gateResult.blockingReasons),
        warnings: serializeGateReasons(input.gateResult.warnings),
        missingFields: input.gateResult.missingFields,
        evaluatedAt: new Date(input.gateResult.evaluatedAt),
        recheckAt: resolveRecheckAt(input.gateResult),
        engineVersion: input.gateResult.engineVersion,
        ruleRevisionIds,
        rulesHash,
        derivedFacts: derivedFacts as Prisma.InputJsonValue,
        dataSources: buildDataSourcesFromGateResult(input.gateResult) as Prisma.InputJsonValue,
        manualApprovalId: input.manualApprovalId ?? null,
        bookingDataVersion: buildBookingEligibilityDataVersion(input.bookingDataContext),
        correlationId: input.gateResult.correlation.auditEventId,
        evaluationId: input.gateResult.correlation.evaluationId,
      },
    });

    return this.mapRow(created);
  }

  appendFromGateResultInTransaction(tx: Tx, input: AppendBookingEligibilityDecisionInput) {
    return this.appendFromGateResult(input, tx);
  }

  async appendManualApprovalDecision(
    input: AppendManualApprovalDecisionInput,
    tx?: Tx,
  ): Promise<BookingEligibilityDecisionView> {
    const snapshot =
      input.approval.gateResultSnapshot &&
      typeof input.approval.gateResultSnapshot === 'object'
        ? (input.approval.gateResultSnapshot as Record<string, unknown>)
        : {};

    const reasonCodes = Array.isArray(input.approval.reasonCodes)
      ? (input.approval.reasonCodes as string[])
      : [];
    const blockingReasons = Array.isArray(snapshot.blockingReasons)
      ? snapshot.blockingReasons
      : [];
    const warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];
    const missingFields = Array.isArray(snapshot.missingFields)
      ? snapshot.missingFields
      : [];

    const derivedFacts: Record<string, unknown> = {
      manualApproval: true,
      eligibilityFingerprint: input.approval.eligibilityFingerprint,
      ruleRevisionFingerprint: input.approval.ruleRevision,
      gateStage: snapshot.stage ?? null,
    };

    const client = tx ?? this.prisma;
    const created = await client.bookingEligibilityDecision.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        eventType: input.eventType,
        decisionStatus: input.approval.eligibilityDecision,
        reasonCodes,
        blockingReasons,
        warnings,
        missingFields,
        evaluatedAt: new Date(input.evaluatedAt),
        recheckAt: null,
        engineVersion: input.engineVersion,
        ruleRevisionIds: [],
        rulesHash: input.approval.ruleRevision,
        derivedFacts: derivedFacts as Prisma.InputJsonValue,
        dataSources: {
          manualApproval: true,
          gateResultSnapshotPresent: Boolean(input.approval.gateResultSnapshot),
        },
        manualApprovalId: input.approval.id,
        bookingDataVersion: input.approval.bookingDataVersion,
        correlationId: input.correlationId,
        evaluationId: null,
      },
    });

    return this.mapRow(created);
  }

  async appendRecheckDecision(
    input: AppendRecheckDecisionInput,
    tx?: Tx,
  ): Promise<BookingEligibilityDecisionView> {
    const client = tx ?? this.prisma;
    const created = await client.bookingEligibilityDecision.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        eventType: input.eventType,
        decisionStatus: input.decisionStatus,
        reasonCodes: input.reasonCodes ?? [],
        blockingReasons: [],
        warnings: [],
        missingFields: [],
        evaluatedAt: new Date(),
        recheckAt: input.recheckAt ?? null,
        engineVersion: input.engineVersion ?? 'recheck-v1',
        ruleRevisionIds: [],
        rulesHash: input.currentRulesHash,
        derivedFacts: {
          ...input.derivedFacts,
          priorRulesHash: input.priorRulesHash,
        } as Prisma.InputJsonValue,
        dataSources: {
          recheck: true,
          trigger: input.derivedFacts.trigger ?? null,
        },
        manualApprovalId: null,
        bookingDataVersion: input.bookingDataVersion,
        correlationId: input.correlationId,
        evaluationId: null,
      },
    });
    return this.mapRow(created);
  }

  async getLatestConfirmRulesHash(
    organizationId: string,
    bookingId: string,
  ): Promise<string | null> {
    const row = await this.prisma.bookingEligibilityDecision.findFirst({
      where: {
        organizationId,
        bookingId,
        eventType: 'CONFIRM_SUCCEEDED',
      },
      orderBy: { createdAt: 'desc' },
      select: { rulesHash: true },
    });
    return row?.rulesHash ?? null;
  }

  async resolveCurrentRulesHashForBooking(
    organizationId: string,
    vehicleId: string,
    rentalCategoryId: string | null,
  ): Promise<string> {
    const context = await this.resolveRuleRevisionContext(
      organizationId,
      vehicleId,
      rentalCategoryId,
    );
    return context.rulesHash;
  }

  findDueRecheckDecisions(limit = 50, now: Date = new Date()) {
    return this.prisma.bookingEligibilityDecision.findMany({
      where: {
        recheckAt: { lte: now },
        eventType: {
          in: ['CONFIRM_ATTEMPT', 'CONFIRM_SUCCEEDED', 'PICKUP_CHECK', 'MUTATION_RECHECK'],
        },
      },
      orderBy: { recheckAt: 'asc' },
      take: limit,
      select: {
        id: true,
        organizationId: true,
        bookingId: true,
        recheckAt: true,
      },
    });
  }

  private async resolveRuleRevisionContext(
    organizationId: string,
    vehicleId: string,
    rentalCategoryId: string | null,
  ): Promise<{ ruleRevisionIds: string[]; rulesHash: string }> {
    const [orgRevision, categoryRevision, vehicleRevision] = await Promise.all([
      findPublishedRevision(this.prisma, {
        organizationId,
        scopeType: 'ORGANIZATION',
        scopeId: organizationId,
      }),
      rentalCategoryId
        ? findPublishedRevision(this.prisma, {
            organizationId,
            scopeType: 'CATEGORY',
            scopeId: rentalCategoryId,
          })
        : Promise.resolve(null),
      findPublishedRevision(this.prisma, {
        organizationId,
        scopeType: 'VEHICLE',
        scopeId: vehicleId,
      }),
    ]);

    const revisions = [orgRevision, categoryRevision, vehicleRevision].filter(
      (revision): revision is NonNullable<typeof revision> => revision != null,
    );

    return {
      ruleRevisionIds: revisions.map((revision) => revision.id),
      rulesHash:
        revisions.length > 0
          ? buildRulesHashFromRevisions(revisions)
          : buildBookingEligibilityRuleRevision({
              engineVersion: 'unknown',
              sourceRuleIds: [],
            }),
    };
  }

  private async assertBooking(organizationId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { id: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found for organization');
    }
  }

  private mapRow(
    row: Prisma.BookingEligibilityDecisionGetPayload<object>,
  ): BookingEligibilityDecisionView {
    return {
      id: row.id,
      organizationId: row.organizationId,
      bookingId: row.bookingId,
      eventType: row.eventType,
      decisionStatus: row.decisionStatus,
      reasonCodes: Array.isArray(row.reasonCodes) ? (row.reasonCodes as string[]) : [],
      blockingReasons: Array.isArray(row.blockingReasons)
        ? (row.blockingReasons as BookingEligibilityDecisionView['blockingReasons'])
        : [],
      warnings: Array.isArray(row.warnings)
        ? (row.warnings as BookingEligibilityDecisionView['warnings'])
        : [],
      missingFields: Array.isArray(row.missingFields) ? (row.missingFields as string[]) : [],
      evaluatedAt: row.evaluatedAt.toISOString(),
      recheckAt: row.recheckAt?.toISOString() ?? null,
      engineVersion: row.engineVersion,
      ruleRevisionIds: Array.isArray(row.ruleRevisionIds)
        ? (row.ruleRevisionIds as string[])
        : [],
      rulesHash: row.rulesHash,
      derivedFacts:
        row.derivedFacts && typeof row.derivedFacts === 'object'
          ? (row.derivedFacts as Record<string, unknown>)
          : {},
      dataSources:
        row.dataSources && typeof row.dataSources === 'object'
          ? (row.dataSources as Record<string, unknown>)
          : {},
      manualApprovalId: row.manualApprovalId,
      bookingDataVersion: row.bookingDataVersion,
      correlationId: row.correlationId,
      evaluationId: row.evaluationId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
