import { Injectable, Logger } from '@nestjs/common';
import { InsightType } from '@modules/business-insights/insight.types';
import type { InsightCandidate } from '@modules/business-insights/insight.types';
import type { DrivingAssessmentQualityStatus } from '@modules/vehicle-intelligence/trips/driving-assessment-device-quality.detector';
import { NotificationEntityType } from '@prisma/client';
import { NotificationProducerRouter } from './notification-producer.router';
import { DrivingAssessmentNotificationAdapter } from './driving-assessment-notification.adapter';
import { TechnicalObservationNotificationAdapter } from './technical-observation-notification.adapter';
import { StationShortageNotificationAdapter } from './station-shortage-notification.adapter';
import {
  buildTechnicalObservationConditionCode,
  isDeviceQualitySystemObservation,
} from './technical-observation.filters';
import { ACTIVE_NOTIFICATION_STATUSES, NotificationRepository } from '../notification.repository';
import { buildRegistryFingerprint } from '../registry/notification-event-registry';

export interface DrivingAssessmentQualityIngestInput {
  organizationId: string;
  vehicleId: string;
  label: string;
  status: DrivingAssessmentQualityStatus;
  sourceRef: string;
  runId?: string;
}

export interface TechnicalObservationIngestInput {
  organizationId: string;
  vehicleId: string;
  observationId: string;
  label: string;
  createdByWorkerId?: string | null;
  notes?: string | null;
  sourceRef?: string;
  runId?: string;
}

/**
 * Orchestrates V2 shadow ingest from domain producers.
 * V1 paths (DashboardInsight, ActionQueue) remain unchanged — no duplicate external delivery.
 */
@Injectable()
export class NotificationProducerIngestService {
  private readonly logger = new Logger(NotificationProducerIngestService.name);

  constructor(
    private readonly router: NotificationProducerRouter,
    private readonly repository: NotificationRepository,
    private readonly drivingAssessmentAdapter: DrivingAssessmentNotificationAdapter,
    private readonly technicalObservationAdapter: TechnicalObservationNotificationAdapter,
    private readonly stationShortageAdapter: StationShortageNotificationAdapter,
  ) {}

  async syncDrivingAssessmentQuality(input: DrivingAssessmentQualityIngestInput): Promise<void> {
    const degraded = input.status === 'DEGRADED';
    const normalized = input.status === 'RECOVERING' || input.status === 'NORMAL';

    if (!degraded && !normalized) return;

    try {
      await this.router.ingestFromAdapter(
        this.drivingAssessmentAdapter,
        {
          vehicleId: input.vehicleId,
          label: input.label,
          degraded,
          sourceRef: input.sourceRef,
        },
        this.adapterContext(input.organizationId, input.sourceRef, input.runId),
      );
    } catch (err) {
      if (normalized && this.isRecoveryNotFound(err)) return;
      this.logger.warn(
        `Driving assessment V2 ingest failed for ${input.vehicleId}: ${(err as Error).message}`,
      );
    }
  }

  async syncTechnicalObservationActive(input: TechnicalObservationIngestInput): Promise<void> {
    if (this.skipDeviceQualityObservation(input)) return;

    try {
      await this.router.ingestFromAdapter(
        this.technicalObservationAdapter,
        {
          vehicleId: input.vehicleId,
          label: input.label,
          complaintId: input.observationId,
        },
        this.adapterContext(input.organizationId, input.sourceRef ?? input.observationId, input.runId),
      );
    } catch (err) {
      this.logger.warn(
        `Technical observation V2 ingest failed for ${input.observationId}: ${(err as Error).message}`,
      );
    }
  }

  async syncTechnicalObservationResolved(input: TechnicalObservationIngestInput): Promise<void> {
    if (this.skipDeviceQualityObservation(input)) return;

    try {
      await this.router.ingestFromAdapter(
        this.technicalObservationAdapter,
        {
          vehicleId: input.vehicleId,
          label: input.label,
          complaintId: input.observationId,
          resolved: true,
        },
        this.adapterContext(input.organizationId, input.sourceRef ?? input.observationId, input.runId),
      );
    } catch (err) {
      if (this.isRecoveryNotFound(err)) return;
      this.logger.warn(
        `Technical observation V2 resolve failed for ${input.observationId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Sync station shortage state from BI detector output (pre-limit candidates).
   * Cleared stations receive SUCCESS ingest → RESOLVED.
   */
  async syncStationShortagesFromInsights(
    organizationId: string,
    runId: string,
    candidates: InsightCandidate[],
    policyThreshold: number,
  ): Promise<void> {
    const shortages = candidates.filter((c) => c.type === InsightType.STATION_SHORTAGE);
    const activeStationIds = new Set(shortages.flatMap((c) => c.entityIds));

    for (const insight of shortages) {
      const stationId = insight.entityIds[0];
      if (!stationId) continue;
      const metrics = insight.metrics ?? {};
      const available = typeof metrics.available === 'number' ? metrics.available : 0;
      const totalVehicles = typeof metrics.totalVehicles === 'number' ? metrics.totalVehicles : 0;
      const bookedOut = typeof metrics.bookedOut === 'number' ? metrics.bookedOut : 0;
      const stationName =
        typeof metrics.stationName === 'string' ? metrics.stationName : stationId;

      try {
        await this.router.ingestFromAdapter(
          this.stationShortageAdapter,
          {
            stationId,
            stationName,
            available,
            totalVehicles,
            bookedOut,
            threshold: policyThreshold,
            expiresAt: insight.expiresAt ? new Date(insight.expiresAt) : undefined,
          },
          this.adapterContext(organizationId, runId, runId),
        );
      } catch (err) {
        this.logger.warn(`Station shortage V2 ingest failed for ${stationId}: ${(err as Error).message}`);
      }
    }

    const activeNotifications = await this.repository.listNotifications({
      organizationId,
      status: ACTIVE_NOTIFICATION_STATUSES,
      entityType: NotificationEntityType.STATION,
      limit: 200,
    });

    for (const notification of activeNotifications) {
      if (notification.eventType !== 'STATION_SHORTAGE') continue;
      if (activeStationIds.has(notification.entityId)) continue;

      const params = (notification.templateParams ?? {}) as Record<string, unknown>;
      const stationName =
        typeof params.stationName === 'string' ? params.stationName : notification.entityId;

      try {
        await this.router.ingestFromAdapter(
          this.stationShortageAdapter,
          {
            stationId: notification.entityId,
            stationName,
            available: policyThreshold + 1,
            totalVehicles: 1,
            bookedOut: 0,
            threshold: policyThreshold,
            cleared: true,
          },
          this.adapterContext(organizationId, runId, runId),
        );
      } catch (err) {
        if (this.isRecoveryNotFound(err)) continue;
        this.logger.warn(
          `Station shortage V2 resolve failed for ${notification.entityId}: ${(err as Error).message}`,
        );
      }
    }
  }

  drivingAssessmentFingerprint(organizationId: string, vehicleId: string): string {
    return buildRegistryFingerprint(organizationId, 'DRIVING_ASSESSMENT_DEVICE_QUALITY', vehicleId).canonical;
  }

  technicalObservationFingerprint(
    organizationId: string,
    vehicleId: string,
    observationId: string,
  ): string {
    const conditionCode = buildTechnicalObservationConditionCode(observationId);
    return [
      organizationId,
      'TECHNICAL_OBSERVATION_ACTIVE',
      'VEHICLE',
      vehicleId,
      conditionCode,
      'v1',
    ].join('|');
  }

  stationShortageFingerprint(organizationId: string, stationId: string): string {
    return buildRegistryFingerprint(organizationId, 'STATION_SHORTAGE', stationId).canonical;
  }

  private adapterContext(organizationId: string, sourceRef: string, runId?: string) {
    return {
      organizationId,
      sourceRef,
      occurredAt: new Date(),
      runId,
    };
  }

  private skipDeviceQualityObservation(input: TechnicalObservationIngestInput): boolean {
    return isDeviceQualitySystemObservation({
      createdByWorkerId: input.createdByWorkerId,
      notes: input.notes,
    });
  }

  private isRecoveryNotFound(err: unknown): boolean {
    return (err as { status?: number; name?: string }).status === 404
      || (err as Error).name === 'NotFoundException';
  }
}
