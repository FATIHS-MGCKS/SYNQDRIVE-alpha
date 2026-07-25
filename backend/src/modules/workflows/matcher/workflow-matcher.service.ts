import { Injectable, Logger } from '@nestjs/common';
import { getWorkflowEventDefinition } from '../registry';
import { buildWorkflowMatcherEventContext } from './workflow-matcher-context.util';
import {
  evaluateWorkflowFeatureFlag,
  evaluateWorkflowPolicyRequirements,
  resolveWorkflowAutomationPlatformEnabled,
} from './workflow-matcher-feature-flag.util';
import { WorkflowMatcherRepository } from './workflow-matcher.repository';
import { evaluateWorkflowMatcherScope } from './workflow-matcher-scope.util';
import type { WorkflowMatcherSkipReason } from './workflow-matcher-skip-reasons';
import {
  isCapabilityBlocked,
  parseWorkflowTriggerMatchConfig,
} from './workflow-matcher-trigger.config';
import type {
  WorkflowMatcherCandidateRow,
  WorkflowMatcherInput,
  WorkflowMatcherMatchedWorkflow,
  WorkflowMatcherResult,
  WorkflowMatcherSkippedWorkflow,
} from './workflow-matcher.types';

@Injectable()
export class WorkflowMatcherService {
  private readonly logger = new Logger(WorkflowMatcherService.name);

  constructor(private readonly repository: WorkflowMatcherRepository) {}

  /** Match-only — never executes workflow actions or creates runs. */
  async match(input: WorkflowMatcherInput): Promise<WorkflowMatcherResult> {
    const dryRun = input.dryRun !== false;
    const asOf = input.asOf ?? new Date();
    const ctx = buildWorkflowMatcherEventContext(input.envelope);

    if (ctx.organizationId !== input.envelope.organizationId) {
      return emptyResult(ctx, dryRun, asOf);
    }

    const candidates = await this.repository.findTriggerCandidates({
      organizationId: ctx.organizationId,
      eventType: ctx.eventType,
    });

    const definitionIds = [...new Set(candidates.map((c) => c.definitionId))];
    const flagKeys = candidates
      .map((c) => parseWorkflowTriggerMatchConfig(c.triggerConfig).featureFlagKey)
      .filter((k): k is string => !!k);

    const flags = await this.repository.loadFeatureFlags({
      organizationId: ctx.organizationId,
      definitionIds,
      flagKeys,
    });

    const platformEnabled = resolveWorkflowAutomationPlatformEnabled(flags);
    const policy = { workflowAutomationEnabled: platformEnabled };

    const matches: WorkflowMatcherMatchedWorkflow[] = [];
    const skipped: WorkflowMatcherSkippedWorkflow[] = [];

    const ordered = sortCandidatesDeterministically(candidates);

    for (const candidate of ordered) {
      try {
        const evaluation = this.evaluateCandidate(candidate, ctx, asOf, flags, policy);
        if (evaluation.matched) {
          matches.push(evaluation.match);
        } else {
          skipped.push(evaluation.skipped);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Matcher evaluation error for definition ${candidate.definitionId}: ${message}`,
        );
        skipped.push({
          workflowDefinitionId: candidate.definitionId,
          workflowVersionId: candidate.versionId,
          definitionName: candidate.definitionName,
          versionNumber: candidate.versionNumber,
          skipReason: 'EVALUATION_ERROR',
          skipDetail: message,
        });
      }
    }

    return {
      organizationId: ctx.organizationId,
      eventId: ctx.eventId,
      eventType: ctx.eventType,
      eventVersion: ctx.eventVersion,
      evaluatedAt: asOf.toISOString(),
      dryRun,
      matches: assignMatchRanks(matches),
      skipped,
      candidatesEvaluated: ordered.length,
    };
  }

  /** Alias for explainability / operator dry-run tooling. */
  explain(input: WorkflowMatcherInput): Promise<WorkflowMatcherResult> {
    return this.match({ ...input, dryRun: true });
  }

  private evaluateCandidate(
    candidate: WorkflowMatcherCandidateRow,
    ctx: ReturnType<typeof buildWorkflowMatcherEventContext>,
    asOf: Date,
    flags: Awaited<ReturnType<WorkflowMatcherRepository['loadFeatureFlags']>>,
    policy: { workflowAutomationEnabled: boolean },
  ):
    | { matched: true; match: WorkflowMatcherMatchedWorkflow }
    | { matched: false; skipped: WorkflowMatcherSkippedWorkflow } {
    const baseSkipped = {
      workflowDefinitionId: candidate.definitionId,
      workflowVersionId: candidate.versionId,
      definitionName: candidate.definitionName,
      versionNumber: candidate.versionNumber,
    };

    if (candidate.definitionLifecycleStatus === 'ARCHIVED') {
      return skip(baseSkipped, 'DEFINITION_ARCHIVED');
    }
    if (candidate.remediationRequired) {
      return skip(baseSkipped, 'DEFINITION_REMEDIATION_REQUIRED');
    }
    if (candidate.versionStatus !== 'ACTIVE') {
      return skip(baseSkipped, 'VERSION_NOT_ACTIVE');
    }
    if (!candidate.publishedAt) {
      return skip(baseSkipped, 'VERSION_NOT_PUBLISHED');
    }
    if (candidate.activeVersionId !== candidate.versionId) {
      return skip(baseSkipped, 'NOT_ACTIVE_VERSION_POINTER');
    }

    const triggerConfig = parseWorkflowTriggerMatchConfig(candidate.triggerConfig);
    const registryDef = getWorkflowEventDefinition(ctx.eventType);
    const supportedVersions =
      triggerConfig.supportedEventVersions
      ?? (registryDef ? [registryDef.defaultVersion] : ['1.0.0']);

    if (!supportedVersions.includes(ctx.eventVersion)) {
      return skip(baseSkipped, 'UNSUPPORTED_EVENT_VERSION', `Event version ${ctx.eventVersion} not in [${supportedVersions.join(', ')}]`);
    }

    if (
      triggerConfig.entityTypes?.length
      && (!ctx.entityType || !triggerConfig.entityTypes.includes(ctx.entityType))
    ) {
      return skip(baseSkipped, 'ENTITY_TYPE_MISMATCH', `entityType ${ctx.entityType ?? 'null'} not allowed`);
    }

    const validity = evaluateValidityWindow(triggerConfig.validFrom, triggerConfig.validUntil, asOf);
    if (!validity.ok) {
      return skip(baseSkipped, validity.reason!, validity.detail);
    }

    const scopeResult = evaluateWorkflowMatcherScope(
      {
        scopeType: candidate.scopeType as never,
        bindings: candidate.bindings.map((b) => ({
          bindingType: b.bindingType as never,
          bindingId: b.bindingId,
        })),
      },
      ctx,
    );
    if (!scopeResult.matched) {
      return skip(baseSkipped, scopeResult.reason, scopeResult.detail);
    }

    const policyEval = evaluateWorkflowPolicyRequirements(policy, triggerConfig.policyRequirements);
    if (!policyEval.allowed) {
      return skip(baseSkipped, policyEval.reason, policyEval.detail);
    }

    const flagEval = evaluateWorkflowFeatureFlag(flags, {
      workflowDefinitionId: candidate.definitionId,
      featureFlagKey: triggerConfig.featureFlagKey,
      ctx,
    });
    if (!flagEval.allowed) {
      return skip(baseSkipped, flagEval.reason, flagEval.detail);
    }

    const capabilitySkip = evaluateCapabilities(candidate, triggerConfig.requiredCapabilities);
    if (capabilitySkip) {
      return skip(baseSkipped, capabilitySkip.reason, capabilitySkip.detail);
    }

    return {
      matched: true,
      match: {
        workflowDefinitionId: candidate.definitionId,
        workflowVersionId: candidate.versionId,
        definitionName: candidate.definitionName,
        definitionSlug: candidate.definitionSlug,
        versionNumber: candidate.versionNumber,
        triggerType: candidate.triggerType,
        scopeType: candidate.scopeType ?? 'ORGANIZATION',
        matchRank: 0,
      },
    };
  }
}

function skip(
  base: Omit<WorkflowMatcherSkippedWorkflow, 'skipReason' | 'skipDetail'>,
  reason: WorkflowMatcherSkipReason,
  detail?: string,
): { matched: false; skipped: WorkflowMatcherSkippedWorkflow } {
  return {
    matched: false,
    skipped: { ...base, skipReason: reason, skipDetail: detail },
  };
}

function evaluateValidityWindow(
  validFrom: string | undefined,
  validUntil: string | undefined,
  asOf: Date,
): { ok: true } | { ok: false; reason: WorkflowMatcherSkipReason; detail?: string } {
  if (validFrom) {
    const from = new Date(validFrom);
    if (!Number.isNaN(from.getTime()) && asOf.getTime() < from.getTime()) {
      return { ok: false, reason: 'VALIDITY_NOT_YET_ACTIVE', detail: `validFrom ${validFrom}` };
    }
  }
  if (validUntil) {
    const until = new Date(validUntil);
    if (!Number.isNaN(until.getTime()) && asOf.getTime() >= until.getTime()) {
      return { ok: false, reason: 'VALIDITY_EXPIRED', detail: `validUntil ${validUntil}` };
    }
  }
  return { ok: true };
}

function evaluateCapabilities(
  candidate: WorkflowMatcherCandidateRow,
  requiredCapabilities?: string[],
): { reason: WorkflowMatcherSkipReason; detail: string } | null {
  for (const action of candidate.actions) {
    if (isCapabilityBlocked(action.capabilityStatusAtPublish as never)) {
      return {
        reason: 'CAPABILITY_UNAVAILABLE',
        detail: `Action ${action.actionType} capability ${action.capabilityStatusAtPublish}`,
      };
    }
  }

  if (requiredCapabilities?.length) {
    const available = new Set(
      candidate.actions
        .filter((a) => !isCapabilityBlocked(a.capabilityStatusAtPublish as never))
        .map((a) => a.actionType),
    );
    for (const required of requiredCapabilities) {
      if (!available.has(required)) {
        return {
          reason: 'CAPABILITY_UNAVAILABLE',
          detail: `Required capability ${required} not available on version`,
        };
      }
    }
  }

  return null;
}

function sortCandidatesDeterministically(
  candidates: WorkflowMatcherCandidateRow[],
): WorkflowMatcherCandidateRow[] {
  return [...candidates].sort((a, b) => {
    const created = a.definitionCreatedAt.getTime() - b.definitionCreatedAt.getTime();
    if (created !== 0) return created;
    const name = a.definitionName.localeCompare(b.definitionName);
    if (name !== 0) return name;
    const version = a.versionNumber - b.versionNumber;
    if (version !== 0) return version;
    return a.definitionId.localeCompare(b.definitionId);
  });
}

function emptyResult(
  ctx: ReturnType<typeof buildWorkflowMatcherEventContext>,
  dryRun: boolean,
  asOf: Date,
): WorkflowMatcherResult {
  return {
    organizationId: ctx.organizationId,
    eventId: ctx.eventId,
    eventType: ctx.eventType,
    eventVersion: ctx.eventVersion,
    evaluatedAt: asOf.toISOString(),
    dryRun,
    matches: [],
    skipped: [],
    candidatesEvaluated: 0,
  };
}

// Assign deterministic matchRank after sort
export function assignMatchRanks(
  matches: WorkflowMatcherMatchedWorkflow[],
): WorkflowMatcherMatchedWorkflow[] {
  return matches.map((m, index) => ({ ...m, matchRank: index + 1 }));
}
