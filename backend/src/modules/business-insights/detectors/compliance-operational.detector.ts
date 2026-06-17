import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { ServiceComplianceService } from '../../vehicle-intelligence/service-compliance/service-compliance.service';
import { buildComplianceInsightCandidates } from '../../vehicle-intelligence/service-compliance/service-compliance-operational.signals';
import {
  DetectorContext,
  InsightCandidate,
  InsightDetector,
  InsightType,
} from '../insight.types';

/**
 * Canonical compliance insights — HM/OEM next service, TÜV, BOKraft, and
 * neutral HM no-tracking info. All logic delegates to ServiceComplianceService
 * + shared signal builder (no interval math, no nextServiceDueDate).
 */
@Injectable()
export class ComplianceOperationalDetector implements InsightDetector {
  /** Top-level enable gate for the insights pipeline. */
  readonly type = InsightType.SERVICE_OVERDUE;

  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceCompliance: ServiceComplianceService,
  ) {}

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
        homeStationId: true,
        lastTuvDate: true,
        nextTuvDate: true,
        lastBokraftDate: true,
        nextBokraftDate: true,
      },
    });

    if (vehicles.length === 0) return [];

    const BATCH = 20;
    const candidates: InsightCandidate[] = [];

    for (let i = 0; i < vehicles.length; i += BATCH) {
      const batch = vehicles.slice(i, i + BATCH);
      const evaluations = await Promise.all(
        batch.map((v) =>
          this.serviceCompliance
            .evaluateCompliance(v.id, {
              lastTuvDate: v.lastTuvDate,
              nextTuvDate: v.nextTuvDate,
              lastBokraftDate: v.lastBokraftDate,
              nextBokraftDate: v.nextBokraftDate,
            }, ctx.now)
            .catch(() => null),
        ),
      );

      for (let j = 0; j < batch.length; j++) {
        const evaluation = evaluations[j];
        if (!evaluation) continue;
        candidates.push(
          ...buildComplianceInsightCandidates(batch[j], evaluation, {
            now: ctx.now,
            enabledTypes: ctx.policy.enabledTypes,
          }),
        );
      }
    }

    return candidates;
  }
}
