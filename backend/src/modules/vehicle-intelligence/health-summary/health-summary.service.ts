import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DtcService } from '../dtc/dtc.service';
import { BrakeHealthService } from '../brakes/brake-health.service';
import { TiresService } from '../tires/tires.service';
import { ServiceEventsService } from '../service-events/service-events.service';
import { TripsService } from '../trips/trips.service';
import { DrivingEventsService } from '../driving-events/driving-events.service';
import { CanonicalBatteryHealthService } from '../battery-health/canonical-battery-health.service';

/** Structured agent request payload (extensible for Driver Feedback later). */
export interface HealthSummaryAgentInput {
  vehicleContext: {
    vehicleId: string;
    orgId: string | null;
    make: string;
    model: string;
    year: number | null;
    vin: string;
    fuelType?: string | null;
  };
  healthModules: {
    battery: { status: string; sohPercent: number | null; voltageV: number | null; hasData: boolean } | null;
    errorCodes: { activeCount: number; totalRecent: number; lastCheckedAt: string | null; hasData: boolean } | null;
    brakes: {
      stateClass: string | null;
      hasBaseline: boolean;
      remainingKm: number | null;
      confidenceLabel: string | null;
      hasAlert: boolean;
      hasData: boolean;
    } | null;
    tires: { treadPercentEstimate: number | null; hasSetups: boolean; hasMeasurements: boolean; hasData: boolean } | null;
    serviceInfo: {
      lastServiceAt: string | null;
      lastOdometerKm: number | null;
      eventCount: number;
      hasData: boolean;
      // Next-service horizon — new fields so the AI Health Care summary can
      // explicitly flag overdue services instead of silently ignoring them.
      remainingDays: number | null;
      remainingKm: number | null;
      overdue: boolean;
      overdueDays: number | null;
      overdueKm: number | null;
      dueImminently: boolean;
    } | null;
    oilChange: { lastChangedAt: string | null; eventCount: number; hasData: boolean } | null;
  };
  behaviorAndUsage: {
    drivingScore: number | null;
    drivingEventsCount: number;
    abuseDetectionCount: number;
    accelerationBehavior: string | null;
    brakingBehavior: string | null;
    tripPattern: { mostlyShortDistance: boolean; mostlyLongDistance: boolean } | null;
    roadDistribution: { cityPercent: number | null; highwayPercent: number | null; countryRoadPercent: number | null } | null;
  };
  futureInputs: {
    driverFeedbackSummary: string | null;
  };
  dataQuality: { available: string[]; missing: string[] };
}

/** Agent response contract (UI-ready). */
export interface HealthSummaryAgentResponse {
  overallStatus: { level: 'good' | 'watch' | 'attention'; title: string; shortSummary: string };
  positives: string[];
  watchpoints: string[];
  futureOutlook: { summary: string; items: string[] };
  preventiveRecommendations: string[];
  maintenanceFocus: Array<{ area: string; priority: 'low' | 'medium' | 'high'; reason: string }>;
  dataConfidence: { level: 'low' | 'medium' | 'high'; reason: string };
}

@Injectable()
export class HealthSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dtcService: DtcService,
    private readonly canonicalBatteryHealthService: CanonicalBatteryHealthService,
    private readonly brakeHealthService: BrakeHealthService,
    private readonly tiresService: TiresService,
    private readonly serviceEventsService: ServiceEventsService,
    private readonly tripsService: TripsService,
    private readonly drivingEventsService: DrivingEventsService,
  ) {}

  async getSummary(vehicleId: string): Promise<HealthSummaryAgentResponse> {
    const input = await this.buildAgentInput(vehicleId);
    return this.generateSummary(input);
  }

  async buildAgentInput(vehicleId: string): Promise<HealthSummaryAgentInput> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        organizationId: true,
        make: true,
        model: true,
        year: true,
        vin: true,
        fuelType: true,
        serviceIntervalManufacturerKm: true,
        serviceIntervalManufacturerMonths: true,
        lastServiceDate: true,
        lastServiceOdometerKm: true,
        nextServiceDueDate: true,
      },
    });
    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    const latestStateRow = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { odometerKm: true },
    });

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      dtcStats,
      dtcList,
      batterySummary,
      brakeSummary,
      tireSetups,
      serviceEventsPaginated,
      tripStats,
      recentTrips,
    ] = await Promise.all([
      this.dtcService.getStats(vehicleId).catch(() => null),
      this.dtcService.findByVehicle(vehicleId).then((r) => (Array.isArray(r) ? r.slice(0, 50) : [])).catch(() => []),
      this.canonicalBatteryHealthService.getSummary(vehicleId).catch(() => null),
      this.brakeHealthService.getSummary(vehicleId).catch(() => null),
      this.tiresService.findSetupsByVehicle(vehicleId).catch(() => []),
      this.serviceEventsService.findByVehicle(vehicleId, { page: 1, limit: 50 }).catch(() => ({ data: [] })),
      this.tripsService.getStats(vehicleId).catch(() => ({
        avgDrivingScore: null,
        avgSafetyScore: null,
        totalTrips: 0,
        totalDistanceKm: 0,
        totalAccelerationEvents: 0,
        totalHardAccelerationEvents: 0,
        totalBrakingEvents: 0,
        totalHardBrakingEvents: 0,
        totalAbuseEvents: 0,
      })),
      this.prisma.vehicleTrip.findMany({
        where: { vehicleId, startTime: { gte: ninetyDaysAgo } },
        select: { distanceKm: true, citySharePercent: true, highwaySharePercent: true, countrySharePercent: true },
        take: 100,
      }).catch(() => []),
    ]);

    const serviceEvents = Array.isArray((serviceEventsPaginated as any).data) ? (serviceEventsPaginated as any).data : [];
    const oilEvents = serviceEvents.filter((e: any) => e.eventType === 'OIL_CHANGE');
    const lastService = serviceEvents[0] ?? null;
    const lastOil = oilEvents[0] ?? null;
    const hasBrakeService = serviceEvents.some((e: any) => e.eventType === 'BRAKE_SERVICE');

    let tireTreadPercent: number | null = null;
    type TireSetupShape = {
      status?: string;
      removedAt?: Date | null;
      measurements?: Array<{ frontLeftMm?: number; frontRightMm?: number; rearLeftMm?: number; rearRightMm?: number }>;
      initialTreadDepthMm?: number;
      initialTreadFrontMm?: number;
      initialTreadRearMm?: number;
      tireSeason?: string;
      overallHealthPercent?: number;
    };
    const activeSetup = (tireSetups as TireSetupShape[])?.find(
      (s) => s.status === 'ACTIVE' && s.removedAt == null,
    );
    const firstSetup: TireSetupShape | undefined = activeSetup ?? (tireSetups?.[0] as TireSetupShape | undefined);
    if (firstSetup?.overallHealthPercent != null) {
      tireTreadPercent = Math.round(firstSetup.overallHealthPercent);
    } else if (firstSetup?.measurements?.length) {
      const m = firstSetup.measurements[0];
      const replaceThreshold = firstSetup.tireSeason === 'WINTER' ? 4.0 : 3.0;
      const initFront = firstSetup.initialTreadFrontMm ?? firstSetup.initialTreadDepthMm ?? 8;
      const initRear = firstSetup.initialTreadRearMm ?? firstSetup.initialTreadDepthMm ?? 8;
      const frontVals = [m.frontLeftMm, m.frontRightMm].filter((x): x is number => typeof x === 'number');
      const rearVals = [m.rearLeftMm, m.rearRightMm].filter((x): x is number => typeof x === 'number');
      const frontAvg = frontVals.length > 0 ? frontVals.reduce((a, b) => a + b, 0) / frontVals.length : null;
      const rearAvg = rearVals.length > 0 ? rearVals.reduce((a, b) => a + b, 0) / rearVals.length : null;
      const usableFront = initFront - replaceThreshold;
      const usableRear = initRear - replaceThreshold;
      const frontPct = frontAvg != null && usableFront > 0 ? Math.max(0, Math.min(100, Math.round((frontAvg - replaceThreshold) / usableFront * 100))) : null;
      const rearPct = rearAvg != null && usableRear > 0 ? Math.max(0, Math.min(100, Math.round((rearAvg - replaceThreshold) / usableRear * 100))) : null;
      if (frontPct != null && rearPct != null) tireTreadPercent = Math.round((frontPct + rearPct) / 2);
      else tireTreadPercent = frontPct ?? rearPct ?? null;
    }

    let cityPct: number | null = null;
    let highwayPct: number | null = null;
    let countryPct: number | null = null;
    type TripShare = { citySharePercent?: number | null; highwaySharePercent?: number | null; countrySharePercent?: number | null };
    const tripsWithShare = recentTrips as TripShare[];
    if (tripsWithShare.length > 0) {
      const withCity = tripsWithShare.filter((t) => t.citySharePercent != null);
      const withHighway = tripsWithShare.filter((t) => t.highwaySharePercent != null);
      const withCountry = tripsWithShare.filter((t) => t.countrySharePercent != null);
      if (withCity.length) cityPct = Math.round(withCity.reduce((s, t) => s + (t.citySharePercent ?? 0), 0) / withCity.length);
      if (withHighway.length) highwayPct = Math.round(withHighway.reduce((s, t) => s + (t.highwaySharePercent ?? 0), 0) / withHighway.length);
      if (withCountry.length) countryPct = Math.round(withCountry.reduce((s, t) => s + (t.countrySharePercent ?? 0), 0) / withCountry.length);
    }

    const avgTripDistance = recentTrips.length > 0 && (tripStats as any).totalDistanceKm != null && (tripStats as any).totalTrips > 0
      ? (tripStats as any).totalDistanceKm / (tripStats as any).totalTrips
      : null;
    const mostlyShortDistance = avgTripDistance != null && avgTripDistance < 20;
    const mostlyLongDistance = avgTripDistance != null && avgTripDistance >= 50;

    const drivingEventsCount =
      ((tripStats as any).totalAccelerationEvents ?? 0) +
      ((tripStats as any).totalBrakingEvents ?? 0);
    const harshBraking = (tripStats as any).totalHardBrakingEvents ?? 0;
    const harshAccel = (tripStats as any).totalHardAccelerationEvents ?? 0;
    let accelerationBehavior: string | null = null;
    let brakingBehavior: string | null = null;
    if (drivingEventsCount > 0) {
      if (harshAccel > 5) accelerationBehavior = 'elevated_harsh_acceleration';
      else if (harshAccel > 0) accelerationBehavior = 'moderate';
      else accelerationBehavior = 'smooth';
      if (harshBraking > 5) brakingBehavior = 'elevated_harsh_braking';
      else if (harshBraking > 0) brakingBehavior = 'moderate';
      else brakingBehavior = 'smooth';
    }

    const available: string[] = [];
    const missing: string[] = [];
    if (batterySummary?.lv?.status !== 'estimate_unavailable') available.push('battery');
    else missing.push('battery');
    if (dtcStats != null) available.push('errorCodes'); else missing.push('errorCodes');
    if (brakeSummary != null) available.push('brakes'); else missing.push('brakes');
    if (tireSetups?.length) available.push('tires'); else missing.push('tires');
    if (serviceEvents.length) available.push('serviceInfo'); else missing.push('serviceInfo');
    if (oilEvents.length) available.push('oilChange'); else missing.push('oilChange');
    if ((tripStats as any).totalTrips > 0) available.push('trips'); else missing.push('trips');
    if (drivingEventsCount > 0) available.push('drivingEvents'); else missing.push('drivingEvents');

    return {
      vehicleContext: {
        vehicleId: vehicle.id,
        orgId: vehicle.organizationId,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        vin: vehicle.vin,
        fuelType: vehicle.fuelType ?? undefined,
      },
      healthModules: {
        battery: batterySummary
          ? {
              status:
                batterySummary.lv?.condition === 'good'
                  ? 'good'
                  : batterySummary.lv?.condition === 'watch'
                    ? 'fair'
                    : batterySummary.lv?.condition === 'attention'
                      ? 'poor'
                      : 'unknown',
              sohPercent: batterySummary.lv?.healthPercent ?? null,
              voltageV: batterySummary.lv?.telemetry?.voltageV ?? null,
              hasData: true,
            }
          : { status: 'unknown', sohPercent: null, voltageV: null, hasData: false },
        errorCodes: dtcStats != null
          ? {
              activeCount: (dtcStats as any).active ?? 0,
              totalRecent: Array.isArray(dtcList) ? dtcList.length : 0,
              lastCheckedAt: (dtcStats as any).lastChecked != null ? new Date((dtcStats as any).lastChecked).toISOString() : null,
              hasData: true,
            }
          : { activeCount: 0, totalRecent: 0, lastCheckedAt: null, hasData: false },
        brakes: {
          stateClass: brakeSummary?.stateClass ?? null,
          hasBaseline:
            brakeSummary?.stateClass === 'MEASURED' || brakeSummary?.stateClass === 'ESTIMATED',
          remainingKm: brakeSummary?.remainingKm ?? null,
          confidenceLabel: brakeSummary?.confidence?.label ?? null,
          hasAlert: brakeSummary?.hasAlert === true,
          hasData: brakeSummary != null || hasBrakeService,
        },
        tires: {
          treadPercentEstimate: tireTreadPercent,
          hasSetups: Array.isArray(tireSetups) && tireSetups.length > 0,
          hasMeasurements: firstSetup?.measurements != null && firstSetup.measurements.length > 0,
          hasData: tireTreadPercent != null,
        },
        serviceInfo: (() => {
          // Compute remaining days/km and overdue flags from the same
          // manufacturer-interval inputs the Service Info card uses. This
          // keeps the AI summary consistent with the Health Tab UI without
          // needing a second round-trip to the service-info-status endpoint.
          const MS_PER_DAY = 24 * 60 * 60 * 1000;
          const DAYS_PER_MONTH = 30.44;
          const baselineDate: Date | null =
            (lastService as any)?.eventDate ?? vehicle.lastServiceDate ?? null;
          const baselineOdo: number | null =
            (lastService as any)?.odometerKm ?? vehicle.lastServiceOdometerKm ?? null;
          const intervalMonths = vehicle.serviceIntervalManufacturerMonths ?? null;
          const intervalKm = vehicle.serviceIntervalManufacturerKm ?? null;
          const currentOdo = latestStateRow?.odometerKm ?? null;

          let remainingDays: number | null = null;
          let remainingKm: number | null = null;
          if (baselineDate && intervalMonths != null && intervalMonths > 0) {
            const intervalDays = Math.round(intervalMonths * DAYS_PER_MONTH);
            const elapsedDays = Math.floor(
              (now.getTime() - new Date(baselineDate).getTime()) / MS_PER_DAY,
            );
            remainingDays = intervalDays - elapsedDays;
          }
          if (baselineOdo != null && currentOdo != null && intervalKm != null && intervalKm > 0) {
            remainingKm = intervalKm - Math.round(currentOdo - baselineOdo);
          }

          const overdueByDays = remainingDays != null && remainingDays < 0;
          const overdueByKm = remainingKm != null && remainingKm < 0;
          const overdue = overdueByDays || overdueByKm;
          const overdueDays = overdueByDays ? Math.abs(remainingDays!) : null;
          const overdueKm = overdueByKm ? Math.abs(remainingKm!) : null;
          const dueImminently =
            !overdue &&
            ((remainingDays != null && remainingDays >= 0 && remainingDays <= 7) ||
              (remainingKm != null && remainingKm >= 0 && remainingKm <= 500));

          return {
            lastServiceAt: (lastService as any)?.eventDate ?? null,
            lastOdometerKm: (lastService as any)?.odometerKm ?? null,
            eventCount: serviceEvents.length,
            hasData: serviceEvents.length > 0,
            remainingDays,
            remainingKm,
            overdue,
            overdueDays,
            overdueKm,
            dueImminently,
          };
        })(),
        oilChange: {
          lastChangedAt: lastOil?.eventDate ? (lastOil as any).eventDate : null,
          eventCount: oilEvents.length,
          hasData: oilEvents.length > 0,
        },
      },
      behaviorAndUsage: {
        drivingScore: (tripStats as any).avgDrivingScore ?? null,
        drivingEventsCount,
        abuseDetectionCount: (tripStats as any).totalAbuseEvents ?? 0,
        accelerationBehavior,
        brakingBehavior,
        tripPattern: (tripStats as any).totalTrips > 0 ? { mostlyShortDistance, mostlyLongDistance } : null,
        roadDistribution: cityPct != null || highwayPct != null || countryPct != null ? { cityPercent: cityPct, highwayPercent: highwayPct, countryRoadPercent: countryPct } : null,
      },
      futureInputs: { driverFeedbackSummary: null },
      dataQuality: { available, missing },
    };
  }

  /** Deterministic summary generator. Can be replaced by DIMO Agent call later. */
  generateSummary(input: HealthSummaryAgentInput): HealthSummaryAgentResponse {
    const m = input.healthModules;
    const b = input.behaviorAndUsage;
    const positives: string[] = [];
    const watchpoints: string[] = [];
    const futureItems: string[] = [];
    const preventive: string[] = [];
    const maintenanceFocus: Array<{ area: string; priority: 'low' | 'medium' | 'high'; reason: string }> = [];

    if (m.battery?.hasData && (m.battery.sohPercent ?? 0) >= 75) {
      positives.push(`Battery state of health is ${m.battery.sohPercent}% — within normal range.`);
    } else if (m.battery?.hasData && (m.battery.sohPercent ?? 0) < 50) {
      watchpoints.push('Battery-SOH unter 50% — Startschwierigkeiten wahrscheinlich, Austausch empfohlen.');
      maintenanceFocus.push({ area: 'battery', priority: 'high', reason: 'Low state of health' });
    } else if (m.battery?.hasData && (m.battery.sohPercent ?? 0) < 75) {
      watchpoints.push('Battery-SOH unter 75% — Startschwierigkeiten möglich, beobachten.');
      maintenanceFocus.push({ area: 'battery', priority: 'medium', reason: 'Declining state of health' });
    }

    if (m.errorCodes?.hasData && m.errorCodes.activeCount === 0) {
      positives.push('No active diagnostic codes reported.');
    } else if (m.errorCodes?.hasData && m.errorCodes.activeCount > 0) {
      watchpoints.push(`${m.errorCodes.activeCount} active error code(s) — review Error Codes for details.`);
      maintenanceFocus.push({ area: 'error_codes', priority: m.errorCodes.activeCount >= 3 ? 'high' : 'medium', reason: 'Active DTCs' });
    }

    if (m.tires?.hasData && (m.tires.treadPercentEstimate ?? 100) >= 50) {
      positives.push(`Tire tread estimate is around ${m.tires.treadPercentEstimate}% remaining.`);
    } else if (m.tires?.hasData && (m.tires.treadPercentEstimate ?? 0) < 40) {
      watchpoints.push('Tire tread is low. Plan for rotation or replacement.');
      maintenanceFocus.push({ area: 'tires', priority: (m.tires.treadPercentEstimate ?? 0) < 25 ? 'high' : 'medium', reason: 'Tread wear' });
    }

    if (m.brakes?.stateClass === 'MEASURED') {
      positives.push('Brake health is based on measured baseline data.');
    } else if (m.brakes?.stateClass === 'ESTIMATED') {
      positives.push('Brake health is available as an estimate with baseline context.');
    } else if (m.brakes?.stateClass === 'WARNING_ONLY') {
      watchpoints.push('Brake module has warning-only telemetry without modeled baseline.');
      maintenanceFocus.push({ area: 'brakes', priority: 'medium', reason: 'No modeled baseline' });
    } else if (m.brakes?.stateClass === 'NO_BASELINE') {
      watchpoints.push('Brake baseline missing — record measured brake inspection to enable wear modeling.');
      maintenanceFocus.push({ area: 'brakes', priority: 'medium', reason: 'Missing baseline data' });
    }

    if (m.brakes?.hasAlert) {
      watchpoints.push('Brake alerts are present in the canonical brake-health model.');
      maintenanceFocus.push({ area: 'brakes', priority: 'high', reason: 'Brake alert state' });
    }

    // Service overdue / imminent — surfaces the same critical state the
    // Service Info card shows on the Health Tab. A single watchpoint here
    // flows into the AI Health Care summary reasons list and also flips the
    // overall status to "attention" via the hasRisks branch below.
    if (m.serviceInfo?.overdue) {
      const parts: string[] = [];
      if (m.serviceInfo.overdueDays != null) parts.push(`${m.serviceInfo.overdueDays} Tagen`);
      if (m.serviceInfo.overdueKm != null) parts.push(`${m.serviceInfo.overdueKm.toLocaleString('de-DE')} km`);
      const suffix = parts.length > 0 ? ` seit ${parts.join(' / ')}` : '';
      watchpoints.push(
        `Nächster Service überfällig${suffix} — Werkstatttermin zeitnah vereinbaren, Garantie- und Betriebssicherheit gefährdet.`,
      );
      maintenanceFocus.push({ area: 'service', priority: 'high', reason: 'Service overdue' });
    } else if (m.serviceInfo?.dueImminently) {
      const parts: string[] = [];
      if (m.serviceInfo.remainingDays != null && m.serviceInfo.remainingDays <= 7) parts.push(`${m.serviceInfo.remainingDays} Tagen`);
      if (m.serviceInfo.remainingKm != null && m.serviceInfo.remainingKm <= 500) parts.push(`${m.serviceInfo.remainingKm.toLocaleString('de-DE')} km`);
      const suffix = parts.length > 0 ? ` in ${parts.join(' / ')}` : '';
      watchpoints.push(
        `Nächster Service fällig${suffix} — Werkstatttermin planen, vor der nächsten Buchung durchführen.`,
      );
      maintenanceFocus.push({ area: 'service', priority: 'medium', reason: 'Service due imminently' });
    }

    if (m.serviceInfo?.hasData) {
      positives.push('Service history is available; last service recorded.');
    }
    if (m.oilChange?.hasData) {
      positives.push('Oil change history is recorded.');
    } else if (m.serviceInfo?.hasData) {
      futureItems.push('Consider logging the next oil change for accurate interval tracking.');
      preventive.push('Log oil changes to keep intervals accurate.');
    }

    if (b.drivingScore != null && b.drivingScore >= 80) {
      positives.push('Driving score is good — smooth driving pattern.');
    } else if (b.drivingScore != null && b.drivingScore < 60) {
      watchpoints.push('Driving score is below average; harsh events may increase wear.');
      maintenanceFocus.push({ area: 'general', priority: 'low', reason: 'Driving style impact' });
    }

    if (b.brakingBehavior === 'elevated_harsh_braking') {
      watchpoints.push('Elevated harsh braking events — may accelerate brake wear.');
      maintenanceFocus.push({ area: 'brakes', priority: 'medium', reason: 'Frequent harsh braking' });
    }
    if (b.accelerationBehavior === 'elevated_harsh_acceleration') {
      watchpoints.push('Elevated harsh acceleration — consider smoother driving to reduce wear.');
    }

    if (m.tires?.hasData && (m.tires.treadPercentEstimate ?? 100) < 60 && (m.tires.treadPercentEstimate ?? 0) >= 30) {
      futureItems.push('Monitor tire tread; plan replacement before it falls below 25%.');
    }
    if (m.battery?.hasData && (m.battery.sohPercent ?? 100) < 75 && (m.battery.sohPercent ?? 0) >= 50) {
      futureItems.push('Battery capacity is declining; recheck in a few months.');
    }

    if (input.dataQuality.missing.length > 3) {
      preventive.push('Add more service and maintenance data for a fuller picture.');
    }

    const hasRisks = watchpoints.length > 0 || maintenanceFocus.some((x) => x.priority === 'high');
    const hasWatch = watchpoints.length > 0 || maintenanceFocus.some((x) => x.priority === 'medium');
    let level: 'good' | 'watch' | 'attention' = 'good';
    if (hasRisks) level = 'attention';
    else if (hasWatch) level = 'watch';

    const titles: Record<string, string> = {
      good: 'Overall condition good',
      watch: 'Some areas need attention',
      attention: 'Attention recommended',
    };
    const summaries: Record<string, string> = {
      good: 'Vehicle health looks good based on available data. Keep up routine maintenance.',
      watch: 'A few items need monitoring or planned maintenance.',
      attention: 'One or more areas need attention. Review watchpoints and maintenance focus.',
    };

    const confidenceMissing = input.dataQuality.missing.length;
    let dataConfidence: 'low' | 'medium' | 'high' = 'high';
    let confidenceReason = 'Summary based on available health and usage data.';
    if (confidenceMissing > 4) {
      dataConfidence = 'low';
      confidenceReason = 'Limited data available; summary may be incomplete.';
    } else if (confidenceMissing > 2) {
      dataConfidence = 'medium';
      confidenceReason = 'Some modules have no data; summary is partial.';
    }

    if (positives.length === 0 && watchpoints.length === 0) {
      positives.push('No major issues detected from the data currently available.');
    }

    return {
      overallStatus: {
        level,
        title: titles[level],
        shortSummary: summaries[level],
      },
      positives,
      watchpoints,
      futureOutlook: {
        summary: futureItems.length > 0 ? 'Near-term items to monitor.' : 'No specific near-term concerns from current data.',
        items: futureItems.length > 0 ? futureItems : ['Continue routine checks and log service events.'],
      },
      preventiveRecommendations: preventive.length > 0 ? preventive : ['Keep service and tire logs up to date for accurate projections.'],
      maintenanceFocus: maintenanceFocus.length > 0 ? maintenanceFocus : [{ area: 'general', priority: 'low', reason: 'Routine maintenance' }],
      dataConfidence: { level: dataConfidence, reason: confidenceReason },
    };
  }
}
