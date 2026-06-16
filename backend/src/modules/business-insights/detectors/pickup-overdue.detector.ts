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
 * Surfaces CONFIRMED bookings whose scheduled pickup time has passed
 * without a pickup handover protocol being recorded.
 *
 * Why this is a dashboard-grade insight:
 *   • Before V4.6.81, the "Pick Up Today" tile only listed bookings
 *     whose `startDate` fell inside today's calendar day, so yesterday's
 *     or earlier missed pickups became invisible. Nothing else
 *     (scheduler, worker, status) surfaced them — the operator only
 *     discovered the issue by manually paging through the bookings list
 *     and noticing the status was still "Confirmed" hours/days after
 *     the pickup should have happened.
 *   • A dedicated insight lets the ranking and grouping layer treat
 *     missed pickups as their own category and gives the dashboard one
 *     consistent pointer per affected booking / station.
 *
 * Graduated severity (matches the user-facing escalation expectation):
 *   • ≥ 30 min overdue → INFO     — "customer is late, keep watching"
 *   • ≥ 2 h overdue    → WARNING  — reach out to the customer
 *   • ≥ 24 h overdue   → CRITICAL — booking needs a decision (backdate
 *                                  the pickup, mark no-show, or cancel)
 *
 * Scope:
 *   • Only `status === 'CONFIRMED'` — PENDING bookings are not yet
 *     operationally live, and ACTIVE/COMPLETED/CANCELLED/NO_SHOW have
 *     already resolved in some form.
 *   • Only bookings without an existing pickup handover protocol —
 *     once the protocol lands the booking flips to ACTIVE, which
 *     automatically excludes it from this detector.
 *   • Scheduled start must be within the last 7 days; anything older
 *     is operationally stale and belongs in the bookings archive
 *     rather than on the live dashboard.
 *
 * Expiry handling:
 *   • The insight is single-vehicle/booking scoped via
 *     `dedupeKey = pickup_overdue:<bookingId>`, so the next run
 *     naturally refreshes the row with the newer severity tier.
 *     Once the operator resolves the booking (backdated pickup /
 *     no-show / cancel), the booking is no longer CONFIRMED → the
 *     candidate is dropped and the insight expires on the next run.
 */
@Injectable()
export class PickupOverdueDetector implements InsightDetector {
  readonly type = InsightType.PICKUP_OVERDUE;

  private static readonly OVERDUE_THRESHOLD_MIN = 30;
  private static readonly WARNING_THRESHOLD_MIN = 2 * 60;
  private static readonly CRITICAL_THRESHOLD_MIN = 24 * 60;
  private static readonly LOOKBACK_DAYS = 7;

  constructor(private readonly prisma: PrismaService) {}

  async detect(ctx: DetectorContext): Promise<InsightCandidate[]> {
    const now = ctx.now;
    const lookbackStart = new Date(
      now.getTime() -
        PickupOverdueDetector.LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    const overdueCutoff = new Date(
      now.getTime() -
        PickupOverdueDetector.OVERDUE_THRESHOLD_MIN * 60 * 1000,
    );

    const bookings = await this.prisma.booking.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: 'CONFIRMED',
        startDate: { gte: lookbackStart, lte: overdueCutoff },
        handoverProtocols: { none: { kind: 'PICKUP' } },
      },
      select: {
        id: true,
        startDate: true,
        vehicleId: true,
        customerId: true,
        pickupStationId: true,
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            licensePlate: true,
            homeStationId: true,
          },
        },
        customer: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    if (bookings.length === 0) return [];

    const candidates: InsightCandidate[] = [];
    for (const b of bookings) {
      const minutesOverdue = Math.max(
        0,
        Math.round((now.getTime() - b.startDate.getTime()) / 60_000),
      );

      let severity: InsightSeverity;
      let priority: number;
      let headline: string;
      if (minutesOverdue >= PickupOverdueDetector.CRITICAL_THRESHOLD_MIN) {
        severity = InsightSeverity.CRITICAL;
        priority = 88;
        headline = 'Pickup >24 h überfällig';
      } else if (minutesOverdue >= PickupOverdueDetector.WARNING_THRESHOLD_MIN) {
        severity = InsightSeverity.WARNING;
        priority = 72;
        headline = 'Pickup überfällig';
      } else {
        severity = InsightSeverity.INFO;
        priority = 55;
        headline = 'Kunde verspätet';
      }

      const vehicleLabel =
        b.vehicle?.licensePlate ||
        `${b.vehicle?.make ?? ''} ${b.vehicle?.model ?? ''}`.trim() ||
        'Fahrzeug';
      const customerLabel = `${b.customer?.firstName ?? ''} ${b.customer?.lastName ?? ''}`.trim();
      const scheduledLabel = b.startDate.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

      const sinceLabel = this.formatDuration(minutesOverdue);
      const message =
        `${vehicleLabel} · ${customerLabel || 'Kunde'} — geplanter Pickup ${scheduledLabel} (${sinceLabel} überfällig).`;

      const reasons = [
        `Geplanter Pickup: ${scheduledLabel}`,
        `${sinceLabel} überfällig`,
      ];
      if (customerLabel) reasons.push(`Kunde: ${customerLabel}`);

      candidates.push({
        type: this.type,
        severity,
        priority,
        title: headline,
        message,
        actionLabel: 'Buchung öffnen',
        actionType: 'navigate_booking',
        entityScope: InsightEntityScope.VEHICLE,
        // Primary entity is the vehicle so the dashboard pointer lands
        // in the fleet context; the bookingId rides along in metrics so
        // the UI can route straight to the booking detail.
        entityIds: [b.vehicleId],
        timeContext: { pickupAt: b.startDate.toISOString() },
        metrics: {
          bookingId: b.id,
          customerId: b.customerId,
          minutesOverdue,
          scheduledStartAt: b.startDate.toISOString(),
          vehicleLicense: b.vehicle?.licensePlate ?? null,
          customerName: customerLabel || null,
        },
        reasons,
        confidence: 0.99,
        dedupeKey: `pickup_overdue:${b.id}`,
        groupKey: b.pickupStationId
          ? `pickup_overdue:${b.pickupStationId}`
          : 'pickup_overdue_fleet',
      });
    }

    return candidates;
  }

  private formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} Min.`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      const rem = minutes % 60;
      return rem === 0 ? `${hours} h` : `${hours} h ${rem} Min.`;
    }
    const days = Math.floor(hours / 24);
    const remH = hours % 24;
    return remH === 0 ? `${days} d` : `${days} d ${remH} h`;
  }
}
