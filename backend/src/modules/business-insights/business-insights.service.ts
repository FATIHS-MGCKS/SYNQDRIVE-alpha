import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationProducerIngestService } from '@modules/notifications/adapters/notification-producer.ingest.service';
import { projectVehicleHealthWarnings } from '@modules/notifications/adapters/rental-health-notification.projector';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { DtcService } from '@modules/vehicle-intelligence/dtc/dtc.service';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';
import { InsightRankingService } from './insight-ranking.service';
import { InsightGroupingService } from './insight-grouping.service';
import { InsightFormatterService } from './insight-formatter.service';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { InsightTaskBridgeService } from './insight-task-bridge.service';
import {
  gateHealthInsightsForBusinessContext,
  RAW_HEALTH_INSIGHT_TYPES,
  type UpcomingBookingSlice,
} from './insight-health-gate';
import {
  InsightType,
  InsightCandidate,
  InsightDetector,
  DetectorContext,
  type TenantPolicy,
} from './insight.types';

import { TightHandoverDetector } from './detectors/tight-handover.detector';
import { ReturnNeedsInspectionDetector } from './detectors/return-needs-inspection.detector';
import { StationShortageDetector } from './detectors/station-shortage.detector';
import { LowUtilizationDetector } from './detectors/low-utilization.detector';
import { ServiceWindowDetector } from './detectors/service-window.detector';
import { ServiceBeforeBookingDetector } from './detectors/service-before-booking.detector';
import { BatteryCriticalDetector } from './detectors/battery-critical.detector';
import { TireCriticalDetector } from './detectors/tire-critical.detector';
import { BrakeCriticalDetector } from './detectors/brake-critical.detector';
import { ComplianceOperationalDetector } from './detectors/compliance-operational.detector';
import { PickupOverdueDetector } from './detectors/pickup-overdue.detector';
import { DrivingAssessmentDeviceQualityDetector } from './detectors/driving-assessment-device-quality.detector';

@Injectable()
export class BusinessInsightsService {
  private readonly logger = new Logger(BusinessInsightsService.name);
  private readonly detectors: InsightDetector[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: TenantInsightPolicyService,
    private readonly ranking: InsightRankingService,
    private readonly grouping: InsightGroupingService,
    private readonly formatter: InsightFormatterService,
    private readonly repo: DashboardInsightsRepository,
    private readonly bridge: InsightTaskBridgeService,
    tightHandover: TightHandoverDetector,
    returnInspection: ReturnNeedsInspectionDetector,
    stationShortage: StationShortageDetector,
    lowUtilization: LowUtilizationDetector,
    serviceWindow: ServiceWindowDetector,
    serviceBeforeBooking: ServiceBeforeBookingDetector,
    batteryCritical: BatteryCriticalDetector,
    tireCritical: TireCriticalDetector,
    brakeCritical: BrakeCriticalDetector,
    complianceOperational: ComplianceOperationalDetector,
    pickupOverdue: PickupOverdueDetector,
    drivingAssessmentDeviceQuality: DrivingAssessmentDeviceQualityDetector,
    @Optional() private readonly notificationIngest?: NotificationProducerIngestService,
    @Optional() private readonly rentalHealth?: RentalHealthService,
    @Optional() private readonly dtcService?: DtcService,
  ) {
    this.detectors = [
      tightHandover,
      returnInspection,
      stationShortage,
      lowUtilization,
      serviceWindow,
      serviceBeforeBooking,
      batteryCritical,
      tireCritical,
      brakeCritical,
      complianceOperational,
      pickupOverdue,
      drivingAssessmentDeviceQuality,
    ];
  }

  async runForOrganization(organizationId: string, trigger: string): Promise<{ runId: string; published: number }> {
    const policy = await this.policyService.getPolicy(organizationId);
    if (!policy.enabled) {
      this.logger.debug(`Insights disabled for org ${organizationId}`);
      return { runId: '', published: 0 };
    }

    await this.repo.expireStaleInsights(organizationId);

    const run = await this.repo.createRun(organizationId, trigger);
    const ctx: DetectorContext = { organizationId, now: new Date(), policy };

    try {
      const enabledDetectors = this.detectors.filter((d) => this.isDetectorEnabled(d, policy));
      const allCandidates: InsightCandidate[] = [];

      // Detectors are independent (each queries its own data slice) — run them
      // in parallel with Promise.allSettled so one slow detector no longer
      // blocks the whole run. A failing detector is still logged individually
      // without tearing down the others (same isolation as the previous
      // per-detector try/catch).
      const detectorResults = await Promise.allSettled(
        enabledDetectors.map(async (detector) => {
          const start = Date.now();
          const results = await detector.detect(ctx);
          const elapsed = Date.now() - start;
          if (elapsed > 2000) {
            this.logger.warn(
              `Detector ${detector.type} slow for org ${organizationId}: ${elapsed}ms`,
            );
          }
          return { detector, results };
        }),
      );

      for (let i = 0; i < detectorResults.length; i++) {
        const r = detectorResults[i];
        const type = enabledDetectors[i].type;
        if (r.status === 'fulfilled') {
          allCandidates.push(...r.value.results);
        } else {
          this.logger.warn(
            `Detector ${type} failed for org ${organizationId}: ${r.reason?.message ?? r.reason}`,
          );
        }
      }

      const gatedCandidates = await this.gateHealthInsights(allCandidates, ctx);

      const grouped = this.grouping.dedupeAndGroup(gatedCandidates);
      const ranked = this.ranking.rank(grouped);
      const formatted = this.formatter.format(ranked.slice(0, policy.maxVisibleInsights), policy.useLlmFormatting);

      await this.repo.publishInsights(organizationId, run.id, formatted);
      await this.repo.completeRun(run.id, gatedCandidates.length, formatted.length);

      // Materialize actionable per-vehicle candidates into escalating OrgTasks.
      // Uses the raw (pre-group, pre-limit) candidate list so every overdue
      // vehicle gets a task — not just the top-N published dashboard insights.
      // Isolated in its own try/catch: a bridge failure must never tear down a
      // successful insights run.
      try {
        await this.bridge.materialize(organizationId, gatedCandidates);
      } catch (bridgeErr: any) {
        this.logger.warn(
          `Insight→Task bridge failed for org ${organizationId}: ${bridgeErr?.message ?? bridgeErr}`,
        );
      }

      try {
        await this.notificationIngest?.syncStationShortagesFromInsights(
          organizationId,
          run.id,
          gatedCandidates,
          policy.stationShortageThreshold,
        );
      } catch (ingestErr: any) {
        this.logger.warn(
          `Notification V2 station shortage sync failed for org ${organizationId}: ${ingestErr?.message ?? ingestErr}`,
        );
      }

      try {
        await this.notificationIngest?.syncLowUtilizationFromInsights(
          organizationId,
          run.id,
          gatedCandidates,
        );
      } catch (lowUtilErr: any) {
        this.logger.warn(
          `Notification V2 low utilization sync failed for org ${organizationId}: ${lowUtilErr?.message ?? lowUtilErr}`,
        );
      }

      try {
        await this.notificationIngest?.resolveInboxExcludedNotifications(
          organizationId,
          run.id,
        );
      } catch (excludeErr: any) {
        this.logger.warn(
          `Notification V2 excluded resolve failed for org ${organizationId}: ${excludeErr?.message ?? excludeErr}`,
        );
      }

      try {
        await this.syncVehicleHealthNotifications(organizationId, run.id);
      } catch (healthIngestErr: any) {
        this.logger.warn(
          `Notification V2 vehicle health sync failed for org ${organizationId}: ${healthIngestErr?.message ?? healthIngestErr}`,
        );
      }

      this.logger.log(
        `Insights run [${trigger}] for org ${organizationId}: ${gatedCandidates.length} candidates → ${grouped.length} grouped → ${formatted.length} published`,
      );
      return { runId: run.id, published: formatted.length };
    } catch (err: any) {
      await this.repo.completeRun(run.id, 0, 0, err.message);
      this.logger.error(`Insights run failed for org ${organizationId}: ${err.message}`);
      return { runId: run.id, published: 0 };
    }
  }

  async runForAllActiveOrganizations(trigger: string) {
    const orgs = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    // Bounded parallelism across tenants: N orgs were previously processed
    // strictly sequentially which made a scheduled run O(N × detector-time).
    // A concurrency of 4 gives a meaningful wall-clock reduction while
    // bounding DB connection pressure (each org uses ~1-2 Prisma connections
    // across detectors).
    const results = await this.runWithConcurrency(orgs, 4, async (org) => {
      const r = await this.runForOrganization(org.id, trigger);
      return { orgId: org.id, published: r.published };
    });
    return results;
  }

  async pruneOldData() {
    const orgs = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    // Prune is a lightweight delete — a bit of concurrency is safe and cheap.
    await this.runWithConcurrency(orgs, 4, async (org) => {
      await this.repo.pruneOldRuns(org.id);
    });
    this.logger.log(`Pruned old insight data for ${orgs.length} organizations`);
  }

  /**
   * Minimal bounded-parallel executor. Preserves input order in the output
   * and swallows rejections to `undefined` so one failing tenant cannot abort
   * the whole batch.
   */
  private async runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    if (items.length === 0) return [];
    const safeLimit = Math.max(1, Math.min(limit, items.length));
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const i = nextIndex++;
        if (i >= items.length) return;
        try {
          results[i] = await fn(items[i]);
        } catch (err: any) {
          this.logger.warn(`Per-item task failed at index ${i}: ${err?.message ?? err}`);
          results[i] = undefined as unknown as R;
        }
      }
    };

    await Promise.all(Array.from({ length: safeLimit }, () => worker()));
    return results.filter((r) => r !== undefined);
  }

  /**
   * Raw BATTERY/TIRE/BRAKE insights only reach the cockpit when an upcoming
   * booking exists — otherwise they stay in Health modules only.
   */
  private async gateHealthInsights(
    candidates: InsightCandidate[],
    ctx: DetectorContext,
  ): Promise<InsightCandidate[]> {
    const healthVehicleIds = [
      ...new Set(
        candidates
          .filter((c) => RAW_HEALTH_INSIGHT_TYPES.has(c.type))
          .flatMap((c) => c.entityIds),
      ),
    ];

    if (healthVehicleIds.length === 0) {
      return gateHealthInsightsForBusinessContext(candidates, new Map(), new Map(), ctx.now);
    }

    const horizon = new Date(
      ctx.now.getTime() + ctx.policy.serviceBeforeBookingHours * 3_600_000,
    );

    const bookings = await this.prisma.booking.findMany({
      where: {
        organizationId: ctx.organizationId,
        vehicleId: { in: healthVehicleIds },
        status: { in: ['CONFIRMED', 'PENDING'] },
        startDate: { gte: ctx.now, lte: horizon },
      },
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        vehicleId: true,
        customerId: true,
        startDate: true,
        totalPriceCents: true,
        dailyRateCents: true,
      },
    });

    const bookingByVehicle = new Map<string, UpcomingBookingSlice>();
    for (const b of bookings) {
      if (!bookingByVehicle.has(b.vehicleId)) {
        bookingByVehicle.set(b.vehicleId, b);
      }
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: { id: { in: healthVehicleIds } },
      select: { id: true, licensePlate: true, make: true, model: true },
    });
    const labelById = new Map(
      vehicles.map((v) => [v.id, v.licensePlate || `${v.make} ${v.model}`.trim()]),
    );

    return gateHealthInsightsForBusinessContext(
      candidates,
      bookingByVehicle,
      labelById,
      ctx.now,
    );
  }

  private static readonly COMPLIANCE_INSIGHT_TYPES: InsightType[] = [
    InsightType.SERVICE_OVERDUE,
    InsightType.TUV_OVERDUE,
    InsightType.BOKRAFT_OVERDUE,
    InsightType.HM_SERVICE_NO_TRACKING,
  ];

  private isDetectorEnabled(detector: InsightDetector, policy: TenantPolicy): boolean {
    if (detector instanceof ComplianceOperationalDetector) {
      return BusinessInsightsService.COMPLIANCE_INSIGHT_TYPES.some((t) =>
        policy.enabledTypes.includes(t),
      );
    }
    return policy.enabledTypes.includes(detector.type);
  }

  /**
   * Batch-sync Rental Health V1 module warnings into V2 notifications (DTC per code,
   * battery/tires/brakes per vehicle). Runs after each insights evaluation pass.
   */
  private async syncVehicleHealthNotifications(
    organizationId: string,
    runId: string,
  ): Promise<void> {
    if (!this.notificationIngest || !this.rentalHealth || !this.dtcService) return;

    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId },
      select: { id: true, licensePlate: true, make: true, model: true },
    });

    const BATCH = 10;
    const allSources = [];

    for (let i = 0; i < vehicles.length; i += BATCH) {
      const slice = vehicles.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        slice.map(async (vehicle) => {
          const label =
            vehicle.licensePlate?.trim() ||
            `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() ||
            vehicle.id;
          try {
            const [health, activeDtcs] = await Promise.all([
              this.rentalHealth!.getVehicleHealth(organizationId, vehicle.id),
              this.dtcService!.findActive(vehicle.id),
            ]);
            return projectVehicleHealthWarnings(vehicle.id, label, health, activeDtcs);
          } catch (err) {
            this.logger.warn(
              `Vehicle health notification projection failed for ${vehicle.id}: ${(err as Error).message}`,
            );
            return [];
          }
        }),
      );
      allSources.push(...batchResults.flat());
    }

    await this.notificationIngest.syncVehicleHealthWarnings(organizationId, runId, allSources);
  }
}
