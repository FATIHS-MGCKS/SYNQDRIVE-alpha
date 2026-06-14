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
 * V4.7.59 — Surfaces vehicles whose statutory inspection (TÜV / BOKraft) is
 * overdue or due soon, mirroring the ServiceInfo card on the Health Tab and
 * RentalHealthService.evaluateServiceCompliance so the org dashboard and the
 * per-vehicle page agree:
 *
 *   days < 0                 → CRITICAL (Termin überfällig)
 *   0..COMPLIANCE_WARNING_DAYS → WARNING (Termin bald fällig)
 *
 * Vehicles without a tracked date ("No tracking") are skipped — we never
 * fabricate a compliance state from a missing date.
 *
 * One detector emits BOTH TUV_OVERDUE and BOKRAFT_OVERDUE candidates. Its
 * `type` (TUV_OVERDUE) is the top-level enable gate in the insights pipeline;
 * per-kind emission additionally respects the tenant policy so a tenant can
 * disable just one of the two while keeping the other.
 */
@Injectable()
export class ComplianceOverdueDetector implements InsightDetector {
  readonly type = InsightType.TUV_OVERDUE;

  // Same threshold as RentalHealthService.COMPLIANCE_WARNING_DAYS so the two
  // surfaces never disagree about when a compliance warning starts.
  private static readonly WARNING_DAYS = 60;

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
        nextTuvDate: true,
        nextBokraftDate: true,
      },
    });

    if (vehicles.length === 0) return [];

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const candidates: InsightCandidate[] = [];

    const kinds: {
      type: InsightType;
      key: string;
      label: string;
      date: (v: (typeof vehicles)[number]) => Date | null;
    }[] = [
      {
        type: InsightType.TUV_OVERDUE,
        key: 'tuv_overdue',
        label: 'TÜV',
        date: (v) => v.nextTuvDate,
      },
      {
        type: InsightType.BOKRAFT_OVERDUE,
        key: 'bokraft_overdue',
        label: 'BOKraft',
        date: (v) => v.nextBokraftDate,
      },
    ];

    for (const v of vehicles) {
      const vehicleLabel = v.licensePlate || `${v.make} ${v.model}`;

      for (const kind of kinds) {
        // Respect tenant policy per compliance kind.
        if (!ctx.policy.enabledTypes.includes(kind.type)) continue;

        const dueDate = kind.date(v);
        if (dueDate == null) continue; // "No tracking" → no task

        const days = Math.floor(
          (new Date(dueDate).getTime() - ctx.now.getTime()) / MS_PER_DAY,
        );

        const overdue = days < 0;
        const imminent = !overdue && days <= ComplianceOverdueDetector.WARNING_DAYS;
        if (!overdue && !imminent) continue;

        let severity: InsightSeverity;
        let title: string;
        let message: string;
        let priority: number;
        const reasons: string[] = [];

        if (overdue) {
          const overdueDays = Math.abs(days);
          severity = InsightSeverity.CRITICAL;
          title = `${kind.label} überfällig`;
          message = `${vehicleLabel}: ${kind.label} überfällig seit ${overdueDays} Tag${overdueDays === 1 ? '' : 'en'} — Termin sofort vereinbaren, Betrieb nicht zulässig.`;
          priority = 88;
          reasons.push(`Überfällig seit ${overdueDays} Tag${overdueDays === 1 ? '' : 'en'}`);
        } else {
          severity = InsightSeverity.WARNING;
          title = `${kind.label} bald fällig`;
          message = `${vehicleLabel}: ${kind.label} fällig in ${days} Tag${days === 1 ? '' : 'en'} — Termin rechtzeitig planen.`;
          priority = 66;
          reasons.push(`Noch ${days} Tag${days === 1 ? '' : 'en'}`);
        }

        candidates.push({
          type: kind.type,
          severity,
          priority,
          title,
          message,
          actionLabel: 'Fahrzeug prüfen',
          actionType: 'navigate_vehicle',
          entityScope: InsightEntityScope.VEHICLE,
          entityIds: [v.id],
          timeContext: {
            dueDate: new Date(dueDate).toISOString(),
          },
          metrics: {
            remainingDays: days,
          },
          reasons,
          confidence: 0.95,
          dedupeKey: `${kind.key}:${v.id}`,
          groupKey: v.stationId
            ? `${kind.key}:${v.stationId}`
            : `${kind.key}_fleet`,
        });
      }
    }

    return candidates;
  }
}
