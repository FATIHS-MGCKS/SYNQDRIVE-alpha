import { createHash } from 'crypto';
import type {
  WorkflowCondition,
  WorkflowConditionGroup,
  WorkflowAction,
  WorkflowScope,
  WorkflowTrigger,
  WorkflowVersion,
  WorkflowDefinition,
  WorkflowFeatureFlag,
} from '@prisma/client';
import { APPROVAL_REQUIRED_ACTIONS } from '../workflow.constants';
import { WORKFLOW_CAPABILITY_REVISION, WORKFLOW_EXECUTION_SNAPSHOT_VERSION } from './workflow-execution-snapshot.constants';
import {
  containsSecretKeys,
  extractTemplateRefs,
  minimizeEventPayload,
  resolveActionRiskClass,
  resolveRequiredPermissions,
  stripSecretsFromValue,
} from './workflow-execution-snapshot.sanitize';
import type {
  WorkflowExecutionSnapshotCaptureInput,
  WorkflowExecutionSnapshotConditionGroup,
  WorkflowExecutionSnapshotPayload,
  WorkflowExecutionSnapshotPolicyBlock,
  WorkflowTemplateRef,
} from './workflow-execution-snapshot.types';

type VersionGraph = WorkflowVersion & {
  definition: WorkflowDefinition;
  trigger: WorkflowTrigger | null;
  scope: (WorkflowScope & { bindings: Array<{ bindingType: string; bindingId: string }> }) | null;
  conditionGroups: Array<
    WorkflowConditionGroup & {
      conditions: WorkflowCondition[];
    }
  >;
  actions: WorkflowAction[];
};

export function computeExecutionSnapshotHash(payload: WorkflowExecutionSnapshotPayload): string {
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(normalized).digest('hex');
}

export function buildPolicySnapshotBlock(input: {
  policySnapshotId: string;
  capabilityRevision: string;
  contentHash: string;
  approvalResumeSupported: boolean;
  approvalTtlHours: number;
  approvalRequiredActionTypes: string[];
  featureFlags: WorkflowFeatureFlag[];
}): WorkflowExecutionSnapshotPolicyBlock {
  return {
    policySnapshotId: input.policySnapshotId,
    capabilityRevision: input.capabilityRevision,
    contentHash: input.contentHash,
    approvalResumeSupported: input.approvalResumeSupported,
    approvalTtlHours: input.approvalTtlHours,
    approvalRequiredActionTypes: input.approvalRequiredActionTypes,
    featureFlags: input.featureFlags.map((flag) => ({
      flagKey: flag.flagKey,
      enabled: flag.enabled,
      scope: flag.scope,
      rolloutPercentage: flag.rolloutPercentage,
    })),
  };
}

export function buildConditionTree(
  groups: VersionGraph['conditionGroups'],
  parentId: string | null = null,
): WorkflowExecutionSnapshotConditionGroup[] {
  return groups
    .filter((group) => (group.parentGroupId ?? null) === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((group) => ({
      groupId: group.id,
      logicOperator: group.logicOperator,
      sortOrder: group.sortOrder,
      conditions: group.conditions
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((condition) => ({
          fieldPath: condition.fieldPath,
          operator: condition.operator,
          value:
            condition.valueJson ??
            condition.valueText ??
            condition.valueNumber ??
            condition.valueBoolean,
          sortOrder: condition.sortOrder,
        })),
      childGroups: buildConditionTree(groups, group.id),
    }));
}

export function buildExecutionSnapshotPayload(
  versionGraph: VersionGraph,
  input: WorkflowExecutionSnapshotCaptureInput & {
    policies: WorkflowExecutionSnapshotPolicyBlock;
  },
): WorkflowExecutionSnapshotPayload {
  if (!versionGraph.trigger || !versionGraph.scope) {
    throw new Error('Workflow version graph incomplete for execution snapshot');
  }
  if (versionGraph.status !== 'ACTIVE' && versionGraph.status !== 'PUBLISHED') {
    throw new Error(`Workflow version ${versionGraph.id} is not executable (${versionGraph.status})`);
  }

  const capturedAt = (input.capturedAt ?? new Date()).toISOString();
  const actions = versionGraph.actions
    .sort((a, b) => a.actionIndex - b.actionIndex)
    .map((action) => {
      const config = stripSecretsFromValue(action.config ?? {}) as Record<string, unknown>;
      const secretPath = containsSecretKeys(config);
      if (secretPath) {
        throw new Error(`Secret-like key detected in action config at ${secretPath}`);
      }
      const requiresApproval =
        action.requiresApproval || APPROVAL_REQUIRED_ACTIONS.has(action.actionType);
      return {
        actionKey: action.actionKey,
        actionIndex: action.actionIndex,
        actionType: action.actionType,
        requiresApproval,
        capabilityStatusAtPublish: action.capabilityStatusAtPublish,
        riskClass: resolveActionRiskClass(action.actionType, requiresApproval),
        requiredPermissions: resolveRequiredPermissions(action.actionType, requiresApproval),
        config,
        templateRefs: extractTemplateRefs(config, action.actionType),
      };
    });

  const templateIndex = new Map<string, WorkflowTemplateRef>();
  for (const action of actions) {
    for (const ref of action.templateRefs) {
      templateIndex.set(`${ref.templateId}:${ref.templateVersion}`, ref);
    }
  }

  const triggerConfig = stripSecretsFromValue(versionGraph.trigger.config ?? {}) as Record<
    string,
    unknown
  >;

  const payload: WorkflowExecutionSnapshotPayload = {
    snapshotVersion: WORKFLOW_EXECUTION_SNAPSHOT_VERSION,
    capturedAt,
    definition: {
      definitionId: versionGraph.definition.id,
      definitionName: versionGraph.definition.name,
      category: versionGraph.definition.category,
      versionId: versionGraph.id,
      versionNumber: versionGraph.versionNumber,
      publishedAt: versionGraph.publishedAt?.toISOString() ?? null,
      versionContentHash: versionGraph.contentHash,
    },
    graph: {
      trigger: {
        type: versionGraph.trigger.triggerType,
        config: triggerConfig,
      },
      scope: {
        type: versionGraph.scope.scopeType.toLowerCase(),
        stationIds: versionGraph.scope.bindings
          .filter((b) => b.bindingType === 'STATION')
          .map((b) => b.bindingId),
        vehicleIds: versionGraph.scope.bindings
          .filter((b) => b.bindingType === 'VEHICLE')
          .map((b) => b.bindingId),
      },
      conditionTree: buildConditionTree(versionGraph.conditionGroups),
      actions,
    },
    policies: input.policies,
    templates: [...templateIndex.values()],
    event: {
      envelope: input.event,
      payload: minimizeEventPayload(input.rawEventPayload, input.event),
    },
    ...(input.conditionEvaluation ? { conditionEvaluation: input.conditionEvaluation } : {}),
  };

  return payload;
}

export function buildPolicyPayloadForCapture(featureFlags: WorkflowFeatureFlag[]) {
  return {
    capabilityRevision: WORKFLOW_CAPABILITY_REVISION,
    approvalResumeSupported: false,
    approvalTtlHours: 72,
    featureFlags: featureFlags.map((f) => ({
      flagKey: f.flagKey,
      enabled: f.enabled,
      scope: f.scope,
      rolloutPercentage: f.rolloutPercentage,
    })),
  };
}

export function computePolicyContentHash(payload: Record<string, unknown>): string {
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(normalized).digest('hex');
}
