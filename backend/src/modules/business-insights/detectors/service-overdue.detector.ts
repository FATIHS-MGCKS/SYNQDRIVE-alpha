import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DetectorContext,
  InsightCandidate,
  InsightDetector,
  InsightEntityScope,
  InsightSeverity,
  InsightType,
} from '../insight.types';

/**
 * Surfaces vehicles whose next manufacturer service is overdue or imminent.
 *
 * Classification mirrors the ServiceInfo card on the Health Tab so operators
 * see the same state on the org dashboard and on the per-vehicle page:
 *
 *   remainingDays < 0  OR  remainingKm < 0   → CRITICAL (Service überfällig)
 *   remainingDays 0..7 OR  remainingKm 0..500 → WARNING  (Service fällig)
 *
 * Data sources (same precedence as getServiceInfoStatus in
 * VehicleIntelligenceController):
 *   1. HM `maintenance.time_to_next_service` / `maintenance.distance_to_next_service`
 *      when the OEM streams them (hmServiceSource).
 *   2. Manufacturer interval + last service event / odometer baseline.
 *
 * Freshness: service intervals do not go stale the way a 12V voltage does —
 * a baseline from months ago is still authoritative — so we do not apply a
 * freshness cutoff here. We skip vehicles without any baseline (nothing to
 * compare against) rather than emitting noise.
 */
@Injectable()
export class ServiceOverdueDetector implements InsightDetector {
  readonly type = InsightType.SERVICE_OVERDUE;

  // Imminent thresholds — matches HealthSummaryService and the
  // ServiceInfoStatus `serviceDueImminently` flag.
  private static readonly IMMINENT_DAYS = 7;
  private static readonly IMMINENT_KM = 500;

  constructor(private readonly prisma: PrismaService) {}

  async detect(ctx: DetectorContext): Promise<InsightCandidate[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ['AVAILABLE', 'RENTED', 'IN_SERVICE', 'RESERVED'] },
      },
      select: {
        id: true,
        make: true,
        model: true,
        licensePlate: true,
        stationId: true,
        serviceIntervalManufacturerKm: true,
        serviceIntervalManufacturerMonths: true,
        lastServiceDate: true,
        lastServiceOdometerKm: true,
        latestState: {
          select: { odometerKm: true },
        },
      },
    });

    if (vehicles.length === 0) return [];

    const vehicleIds = vehicles.map((v) => v.id);

    // Most recent service event per vehicle — overrides the denormalized
    // `lastServiceDate` / `lastServiceOdometerKm` columns when present so
    // this detector stays aligned with the Service Info card (which uses
    // the latest FULL_SERVICE / GENERAL_INSPECTION / OIL_CHANGE / REPAIR
    // event as its baseline).
    const serviceEvents = await this.prisma.vehicleServiceEvent.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        eventType: {
          in: ['FULL_SERVICE', 'GENERAL_INSPECTION', 'OIL_CHANGE', 'REPAIR'],
        },
      },
      orderBy: { eventDate: 'desc' },
      select: { vehicleId: true, eventDate: true, odometerKm: true },
    });

    const latestServiceByVehicle = new Map<
      string,
      { eventDate: Date; odometerKm: number | null }
    >();
    for (const e of serviceEvents) {
      if (!latestServiceByVehicle.has(e.vehicleId)) {
        latestServiceByVehicle.set(e.vehicleId, {
          eventDate: e.eventDate,
          odometerKm: e.odometerKm,
        });
      }
    }

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const DAYS_PER_MONTH = 30.44;

    const candidates: InsightCandidate[] = [];

    for (const v of vehicles) {
      const latestEvent = latestServiceByVehicle.get(v.id);
      const baselineDate = latestEvent?.eventDate ?? v.lastServiceDate ?? null;
      const baselineOdo =
        latestEvent?.odometerKm ?? v.lastServiceOdometerKm ?? null;
      const intervalMonths = v.serviceIntervalManufacturerMonths ?? null;
      const intervalKm = v.serviceIntervalManufacturerKm ?? null;
      const currentOdo = v.latestState?.odometerKm ?? null;

      // Without both a baseline and an interval we cannot reason about
      // remaining distance/time — skip the vehicle rather than fabricating
      // a state.
      if (!baselineDate) continue;

      let remainingDays: number | null = null;
      let remainingKm: number | null = null;
      if (intervalMonths != null && intervalMonths > 0) {
        const intervalDays = Math.round(intervalMonths * DAYS_PER_MONTH);
        const elapsedDays = Math.floor(
          (ctx.now.getTime() - new Date(baselineDate).getTime()) / MS_PER_DAY,
        );
        remainingDays = intervalDays - elapsedDays;
      }
      if (
        baselineOdo != null &&
        currentOdo != null &&
        intervalKm != null &&
        intervalKm > 0
      ) {
        remainingKm = intervalKm - Math.round(currentOdo - baselineOdo);
      }

      const overdueByDays = remainingDays != null && remainingDays < 0;
      const overdueByKm = remainingKm != null && remainingKm < 0;
      const overdue = overdueByDays || overdueByKm;
      const overdueDays = overdueByDays ? Math.abs(remainingDays!) : null;
      const overdueKm = overdueByKm ? Math.abs(remainingKm!) : null;

      const imminentByDays =
        !overdue &&
        remainingDays != null &&
        remainingDays >= 0 &&
        remainingDays <= ServiceOverdueDetector.IMMINENT_DAYS;
      const imminentByKm =
        !overdue &&
        remainingKm != null &&
        remainingKm >= 0 &&
        remainingKm <= ServiceOverdueDetector.IMMINENT_KM;
      const imminent = imminentByDays || imminentByKm;

      if (!overdue && !imminent) continue;

      const label = v.licensePlate || `${v.make} ${v.model}`;
      let severity: InsightSeverity;
      let title: string;
      let message: string;
      let priority: number;
      const reasons: string[] = [];

      if (overdue) {
        severity = InsightSeverity.CRITICAL;
        title = 'Service überfällig';
        const parts: string[] = [];
        if (overdueDays != null) parts.push(`${overdueDays} Tagen`);
        if (overdueKm != null)
          parts.push(`${overdueKm.toLocaleString('de-DE')} km`);
        const suffix = parts.length > 0 ? ` seit ${parts.join(' / ')}` : '';
        message = `${label}: Werkstatttermin überfällig${suffix} — Service sofort vereinbaren, Betriebssicherheit und Garantie gefährdet.`;
        priority = 85;
        if (overdueDays != null) reasons.push(`Überfällig seit ${overdueDays} Tagen`);
        if (overdueKm != null)
          reasons.push(`Überfällig seit ${overdueKm.toLocaleString('de-DE')} km`);
      } else {
        severity = InsightSeverity.WARNING;
        title = 'Service fällig';
        const parts: string[] = [];
        if (imminentByDays) parts.push(`${remainingDays} Tagen`);
        if (imminentByKm)
          parts.push(`${remainingKm!.toLocaleString('de-DE')} km`);
        const suffix = parts.length > 0 ? ` in ${parts.join(' / ')}` : '';
        message = `${label}: Service fällig${suffix} — Werkstatttermin planen, vor der nächsten Buchung durchführen.`;
        priority = 65;
        if (imminentByDays) reasons.push(`Noch ${remainingDays} Tage`);
        if (imminentByKm)
          reasons.push(`Noch ${remainingKm!.toLocaleString('de-DE')} km`);
      }

      // Always include the data source so operators know whether this came
      // from a service baseline (manufacturer interval) or HM live data.
      reasons.push('Quelle: Manufacturer-Interval + letzter Service');

      candidates.push({
        type: this.type,
        severity,
        priority,
        title,
        message,
        actionLabel: 'Fahrzeug prüfen',
        actionType: 'navigate_vehicle',
        entityScope: InsightEntityScope.VEHICLE,
        entityIds: [v.id],
        timeContext: {
          baselineDate: new Date(baselineDate).toISOString(),
        },
        metrics: {
          remainingDays: remainingDays ?? 'unknown',
          remainingKm: remainingKm ?? 'unknown',
          overdueDays: overdueDays ?? 'none',
          overdueKm: overdueKm ?? 'none',
        },
        reasons,
        confidence: 0.9,
        dedupeKey: `service_overdue:${v.id}`,
        // Group overdue vehicles per station so the dashboard can collapse
        // "5 vehicles at station X are overdue" into a single line when
        // the list gets long. Falls back to a fleet-wide group when the
        // vehicle has no station (shared pool).
        groupKey: v.stationId
          ? `service_overdue:${v.stationId}`
          : 'service_overdue_fleet',
      });
    }

    return candidates;
  }
}
