import { Injectable, Logger } from '@nestjs/common';
import { InsightType } from '@modules/business-insights/insight.types';
import type { InsightCandidate } from '@modules/business-insights/insight.types';
import type { DrivingAssessmentQualityStatus } from '@modules/vehicle-intelligence/trips/driving-assessment-device-quality.detector';
import { NotificationEntityType } from '@prisma/client';
import { NotificationProducerRouter } from './notification-producer.router';
import { DrivingAssessmentNotificationAdapter } from './driving-assessment-notification.adapter';
import { TechnicalObservationNotificationAdapter } from './technical-observation-notification.adapter';
import { StationShortageNotificationAdapter } from './station-shortage-notification.adapter';
import { LowUtilizationNotificationAdapter } from './low-utilization-notification.adapter';
import { VehicleHealthNotificationAdapter } from './vehicle-health-notification.adapter';
import {
  VEHICLE_HEALTH_NOTIFICATION_EVENT_TYPES,
  vehicleHealthSourceFingerprint,
} from './rental-health-notification.projector';
import type { VehicleHealthAdapterSource } from './notification-adapter.types';
import {
  buildTechnicalObservationConditionCode,
  isDeviceQualitySystemObservation,
} from './technical-observation.filters';
import { ACTIVE_NOTIFICATION_STATUSES, NotificationRepository } from '../notification.repository';
import { buildRegistryFingerprint } from '../registry/notification-event-registry';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
import { NotificationSeverity } from '../notification.enums';
import { NotificationCoreService } from '../notification-core.service';

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
    private readonly lowUtilizationAdapter: LowUtilizationNotificationAdapter,
    private readonly vehicleHealthAdapter: VehicleHealthNotificationAdapter,
    private readonly core: NotificationCoreService,
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

  /**
   * Sync low-utilization STATE notifications from BI detector output.
   * Vehicles that no longer qualify are resolved via SUCCESS ingest.
   */
  async syncLowUtilizationFromInsights(
    organizationId: string,
    runId: string,
    candidates: InsightCandidate[],
  ): Promise<void> {
    const lowUtil = candidates.filter((c) => c.type === InsightType.LOW_UTILIZATION);
    const activeVehicleIds = new Set(lowUtil.flatMap((c) => c.entityIds));

    for (const insight of lowUtil) {
      const vehicleId = insight.entityIds[0];
      if (!vehicleId) continue;
      const metrics = insight.metrics ?? {};
      const idleDays = typeof metrics.idleDays === 'number' ? metrics.idleDays : 0;
      const lostRevenueEur =
        typeof metrics.lostRevenueEur === 'number' ? metrics.lostRevenueEur : 0;
      const label =
        typeof metrics.entityLabel === 'string'
          ? metrics.entityLabel
          : insight.message?.split(':')[0]?.trim() || vehicleId;

      try {
        await this.router.ingestFromAdapter(
          this.lowUtilizationAdapter,
          {
            vehicleId,
            label,
            idleDays,
            lostRevenueEur,
          },
          this.adapterContext(organizationId, runId, runId),
        );
      } catch (err) {
        this.logger.warn(
          `Low utilization V2 ingest failed for ${vehicleId}: ${(err as Error).message}`,
        );
      }
    }

    const activeNotifications = await this.repository.listNotifications({
      organizationId,
      status: ACTIVE_NOTIFICATION_STATUSES,
      entityType: NotificationEntityType.VEHICLE,
      limit: 500,
    });

    for (const notification of activeNotifications) {
      if (notification.eventType !== 'LOW_UTILIZATION') continue;
      if (activeVehicleIds.has(notification.entityId)) continue;

      const params = (notification.templateParams ?? {}) as Record<string, unknown>;
      const label =
        typeof params.label === 'string' ? params.label : notification.entityId;
      const idleDays = typeof params.idleDays === 'number' ? params.idleDays : 0;
      const lostRevenueEur =
        typeof params.lostRevenueEur === 'number' ? params.lostRevenueEur : 0;

      try {
        await this.router.ingestFromAdapter(
          this.lowUtilizationAdapter,
          {
            vehicleId: notification.entityId,
            label,
            idleDays,
            lostRevenueEur,
            cleared: true,
          },
          this.adapterContext(organizationId, runId, runId),
        );
      } catch (err) {
        if (this.isRecoveryNotFound(err)) continue;
        this.logger.warn(
          `Low utilization V2 resolve failed for ${notification.entityId}: ${(err as Error).message}`,
        );
      }
    }
  }

  /** HM no-tracking is informational only — resolve any active inbox rows. */
  async resolveInboxExcludedNotifications(
    organizationId: string,
    runId: string,
  ): Promise<void> {
    const excluded = ['HM_SERVICE_NO_TRACKING'] as const;
    const activeNotifications = await this.repository.listNotifications({
      organizationId,
      status: ACTIVE_NOTIFICATION_STATUSES,
      limit: 500,
    });

    for (const notification of activeNotifications) {
      if (!excluded.includes(notification.eventType as (typeof excluded)[number])) continue;

      const params = (notification.templateParams ?? {}) as Record<string, unknown>;
      const label =
        typeof params.label === 'string' ? params.label : notification.entityId;

      try {
        const candidate = validateRegistryCandidate(
          buildCandidateFromRegistry({
            organizationId,
            eventType: notification.eventType,
            entityId: notification.entityId,
            sourceRef: runId,
            occurredAt: new Date(),
            severity: NotificationSeverity.SUCCESS,
            templateParams: { label },
            actionTargetContext: { vehicleId: notification.entityId },
            metadata: { runId, resolvedBy: 'inbox_excluded' },
          }),
        );
        if (candidate) {
          await this.core.ingestCandidate(candidate, { runId });
        }
      } catch (err) {
        if (this.isRecoveryNotFound(err)) continue;
        this.logger.warn(
          `Excluded notification resolve failed for ${notification.eventType}/${notification.entityId}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Materialize Rental Health warnings (DTC, battery, tires, brakes) as V2 notifications.
   * Active sources are ingested; stale active rows are resolved via SUCCESS ingest.
   */
  async syncVehicleHealthWarnings(
    organizationId: string,
    runId: string,
    sources: VehicleHealthAdapterSource[],
  ): Promise<void> {
    const activeFingerprints = new Set<string>();

    for (const source of sources) {
      if (!source.cleared) {
        activeFingerprints.add(vehicleHealthSourceFingerprint(organizationId, source));
      }
    }

    await this.ingestVehicleHealthSources(organizationId, runId, sources);

    const activeNotifications = await this.repository.listNotifications({
      organizationId,
      status: ACTIVE_NOTIFICATION_STATUSES,
      entityType: NotificationEntityType.VEHICLE,
      limit: 500,
    });

    for (const notification of activeNotifications) {
      if (
        !VEHICLE_HEALTH_NOTIFICATION_EVENT_TYPES.includes(
          notification.eventType as (typeof VEHICLE_HEALTH_NOTIFICATION_EVENT_TYPES)[number],
        )
      ) {
        continue;
      }
      if (activeFingerprints.has(notification.fingerprint)) continue;

      const params = (notification.templateParams ?? {}) as Record<string, unknown>;
      const label =
        typeof params.label === 'string' ? params.label : notification.entityId;
      const code =
        notification.eventType === 'ACTIVE_DTC' && typeof params.code === 'string'
          ? params.code
          : undefined;

      try {
        await this.router.ingestFromAdapter(
          this.vehicleHealthAdapter,
          {
            eventType: notification.eventType,
            vehicleId: notification.entityId,
            label,
            code,
            cleared: true,
          },
          this.adapterContext(organizationId, runId, runId),
        );
      } catch (err) {
        if (this.isRecoveryNotFound(err)) continue;
        this.logger.warn(
          `Vehicle health V2 resolve failed for ${notification.entityId}/${notification.eventType}: ${(err as Error).message}`,
        );
      }
    }
  }

  /** Ingest health sources without fleet-wide sweep — for real-time DTC/module updates. */
  async ingestVehicleHealthSources(
    organizationId: string,
    runId: string,
    sources: VehicleHealthAdapterSource[],
  ): Promise<void> {
    for (const source of sources) {
      try {
        await this.router.ingestFromAdapter(
          this.vehicleHealthAdapter,
          source,
          this.adapterContext(organizationId, runId, runId),
        );
      } catch (err) {
        this.logger.warn(
          `Vehicle health V2 ingest failed for ${source.vehicleId}/${source.eventType}: ${(err as Error).message}`,
        );
      }
    }
  }

  vehicleHealthFingerprint(
    organizationId: string,
    source: Pick<VehicleHealthAdapterSource, 'eventType' | 'vehicleId' | 'code'>,
  ): string {
    return vehicleHealthSourceFingerprint(organizationId, source);
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
