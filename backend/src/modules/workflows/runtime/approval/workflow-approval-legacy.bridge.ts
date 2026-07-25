import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

export interface LegacyApprovalBridgeResult {
  legacyId: string;
  canonicalId: string | null;
  status: 'BRIDGED' | 'LEGACY_ONLY' | 'NOT_FOUND';
}

/**
 * Safely bridges or marks legacy OrgWorkflowApproval rows during canonical cutover.
 */
@Injectable()
export class WorkflowApprovalLegacyBridgeService {
  constructor(private readonly prisma: PrismaService) {}

  async bridgeLegacyApproval(orgId: string, legacyApprovalId: string): Promise<LegacyApprovalBridgeResult> {
    const legacy = await this.prisma.orgWorkflowApproval.findFirst({
      where: { id: legacyApprovalId, organizationId: orgId },
    });
    if (!legacy) {
      return { legacyId: legacyApprovalId, canonicalId: null, status: 'NOT_FOUND' };
    }

    const existing = await this.prisma.workflowApproval.findFirst({
      where: { legacyOrgWorkflowApprovalId: legacy.id },
    });
    if (existing) {
      return { legacyId: legacy.id, canonicalId: existing.id, status: 'BRIDGED' };
    }

    return { legacyId: legacy.id, canonicalId: null, status: 'LEGACY_ONLY' };
  }

  async markLegacyOnly(orgId: string, legacyApprovalId: string) {
    const legacy = await this.prisma.orgWorkflowApproval.findFirst({
      where: { id: legacyApprovalId, organizationId: orgId },
    });
    if (!legacy) return null;
    return {
      legacyId: legacy.id,
      status: legacy.status,
      message: 'Legacy approval — use canonical workflow approval APIs for new runs',
      migrated: false,
    };
  }

  listUnbridgedLegacy(orgId: string, limit = 50) {
    return this.prisma.orgWorkflowApproval.findMany({
      where: {
        organizationId: orgId,
        status: 'PENDING',
      },
      take: limit,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        workflowRunId: true,
        actionRunId: true,
        status: true,
        createdAt: true,
      },
    });
  }
}
