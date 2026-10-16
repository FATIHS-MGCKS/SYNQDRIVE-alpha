import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import {
  VSI_APDS_P5B1_MAX_BATCH_LIMIT,
  VSI_APDS_P5B1_DEFAULT_BATCH_LIMIT,
} from './vsi-apds-p5b1.contract';
import type { VsiApdsP5b1OfflineReplayFilterV1 } from './vsi-apds-p5b1.types';

export type VsiApdsP5b1PersistedShadowDecisionRow = {
  id: string;
  organizationId: string;
  vehicleId: string;
  opportunityId: string;
  decisionAt: Date;
  activationEpochId: string | null;
  policyVersion: string;
  shadowExecutionVersion: string | null;
  decision: string;
  reason: string;
};

@Injectable()
export class VsiApdsP5b1DecisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async loadShadowDecisionsPage(input: {
    filter: VsiApdsP5b1OfflineReplayFilterV1;
    cursorDecisionAt?: Date;
    cursorId?: string;
    limit?: number;
  }): Promise<{ rows: VsiApdsP5b1PersistedShadowDecisionRow[]; hasMore: boolean }> {
    const limit = Math.min(
      Math.max(1, input.limit ?? VSI_APDS_P5B1_DEFAULT_BATCH_LIMIT),
      VSI_APDS_P5B1_MAX_BATCH_LIMIT,
    );
    const where: Record<string, unknown> = {};
    if (input.filter.organizationId) {
      where.organizationId = input.filter.organizationId;
    }
    if (input.filter.vehicleId) {
      where.vehicleId = input.filter.vehicleId;
    }
    if (input.filter.opportunityId) {
      where.opportunityId = input.filter.opportunityId;
    }
    if (input.filter.activationEpochId !== undefined) {
      where.activationEpochId = input.filter.activationEpochId;
    }
    if (input.filter.policyVersions?.length) {
      where.policyVersion = { in: [...input.filter.policyVersions] };
    }
    if (input.filter.decisionAtFrom || input.filter.decisionAtTo) {
      where.decisionAt = {
        ...(input.filter.decisionAtFrom ? { gte: input.filter.decisionAtFrom } : {}),
        ...(input.filter.decisionAtTo ? { lte: input.filter.decisionAtTo } : {}),
      };
    }

    if (input.cursorDecisionAt && input.cursorId) {
      where.AND = [
        {
          OR: [
            { decisionAt: { gt: input.cursorDecisionAt } },
            {
              decisionAt: input.cursorDecisionAt,
              id: { gt: input.cursorId },
            },
          ],
        },
      ];
    }

    const rows = await this.prisma.apdShadowReconciliationDecision.findMany({
      where,
      orderBy: [{ decisionAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        opportunityId: true,
        decisionAt: true,
        activationEpochId: true,
        policyVersion: true,
        shadowExecutionVersion: true,
        decision: true,
        reason: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { rows: page, hasMore };
  }
}
