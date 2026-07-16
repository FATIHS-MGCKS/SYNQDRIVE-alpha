/**
 * SynqDrive — DIMO RPM Webhook Candidate Intake
 *
 * Persists high-RPM Vehicle Trigger firings as tenant-scoped anchors with optional
 * HF context enrichment. These are evidence anchors — NOT misuse cases or alerts.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  Prisma,
  RpmWebhookCandidateStatus,
  TelemetryTriggerType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { EventContextEnrichmentService } from '../vehicle-intelligence/event-context/event-context-enrichment.service';
import {
  shouldRunIceEventContextEnrichment,
  type EngineContextVehicleInput,
} from '../vehicle-intelligence/event-context/engine-context.guards';
import type { EventContextStatus } from '../vehicle-intelligence/event-context/event-context-assessment.types';

/** Aligns with DIMO console cooldown (10s) for dedup buckets. */
export const RPM_WEBHOOK_DEDUP_WINDOW_MS = 10_000;
export const DEFAULT_RPM_THRESHOLD = 5000;

export type RpmWebhookIntakeOutcome =
  | 'created'
  | 'duplicate'
  | 'ignored'
  | 'skipped_powertrain';

export interface RpmWebhookVehicle extends EngineContextVehicleInput {
  id: string;
  organizationId: string;
}

export interface IngestRpmWebhookInput {
  vehicle: RpmWebhookVehicle;
  tokenId: number;
  observedAt: Date;
  observedValue: number;
  threshold?: number;
  rawPayload: unknown;
}

@Injectable()
export class RpmWebhookCandidateService {
  private readonly logger = new Logger(RpmWebhookCandidateService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly contextEnrichment?: EventContextEnrichmentService,
  ) {}

  static dedupBucket(observedAt: Date): bigint {
    return BigInt(Math.floor(observedAt.getTime() / RPM_WEBHOOK_DEDUP_WINDOW_MS));
  }

  async ingestRpmThresholdEvent(input: IngestRpmWebhookInput): Promise<{
    outcome: RpmWebhookIntakeOutcome;
    candidateId?: string;
    status?: RpmWebhookCandidateStatus;
  }> {
    if (!shouldRunIceEventContextEnrichment(input.vehicle)) {
      this.logger.debug(
        `RPM webhook skipped for vehicle ${input.vehicle.id}: powertrain not ICE/LTE_R1 eligible`,
      );
      return { outcome: 'skipped_powertrain' };
    }

    const threshold = input.threshold ?? DEFAULT_RPM_THRESHOLD;
    if (input.observedValue < threshold) {
      return { outcome: 'ignored' };
    }

    const tripId = await this.resolveTripId(input.vehicle.id, input.observedAt);
    const dedupBucket = RpmWebhookCandidateService.dedupBucket(input.observedAt);

    try {
      const row = await this.prisma.rpmWebhookCandidate.upsert({
        where: {
          provider_vehicleId_triggerType_dedupBucket: {
            provider: 'DIMO',
            vehicleId: input.vehicle.id,
            triggerType: TelemetryTriggerType.RPM_THRESHOLD,
            dedupBucket,
          },
        },
        create: {
          organizationId: input.vehicle.organizationId,
          vehicleId: input.vehicle.id,
          tripId,
          tokenId: input.tokenId,
          provider: 'DIMO',
          triggerType: TelemetryTriggerType.RPM_THRESHOLD,
          threshold,
          observedValue: input.observedValue,
          observedAt: input.observedAt,
          dedupBucket,
          rawPayloadJson: input.rawPayload as object,
          status: RpmWebhookCandidateStatus.RECEIVED,
        },
        update: {},
        select: { id: true, createdAt: true, updatedAt: true, status: true },
      });

      const isNew = row.createdAt.getTime() === row.updatedAt.getTime();
      if (!isNew) {
        return { outcome: 'duplicate', candidateId: row.id, status: row.status };
      }

      this.logger.log(
        `RPM webhook candidate for vehicle ${input.vehicle.id}: ${input.observedValue} rpm (threshold ${threshold})`,
      );

      const status = await this.enrichCandidateBestEffort(row.id, input.tokenId, input.observedAt);
      return { outcome: 'created', candidateId: row.id, status };
    } catch (err: unknown) {
      this.logger.warn(
        `RPM webhook intake failed for vehicle ${input.vehicle.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { outcome: 'ignored' };
    }
  }

  private async enrichCandidateBestEffort(
    candidateId: string,
    tokenId: number,
    observedAt: Date,
  ): Promise<RpmWebhookCandidateStatus> {
    if (!this.contextEnrichment) {
      return RpmWebhookCandidateStatus.RECEIVED;
    }

    try {
      const assessment = await this.contextEnrichment.enrichAnchorContext({
        anchorType: 'DIMO_NATIVE_BEHAVIOR_EVENT',
        anchorTimestamp: observedAt,
        tokenId,
        engineSignalsApplicable: true,
      });

      const status = this.mapAssessmentToCandidateStatus(assessment.status);

      await this.prisma.rpmWebhookCandidate.update({
        where: { id: candidateId },
        data: {
          status,
          contextAssessmentJson: assessment as unknown as Prisma.InputJsonValue,
          error: assessment.status === 'FAILED' ? assessment.error ?? null : null,
        },
      });

      return status;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.rpmWebhookCandidate.update({
        where: { id: candidateId },
        data: { status: RpmWebhookCandidateStatus.FAILED, error: message },
      });
      return RpmWebhookCandidateStatus.FAILED;
    }
  }

  private mapAssessmentToCandidateStatus(
    assessmentStatus: EventContextStatus,
  ): RpmWebhookCandidateStatus {
    switch (assessmentStatus) {
      case 'SUCCESS':
      case 'LIMITED':
        return RpmWebhookCandidateStatus.CONTEXT_ENRICHED;
      case 'INSUFFICIENT_CADENCE':
      case 'UNSUPPORTED':
        return RpmWebhookCandidateStatus.INSUFFICIENT_CONTEXT;
      case 'PROVIDER_ERROR':
      default:
        return RpmWebhookCandidateStatus.FAILED;
    }
  }

  private async resolveTripId(vehicleId: string, at: Date): Promise<string | null> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: {
        vehicleId,
        startTime: { lte: at },
        OR: [{ endTime: null }, { endTime: { gte: at } }],
      },
      orderBy: { startTime: 'desc' },
      select: { id: true },
    });
    return trip?.id ?? null;
  }
}
