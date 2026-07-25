import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  WorkflowMatcherCandidateRow,
  WorkflowMatcherFeatureFlagRow,
} from './workflow-matcher.types';

const triggerCandidateSelect = Prisma.validator<Prisma.WorkflowTriggerDefaultArgs>()({
  select: {
    id: true,
    triggerType: true,
    config: true,
    version: {
      select: {
        id: true,
        versionNumber: true,
        status: true,
        publishedAt: true,
        definition: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            lifecycleStatus: true,
            remediationRequired: true,
            activeVersionId: true,
          },
        },
        scope: {
          select: {
            scopeType: true,
            bindings: {
              select: {
                bindingType: true,
                bindingId: true,
              },
            },
          },
        },
        actions: {
          select: {
            actionType: true,
            actionIndex: true,
            capabilityStatusAtPublish: true,
          },
          orderBy: { actionIndex: 'asc' as const },
        },
      },
    },
  },
});

type TriggerCandidateRow = Prisma.WorkflowTriggerGetPayload<typeof triggerCandidateSelect>;

@Injectable()
export class WorkflowMatcherRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Index-backed candidate lookup:
   * workflow_triggers (organization_id, trigger_type)
   * → active workflow_versions via activeForDefinition
   * → ACTIVE non-archived workflow_definitions
   */
  async findTriggerCandidates(input: {
    organizationId: string;
    eventType: string;
  }): Promise<WorkflowMatcherCandidateRow[]> {
    const rows = await this.prisma.workflowTrigger.findMany({
      where: {
        organizationId: input.organizationId,
        triggerType: input.eventType,
        version: {
          status: 'ACTIVE',
          publishedAt: { not: null },
          activeForDefinition: {
            is: {
              lifecycleStatus: 'ACTIVE',
              remediationRequired: false,
            },
          },
        },
      },
      select: triggerCandidateSelect.select,
      orderBy: [{ version: { definition: { createdAt: 'asc' } } }, { id: 'asc' }],
    });

    return rows.map((row: TriggerCandidateRow) => ({
      triggerId: row.id,
      triggerType: row.triggerType,
      triggerConfig: row.config,
      versionId: row.version.id,
      versionNumber: row.version.versionNumber,
      versionStatus: row.version.status,
      publishedAt: row.version.publishedAt,
      definitionId: row.version.definition.id,
      definitionName: row.version.definition.name,
      definitionSlug: row.version.definition.slug,
      definitionCreatedAt: row.version.definition.createdAt,
      definitionLifecycleStatus: row.version.definition.lifecycleStatus,
      remediationRequired: row.version.definition.remediationRequired,
      activeVersionId: row.version.definition.activeVersionId,
      scopeType: row.version.scope?.scopeType ?? null,
      bindings:
        row.version.scope?.bindings.map((b) => ({
          bindingType: b.bindingType,
          bindingId: b.bindingId,
        })) ?? [],
      actions: row.version.actions.map((a) => ({
        actionType: a.actionType,
        actionIndex: a.actionIndex,
        capabilityStatusAtPublish: a.capabilityStatusAtPublish,
      })),
    }));
  }

  async loadFeatureFlags(input: {
    organizationId: string;
    definitionIds: string[];
    flagKeys: string[];
  }): Promise<WorkflowMatcherFeatureFlagRow[]> {
    const keys = unique([...input.flagKeys, 'workflow_automation_enabled', 'workflow_definition_enabled']);

    const rows = await this.prisma.workflowFeatureFlag.findMany({
      where: {
        OR: [
          { scope: 'PLATFORM', flagKey: { in: keys } },
          {
            scope: 'ORGANIZATION',
            organizationId: input.organizationId,
            ...(input.flagKeys.length > 0 ? { flagKey: { in: input.flagKeys } } : {}),
          },
          {
            scope: 'WORKFLOW_DEFINITION',
            organizationId: input.organizationId,
            workflowDefinitionId: { in: input.definitionIds },
          },
        ],
      },
      include: { rolloutScopes: true },
    });

    return rows.map(mapFlag);
  }
}

function mapFlag(row: {
  id: string;
  scope: string;
  organizationId: string | null;
  workflowDefinitionId: string | null;
  flagKey: string;
  enabled: boolean;
  rolloutPercentage: number | null;
  rolloutScopes: Array<{ scopeType: string; scopeId: string }>;
}): WorkflowMatcherFeatureFlagRow {
  return {
    id: row.id,
    scope: row.scope,
    organizationId: row.organizationId,
    workflowDefinitionId: row.workflowDefinitionId,
    flagKey: row.flagKey,
    enabled: row.enabled,
    rolloutPercentage: row.rolloutPercentage,
    rolloutScopes: row.rolloutScopes.map((rs) => ({
      scopeType: rs.scopeType,
      scopeId: rs.scopeId,
    })),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.length > 0))];
}
