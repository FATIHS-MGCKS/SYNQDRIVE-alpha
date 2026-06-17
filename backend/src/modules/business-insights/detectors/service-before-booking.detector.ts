import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { ServiceComplianceService } from '../../vehicle-intelligence/service-compliance/service-compliance.service';
import {
  NEXT_SERVICE_WARNING_DAYS,
  NEXT_SERVICE_WARNING_KM,
  TUV_BOKRAFT_WARNING_DAYS,
} from '../../vehicle-intelligence/service-compliance/service-compliance.config';
import {
  InsightCandidate,
  InsightDetector,
  DetectorContext,
  InsightType,
  InsightSeverity,
  InsightEntityScope,
} from '../insight.types';

/**
 * Pre-pickup risk when HM/OEM service or TÜV/BOKraft compliance conflicts with booking.
 * No nextServiceDueDate or interval estimates.
 */
@Injectable()
export class ServiceBeforeBookingDetector implements InsightDetector {
  readonly type = InsightType.SERVICE_BEFORE_BOOKING;

  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceCompliance: ServiceComplianceService,
  ) {}

  async detect(ctx: DetectorContext): Promise<InsightCandidate[]> {
    const horizon = new Date(ctx.now.getTime() + ctx.policy.serviceBeforeBookingHours * 3600_000);

    const upcoming = await this.prisma.booking.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ['CONFIRMED', 'PENDING'] },
        startDate: { gte: ctx.now, lte: horizon },
      },
      select: { id: true, vehicleId: true, startDate: true },
      orderBy: { startDate: 'asc' },
    });

    const seen = new Set<string>();
    const candidates: InsightCandidate[] = [];

    for (const b of upcoming) {
      if (seen.has(b.vehicleId)) continue;
      seen.add(b.vehicleId);

      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: b.vehicleId },
        select: {
          id: true,
          licensePlate: true,
          make: true,
          model: true,
          cleaningStatus: true,
          healthStatus: true,
          lastTuvDate: true,
          nextTuvDate: true,
          lastBokraftDate: true,
          nextBokraftDate: true,
        },
      });
      if (!vehicle) continue;

      const compliance = await this.serviceCompliance
        .evaluateCompliance(
          vehicle.id,
          {
            lastTuvDate: vehicle.lastTuvDate,
            nextTuvDate: vehicle.nextTuvDate,
            lastBokraftDate: vehicle.lastBokraftDate,
            nextBokraftDate: vehicle.nextBokraftDate,
          },
          ctx.now,
        )
        .catch(() => null);

      const reasons: string[] = [];
      if (vehicle.cleaningStatus && vehicle.cleaningStatus !== 'CLEAN') {
        reasons.push(`Reinigung: ${vehicle.cleaningStatus}`);
      }
      if (vehicle.healthStatus && vehicle.healthStatus !== 'GOOD') {
        reasons.push(`Health-Status: ${vehicle.healthStatus}`);
      }

      if (compliance) {
        const ns = compliance.nextService;
        if (ns.trackingStatus === 'TRACKED') {
          const overdue = ns.severity === 'CRITICAL';
          const imminent =
            ns.severity === 'WARNING' &&
            !overdue &&
            ((ns.timeToNextServiceDays != null &&
              ns.timeToNextServiceDays >= 0 &&
              ns.timeToNextServiceDays <= NEXT_SERVICE_WARNING_DAYS) ||
              (ns.distanceToNextServiceKm != null &&
                ns.distanceToNextServiceKm >= 0 &&
                ns.distanceToNextServiceKm <= NEXT_SERVICE_WARNING_KM));
          if (overdue || imminent) {
            reasons.push('Service laut HM/OEM vor Abholung fällig');
          }
        }

        const { tuvBokraft } = compliance;
        if (tuvBokraft.tuvOverdue) reasons.push('TÜV abgelaufen');
        else if (
          tuvBokraft.tuvRemainingDays != null &&
          tuvBokraft.tuvRemainingDays <= TUV_BOKRAFT_WARNING_DAYS
        ) {
          reasons.push('TÜV bald fällig');
        }
        if (tuvBokraft.bokraftOverdue) reasons.push('BOKraft abgelaufen');
        else if (
          tuvBokraft.bokraftRemainingDays != null &&
          tuvBokraft.bokraftRemainingDays <= TUV_BOKRAFT_WARNING_DAYS
        ) {
          reasons.push('BOKraft bald fällig');
        }
      }

      const activeDtc = await this.prisma.vehicleDtcEvent.count({
        where: { vehicleId: vehicle.id, isActive: true },
      });
      if (activeDtc > 0) reasons.push(`${activeDtc} aktive Fehlercode${activeDtc > 1 ? 's' : ''}`);

      if (reasons.length === 0) continue;

      const hoursUntil = Math.round((b.startDate.getTime() - ctx.now.getTime()) / 3600_000);
      const label = vehicle.licensePlate || `${vehicle.make} ${vehicle.model}`;
      const severity =
        hoursUntil < 6
          ? InsightSeverity.CRITICAL
          : hoursUntil < 24
            ? InsightSeverity.WARNING
            : InsightSeverity.INFO;

      candidates.push({
        type: this.type,
        severity,
        priority: severity === InsightSeverity.CRITICAL ? 88 : severity === InsightSeverity.WARNING ? 72 : 50,
        title: 'Vor Abholung prüfen',
        message: `${label} benötigt Aufmerksamkeit vor Abholung in ${hoursUntil}h — ${reasons[0].toLowerCase()}.`,
        actionLabel: 'Fahrzeug prüfen',
        actionType: 'navigate_vehicle',
        entityScope: InsightEntityScope.VEHICLE,
        entityIds: [vehicle.id],
        timeContext: { pickupAt: b.startDate.toISOString() },
        metrics: { hoursUntilPickup: hoursUntil, issueCount: reasons.length },
        reasons,
        confidence: 0.95,
        dedupeKey: `service_before_booking:${vehicle.id}:${b.id}`,
        expiresAt: b.startDate,
      });
    }
    return candidates;
  }
}
