import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  BrakeDtcCategory,
  BrakeDtcFreshness,
  BrakeEvidenceConfidence,
  BrakeEvidenceConfirmationStatus,
  BrakeEvidenceFreshnessStatus,
  BrakeEvidenceSource,
  BrakeHealthAlertResolutionReason,
  Prisma,
  VehicleDtcEvent,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BrakeEvidenceService } from './brake-evidence.service';
import { BrakeHealthAlertService } from './brake-health-alert.service';
import { BrakeRecalculationOrchestratorService } from './brake-recalculation-orchestrator.service';
import {
  buildBrakeDtcDedupeKey,
  classifyBrakeDtc,
  isBrakeDtcEvidenceRelevant,
  resolveBrakeDtcFreshness,
  type BrakeDtcClassification,
} from './brake-dtc-classification';
import { mapDtcFreshnessToEvidenceFreshness } from './brake-evidence.domain';
import { NotificationProducerIngestService } from '@modules/notifications/adapters/notification-producer.ingest.service';
import { BrakeHealthObservabilityService } from './brake-health-observability.service';

export type BrakeDtcSourceProvider = 'DIMO' | 'HIGH_MOBILITY' | 'OBD' | 'MANUAL';

export interface BrakeDtcProducerContext {
  sourceProvider: BrakeDtcSourceProvider;
  sourceTimestamp?: Date | null;
  organizationId?: string | null;
}

export interface BrakeDtcEvidenceSyncResult {
  created: number;
  updated: number;
  cleared: number;
  skipped: number;
}

@Injectable()
export class BrakeDtcEvidenceProducerService {
  private readonly logger = new Logger(BrakeDtcEvidenceProducerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brakeEvidence: BrakeEvidenceService,
    @Optional() private readonly recalcOrchestrator?: BrakeRecalculationOrchestratorService,
    @Optional() private readonly notificationIngest?: NotificationProducerIngestService,
    @Optional() private readonly brakeHealthAlerts?: BrakeHealthAlertService,
    @Optional() private readonly observability?: BrakeHealthObservabilityService,
  ) {}

  async onDtcUpserted(
    vehicleId: string,
    event: VehicleDtcEvent,
    context: BrakeDtcProducerContext,
  ): Promise<'created' | 'updated' | 'skipped'> {
    if (!(await this.assertVehicleTenant(vehicleId, context.organizationId))) {
      return 'skipped';
    }

    const classification = classifyBrakeDtc(event.dtcCode, {
      eventSeverity: event.severity,
    });
    if (!classification || !isBrakeDtcEvidenceRelevant(classification.category)) {
      return 'skipped';
    }

    const freshness = await this.resolveFreshness(vehicleId);
    const dedupeKey = buildBrakeDtcDedupeKey(classification.normalizedCode);
    const existing = await this.prisma.brakeEvidence.findFirst({
      where: {
        vehicleId,
        dedupeKey,
        active: true,
        supersededByEvidenceId: null,
      },
      orderBy: [{ dtcLastSeenAt: 'desc' }, { createdAt: 'desc' }],
    });

    const payload = this.buildEvidencePayload({
      vehicleId,
      event,
      classification,
      context,
      freshness,
      dedupeKey,
      organizationId: context.organizationId ?? (await this.loadOrganizationId(vehicleId)),
      reactivated: existing?.dtcActive === false,
    });

    if (existing) {
      await this.prisma.brakeEvidence.update({
        where: { id: existing.id },
        data: payload,
      });
      this.observability?.recordEvidence({
        action: 'created',
        source: 'DTC_SIGNAL',
        category: classification.category,
      });
      this.observability?.recordTdiProcessing({ status: 'completed', reasonCode: 'dtc_updated' });
      await this.enqueueRecalculation(vehicleId);
      return 'updated';
    }

    await this.prisma.brakeEvidence.create({
      data: payload,
    });
    this.observability?.recordEvidence({
      action: 'created',
      source: 'DTC_SIGNAL',
      category: classification.category,
    });
    this.observability?.recordTdiProcessing({ status: 'completed', reasonCode: 'dtc_created' });
    await this.enqueueRecalculation(vehicleId);
    await this.emitBrakeSafetyNotification(vehicleId, classification, false, context);
    return 'created';
  }

  async onDtcCleared(
    vehicleId: string,
    dtcCode: string,
    resolvedAt: Date,
    context: BrakeDtcProducerContext,
  ): Promise<'cleared' | 'skipped'> {
    if (!(await this.assertVehicleTenant(vehicleId, context.organizationId))) {
      return 'skipped';
    }

    const classification = classifyBrakeDtc(dtcCode);
    if (!classification || !isBrakeDtcEvidenceRelevant(classification.category)) {
      return 'skipped';
    }

    const dedupeKey = buildBrakeDtcDedupeKey(classification.normalizedCode);
    const existing = await this.prisma.brakeEvidence.findFirst({
      where: {
        vehicleId,
        dedupeKey,
        source: BrakeEvidenceSource.DTC_SIGNAL,
        dtcActive: true,
      },
      orderBy: [{ dtcLastSeenAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (!existing) return 'skipped';

    await this.prisma.brakeEvidence.update({
      where: { id: existing.id },
      data: {
        dtcActive: false,
        active: false,
        dtcResolvedAt: resolvedAt,
        resolvedAt,
        sourceProvider: context.sourceProvider,
        sourceTimestamp: context.sourceTimestamp ?? resolvedAt,
        lastObservedAt: resolvedAt,
      },
    });

    await this.enqueueRecalculation(vehicleId);
    await this.brakeHealthAlerts?.resolveOpenAlerts(vehicleId, BrakeHealthAlertResolutionReason.DTC_CLEARED, {
      alertType: 'BRAKE_DTC',
    });
    await this.brakeHealthAlerts?.resolveOpenAlerts(vehicleId, BrakeHealthAlertResolutionReason.DTC_CLEARED, {
      alertType: 'ABS_WARNING',
    });
    this.observability?.recordEvidence({
      action: 'resolved',
      source: 'DTC_SIGNAL',
      category: classification.category,
    });
    this.observability?.recordTdiProcessing({ status: 'completed', reasonCode: 'dtc_cleared' });
    await this.emitBrakeSafetyNotification(vehicleId, classification, true, context);
    return 'cleared';
  }

  async syncVehicleActiveDtcs(
    vehicleId: string,
    context: BrakeDtcProducerContext,
  ): Promise<BrakeDtcEvidenceSyncResult> {
    const result: BrakeDtcEvidenceSyncResult = {
      created: 0,
      updated: 0,
      cleared: 0,
      skipped: 0,
    };

    const activeEvents = await this.prisma.vehicleDtcEvent.findMany({
      where: { vehicleId, isActive: true },
    });

    for (const event of activeEvents) {
      const outcome = await this.onDtcUpserted(vehicleId, event, context);
      if (outcome === 'created') result.created += 1;
      else if (outcome === 'updated') result.updated += 1;
      else result.skipped += 1;
    }

    return result;
  }

  private buildEvidencePayload(args: {
    vehicleId: string;
    event: VehicleDtcEvent;
    classification: BrakeDtcClassification;
    context: BrakeDtcProducerContext;
    freshness: BrakeDtcFreshness;
    dedupeKey: string;
    organizationId?: string | null;
    reactivated: boolean;
  }): Prisma.BrakeEvidenceUncheckedCreateInput {
    const { event, classification, context, freshness, dedupeKey, reactivated } = args;
    const effectiveSeverity =
      classification.reviewRequired && classification.severity === 'CRITICAL'
        ? 'WARNING'
        : classification.severity;
    const observedAt = context.sourceTimestamp ?? event.lastSeenAt;
    const evidenceFreshness = mapDtcFreshnessToEvidenceFreshness(freshness);

    return {
      organizationId: args.organizationId ?? undefined,
      vehicleId: args.vehicleId,
      source: BrakeEvidenceSource.DTC_SIGNAL,
      axle: 'UNKNOWN',
      dtcSeverity: effectiveSeverity,
      vehicleDtcEventId: event.id,
      dtcCode: classification.normalizedCode,
      dtcCategory: classification.category as BrakeDtcCategory,
      dtcActive: true,
      active: true,
      dtcFirstSeenAt: event.firstSeenAt,
      dtcLastSeenAt: event.lastSeenAt,
      dtcResolvedAt: null,
      resolvedAt: null,
      firstObservedAt: event.firstSeenAt,
      lastObservedAt: observedAt,
      sourceProvider: context.sourceProvider,
      sourceTimestamp: observedAt,
      dtcFreshness: freshness,
      freshnessStatus: evidenceFreshness,
      confirmationStatus: BrakeEvidenceConfirmationStatus.NOT_APPLICABLE,
      externalSourceId: classification.normalizedCode,
      dedupeKey,
      dtcReviewRequired: classification.reviewRequired,
      measuredAt: event.lastSeenAt,
      confidence:
        classification.safetyClassified && !classification.reviewRequired
          ? BrakeEvidenceConfidence.MEDIUM
          : BrakeEvidenceConfidence.LOW,
      notes: JSON.stringify({
        mappingSource: classification.mappingSource,
        reviewRequired: classification.reviewRequired,
        reactivated,
        occurrenceCount: event.occurrenceCount,
      }),
    };
  }

  private async loadOrganizationId(vehicleId: string): Promise<string | null> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    return vehicle?.organizationId ?? null;
  }

  private async resolveFreshness(vehicleId: string): Promise<BrakeDtcFreshness> {
    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { lastDtcSuccessfulCheckAt: true },
    });
    return resolveBrakeDtcFreshness({
      lastSuccessfulCheckAt: latestState?.lastDtcSuccessfulCheckAt,
    });
  }

  private async assertVehicleTenant(
    vehicleId: string,
    organizationId?: string | null,
  ): Promise<boolean> {
    if (!organizationId) return true;
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle) return false;
    if (vehicle.organizationId !== organizationId) {
      this.logger.warn(
        `Skipping brake DTC evidence for vehicle=${vehicleId} — tenant mismatch`,
      );
      return false;
    }
    return true;
  }

  private async enqueueRecalculation(vehicleId: string): Promise<void> {
    await this.recalcOrchestrator?.enqueue({ vehicleId, trigger: 'dtc' });
  }

  private async emitBrakeSafetyNotification(
    vehicleId: string,
    classification: BrakeDtcClassification,
    cleared: boolean,
    context: BrakeDtcProducerContext,
  ): Promise<void> {
    if (!this.notificationIngest) return;
    if (classification.reviewRequired && !cleared) return;

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        organizationId: true,
        licensePlate: true,
        make: true,
        model: true,
      },
    });
    if (!vehicle) return;

    const label =
      vehicle.licensePlate?.trim() ||
      `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() ||
      vehicleId;

    const severity =
      classification.severity === 'CRITICAL' && classification.safetyClassified
        ? 'critical'
        : 'warning';

    try {
      await this.notificationIngest.ingestVehicleHealthSources(
        vehicle.organizationId,
        `brake-dtc:${vehicleId}:${classification.normalizedCode}`,
        [
          {
            eventType: 'BRAKE_CRITICAL',
            vehicleId,
            label,
            code: classification.normalizedCode,
            reason: `${classification.category} DTC ${classification.normalizedCode}`,
            severity,
            cleared,
          },
        ],
      );
    } catch (error) {
      this.logger.warn(
        `Brake DTC notification ingest failed vehicle=${vehicleId}: ${(error as Error).message}`,
      );
    }
  }
}
