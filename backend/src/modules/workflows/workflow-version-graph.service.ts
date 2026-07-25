import {
  Prisma,
  WorkflowActionCapabilityStatus,
  WorkflowConditionLogicOperator,
} from '@prisma/client';
import type { validateWorkflowDefinition } from './workflow-definition.validator';
import {
  mapConditionOperator,
  mapScopeType,
  newActionKey,
  serializeConditionValue,
} from './workflow-lifecycle.util';

type Tx = Prisma.TransactionClient;

type ValidatedGraph = ReturnType<typeof validateWorkflowDefinition>;

export async function replaceVersionGraph(
  tx: Tx,
  orgId: string,
  versionId: string,
  validated: ValidatedGraph,
) {
  await clearVersionGraph(tx, versionId);

  await tx.workflowTrigger.create({
    data: {
      organizationId: orgId,
      workflowVersionId: versionId,
      triggerType: validated.trigger.type,
      legacyTriggerKey: validated.trigger.type,
      config: (validated.trigger.config ?? {}) as Prisma.InputJsonValue,
    },
  });

  const scope = await tx.workflowScope.create({
    data: {
      organizationId: orgId,
      workflowVersionId: versionId,
      scopeType: mapScopeType(validated.scope.type),
    },
  });

  if (validated.scope.type === 'station' && validated.scope.stationIds?.length) {
    await tx.workflowScopeBinding.createMany({
      data: validated.scope.stationIds.map((bindingId) => ({
        organizationId: orgId,
        workflowScopeId: scope.id,
        bindingType: 'STATION',
        bindingId,
      })),
    });
  }
  if (validated.scope.type === 'vehicle' && validated.scope.vehicleIds?.length) {
    await tx.workflowScopeBinding.createMany({
      data: validated.scope.vehicleIds.map((bindingId) => ({
        organizationId: orgId,
        workflowScopeId: scope.id,
        bindingType: 'VEHICLE',
        bindingId,
      })),
    });
  }

  const rootGroup = await tx.workflowConditionGroup.create({
    data: {
      organizationId: orgId,
      workflowVersionId: versionId,
      logicOperator: WorkflowConditionLogicOperator.AND,
      sortOrder: 0,
    },
  });

  for (let i = 0; i < validated.conditions.length; i++) {
    const condition = validated.conditions[i];
    const fieldPath = condition.path?.trim() || (condition.field ? `payload.${condition.field}` : 'payload');
    const operator = mapConditionOperator(condition.operator);
    const valueFields = serializeConditionValue(operator, condition.value);
    await tx.workflowCondition.create({
      data: {
        organizationId: orgId,
        conditionGroupId: rootGroup.id,
        fieldPath,
        operator,
        sortOrder: i,
        ...valueFields,
      } as Prisma.WorkflowConditionUncheckedCreateInput,
    });
  }

  for (let i = 0; i < validated.actions.length; i++) {
    const action = validated.actions[i];
    await tx.workflowAction.create({
      data: {
        organizationId: orgId,
        workflowVersionId: versionId,
        actionKey: newActionKey(),
        actionIndex: i,
        actionType: action.type,
        requiresApproval: action.requiresApproval === true,
        capabilityStatusAtPublish: WorkflowActionCapabilityStatus.AVAILABLE,
        config: (action.config ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}

export async function clearVersionGraph(tx: Tx, versionId: string) {
  const groups = await tx.workflowConditionGroup.findMany({
    where: { workflowVersionId: versionId },
    select: { id: true },
  });
  if (groups.length) {
    await tx.workflowCondition.deleteMany({
      where: { conditionGroupId: { in: groups.map((g) => g.id) } },
    });
  }
  await tx.workflowConditionGroup.deleteMany({ where: { workflowVersionId: versionId } });
  await tx.workflowAction.deleteMany({ where: { workflowVersionId: versionId } });

  const scopes = await tx.workflowScope.findMany({
    where: { workflowVersionId: versionId },
    select: { id: true },
  });
  if (scopes.length) {
    await tx.workflowScopeBinding.deleteMany({
      where: { workflowScopeId: { in: scopes.map((s) => s.id) } },
    });
  }
  await tx.workflowScope.deleteMany({ where: { workflowVersionId: versionId } });
  await tx.workflowTrigger.deleteMany({ where: { workflowVersionId: versionId } });
}

export async function cloneVersionGraph(
  tx: Tx,
  orgId: string,
  sourceVersionId: string,
  targetVersionId: string,
) {
  const source = await tx.workflowVersion.findFirst({
    where: { id: sourceVersionId, organizationId: orgId },
    include: {
      trigger: true,
      scope: { include: { bindings: true } },
      conditionGroups: { include: { conditions: true } },
      actions: { orderBy: { actionIndex: 'asc' } },
    },
  });
  if (!source?.trigger || !source.scope) {
    throw new Error('Source version graph incomplete');
  }

  await tx.workflowTrigger.create({
    data: {
      organizationId: orgId,
      workflowVersionId: targetVersionId,
      triggerType: source.trigger.triggerType,
      legacyTriggerKey: source.trigger.legacyTriggerKey,
      config: source.trigger.config as Prisma.InputJsonValue,
    },
  });

  const scope = await tx.workflowScope.create({
    data: {
      organizationId: orgId,
      workflowVersionId: targetVersionId,
      scopeType: source.scope.scopeType,
    },
  });

  if (source.scope.bindings.length) {
    await tx.workflowScopeBinding.createMany({
      data: source.scope.bindings.map((b) => ({
        organizationId: orgId,
        workflowScopeId: scope.id,
        bindingType: b.bindingType,
        bindingId: b.bindingId,
      })),
    });
  }

  for (const group of source.conditionGroups) {
    const newGroup = await tx.workflowConditionGroup.create({
      data: {
        organizationId: orgId,
        workflowVersionId: targetVersionId,
        parentGroupId: null,
        logicOperator: group.logicOperator,
        sortOrder: group.sortOrder,
      },
    });
    for (const condition of group.conditions) {
      await tx.workflowCondition.create({
        data: {
          organizationId: orgId,
          conditionGroupId: newGroup.id,
          fieldPath: condition.fieldPath,
          operator: condition.operator,
          sortOrder: condition.sortOrder,
          valueText: condition.valueText,
          valueNumber: condition.valueNumber,
          valueBoolean: condition.valueBoolean,
          valueJson: condition.valueJson as Prisma.InputJsonValue,
        },
      });
    }
  }

  for (const action of source.actions) {
    await tx.workflowAction.create({
      data: {
        organizationId: orgId,
        workflowVersionId: targetVersionId,
        actionKey: newActionKey(),
        actionIndex: action.actionIndex,
        actionType: action.actionType,
        requiresApproval: action.requiresApproval,
        capabilityStatusAtPublish: action.capabilityStatusAtPublish,
        config: action.config as Prisma.InputJsonValue,
      },
    });
  }
}

export async function loadVersionGraph(prisma: Tx, orgId: string, versionId: string) {
  return prisma.workflowVersion.findFirst({
    where: { id: versionId, organizationId: orgId },
    include: {
      trigger: true,
      scope: { include: { bindings: true } },
      conditionGroups: {
        include: { conditions: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
      actions: { orderBy: { actionIndex: 'asc' } },
    },
  });
}
