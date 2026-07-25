import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkflowDefinitionLifecycleStatus, WorkflowRevisionType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  ActivateWorkflowVersionDto,
  CreateWorkflowDefinitionDto,
  CreateWorkflowDraftDto,
  LifecycleChangeReasonDto,
  PublishWorkflowVersionDto,
  UpdateWorkflowDefinitionMetadataDto,
  UpdateWorkflowDraftDto,
} from './dto/workflow-lifecycle.dto';
import { validateWorkflowDefinition } from './workflow-definition.validator';
import { WORKFLOW_LIFECYCLE_ERROR_CODES } from './workflow-lifecycle.errors';
import { computeWorkflowContentHash, isImmutableVersionStatus } from './workflow-lifecycle.util';
import {
  collectActivationPolicyIssues,
  validateWorkflowForPublish,
  type WorkflowPublishValidationInput,
} from './workflow-publish.validator';
import {
  cloneVersionGraph,
  loadVersionGraph,
  replaceVersionGraph,
} from './workflow-version-graph.service';

type Actor = { id?: string; name?: string; email?: string };
type LifecycleTx = Prisma.TransactionClient;

type VersionWithGraph = NonNullable<Awaited<ReturnType<typeof loadVersionGraph>>>;

@Injectable()
export class WorkflowDefinitionLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async listDefinitions(orgId: string) {
    const rows = await this.prisma.workflowDefinition.findMany({
      where: { organizationId: orgId },
      orderBy: { updatedAt: 'desc' },
      include: {
        draftVersion: { select: { id: true, versionNumber: true, status: true } },
        publishedVersion: { select: { id: true, versionNumber: true, status: true } },
        activeVersion: { select: { id: true, versionNumber: true, status: true } },
      },
    });
    return rows.map((row) => this.formatDefinition(row));
  }

  async getDefinition(orgId: string, definitionId: string) {
    const row = await this.prisma.workflowDefinition.findFirst({
      where: { id: definitionId, organizationId: orgId },
      include: {
        draftVersion: true,
        publishedVersion: true,
        activeVersion: true,
        versions: { orderBy: { versionNumber: 'desc' } },
      },
    });
    if (!row) this.throwNotFound();
    return this.formatDefinition(row);
  }

  async createDefinition(orgId: string, dto: CreateWorkflowDefinitionDto, actor?: Actor) {
    const publishInput = {
      name: dto.name,
      category: dto.category,
      trigger: dto.trigger,
      conditions: dto.conditions,
      actions: dto.actions,
      scope: dto.scope,
    };
    const { validated, snapshot, contentHash } = validateWorkflowForPublish(publishInput);

    const result = await this.prisma.$transaction(async (tx) => {
      const definition = await tx.workflowDefinition.create({
        data: {
          organizationId: orgId,
          name: dto.name.trim(),
          description: dto.description,
          category: dto.category,
          slug: dto.slug?.trim() || null,
          lifecycleStatus: WorkflowDefinitionLifecycleStatus.ACTIVE,
          versionCounter: 1,
          lockVersion: 1,
          createdByUserId: actor?.id,
          updatedByUserId: actor?.id,
        },
      });

      const version = await tx.workflowVersion.create({
        data: {
          organizationId: orgId,
          workflowDefinitionId: definition.id,
          versionNumber: 1,
          status: 'DRAFT',
          contentHash,
        },
      });

      await replaceVersionGraph(tx, orgId, version.id, validated);

      const updatedDefinition = await tx.workflowDefinition.update({
        where: { id: definition.id },
        data: { draftVersionId: version.id },
      });

      await this.writeRevision(tx, {
        orgId,
        definitionId: definition.id,
        versionId: version.id,
        revisionType: WorkflowRevisionType.DRAFT_SAVED,
        actorUserId: actor?.id,
        afterHash: contentHash,
        changeReason: 'Initial draft created',
      });

      return { definition: updatedDefinition, version, snapshot };
    });

    return this.getDefinition(orgId, result.definition.id);
  }

  async updateMetadata(
    orgId: string,
    definitionId: string,
    dto: UpdateWorkflowDefinitionMetadataDto,
    actor?: Actor,
  ) {
    const existing = await this.loadDefinitionOrThrow(orgId, definitionId);
    this.assertNotArchived(existing);

    await this.prisma.workflowDefinition.update({
      where: { id: definitionId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug?.trim() || null } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        updatedByUserId: actor?.id,
        lockVersion: { increment: 1 },
      },
    });

    return this.getDefinition(orgId, definitionId);
  }

  async updateDraft(
    orgId: string,
    definitionId: string,
    dto: UpdateWorkflowDraftDto,
    actor?: Actor,
  ) {
    const definition = await this.loadDefinitionOrThrow(orgId, definitionId, {
      includeDraft: true,
      includeGraph: true,
    });
    this.assertNotArchived(definition);

    if (definition.lockVersion !== dto.expectedLockVersion) {
      throw new ConflictException({
        message: 'Workflow definition was modified concurrently',
        code: WORKFLOW_LIFECYCLE_ERROR_CODES.LOCK_CONFLICT,
        currentLockVersion: definition.lockVersion,
      });
    }

    const draft = definition.draftVersion as VersionWithGraph | null | undefined;
    if (!draft) {
      throw new BadRequestException({
        message: 'No draft version exists',
        code: WORKFLOW_LIFECYCLE_ERROR_CODES.NO_DRAFT,
      });
    }
    if (draft.status !== 'DRAFT') {
      throw new BadRequestException({
        message: 'Only draft versions can be edited',
        code: WORKFLOW_LIFECYCLE_ERROR_CODES.NOT_DRAFT,
      });
    }

    const merged = this.mergeDraftGraph(definition, dto);
    const { validated, contentHash } = validateWorkflowForPublish({
      name: definition.name,
      category: definition.category,
      ...merged,
    } as WorkflowPublishValidationInput);

    const beforeHash = draft.contentHash;

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workflowDefinition.updateMany({
        where: {
          id: definitionId,
          organizationId: orgId,
          lockVersion: dto.expectedLockVersion,
        },
        data: { lockVersion: { increment: 1 }, updatedByUserId: actor?.id },
      });
      if (updated.count === 0) {
        throw new ConflictException({
          message: 'Workflow definition was modified concurrently',
          code: WORKFLOW_LIFECYCLE_ERROR_CODES.LOCK_CONFLICT,
        });
      }

      await replaceVersionGraph(tx, orgId, draft.id, validated);
      await tx.workflowVersion.update({
        where: { id: draft.id },
        data: { contentHash },
      });

      await this.writeRevision(tx, {
        orgId,
        definitionId,
        versionId: draft.id,
        revisionType: WorkflowRevisionType.DRAFT_SAVED,
        actorUserId: actor?.id,
        beforeHash,
        afterHash: contentHash,
        changeReason: dto.changeReason,
      });
    });

    return this.getDefinition(orgId, definitionId);
  }

  async publishDraft(
    orgId: string,
    definitionId: string,
    dto: PublishWorkflowVersionDto,
    actor?: Actor,
  ) {
    const definition = await this.loadDefinitionOrThrow(orgId, definitionId, {
      includeDraft: true,
      includeGraph: true,
    });
    this.assertNotArchived(definition);

    const draft = definition.draftVersion as VersionWithGraph | null | undefined;
    if (!draft || draft.status !== 'DRAFT') {
      throw new BadRequestException({
        message: 'No draft version available to publish',
        code: WORKFLOW_LIFECYCLE_ERROR_CODES.NO_DRAFT,
      });
    }

    const graph = await this.graphFromVersion(draft);
    const { snapshot, contentHash } = validateWorkflowForPublish({
      name: definition.name,
      category: definition.category,
      ...graph,
    } as WorkflowPublishValidationInput);

    const beforeHash = draft.contentHash;
    const now = new Date();

    const published = await this.prisma.$transaction(async (tx) => {
      const versionUpdate = await tx.workflowVersion.updateMany({
        where: { id: draft.id, organizationId: orgId, status: 'DRAFT' },
        data: {
          status: 'PUBLISHED',
          contentHash,
          definitionSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          publishedAt: now,
          publishedByUserId: actor?.id,
        },
      });
      if (versionUpdate.count === 0) {
        throw new ConflictException({
          message: 'Draft was already published or modified concurrently',
          code: WORKFLOW_LIFECYCLE_ERROR_CODES.CONCURRENT_LIFECYCLE,
        });
      }

      await tx.workflowDefinition.update({
        where: { id: definitionId },
        data: {
          publishedVersionId: draft.id,
          draftVersionId: null,
          updatedByUserId: actor?.id,
          lockVersion: { increment: 1 },
        },
      });

      await this.writeRevision(tx, {
        orgId,
        definitionId,
        versionId: draft.id,
        revisionType: WorkflowRevisionType.PUBLISHED,
        actorUserId: actor?.id,
        beforeHash,
        afterHash: contentHash,
        changeReason: dto.changeReason,
      });

      return draft.id;
    });

    return this.getVersion(orgId, definitionId, published);
  }

  async activateVersion(
    orgId: string,
    definitionId: string,
    dto: ActivateWorkflowVersionDto,
    actor?: Actor,
  ) {
    const definition = await this.loadDefinitionOrThrow(orgId, definitionId);
    this.assertNotArchived(definition);

    const version = await loadVersionGraph(this.prisma, orgId, dto.versionId);
    if (!version || version.workflowDefinitionId !== definitionId) {
      throw new NotFoundException({
        message: 'Workflow version not found',
        code: WORKFLOW_LIFECYCLE_ERROR_CODES.VERSION_NOT_FOUND,
      });
    }
    if (version.status !== 'PUBLISHED') {
      throw new BadRequestException({
        message: 'Only published versions can be activated',
        code: WORKFLOW_LIFECYCLE_ERROR_CODES.NOT_PUBLISHED,
      });
    }

    const graph = await this.graphFromVersion(version);
    const activationIssues = collectActivationPolicyIssues(graph.actions ?? []);
    if (activationIssues.length > 0) {
      throw new BadRequestException({
        message: activationIssues[0].message,
        code: WORKFLOW_LIFECYCLE_ERROR_CODES.ACTIVATION_VALIDATION_FAILED,
        issues: activationIssues,
      });
    }

    const now = new Date();
    const previousActiveId = definition.activeVersionId;

    await this.prisma.$transaction(async (tx) => {
      if (previousActiveId && previousActiveId !== dto.versionId) {
        await tx.workflowVersion.updateMany({
          where: {
            id: previousActiveId,
            workflowDefinitionId: definitionId,
            status: 'ACTIVE',
          },
          data: { status: 'DISABLED', disabledAt: now },
        });
        await this.writeRevision(tx, {
          orgId,
          definitionId,
          versionId: previousActiveId,
          revisionType: WorkflowRevisionType.DEACTIVATED,
          actorUserId: actor?.id,
          changeReason: `Superseded by version ${version.versionNumber}`,
        });
      }

      const activated = await tx.workflowVersion.updateMany({
        where: {
          id: dto.versionId,
          organizationId: orgId,
          workflowDefinitionId: definitionId,
          status: 'PUBLISHED',
        },
        data: { status: 'ACTIVE', activatedAt: now },
      });
      if (activated.count === 0) {
        throw new ConflictException({
          message: 'Version activation conflict — version may already be active',
          code: WORKFLOW_LIFECYCLE_ERROR_CODES.CONCURRENT_LIFECYCLE,
        });
      }

      await tx.workflowDefinition.update({
        where: { id: definitionId },
        data: {
          activeVersionId: dto.versionId,
          publishedVersionId: dto.versionId,
          updatedByUserId: actor?.id,
          lockVersion: { increment: 1 },
        },
      });

      await this.writeRevision(tx, {
        orgId,
        definitionId,
        versionId: dto.versionId,
        revisionType: WorkflowRevisionType.ACTIVATED,
        actorUserId: actor?.id,
        afterHash: version.contentHash,
        changeReason: dto.changeReason,
      });
    });

    return this.getDefinition(orgId, definitionId);
  }

  async deactivate(
    orgId: string,
    definitionId: string,
    dto: LifecycleChangeReasonDto,
    actor?: Actor,
  ) {
    const definition = await this.loadDefinitionOrThrow(orgId, definitionId);
    this.assertNotArchived(definition);

    const activeId = definition.activeVersionId;
    if (!activeId) {
      throw new BadRequestException({
        message: 'No active version to deactivate',
        code: WORKFLOW_LIFECYCLE_ERROR_CODES.NOT_ACTIVE,
      });
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workflowVersion.updateMany({
        where: { id: activeId, organizationId: orgId, status: 'ACTIVE' },
        data: { status: 'DISABLED', disabledAt: now },
      });
      if (updated.count === 0) {
        throw new ConflictException({
          message: 'Active version changed concurrently',
          code: WORKFLOW_LIFECYCLE_ERROR_CODES.CONCURRENT_LIFECYCLE,
        });
      }

      await tx.workflowDefinition.update({
        where: { id: definitionId },
        data: { activeVersionId: null, lockVersion: { increment: 1 }, updatedByUserId: actor?.id },
      });

      await this.writeRevision(tx, {
        orgId,
        definitionId,
        versionId: activeId,
        revisionType: WorkflowRevisionType.DEACTIVATED,
        actorUserId: actor?.id,
        changeReason: dto.changeReason,
      });
    });

    return this.getDefinition(orgId, definitionId);
  }

  async archive(
    orgId: string,
    definitionId: string,
    dto: LifecycleChangeReasonDto,
    actor?: Actor,
  ) {
    const definition = await this.loadDefinitionOrThrow(orgId, definitionId);
    if (definition.lifecycleStatus === WorkflowDefinitionLifecycleStatus.ARCHIVED) {
      return this.getDefinition(orgId, definitionId);
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.workflowVersion.updateMany({
        where: {
          workflowDefinitionId: definitionId,
          organizationId: orgId,
          status: { in: ['DRAFT', 'PUBLISHED', 'ACTIVE', 'DISABLED'] },
        },
        data: { status: 'ARCHIVED', archivedAt: now },
      });

      await tx.workflowDefinition.update({
        where: { id: definitionId },
        data: {
          lifecycleStatus: WorkflowDefinitionLifecycleStatus.ARCHIVED,
          archivedAt: now,
          draftVersionId: null,
          activeVersionId: null,
          updatedByUserId: actor?.id,
          lockVersion: { increment: 1 },
        },
      });

      await this.writeRevision(tx, {
        orgId,
        definitionId,
        revisionType: WorkflowRevisionType.ARCHIVED,
        actorUserId: actor?.id,
        changeReason: dto.changeReason,
      });
    });

    return this.getDefinition(orgId, definitionId);
  }

  async createNewDraft(
    orgId: string,
    definitionId: string,
    dto: CreateWorkflowDraftDto,
    actor?: Actor,
  ) {
    const definition = await this.loadDefinitionOrThrow(orgId, definitionId);
    this.assertNotArchived(definition);

    if (definition.draftVersionId) {
      throw new ConflictException({
        message: 'A draft version already exists',
        code: WORKFLOW_LIFECYCLE_ERROR_CODES.DRAFT_EXISTS,
      });
    }

    const sourceVersionId =
      dto.sourceVersionId ??
      definition.activeVersionId ??
      definition.publishedVersionId ??
      (
        await this.prisma.workflowVersion.findFirst({
          where: { workflowDefinitionId: definitionId, organizationId: orgId },
          orderBy: { versionNumber: 'desc' },
        })
      )?.id;

    if (!sourceVersionId) {
      throw new BadRequestException({
        message: 'No source version to branch draft from',
        code: WORKFLOW_LIFECYCLE_ERROR_CODES.VERSION_NOT_FOUND,
      });
    }

    const source = await loadVersionGraph(this.prisma, orgId, sourceVersionId);
    if (!source) this.throwVersionNotFound();

    const graph = await this.graphFromVersion(source);
    const contentHash = computeWorkflowContentHash(graph as Parameters<typeof computeWorkflowContentHash>[0]);
    const nextVersionNumber = definition.versionCounter + 1;

    await this.prisma.$transaction(async (tx) => {
      const version = await tx.workflowVersion.create({
        data: {
          organizationId: orgId,
          workflowDefinitionId: definitionId,
          versionNumber: nextVersionNumber,
          status: 'DRAFT',
          contentHash,
          supersedesVersionId: sourceVersionId,
        },
      });

      await cloneVersionGraph(tx, orgId, sourceVersionId, version.id);

      await tx.workflowDefinition.update({
        where: { id: definitionId },
        data: {
          draftVersionId: version.id,
          versionCounter: nextVersionNumber,
          lockVersion: { increment: 1 },
          updatedByUserId: actor?.id,
        },
      });

      await this.writeRevision(tx, {
        orgId,
        definitionId,
        versionId: version.id,
        revisionType: WorkflowRevisionType.DRAFT_SAVED,
        actorUserId: actor?.id,
        afterHash: contentHash,
        changeReason: dto.changeReason ?? `Draft branched from v${source.versionNumber}`,
      });
    });

    return this.getDefinition(orgId, definitionId);
  }

  async listVersions(orgId: string, definitionId: string) {
    await this.loadDefinitionOrThrow(orgId, definitionId);
    return this.prisma.workflowVersion.findMany({
      where: { workflowDefinitionId: definitionId, organizationId: orgId },
      orderBy: { versionNumber: 'desc' },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        contentHash: true,
        publishedAt: true,
        activatedAt: true,
        disabledAt: true,
        archivedAt: true,
        createdAt: true,
      },
    });
  }

  async getVersion(orgId: string, definitionId: string, versionId: string) {
    await this.loadDefinitionOrThrow(orgId, definitionId);
    const version = await loadVersionGraph(this.prisma, orgId, versionId);
    if (!version || version.workflowDefinitionId !== definitionId) {
      this.throwVersionNotFound();
    }
    return {
      ...version,
      immutable: isImmutableVersionStatus(version.status),
      graph: await this.graphFromVersion(version),
    };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private async loadDefinitionOrThrow(
    orgId: string,
    definitionId: string,
    opts?: { includeDraft?: boolean; includeGraph?: boolean },
  ) {
    const row = await this.prisma.workflowDefinition.findFirst({
      where: { id: definitionId, organizationId: orgId },
      include: {
        draftVersion: opts?.includeDraft
          ? {
              include: opts.includeGraph
                ? {
                    trigger: true,
                    scope: { include: { bindings: true } },
                    conditionGroups: { include: { conditions: true } },
                    actions: { orderBy: { actionIndex: 'asc' } },
                  }
                : undefined,
            }
          : false,
        publishedVersion: true,
        activeVersion: true,
      },
    });
    if (!row) this.throwNotFound();
    return row;
  }

  private mergeDraftGraph(
    definition: Awaited<ReturnType<typeof this.loadDefinitionOrThrow>>,
    dto: UpdateWorkflowDraftDto,
  ): WorkflowPublishValidationInput {
    const draft = definition.draftVersion as VersionWithGraph | null | undefined;
    const existingGraph = draft
      ? {
          trigger: draft.trigger
            ? { type: draft.trigger.triggerType, config: draft.trigger.config as object }
            : undefined,
          scope: draft.scope
            ? {
                type: draft.scope.scopeType.toLowerCase(),
                stationIds: draft.scope.bindings
                  ?.filter((b) => b.bindingType === 'STATION')
                  .map((b) => b.bindingId),
                vehicleIds: draft.scope.bindings
                  ?.filter((b) => b.bindingType === 'VEHICLE')
                  .map((b) => b.bindingId),
              }
            : undefined,
          conditions:
            draft.conditionGroups?.[0]?.conditions?.map((c) => ({
              path: c.fieldPath,
              operator: c.operator.toLowerCase(),
              value:
                c.valueJson ??
                c.valueText ??
                c.valueNumber ??
                c.valueBoolean,
            })) ?? [],
          actions:
            draft.actions?.map((a) => ({
              type: a.actionType,
              config: a.config as object,
              requiresApproval: a.requiresApproval,
            })) ?? [],
        }
      : {};

    return {
      trigger: dto.trigger ?? existingGraph.trigger,
      conditions: dto.conditions ?? existingGraph.conditions,
      actions: dto.actions ?? existingGraph.actions,
      scope: dto.scope ?? existingGraph.scope,
    } as WorkflowPublishValidationInput;
  }

  private async graphFromVersion(version: VersionWithGraph): Promise<WorkflowPublishValidationInput> {
    if (version.definitionSnapshot) {
      const snap = version.definitionSnapshot as {
        trigger: { type: string; config?: object };
        scope: { type: string; stationIds?: string[]; vehicleIds?: string[] };
        conditions: Array<{ path?: string; field?: string; operator: string; value?: unknown }>;
        actions: Array<{ type: string; config?: object; requiresApproval?: boolean }>;
      };
      return snap as WorkflowPublishValidationInput;
    }
    return {
      trigger: {
        type: version.trigger!.triggerType,
        config: (version.trigger!.config as Record<string, unknown>) ?? {},
      },
      scope: {
        type: version.scope!.scopeType.toLowerCase(),
        stationIds: version.scope!.bindings
          .filter((b) => b.bindingType === 'STATION')
          .map((b) => b.bindingId),
        vehicleIds: version.scope!.bindings
          .filter((b) => b.bindingType === 'VEHICLE')
          .map((b) => b.bindingId),
      },
      conditions:
        version.conditionGroups[0]?.conditions.map((c) => ({
          path: c.fieldPath,
          operator: c.operator.toLowerCase(),
          value: c.valueJson ?? c.valueText ?? c.valueNumber ?? c.valueBoolean,
        })) ?? [],
      actions: version.actions.map((a) => ({
        type: a.actionType,
        config: (a.config as Record<string, unknown>) ?? {},
        requiresApproval: a.requiresApproval,
      })),
    };
  }

  private async writeRevision(
    tx: LifecycleTx,
    input: {
      orgId: string;
      definitionId: string;
      versionId?: string;
      revisionType: WorkflowRevisionType;
      actorUserId?: string;
      beforeHash?: string | null;
      afterHash?: string | null;
      changeReason?: string | null;
    },
  ) {
    await tx.workflowRevision.create({
      data: {
        organizationId: input.orgId,
        workflowDefinitionId: input.definitionId,
        workflowVersionId: input.versionId,
        revisionType: input.revisionType,
        actorUserId: input.actorUserId,
        beforeHash: input.beforeHash ?? null,
        afterHash: input.afterHash ?? null,
        changeReason: input.changeReason ?? null,
        correlationId: `${input.revisionType}:${input.definitionId}:${Date.now()}`,
      },
    });
  }

  private assertNotArchived(definition: { lifecycleStatus: WorkflowDefinitionLifecycleStatus }) {
    if (definition.lifecycleStatus === WorkflowDefinitionLifecycleStatus.ARCHIVED) {
      throw new BadRequestException({
        message: 'Workflow definition is archived',
        code: WORKFLOW_LIFECYCLE_ERROR_CODES.ARCHIVED,
      });
    }
  }

  private formatDefinition(row: Record<string, unknown>) {
    return {
      ...row,
      lifecycle: {
        draftVersionId: row.draftVersionId,
        publishedVersionId: row.publishedVersionId,
        activeVersionId: row.activeVersionId,
        lockVersion: row.lockVersion,
      },
    };
  }

  private throwNotFound(): never {
    throw new NotFoundException({
      message: 'Workflow definition not found',
      code: WORKFLOW_LIFECYCLE_ERROR_CODES.NOT_FOUND,
    });
  }

  private throwVersionNotFound(): never {
    throw new NotFoundException({
      message: 'Workflow version not found',
      code: WORKFLOW_LIFECYCLE_ERROR_CODES.VERSION_NOT_FOUND,
    });
  }
}
