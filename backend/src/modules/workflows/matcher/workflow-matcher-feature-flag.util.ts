import { createHash } from 'crypto';
import type { WorkflowMatcherEventContext } from './workflow-matcher-context.util';
import type {
  WorkflowMatcherFeatureFlagRow,
  WorkflowMatcherPolicyContext,
} from './workflow-matcher.types';
import type { WorkflowMatcherSkipReason } from './workflow-matcher-skip-reasons';

export const WORKFLOW_PLATFORM_FLAG_AUTOMATION = 'workflow_automation_enabled';

export type WorkflowFeatureFlagEvaluation =
  | { allowed: true }
  | { allowed: false; reason: WorkflowMatcherSkipReason; detail?: string };

export function resolveWorkflowAutomationPlatformEnabled(
  flags: WorkflowMatcherFeatureFlagRow[],
): boolean {
  const platform = flags.find(
    (f) => f.scope === 'PLATFORM' && f.flagKey === WORKFLOW_PLATFORM_FLAG_AUTOMATION,
  );
  if (!platform) return true;
  return platform.enabled;
}

export function evaluateWorkflowFeatureFlag(
  flags: WorkflowMatcherFeatureFlagRow[],
  input: {
    workflowDefinitionId: string;
    featureFlagKey?: string;
    ctx: WorkflowMatcherEventContext;
  },
): WorkflowFeatureFlagEvaluation {
  const keyed = input.featureFlagKey
    ? flags.find(
        (f) =>
          f.flagKey === input.featureFlagKey
          && (f.scope !== 'WORKFLOW_DEFINITION'
            || f.workflowDefinitionId === input.workflowDefinitionId),
      )
    : undefined;

  if (keyed && !keyed.enabled) {
    return {
      allowed: false,
      reason: 'FEATURE_FLAG_DISABLED',
      detail: `Feature flag ${keyed.flagKey} is disabled`,
    };
  }

  const target = keyed
    ?? flags.find(
      (f) =>
        f.scope === 'WORKFLOW_DEFINITION'
        && f.workflowDefinitionId === input.workflowDefinitionId
        && f.flagKey === 'workflow_definition_enabled',
    );

  if (target && !target.enabled) {
    return {
      allowed: false,
      reason: 'FEATURE_FLAG_DISABLED',
      detail: `Workflow definition flag ${target.flagKey} is disabled`,
    };
  }

  if (target?.rolloutPercentage != null && target.rolloutPercentage < 100) {
    const seed = `${input.ctx.organizationId}:${input.workflowDefinitionId}:${input.ctx.eventId}`;
    if (!isInRolloutPercentage(seed, target.rolloutPercentage)) {
      return {
        allowed: false,
        reason: 'ROLLOUT_PERCENTAGE_EXCLUDED',
        detail: `Rollout ${target.rolloutPercentage}% excluded event`,
      };
    }
  }

  if (target && target.rolloutScopes.length > 0) {
    const hit = target.rolloutScopes.some((rs) => matchesRolloutScope(rs, input.ctx));
    if (!hit) {
      return {
        allowed: false,
        reason: 'ROLLOUT_SCOPE_MISMATCH',
        detail: 'Event context does not match rollout scope bindings',
      };
    }
  }

  return { allowed: true };
}

export function evaluateWorkflowPolicyRequirements(
  policy: WorkflowMatcherPolicyContext,
  requirements?: Record<string, unknown>,
): WorkflowFeatureFlagEvaluation {
  if (!requirements || Object.keys(requirements).length === 0) {
    return { allowed: true };
  }

  if (requirements.workflowAutomationEnabled === true && !policy.workflowAutomationEnabled) {
    return {
      allowed: false,
      reason: 'POLICY_REQUIREMENT_FAILED',
      detail: 'Organization workflow automation policy is disabled',
    };
  }

  return { allowed: true };
}

function matchesRolloutScope(
  scope: { scopeType: string; scopeId: string },
  ctx: WorkflowMatcherEventContext,
): boolean {
  switch (scope.scopeType) {
    case 'STATION':
      return !!ctx.stationId && ctx.stationId === scope.scopeId;
    case 'VEHICLE':
      return !!ctx.vehicleId && ctx.vehicleId === scope.scopeId;
    case 'CATEGORY':
      return false;
    default:
      return false;
  }
}

function isInRolloutPercentage(seed: string, percentage: number): boolean {
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;
  const hash = createHash('sha256').update(seed).digest();
  const bucket = hash.readUInt32BE(0) % 100;
  return bucket < percentage;
}
