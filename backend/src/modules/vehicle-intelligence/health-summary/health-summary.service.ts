import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DtcService } from '../dtc/dtc.service';
import { BatteryHealthService } from '../battery-health/battery-health.service';
import { BrakesService } from '../brakes/brakes.service';
import { TiresService } from '../tires/tires.service';
import { ServiceEventsService } from '../service-events/service-events.service';
import { TripsService } from '../trips/trips.service';
import { DrivingEventsService } from '../driving-events/driving-events.service';

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
    brakes: { hasSpecs: boolean; hasBrakeServiceHistory: boolean; hasData: boolean } | null;
    tires: { treadPercentEstimate: number | null; hasSetups: boolean; hasMeasurements: boolean; hasData: boolean } | null;
    serviceInfo: { lastServiceAt: string | null; lastOdometerKm: number | null; eventCount: number; hasData: boolean } | null;
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
    private readonly batteryHealthService: BatteryHealthService,
    private readonly brakesService: BrakesService,
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
      select: { id: true, organizationId: true, make: true, model: true, year: true, vin: true, fuelType: true },
    });
    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      dtcStats,
      dtcList,
      batteryLatest,
      batteryTrend,
      brakes,
      tireSetups,
      serviceEventsPaginated,
      tripStats,
      recentTrips,
      drivingInsights,
    ] = await Promise.all([
      this.dtcService.getStats(vehicleId).catch(() => null),
      this.dtcService.findByVehicle(vehicleId).then((r) => (Array.isArray(r) ? r.slice(0, 50) : [])).catch(() => []),
      this.batteryHealthService.getLatest(vehicleId).catch(() => null),
      this.batteryHealthService.findByVehicle(vehicleId, 30).catch(() => []),
      this.brakesService.findByVehicle(vehicleId).catch(() => []),
      this.tiresService.findSetupsByVehicle(vehicleId).catch(() => []),
      this.serviceEventsService.findByVehicle(vehicleId, { page: 1, limit: 50 }).catch(() => ({ data: [] })),
      this.tripsService.getStats(vehicleId).catch(() => ({ avgDrivingScore: null, totalTrips: 0, totalDistanceKm: 0 })),
      this.prisma.vehicleTrip.findMany({
        where: { vehicleId, startTime: { gte: ninetyDaysAgo } },
        select: { distanceKm: true, citySharePercent: true, highwaySharePercent: true, countrySharePercent: true },
        take: 100,
      }).catch(() => []),
      this.drivingEventsService.getInsights(vehicleId, ninetyDaysAgo, now).catch(() => ({ total: 0, harshBraking: 0, harshAcceleration: 0 })),
    ]);

    const serviceEvents = Array.isArray((serviceEventsPaginated as any).data) ? (serviceEventsPaginated as any).data : [];
    const oilEvents = serviceEvents.filter((e: any) => e.eventType === 'OIL_CHANGE');
    const lastService = serviceEvents[0] ?? null;
    const lastOil = oilEvents[0] ?? null;
    const hasBrakeService = serviceEvents.some((e: any) => e.eventType === 'BRAKE_SERVICE');

    let tireTreadPercent: number | null = null;
    const firstSetup = tireSetups?.[0] as {
      measurements?: Array<{ frontLeftMm?: number; frontRightMm?: number; rearLeftMm?: number; rearRightMm?: number }>;
      initialTreadDepthMm?: number;
      initialTreadFrontMm?: number;
      initialTreadRearMm?: number;
      tireSeason?: string;
      overallHealthPercent?: number;
    } | undefined;
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

    const insights = drivingInsights as { total?: number; harshBraking?: number; harshAcceleration?: number };
    const drivingEventsCount = insights?.total ?? 0;
    const harshBraking = insights?.harshBraking ?? 0;
    const harshAccel = insights?.harshAcceleration ?? 0;
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
    if (batteryLatest) available.push('battery'); else missing.push('battery');
    if (dtcStats != null) available.push('errorCodes'); else missing.push('errorCodes');
    if (brakes?.length) available.push('brakes'); else missing.push('brakes');
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
        battery: batteryLatest
          ? {
              status: (batteryLatest as any).sohPercent >= 80 ? 'good' : (batteryLatest as any).sohPercent >= 50 ? 'fair' : 'poor',
              sohPercent: (batteryLatest as any).sohPercent ?? null,
              voltageV: (batteryLatest as any).voltageV ?? null,
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
          hasSpecs: Array.isArray(brakes) && brakes.length > 0,
          hasBrakeServiceHistory: hasBrakeService,
          hasData: (Array.isArray(brakes) && brakes.length > 0) || hasBrakeService,
        },
        tires: {
          treadPercentEstimate: tireTreadPercent,
          hasSetups: Array.isArray(tireSetups) && tireSetups.length > 0,
          hasMeasurements: Array.isArray(tireSetups) && tireSetups.length > 0 && (tireSetups[0] as any).measurements?.length > 0,
          hasData: tireTreadPercent != null,
        },
        serviceInfo: {
          lastServiceAt: lastService?.eventDate ? (lastService as any).eventDate : null,
          lastOdometerKm: lastService?.odometerKm ?? null,
          eventCount: serviceEvents.length,
          hasData: serviceEvents.length > 0,
        },
        oilChange: {
          lastChangedAt: lastOil?.eventDate ? (lastOil as any).eventDate : null,
          eventCount: oilEvents.length,
          hasData: oilEvents.length > 0,
        },
      },
      behaviorAndUsage: {
        drivingScore: (tripStats as any).avgDrivingScore ?? null,
        drivingEventsCount,
        abuseDetectionCount: 0,
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

    if (m.battery?.hasData && (m.battery.sohPercent ?? 0) >= 70) {
      positives.push(`Battery state of health is ${m.battery.sohPercent}% — within normal range.`);
    } else if (m.battery?.hasData && (m.battery.sohPercent ?? 0) < 50) {
      watchpoints.push('Battery capacity is below 50%. Consider testing or replacement soon.');
      maintenanceFocus.push({ area: 'battery', priority: 'high', reason: 'Low state of health' });
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

    if (m.brakes?.hasData) {
      positives.push('Brake specs and/or service history are recorded.');
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
    if (m.battery?.hasData && (m.battery.sohPercent ?? 100) < 70 && (m.battery.sohPercent ?? 0) >= 50) {
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
