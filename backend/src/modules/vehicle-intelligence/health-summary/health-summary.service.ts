import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DtcService } from '../dtc/dtc.service';
import { BrakeHealthService } from '../brakes/brake-health.service';
import { TireHealthService } from '../tires/tire-health.service';
import { ServiceEventsService } from '../service-events/service-events.service';
import { TripsService } from '../trips/trips.service';
import { DrivingEventsService } from '../driving-events/driving-events.service';
import { CanonicalBatteryHealthService } from '../battery-health/canonical-battery-health.service';
import { ServiceComplianceService } from '../service-compliance/service-compliance.service';
import { FULL_SERVICE_BASELINE_EVENT_TYPES } from '../service-events/service-events.constants';
import {
  NEXT_SERVICE_WARNING_DAYS,
  NEXT_SERVICE_WARNING_KM,
} from '../service-compliance/service-compliance.config';

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
      overallCondition: string | null;
      hasBaseline: boolean;
      remainingKm: number | null;
      confidenceLabel: string | null;
      hasAlert: boolean;
      openAlertCount: number;
      hasData: boolean;
    } | null;
    tires: {
      treadPercentEstimate: number | null;
      // Canonical tire truth (TireHealthService.getSummary → tire-status.ts).
      status: string;
      displayTreadMm: number | null;
      displayMode: string;
      lowestTreadPosition: string | null;
      confidence: string;
      hasSetups: boolean;
      hasMeasurements: boolean;
      hasData: boolean;
    } | null;
    serviceInfo: {
      lastServiceAt: string | null;
      lastOdometerKm: number | null;
      eventCount: number;
      hasData: boolean;
      trackingStatus: 'TRACKED' | 'NO_TRACKING' | 'STALE' | null;
      remainingDays: number | null;
      remainingKm: number | null;
      overdue: boolean;
      overdueDays: number | null;
      overdueKm: number | null;
      dueImminently: boolean;
      severity: 'GOOD' | 'WARNING' | 'CRITICAL' | 'INFO' | null;
      message: string | null;
    } | null;
    oilChange: { lastChangedAt: string | null; eventCount: number; hasData: boolean } | null;
  };
  behaviorAndUsage: {
    /** Vehicle stress index 0–100 — higher = more load on tires/brakes. */
    drivingStressScore: number | null;
    /** @deprecated Mirror of drivingStressScore (legacy field name). */
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
    private readonly tireHealthService: TireHealthService,
    private readonly serviceEventsService: ServiceEventsService,
    private readonly tripsService: TripsService,
    private readonly drivingEventsService: DrivingEventsService,
    private readonly serviceCompliance: ServiceComplianceService,
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
        lastServiceDate: true,
        lastServiceOdometerKm: true,
      },
    });
    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      dtcStats,
      dtcList,
      batterySummary,
      brakeSummary,
      tireSummary,
      tireDataQuality,
      serviceEventsPaginated,
      tripStats,
      recentTrips,
      nextServiceCompliance,
    ] = await Promise.all([
      this.dtcService.getStats(vehicleId).catch(() => null),
      this.dtcService.findByVehicle(vehicleId).then((r) => (Array.isArray(r) ? r.slice(0, 50) : [])).catch(() => []),
      this.canonicalBatteryHealthService.getSummary(vehicleId).catch(() => null),
      this.brakeHealthService.getSummary(vehicleId).catch(() => null),
      // Canonical tire truth — single source for tread status/percent and data-quality flags.
      this.tireHealthService.getSummary(vehicleId).catch(() => null),
      this.tireHealthService.getTireDataQuality(vehicleId).catch(() => ({
        hasActiveSet: false,
        hasSetups: false,
        hasMeasurements: false,
      })),
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
      this.serviceCompliance.evaluateNextService(vehicleId, now).catch(() => null),
    ]);

    const serviceEvents = Array.isArray((serviceEventsPaginated as any).data) ? (serviceEventsPaginated as any).data : [];
    const oilEvents = serviceEvents.filter((e: any) => e.eventType === 'OIL_CHANGE');
    const lastService =
      serviceEvents.find((e: any) =>
        FULL_SERVICE_BASELINE_EVENT_TYPES.includes(e.eventType),
      ) ?? null;
    const lastOil = oilEvents[0] ?? null;
    const hasBrakeService = serviceEvents.some((e: any) => e.eventType === 'BRAKE_SERVICE');

    // Tire tread truth comes ONLY from the canonical TireHealthService summary
    // (which centralises the season-aware thresholds in tire-health.config /
    // tire-status). Data-quality flags (hasSetups/hasMeasurements) also come
    // from TireHealthService — never from a parallel TiresService query.
    const tireTreadPercent: number | null =
      tireSummary?.overallPercent != null ? Math.round(tireSummary.overallPercent) : null;
    const tireHasSetups = tireSummary?.hasSetups ?? tireDataQuality.hasSetups;
    const tireHasMeasurements =
      tireSummary?.hasMeasurements ?? tireDataQuality.hasMeasurements;

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
    if (tireHasSetups) available.push('tires'); else missing.push('tires');
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
          overallCondition: brakeSummary?.overallCondition ?? null,
          hasBaseline:
            brakeSummary?.stateClass === 'MEASURED' || brakeSummary?.stateClass === 'ESTIMATED',
          remainingKm:
            brakeSummary?.estimatedReplacementDueInKm ??
            brakeSummary?.legacy?.remainingKm ??
            null,
          confidenceLabel: brakeSummary?.confidenceLevel ?? brakeSummary?.confidence?.label ?? null,
          hasAlert: brakeSummary?.hasAlert === true,
          openAlertCount: brakeSummary?.openAlerts?.length ?? 0,
          hasData: brakeSummary != null || hasBrakeService,
        },
        tires: {
          treadPercentEstimate: tireTreadPercent,
          status: tireSummary?.overallStatus ?? 'UNKNOWN',
          displayTreadMm: tireSummary?.displayTreadMm ?? null,
          displayMode: tireSummary?.displayMode ?? 'UNKNOWN',
          lowestTreadPosition: tireSummary?.lowestTreadPosition ?? null,
          confidence: tireSummary?.confidence ?? 'UNKNOWN',
          hasSetups: tireHasSetups,
          hasMeasurements: tireHasMeasurements,
          hasData: tireSummary != null && tireSummary.overallStatus !== 'UNKNOWN',
        },
        serviceInfo: (() => {
          const ns = nextServiceCompliance;
          const tracked = ns?.trackingStatus === 'TRACKED';
          const remainingDays = tracked ? ns.timeToNextServiceDays : null;
          const remainingKm = tracked ? ns.distanceToNextServiceKm : null;
          const overdueByDays = remainingDays != null && remainingDays < 0;
          const overdueByKm = remainingKm != null && remainingKm < 0;
          const overdue = tracked && (overdueByDays || overdueByKm);
          const overdueDays = overdueByDays ? Math.abs(remainingDays!) : null;
          const overdueKm = overdueByKm ? Math.abs(remainingKm!) : null;
          const dueImminently =
            tracked &&
            !overdue &&
            ((remainingDays != null &&
              remainingDays >= 0 &&
              remainingDays <= NEXT_SERVICE_WARNING_DAYS) ||
              (remainingKm != null &&
                remainingKm >= 0 &&
                remainingKm <= NEXT_SERVICE_WARNING_KM));

          return {
            lastServiceAt: (lastService as any)?.eventDate ?? null,
            lastOdometerKm: (lastService as any)?.odometerKm ?? null,
            eventCount: serviceEvents.length,
            hasData: serviceEvents.length > 0 || tracked,
            trackingStatus: ns?.trackingStatus ?? null,
            remainingDays,
            remainingKm,
            overdue,
            overdueDays,
            overdueKm,
            dueImminently,
            severity: ns?.severity ?? null,
            message: ns?.message ?? null,
          };
        })(),
        oilChange: {
          lastChangedAt: lastOil?.eventDate ? (lastOil as any).eventDate : null,
          eventCount: oilEvents.length,
          hasData: oilEvents.length > 0,
        },
      },
      behaviorAndUsage: {
        drivingStressScore:
          (tripStats as any).avgDrivingStressScore ??
          (tripStats as any).avgDrivingScore ??
          null,
        drivingScore:
          (tripStats as any).avgDrivingStressScore ??
          (tripStats as any).avgDrivingScore ??
          null,
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
      positives.push(`Estimated 12V battery health is within normal range.`);
    } else if (m.battery?.hasData && (m.battery.sohPercent ?? 0) < 50) {
      watchpoints.push('Geschätzte 12V-Batteriegesundheit kritisch — Startschwierigkeiten wahrscheinlich, Austausch empfohlen.');
      maintenanceFocus.push({ area: 'battery', priority: 'high', reason: 'Low estimated battery health' });
    } else if (m.battery?.hasData && (m.battery.sohPercent ?? 0) < 75) {
      watchpoints.push('Geschätzte 12V-Batteriegesundheit niedrig — Startschwierigkeiten möglich, beobachten.');
      maintenanceFocus.push({ area: 'battery', priority: 'medium', reason: 'Declining estimated battery health' });
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

    if (m.brakes?.overallCondition === 'CRITICAL') {
      watchpoints.push('Brake condition is critical — immediate workshop inspection recommended.');
      maintenanceFocus.push({ area: 'brakes', priority: 'high', reason: 'Critical brake condition' });
    } else if (
      m.brakes?.overallCondition === 'WARNING' ||
      m.brakes?.overallCondition === 'WATCH'
    ) {
      watchpoints.push('Brake condition needs attention — plan service soon.');
      maintenanceFocus.push({ area: 'brakes', priority: 'medium', reason: 'Brake wear attention' });
    } else if (m.brakes?.stateClass === 'MEASURED') {
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

    const vehicleStress = b.drivingStressScore ?? b.drivingScore;
    if (vehicleStress != null && vehicleStress <= 25) {
      positives.push('Recent trips show low vehicle stress — gentle load on tires and brakes.');
    } else if (vehicleStress != null && vehicleStress >= 76) {
      watchpoints.push('Recent trips show critical vehicle stress — elevated wear on tires and brakes likely.');
      maintenanceFocus.push({ area: 'general', priority: 'medium', reason: 'Critical vehicle stress' });
    } else if (vehicleStress != null && vehicleStress >= 51) {
      watchpoints.push('Recent trips show high vehicle stress — monitor tire and brake wear closely.');
      maintenanceFocus.push({ area: 'general', priority: 'low', reason: 'High vehicle stress' });
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
      futureItems.push('Estimated 12V battery health is declining; recheck in a few months.');
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
