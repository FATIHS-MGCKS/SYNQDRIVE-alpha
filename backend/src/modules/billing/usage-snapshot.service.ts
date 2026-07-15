import { createHash } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingQuantityEventSource,
  BillingQuantityEventType,
  BillingUsageCalculationStatus,
  BillingUsageSnapshotBasis,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingPeriodResolverService } from './billing-period-resolver.service';
import { BillingPriceResolutionService } from './billing-price-resolution.service';
import { BillingQuantityService } from './billing-quantity.service';
import { AppliedDiscountLine } from './domain/discount-calculator';
import { ResolvedBillingPeriodWindow } from './domain/billing-period-resolver';
import {
  calculateProration,
  ProrationCalculationResult,
  QuantityEventValidationResult,
  validateQuantityEvents,
} from './domain/proration-calculator';
import { buildQuantityIdempotencyKey, isRetroactiveEvent } from './domain/billing-quantity-ledger';
import { TierPricingLine } from './domain/tier-pricing-calculator';
import {
  DiscountResolverService,
  PricingResolverService,
  QuantityResolverService,
} from './resolvers';
import { applyDiscounts } from './domain/discount-calculator';

export const UsageSnapshotErrorCode = {
  SNAPSHOT_LOCKED: 'SNAPSHOT_LOCKED',
  SNAPSHOT_NOT_FOUND: 'SNAPSHOT_NOT_FOUND',
  SNAPSHOT_ALREADY_LOCKED: 'SNAPSHOT_ALREADY_LOCKED',
  INVALID_PERIOD: 'INVALID_PERIOD',
} as const;

export interface UsageSnapshotPreviewInput {
  organizationId: string;
  periodStart?: Date;
  periodEnd?: Date;
  reference?: Date;
  subscriptionItemId?: string;
}

export interface UsageSnapshotPreview {
  organizationId: string;
  subscriptionId: string | null;
  subscriptionItemId: string | null;
  period: ResolvedBillingPeriodWindow;
  connectedVehicleCount: number;
  billableVehicleCount: number;
  billableVehicleIds: string[];
  excludedVehicleIds: string[];
  calculatedQuantity: number;
  calculationBasis: BillingUsageSnapshotBasis;
  proration: ProrationCalculationResult;
  quantityValidation: QuantityEventValidationResult;
  priceBookId: string | null;
  priceVersionId: string | null;
  priceTierId: string | null;
  unitPriceCents: number | null;
  subtotalCents: number | null;
  discountCents: number;
  amountAfterDiscountCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
  currency: string | null;
  calculationStatus: BillingUsageCalculationStatus;
  tierBreakdown: TierPricingLine[];
  discounts: AppliedDiscountLine[];
  warnings: string[];
  sourceHash: string;
  sourceRevision: number;
}

export interface CreateUsageSnapshotInput {
  organizationId: string;
  idempotencyKey: string;
  periodStart?: Date;
  periodEnd?: Date;
  reference?: Date;
  createdByUserId?: string | null;
  lock?: boolean;
}

export interface UsageSnapshotRecordResult {
  created: boolean;
  snapshot: Awaited<ReturnType<PrismaService['billingUsageSnapshot']['create']>>;
  preview: UsageSnapshotPreview;
  correctionHint?: UsageSnapshotCorrectionHint | null;
}

export interface UsageSnapshotCorrectionHint {
  code: 'SNAPSHOT_SOURCE_DRIFT';
  message: string;
  lockedSourceHash: string;
  currentSourceHash: string;
  recommendation: string;
}

@Injectable()
export class UsageSnapshotService {
  private readonly logger = new Logger(UsageSnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly periodResolver: BillingPeriodResolverService,
    private readonly quantityResolver: QuantityResolverService,
    private readonly pricingResolver: PricingResolverService,
    private readonly discountResolver: DiscountResolverService,
    private readonly priceResolution: BillingPriceResolutionService,
    private readonly quantityLedger: BillingQuantityService,
  ) {}

  async preview(input: UsageSnapshotPreviewInput): Promise<UsageSnapshotPreview> {
    const period = await this.resolvePeriod(input);
    const built = await this.buildPreview(input.organizationId, period, input.subscriptionItemId);
    return built.preview;
  }

  async createSnapshot(input: CreateUsageSnapshotInput): Promise<UsageSnapshotRecordResult> {
    const existing = await this.prisma.billingUsageSnapshot.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      const preview = await this.preview({
        organizationId: input.organizationId,
        periodStart: existing.periodStart,
        periodEnd: existing.periodEnd,
        subscriptionItemId: existing.subscriptionItemId ?? undefined,
      });
      return { created: false, snapshot: existing, preview };
    }

    const period = await this.resolvePeriod(input);
    const { preview, sourceRevision } = await this.buildPreview(
      input.organizationId,
      period,
      undefined,
    );

    const shouldLock = input.lock ?? true;

    const snapshot = await this.prisma.billingUsageSnapshot.create({
      data: {
        organizationId: input.organizationId,
        subscriptionItemId: preview.subscriptionItemId,
        periodStart: preview.period.periodStart,
        periodEnd: preview.period.periodEnd,
        connectedVehicleCount: preview.connectedVehicleCount,
        billableVehicleCount: preview.billableVehicleCount,
        calculatedQuantity: preview.calculatedQuantity,
        calculationBasis: preview.calculationBasis,
        billableVehicleIds: preview.billableVehicleIds,
        excludedVehicleIds: preview.excludedVehicleIds,
        excludedReasonSummary:
          preview.excludedVehicleIds.length > 0
            ? { reason: 'EXCLUDED_VEHICLES', count: preview.excludedVehicleIds.length }
            : undefined,
        priceBookId: preview.priceBookId,
        priceVersionId: preview.priceVersionId,
        priceTierId: preview.priceTierId,
        unitPriceCents: preview.unitPriceCents,
        subtotalCents: preview.subtotalCents,
        taxCents: preview.taxCents,
        totalCents: preview.totalCents,
        currency: preview.currency ?? 'EUR',
        calculationStatus: preview.calculationStatus,
        sourceHash: preview.sourceHash,
        sourceRevision,
        idempotencyKey: input.idempotencyKey,
        discountSnapshotJson: {
          discounts: preview.discounts,
          discountCents: preview.discountCents,
          amountAfterDiscountCents: preview.amountAfterDiscountCents,
        } as unknown as Prisma.InputJsonValue,
        prorationDetailsJson: preview.proration as unknown as Prisma.InputJsonValue,
        createdByUserId: input.createdByUserId ?? null,
        lockedAt: shouldLock ? new Date() : null,
      },
    });

    if (shouldLock && preview.subscriptionItemId) {
      await this.quantityLedger.recordEvent({
        organizationId: input.organizationId,
        subscriptionId: preview.subscriptionId ?? undefined,
        subscriptionItemId: preview.subscriptionItemId,
        eventType: BillingQuantityEventType.SNAPSHOT_LOCK,
        delta: 0,
        effectiveAt: preview.period.periodEnd,
        source: BillingQuantityEventSource.SCHEDULER,
        actorUserId: input.createdByUserId ?? null,
        reason: `Usage snapshot locked: ${snapshot.id}`,
        idempotencyKey: buildQuantityIdempotencyKey([
          'snapshot-lock',
          snapshot.id,
          input.idempotencyKey,
        ]),
        retroactiveAuthorized: true,
      });
    }

    this.logger.log({
      msg: 'billing.usage_snapshot.created',
      snapshotId: snapshot.id,
      organizationId: input.organizationId,
      locked: shouldLock,
      idempotencyKey: input.idempotencyKey,
    });

    return { created: true, snapshot, preview };
  }

  async lockSnapshot(snapshotId: string, actorUserId?: string | null) {
    const snapshot = await this.prisma.billingUsageSnapshot.findUnique({
      where: { id: snapshotId },
    });
    if (!snapshot) {
      throw new NotFoundException({
        code: UsageSnapshotErrorCode.SNAPSHOT_NOT_FOUND,
        message: UsageSnapshotErrorCode.SNAPSHOT_NOT_FOUND,
      });
    }
    if (snapshot.lockedAt) {
      throw new ConflictException({
        code: UsageSnapshotErrorCode.SNAPSHOT_ALREADY_LOCKED,
        message: UsageSnapshotErrorCode.SNAPSHOT_ALREADY_LOCKED,
      });
    }

    try {
      const updated = await this.prisma.billingUsageSnapshot.update({
        where: { id: snapshotId },
        data: { lockedAt: new Date() },
      });

      if (snapshot.subscriptionItemId) {
        await this.quantityLedger.recordEvent({
          organizationId: snapshot.organizationId,
          subscriptionItemId: snapshot.subscriptionItemId,
          eventType: BillingQuantityEventType.SNAPSHOT_LOCK,
          delta: 0,
          effectiveAt: snapshot.periodEnd,
          source: BillingQuantityEventSource.ADMIN,
          actorUserId: actorUserId ?? null,
          reason: `Usage snapshot locked: ${snapshot.id}`,
          idempotencyKey: buildQuantityIdempotencyKey(['snapshot-lock', snapshot.id]),
          retroactiveAuthorized: true,
        });
      }

      return updated;
    } catch (error) {
      throw new ConflictException({
        code: UsageSnapshotErrorCode.SNAPSHOT_LOCKED,
        message: UsageSnapshotErrorCode.SNAPSHOT_LOCKED,
        cause: error,
      });
    }
  }

  async detectCorrectionHint(snapshotId: string): Promise<UsageSnapshotCorrectionHint | null> {
    const snapshot = await this.prisma.billingUsageSnapshot.findUnique({
      where: { id: snapshotId },
    });
    if (!snapshot?.lockedAt || !snapshot.sourceHash) {
      return null;
    }

    const preview = await this.preview({
      organizationId: snapshot.organizationId,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      subscriptionItemId: snapshot.subscriptionItemId ?? undefined,
    });

    if (preview.sourceHash === snapshot.sourceHash) {
      return null;
    }

    return {
      code: 'SNAPSHOT_SOURCE_DRIFT',
      message: 'Locked usage snapshot no longer matches current billing inputs.',
      lockedSourceHash: snapshot.sourceHash,
      currentSourceHash: preview.sourceHash,
      recommendation:
        'Do not mutate the locked snapshot. Create an adjustment or a supplemental snapshot for the correction period.',
    };
  }

  private async resolvePeriod(
    input: Pick<UsageSnapshotPreviewInput, 'organizationId' | 'periodStart' | 'periodEnd' | 'reference'>,
  ): Promise<ResolvedBillingPeriodWindow> {
    if (input.periodStart && input.periodEnd) {
      if (input.periodEnd.getTime() <= input.periodStart.getTime()) {
        throw new BadRequestException({
          code: UsageSnapshotErrorCode.INVALID_PERIOD,
          message: UsageSnapshotErrorCode.INVALID_PERIOD,
        });
      }
      const resolved = await this.periodResolver.resolveForOrganization(
        input.organizationId,
        input.reference ?? input.periodStart,
      );
      return {
        ...resolved,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        source: resolved.source,
      };
    }

    return this.periodResolver.resolveForOrganization(
      input.organizationId,
      input.reference ?? new Date(),
    );
  }

  private async buildPreview(
    organizationId: string,
    period: ResolvedBillingPeriodWindow,
    subscriptionItemId?: string,
  ): Promise<{ preview: UsageSnapshotPreview; sourceRevision: number }> {
    const asOf = new Date(period.periodEnd.getTime() - 1);
    const [quantityAtEnd, assignment, discounts, subscriptionItem, assignments] =
      await Promise.all([
        this.quantityResolver.resolveQuantity(organizationId, asOf),
        this.pricingResolver.resolvePriceAssignment(organizationId, { asOf }),
        this.discountResolver.resolveDiscounts(organizationId, { asOf }),
        subscriptionItemId
          ? this.prisma.billingSubscriptionItem.findUnique({
              where: { id: subscriptionItemId },
              select: { id: true, subscriptionId: true },
            })
          : this.prisma.billingSubscriptionItem.findFirst({
              where: { organizationId },
              orderBy: { validFrom: 'desc' },
              select: { id: true, subscriptionId: true },
            }),
        this.prisma.billingBillableVehicleAssignment.findMany({
          where: { organizationId },
          select: {
            id: true,
            vehicleId: true,
            billableFrom: true,
            billableUntil: true,
            status: true,
            reasonCode: true,
          },
        }),
      ]);

    const resolvedItemId = subscriptionItem?.id ?? assignment.subscriptionItemId;
    const quantityEvents = resolvedItemId
      ? await this.prisma.billingQuantityEvent.findMany({
          where: { subscriptionItemId: resolvedItemId },
          select: { effectiveAt: true, createdAt: true },
        })
      : [];
    const ledgerQuantityAtPeriodEnd = resolvedItemId
      ? await this.quantityResolver.reconstructHistoricalQuantity(resolvedItemId, asOf)
      : quantityAtEnd.billableVehicleCount;

    const retroactiveEventCount = quantityEvents.filter((event) =>
      isRetroactiveEvent(event.effectiveAt, event.createdAt),
    ).length;

    const prorationAssignments = assignments.map((assignment) => ({
      assignmentId: assignment.id,
      vehicleId: assignment.vehicleId,
      billableFrom: assignment.billableFrom,
      billableUntil: assignment.billableUntil,
      status: assignment.status,
      reasonCode: assignment.reasonCode,
    }));

    const proration = calculateProration({
      period: {
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      },
      assignments: prorationAssignments,
    });

    const calculatedQuantity = Math.ceil(proration.proratedBillableQuantity);

    let priceResult: Awaited<
      ReturnType<BillingPriceResolutionService['calculateVolumePriceForVersion']>
    > = {
      calculationStatus: BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION,
      priceBookId: assignment.priceBookId,
      priceVersionId: assignment.priceVersionId,
      currency: null,
      pricingModel: 'VOLUME',
      tier: null,
      tierLines: [],
      unitPriceCents: null,
      subtotalCents: null,
      totalCents: null,
    };

    const baseAdjustments = discounts.filter(
      (discount) =>
        discount.applicationPhase === 'UNIT_PRICE' || discount.applicationPhase === 'MINIMUM',
    );
    const unitPriceOverride =
      baseAdjustments.find((discount) => discount.customUnitPriceCents != null)
        ?.customUnitPriceCents ?? null;
    const minimumOverride =
      baseAdjustments.find((discount) => discount.customMonthlyMinimumCents != null)
        ?.customMonthlyMinimumCents ?? null;

    if (assignment.priceVersionId) {
      priceResult = await this.priceResolution.calculateVolumePriceForVersion(
        assignment.priceVersionId,
        calculatedQuantity,
        {
          asOf,
          priceBookId: assignment.priceBookId,
          customUnitPriceCents: unitPriceOverride,
          customMonthlyMinimumCents: minimumOverride,
        },
      );
    }

    const prorationWithPrice = calculateProration({
      period: {
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      },
      assignments: prorationAssignments,
      unitPriceCents: priceResult.unitPriceCents,
    });

    const baseAmountCents =
      prorationWithPrice.proratedSubtotalCents ??
      priceResult.subtotalCents ??
      priceResult.totalCents;

    let amountAfterDiscountCents = baseAmountCents;
    let appliedDiscounts: AppliedDiscountLine[] = [];
    let totalDiscountCents = 0;
    const warnings: string[] = [];

    if (baseAmountCents != null && baseAmountCents > 0) {
      const discountResult = applyDiscounts({
        baseAmountCents,
        currency: priceResult.currency ?? 'EUR',
        discounts,
        asOf,
        subscriptionItemId: resolvedItemId,
      });
      amountAfterDiscountCents = discountResult.amountAfterDiscountCents;
      appliedDiscounts = discountResult.appliedDiscounts;
      totalDiscountCents = discountResult.totalDiscountCents;
      warnings.push(...discountResult.warnings);
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { defaultVatRate: true },
    });
    const taxCents =
      amountAfterDiscountCents != null && org?.defaultVatRate != null
        ? Math.round((amountAfterDiscountCents * Math.round(org.defaultVatRate * 100)) / 10_000)
        : null;
    const totalCents =
      amountAfterDiscountCents != null && taxCents != null
        ? amountAfterDiscountCents + taxCents
        : amountAfterDiscountCents;

    const quantityValidation = validateQuantityEvents({
      period: {
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      },
      ledgerQuantityAtPeriodEnd,
      proratedBillableQuantity: proration.proratedBillableQuantity,
      retroactiveEventCount,
    });
    warnings.push(...quantityValidation.warnings);

    const sourceRevision = quantityEvents.length;
    const sourceHash = this.buildSourceHash({
      organizationId,
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      assignments,
      quantityRevision: sourceRevision,
      priceVersionId: assignment.priceVersionId,
      calculatedQuantity,
      discounts: appliedDiscounts,
      proration: prorationWithPrice,
    });

    return {
      sourceRevision,
      preview: {
        organizationId,
        subscriptionId: subscriptionItem?.subscriptionId ?? null,
        subscriptionItemId: resolvedItemId,
        period,
        connectedVehicleCount: quantityAtEnd.connectedVehicleCount,
        billableVehicleCount: quantityAtEnd.billableVehicleCount,
        billableVehicleIds: quantityAtEnd.billableVehicleIds,
        excludedVehicleIds: quantityAtEnd.excludedVehicleIds,
        calculatedQuantity,
        calculationBasis: BillingUsageSnapshotBasis.BILLABLE_VEHICLES,
        proration: prorationWithPrice,
        quantityValidation,
        priceBookId: priceResult.priceBookId ?? assignment.priceBookId,
        priceVersionId: priceResult.priceVersionId ?? assignment.priceVersionId,
        priceTierId: priceResult.tier?.id ?? null,
        unitPriceCents: priceResult.unitPriceCents,
        subtotalCents: baseAmountCents,
        discountCents: totalDiscountCents,
        amountAfterDiscountCents,
        taxCents,
        totalCents,
        currency: priceResult.currency ?? 'EUR',
        calculationStatus: priceResult.calculationStatus,
        tierBreakdown: priceResult.tierLines,
        discounts: appliedDiscounts,
        warnings,
        sourceHash,
        sourceRevision,
      },
    };
  }

  private buildSourceHash(payload: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}
