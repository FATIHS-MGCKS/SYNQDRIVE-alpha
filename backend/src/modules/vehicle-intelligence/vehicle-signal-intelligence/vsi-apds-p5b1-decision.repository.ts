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

/** Manifest replay only — includes post-poll correlation fields from persistence. */
export type VsiApdsP5b1PersistedShadowDecisionManifestRow = VsiApdsP5b1PersistedShadowDecisionRow & {
  realPollId: string | null;
  realPollStatus: string | null;
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

  /**
   * Offline research only: exact UUID allowlist, organization-scoped, no writes.
   * Caller must validate scope (epoch, vehicles, window) after load.
   */
  async loadShadowDecisionsByIds(input: {
    organizationId: string;
    decisionIds: readonly string[];
  }): Promise<VsiApdsP5b1PersistedShadowDecisionManifestRow[]> {
    if (input.decisionIds.length === 0) {
      return [];
    }
    const unique = [...new Set(input.decisionIds)];
    if (unique.length !== input.decisionIds.length) {
      throw new Error('P5B2_MANIFEST_DUPLICATE_DECISION_ID');
    }

    const rows = await this.prisma.apdShadowReconciliationDecision.findMany({
      where: {
        organizationId: input.organizationId,
        id: { in: [...unique] },
      },
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
        realPollId: true,
        realPollStatus: true,
      },
    });

    if (rows.length !== unique.length) {
      throw new Error('P5B2_MANIFEST_DECISION_ID_NOT_FOUND');
    }

    const byId = new Map(rows.map((r) => [r.id, r]));
    return input.decisionIds.map((id) => {
      const row = byId.get(id);
      if (!row) {
        throw new Error('P5B2_MANIFEST_DECISION_ID_NOT_FOUND');
      }
      return row;
    });
  }
}
