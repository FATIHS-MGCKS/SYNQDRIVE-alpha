import { Injectable, Logger, Optional } from '@nestjs/common';
import { InsightType, InsightSeverity } from '@modules/business-insights/insight.types';
import type { InsightCandidate } from '@modules/business-insights/insight.types';
import type { DrivingAssessmentQualityStatus } from '@modules/vehicle-intelligence/trips/driving-assessment-device-quality.detector';
import { BOOKING_RETURN_OVERDUE_GRACE_PERIOD_MINUTES } from '@modules/bookings/overdue-return/overdue-return-explanation.constants';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationEntityType } from '@prisma/client';
import { NotificationProducerRouter } from './notification-producer.router';
import { DrivingAssessmentNotificationAdapter } from './driving-assessment-notification.adapter';
import { TechnicalObservationNotificationAdapter } from './technical-observation-notification.adapter';
import { StationShortageNotificationAdapter } from './station-shortage-notification.adapter';
import { LowUtilizationNotificationAdapter } from './low-utilization-notification.adapter';
import { ComplianceOperationalNotificationAdapter } from './compliance-operational-notification.adapter';
import { VehicleHealthNotificationAdapter } from './vehicle-health-notification.adapter';
import { BookingHandoverNotificationAdapter } from './booking-handover-notification.adapter';
import {
  bookingHandoverFingerprint as buildBookingHandoverFingerprint,
  bookingHandoverSourceFromInsight,
  BOOKING_HANDOVER_EVENT_TYPES,
  returnOverdueSourceFromBooking,
} from './booking-handover-source.mapper';
import type { BookingHandoverAdapterSource } from './notification-adapter.types';
import {
  VEHICLE_HEALTH_NOTIFICATION_EVENT_TYPES,
  vehicleHealthSourceFingerprint,
} from './rental-health-notification.projector';
import type { VehicleHealthAdapterSource } from './notification-adapter.types';
import {
  buildTechnicalObservationConditionCode,
  shouldIngestTechnicalObservationNotification,
} from './technical-observation.filters';
import { ACTIVE_NOTIFICATION_STATUSES, NotificationRepository } from '../notification.repository';
import { buildRegistryFingerprint } from '../registry/notification-event-registry';
import { buildCandidateFromRegistry } from '../registry/notification-event-registry';
import { validateRegistryCandidate } from '../registry/notification-event-registry.validator';
import { NotificationSeverity } from '../notification.enums';
import { NotificationCoreService } from '../notification-core.service';

/** VW-F-026: defer notification clear when evidence may be temporarily stale. */
function vehicleHealthNotificationClearGraceMs(): number {
  const raw =
    process.env.VEHICLE_HEALTH_NOTIFICATION_CLEAR_GRACE_MS ??
    String(6 * 60 * 60_000);
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return 6 * 60 * 60_000;
  }
  return Math.max(0, parsed);
}

const DEFERRABLE_HEALTH_SEVERITIES = new Set<NotificationSeverity>([
  NotificationSeverity.WARNING,
  NotificationSeverity.CRITICAL,
]);

const BOOKING_HANDOVER_SWEEP_LIMIT = Math.min(
  Math.max(
    Number.parseInt(process.env.BOOKING_HANDOVER_NOTIFICATION_SWEEP_LIMIT ?? '2000', 10) || 2000,
    500,
  ),
  5000,
);

const RETURN_OVERDUE_LOOKBACK_DAYS = 7;

const VEHICLE_HEALTH_NOTIFICATION_SWEEP_LIMIT = Math.min(
  Math.max(
    Number.parseInt(process.env.VEHICLE_HEALTH_NOTIFICATION_SWEEP_LIMIT ?? '2000', 10) || 2000,
    500,
  ),
  5000,
);

export interface DrivingAssessmentQualityIngestInput {
  organizationId: string;
  vehicleId: string;
  label: string;
  status: DrivingAssessmentQualityStatus;
  sourceRef: string;
  occurredAt?: Date;
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
  occurredAt?: Date;
  runId?: string;
  severity?: import('@modules/business-insights/insight.types').InsightSeverity;
  correlationId?: string;
  causationId?: string;
  sourceEventId?: string;
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
    private readonly complianceAdapter: ComplianceOperationalNotificationAdapter,
    private readonly vehicleHealthAdapter: VehicleHealthNotificationAdapter,
    private readonly bookingHandoverAdapter: BookingHandoverNotificationAdapter,
    private readonly core: NotificationCoreService,
    @Optional() private readonly prisma?: PrismaService,
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
        this.adapterContext(
          input.organizationId,
          input.sourceRef,
          input.runId,
          input.occurredAt,
        ),
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
        this.technicalObservationSource(input, false),
        this.adapterContext(
          input.organizationId,
          input.sourceEventId ?? input.sourceRef ?? input.observationId,
          input.runId,
          input.occurredAt,
          undefined,
          input.correlationId,
          input.causationId,
        ),
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
        this.technicalObservationSource(input, true),
        this.adapterContext(
          input.organizationId,
          input.sourceEventId ?? `${input.sourceRef ?? input.observationId}:resolved`,
          input.runId,
          input.occurredAt,
          undefined,
          input.correlationId,
          input.causationId,
        ),
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
      limit: VEHICLE_HEALTH_NOTIFICATION_SWEEP_LIMIT,
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
      limit: VEHICLE_HEALTH_NOTIFICATION_SWEEP_LIMIT,
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
   * Sync service/TÜV/BOKraft compliance insights into V2 notifications.
   */
  async syncComplianceFromInsights(
    organizationId: string,
    runId: string,
    candidates: InsightCandidate[],
  ): Promise<void> {
    const complianceTypes = new Set<InsightType>([
      InsightType.SERVICE_OVERDUE,
      InsightType.TUV_OVERDUE,
      InsightType.BOKRAFT_OVERDUE,
    ]);
    const compliance = candidates.filter((c) => complianceTypes.has(c.type));
    const activeFingerprints = new Set<string>();

    for (const insight of compliance) {
      const vehicleId = insight.entityIds[0];
      if (!vehicleId) continue;
      const eventType = this.complianceEventType(insight.type);
      if (!eventType) continue;

      const metrics = insight.metrics ?? {};
      const remainingDays =
        typeof metrics.remainingDays === 'number' ? metrics.remainingDays : null;
      const remainingKm =
        typeof metrics.remainingKm === 'number' ? metrics.remainingKm : null;

      try {
        await this.router.ingestFromAdapter(
          this.complianceAdapter,
          {
            eventType,
            vehicleId,
            label: this.labelFromInsight(insight, vehicleId),
            insightSeverity: insight.severity,
            dedupeKey: insight.dedupeKey,
            sourceEventId: insight.dedupeKey,
            remainingDays,
            remainingKm,
            complianceKind: eventType,
          },
          this.adapterContext(organizationId, insight.dedupeKey, runId),
        );
        activeFingerprints.add(
          buildRegistryFingerprint(organizationId, eventType, vehicleId).canonical,
        );
      } catch (err) {
        this.logger.warn(
          `Compliance V2 ingest failed for ${vehicleId}/${eventType}: ${(err as Error).message}`,
        );
      }
    }

    const activeNotifications = await this.repository.listNotifications({
      organizationId,
      status: ACTIVE_NOTIFICATION_STATUSES,
      entityType: NotificationEntityType.VEHICLE,
      limit: VEHICLE_HEALTH_NOTIFICATION_SWEEP_LIMIT,
    });

    const complianceEvents = new Set(['SERVICE_OVERDUE', 'TUV_OVERDUE', 'BOKRAFT_OVERDUE']);

    for (const notification of activeNotifications) {
      if (!complianceEvents.has(notification.eventType)) continue;
      if (activeFingerprints.has(notification.fingerprint)) continue;

      const params = (notification.templateParams ?? {}) as Record<string, unknown>;
      const label =
        typeof params.label === 'string' ? params.label : notification.entityId;

      try {
        await this.router.ingestFromAdapter(
          this.complianceAdapter,
          {
            eventType: notification.eventType as 'SERVICE_OVERDUE' | 'TUV_OVERDUE' | 'BOKRAFT_OVERDUE',
            vehicleId: notification.entityId,
            label,
            insightSeverity: InsightSeverity.WARNING,
            dedupeKey: notification.fingerprint,
            cleared: true,
          },
          this.adapterContext(organizationId, runId, runId),
        );
      } catch (err) {
        if (this.isRecoveryNotFound(err)) continue;
        this.logger.warn(
          `Compliance V2 resolve failed for ${notification.entityId}/${notification.eventType}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Sync pickup/tight-handover/return-inspection BI insights into V2 notifications.
   * Booking-scoped entity with stable per-booking fingerprints.
   */
  async syncBookingHandoverFromInsights(
    organizationId: string,
    runId: string,
    candidates: InsightCandidate[],
  ): Promise<void> {
    const handoverTypes = new Set<InsightType>([
      InsightType.PICKUP_OVERDUE,
      InsightType.TIGHT_HANDOVER,
      InsightType.RETURN_NEEDS_INSPECTION,
    ]);
    const handover = candidates.filter((c) => handoverTypes.has(c.type));
    const activeFingerprints = new Set<string>();

    for (const insight of handover) {
      const source = bookingHandoverSourceFromInsight(insight);
      if (!source) continue;

      try {
        await this.ingestBookingHandoverSource(organizationId, runId, source);
        activeFingerprints.add(
          buildBookingHandoverFingerprint(organizationId, source),
        );
      } catch (err) {
        this.logger.warn(
          `Booking handover V2 ingest failed for ${source.bookingId}/${source.eventType}: ${(err as Error).message}`,
        );
      }
    }

    await this.resolveStaleBookingHandoverNotifications(
      organizationId,
      runId,
      activeFingerprints,
      new Set(BOOKING_HANDOVER_EVENT_TYPES),
    );
  }

  /**
   * Materialize RETURN_OVERDUE from ACTIVE bookings past endDate (0 min grace).
   * Separate from BI because RETURN_OVERDUE is not an InsightType.
   */
  async syncReturnOverdueNotifications(
    organizationId: string,
    runId: string,
    referenceNow: Date = new Date(),
  ): Promise<void> {
    if (!this.prisma) return;

    const graceMs = BOOKING_RETURN_OVERDUE_GRACE_PERIOD_MINUTES * 60_000;
    const overdueCutoff = new Date(referenceNow.getTime() - graceMs);
    const lookbackStart = new Date(
      referenceNow.getTime() - RETURN_OVERDUE_LOOKBACK_DAYS * 24 * 60 * 60_000,
    );

    const bookings = await this.prisma.booking.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        endDate: { gte: lookbackStart, lt: overdueCutoff },
        handoverProtocols: { none: { kind: 'RETURN' } },
      },
      select: {
        id: true,
        endDate: true,
        vehicleId: true,
        customerId: true,
        vehicle: { select: { licensePlate: true, make: true, model: true } },
        customer: { select: { firstName: true, lastName: true } },
      },
    });

    const activeFingerprints = new Set<string>();

    for (const booking of bookings) {
      const source = returnOverdueSourceFromBooking(booking, referenceNow);
      try {
        await this.ingestBookingHandoverSource(organizationId, runId, source);
        activeFingerprints.add(
          buildBookingHandoverFingerprint(organizationId, source),
        );
      } catch (err) {
        this.logger.warn(
          `Return overdue V2 ingest failed for ${booking.id}: ${(err as Error).message}`,
        );
      }
    }

    await this.resolveStaleBookingHandoverNotifications(
      organizationId,
      runId,
      activeFingerprints,
      new Set(['RETURN_OVERDUE']),
    );
  }

  /**
   * Active sources are ingested; stale active rows are resolved via SUCCESS ingest.
   */
  async syncVehicleHealthWarnings(
    organizationId: string,
    runId: string,
    sources: VehicleHealthAdapterSource[],
  ): Promise<void> {
    const activeFingerprints = new Set<string>();
    const clearedFingerprints = new Set<string>();

    for (const source of sources) {
      const fp = vehicleHealthSourceFingerprint(organizationId, source);
      if (source.cleared) {
        clearedFingerprints.add(fp);
      } else {
        activeFingerprints.add(fp);
      }
    }

    await this.ingestVehicleHealthSources(organizationId, runId, sources, 'batch');

    const activeNotifications = await this.repository.listNotifications({
      organizationId,
      status: ACTIVE_NOTIFICATION_STATUSES,
      entityType: NotificationEntityType.VEHICLE,
      limit: VEHICLE_HEALTH_NOTIFICATION_SWEEP_LIMIT,
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

      const explicitlyCleared = clearedFingerprints.has(notification.fingerprint);
      const withinClearGrace =
        !explicitlyCleared &&
        vehicleHealthNotificationClearGraceMs() > 0 &&
        DEFERRABLE_HEALTH_SEVERITIES.has(
          notification.severity as NotificationSeverity,
        ) &&
        Date.now() - notification.lastSeenAt.getTime() <
          vehicleHealthNotificationClearGraceMs();
      if (withinClearGrace) continue;

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
    ingestPath: 'batch' | 'realtime' = 'realtime',
  ): Promise<void> {
    for (const source of sources) {
      const sourceEventId =
        source.sourceEventId ??
        (source.code ? `${runId}:${source.code}` : runId);
      try {
        await this.router.ingestFromAdapter(
          this.vehicleHealthAdapter,
          source,
          this.adapterContext(
            organizationId,
            sourceEventId,
            runId,
            source.occurredAt,
            ingestPath,
          ),
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

  bookingHandoverFingerprint(
    organizationId: string,
    source: Pick<
      BookingHandoverAdapterSource,
      'eventType' | 'bookingId' | 'conditionCodeVariant'
    >,
  ): string {
    return buildBookingHandoverFingerprint(organizationId, source);
  }

  private async ingestBookingHandoverSource(
    organizationId: string,
    runId: string,
    source: BookingHandoverAdapterSource,
  ): Promise<void> {
    await this.router.ingestFromAdapter(
      this.bookingHandoverAdapter,
      source,
      this.adapterContext(
        organizationId,
        source.sourceEventId ?? source.dedupeKey,
        runId,
        source.occurredAt,
      ),
    );
  }

  private async resolveStaleBookingHandoverNotifications(
    organizationId: string,
    runId: string,
    activeFingerprints: Set<string>,
    eventTypes: Set<string>,
  ): Promise<void> {
    const activeNotifications = await this.repository.listNotifications({
      organizationId,
      status: ACTIVE_NOTIFICATION_STATUSES,
      entityType: NotificationEntityType.BOOKING,
      limit: BOOKING_HANDOVER_SWEEP_LIMIT,
    });

    for (const notification of activeNotifications) {
      if (!eventTypes.has(notification.eventType)) continue;
      if (activeFingerprints.has(notification.fingerprint)) continue;

      const params = (notification.templateParams ?? {}) as Record<string, unknown>;
      const label =
        typeof params.label === 'string' ? params.label : notification.entityId;
      const bookingRef =
        typeof params.bookingRef === 'string' ? params.bookingRef : notification.entityId;

      try {
        await this.router.ingestFromAdapter(
          this.bookingHandoverAdapter,
          {
            eventType: notification.eventType as BookingHandoverAdapterSource['eventType'],
            bookingId: notification.entityId,
            label,
            bookingRef,
            insightSeverity: InsightSeverity.WARNING,
            dedupeKey: notification.fingerprint,
            cleared: true,
          },
          this.adapterContext(
            organizationId,
            `${runId}:clear:${notification.id}`,
            runId,
            new Date(notification.lastSeenAt.getTime()),
          ),
        );
      } catch (err) {
        if (this.isRecoveryNotFound(err)) continue;
        this.logger.warn(
          `Booking handover V2 resolve failed for ${notification.entityId}/${notification.eventType}: ${(err as Error).message}`,
        );
      }
    }
  }

  private adapterContext(
    organizationId: string,
    sourceRef: string,
    runId?: string,
    occurredAt?: Date,
    ingestPath?: 'batch' | 'realtime',
    correlationId?: string,
    causationId?: string,
  ) {
    const at = occurredAt ?? new Date();
    return {
      organizationId,
      sourceEventId: sourceRef,
      sourceRef,
      occurredAt: at,
      observedAt: at,
      runId,
      ingestPath,
      correlationId,
      causationId,
    };
  }

  private technicalObservationSource(
    input: TechnicalObservationIngestInput,
    resolved: boolean,
  ) {
    return {
      vehicleId: input.vehicleId,
      label: input.label,
      complaintId: input.observationId,
      observationId: input.observationId,
      resolved,
      severity: input.severity,
      correlationId: input.correlationId,
      causationId: input.causationId,
      sourceEventId: input.sourceEventId,
    };
  }

  private complianceEventType(
    type: InsightType,
  ): 'SERVICE_OVERDUE' | 'TUV_OVERDUE' | 'BOKRAFT_OVERDUE' | null {
    switch (type) {
      case InsightType.SERVICE_OVERDUE:
        return 'SERVICE_OVERDUE';
      case InsightType.TUV_OVERDUE:
        return 'TUV_OVERDUE';
      case InsightType.BOKRAFT_OVERDUE:
        return 'BOKRAFT_OVERDUE';
      default:
        return null;
    }
  }

  private labelFromInsight(insight: InsightCandidate, vehicleId: string): string {
    const colon = insight.message.indexOf(':');
    if (colon > 0) return insight.message.slice(0, colon).trim();
    return vehicleId;
  }

  private skipDeviceQualityObservation(input: TechnicalObservationIngestInput): boolean {
    return !shouldIngestTechnicalObservationNotification({
      createdByWorkerId: input.createdByWorkerId,
      notes: input.notes,
    });
  }

  private isRecoveryNotFound(err: unknown): boolean {
    return (err as { status?: number; name?: string }).status === 404
      || (err as Error).name === 'NotFoundException';
  }
}
