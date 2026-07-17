import type { DocumentActionRequirement } from '@prisma/client';
import type { PlannedDocumentActionInput } from './document-action.types';
import {
  DOCUMENT_ACTION_CAPABILITY_KEYS,
  isDownstreamCapabilityEnabled,
} from './document-action-planner.capabilities';
import {
  buildPlannerSummary,
  listActionTemplatesForRoutingType,
  resolveFollowUpCandidateTypes,
} from './document-action-planner.catalog';
import { buildDocumentActionPlannerInputFingerprint } from './document-action-planner.fingerprint';
import {
  collectEntityMissingRequirements,
  collectFieldMissingRequirements,
  findVehicleEntityId,
  resolvePlannerRoutingType,
} from './document-action-planner.requirements';
import type {
  DocumentActionBlockingReason,
  DocumentActionPlannerBuildContext,
  DocumentActionPlannerInput,
  DocumentActionPlannerResult,
  DocumentActionPlanDraft,
} from './document-action-planner.types';
import { DOCUMENT_ACTION_PLANNER_VERSION } from './document-action-planner.types';
import {
  buildArchiveOnlyPlannerActions,
  buildArchiveOnlyPlannerSummary,
  isArchiveOnlyDocumentProfile,
  resolveArchiveOnlyFollowUpCandidateTypes,
  resolveArchiveOnlySubtype,
} from './document-action-planner.archive-rules';

const EXECUTABLE_REQUIREMENTS = new Set<DocumentActionRequirement>(['REQUIRED', 'OPTIONAL']);

function collectPlausibilityBlockers(
  input: DocumentActionPlannerInput,
): DocumentActionBlockingReason[] {
  const blockers: DocumentActionBlockingReason[] = [];

  if (input.plausibility.overallStatus === 'BLOCKER') {
    blockers.push({
      code: 'PLAUSIBILITY_OVERALL_BLOCKER',
      message: 'Plausibility overall status is BLOCKER.',
      source: 'PLAUSIBILITY',
      severity: 'BLOCKER',
    });
  }

  for (const check of input.plausibility.checks) {
    if (check.status !== 'BLOCKER') continue;
    blockers.push({
      code: check.code,
      message: check.message,
      source: 'PLAUSIBILITY',
      severity: 'BLOCKER',
    });
  }

  return blockers;
}

function toBlockingReasonFromMissing(
  missing: { code: string; message: string; entityType?: string },
  source: DocumentActionBlockingReason['source'],
): DocumentActionBlockingReason {
  return {
    code: missing.code,
    message: missing.message,
    source,
    severity: 'BLOCKER',
  };
}

function buildBlockedArchiveOnlyAction(
  ctx: DocumentActionPlannerBuildContext,
): PlannedDocumentActionInput {
  return {
    actionType: 'ARCHIVE_ONLY',
    requirement: 'INFORMATIONAL',
    targetEntityType: ctx.vehicleEntityId ? 'VEHICLE' : null,
    targetEntityId: ctx.vehicleEntityId,
    inputPayload: {
      reason: 'blocked_plan',
      routingType: ctx.routingType,
    },
    previewPayload: {
      wouldArchiveOnly: true,
      routingType: ctx.routingType,
    },
    sequence: 1,
  };
}

function materializeTemplateActions(
  ctx: DocumentActionPlannerBuildContext,
  input: DocumentActionPlannerInput,
): { actions: PlannedDocumentActionInput[]; capabilityBlockers: DocumentActionBlockingReason[] } {
  const templates = listActionTemplatesForRoutingType(ctx.routingType);
  const actions: PlannedDocumentActionInput[] = [];
  const capabilityBlockers: DocumentActionBlockingReason[] = [];
  let sequence = 0;

  for (const template of templates) {
    const isInformational = template.requirement === 'INFORMATIONAL';
    if (
      !isInformational &&
      !isDownstreamCapabilityEnabled(input.downstreamCapabilities, template.capabilityKey)
    ) {
      if (template.requirement && EXECUTABLE_REQUIREMENTS.has(template.requirement)) {
        capabilityBlockers.push({
          code: `CAPABILITY_DISABLED_${template.capabilityKey.toUpperCase()}`,
          message: `Downstream capability "${template.capabilityKey}" is disabled for action ${template.actionType}.`,
          source: 'CAPABILITY',
          severity: 'BLOCKER',
        });
      }
      continue;
    }

    sequence += 1;
    const inputPayload = template.buildPayload(ctx);
    const previewPayload = template.buildPreview?.(ctx) ?? {
      actionType: template.actionType,
      requirement: template.requirement ?? 'REQUIRED',
    };

    actions.push({
      actionType: template.actionType,
      requirement: template.requirement ?? 'REQUIRED',
      targetEntityType: template.targetEntityType ?? (ctx.vehicleEntityId ? 'VEHICLE' : null),
      targetEntityId: ctx.vehicleEntityId,
      inputPayload,
      previewPayload,
      sequence,
    });
  }

  return { actions, capabilityBlockers };
}

function stripExecutableActions(actions: PlannedDocumentActionInput[]): PlannedDocumentActionInput[] {
  return actions.filter(
    (action) => !action.requirement || !EXECUTABLE_REQUIREMENTS.has(action.requirement),
  );
}

function hasExecutableRequiredAction(actions: PlannedDocumentActionInput[]): boolean {
  return actions.some(
    (action) => action.requirement === 'REQUIRED' || action.requirement === 'BLOCKER',
  );
}

/**
 * Pure, deterministic document action planner.
 * No Prisma writes, no downstream service calls, no randomness, no date fallbacks.
 */
export function planDocumentActions(input: DocumentActionPlannerInput): DocumentActionPlannerResult {
  if (isArchiveOnlyDocumentProfile(input)) {
    return planArchiveOnlyDocument(input);
  }
  return planDownstreamDocumentActions(input);
}

function planArchiveOnlyDocument(input: DocumentActionPlannerInput): DocumentActionPlannerResult {
  const plannerVersion = input.plannerVersion ?? DOCUMENT_ACTION_PLANNER_VERSION;
  const routingType = resolvePlannerRoutingType(input);
  const vehicleEntityId = findVehicleEntityId(input.entityLinks);
  const archiveSubtype = resolveArchiveOnlySubtype(input);
  const inputFingerprint = buildDocumentActionPlannerInputFingerprint({
    ...input,
    plannerVersion,
  });

  const blockingReasons: DocumentActionBlockingReason[] = [];
  if (!input.featureFlags.actionPreviewEnabled) {
    blockingReasons.push({
      code: 'ACTION_PREVIEW_DISABLED',
      message: 'Action preview is disabled by feature flag.',
      source: 'FEATURE_FLAG',
      severity: 'BLOCKER',
    });
  }

  const ctx: DocumentActionPlannerBuildContext = {
    input: { ...input, plannerVersion },
    vehicleEntityId,
    routingType,
  };

  const actions =
    blockingReasons.length > 0 ? [] : buildArchiveOnlyPlannerActions(ctx);
  const isBlocked = blockingReasons.length > 0;

  if (isBlocked && input.featureFlags.archiveOnlyFallback) {
    actions.push(buildBlockedArchiveOnlyAction(ctx));
  }

  const followUpCandidateTypes = resolveArchiveOnlyFollowUpCandidateTypes(archiveSubtype);

  const planDraft: DocumentActionPlanDraft = {
    plannerVersion,
    documentCategory: input.documentCategory,
    documentSubtype: input.documentSubtype,
    effectiveDocumentType: input.effectiveDocumentType,
    inputFingerprint,
    applyMode: input.applyMode,
    isBlocked,
    summary: isBlocked
      ? 'Blocked archive-only action plan.'
      : buildArchiveOnlyPlannerSummary(archiveSubtype, actions.length),
    snapshot: {
      plannerVersion,
      inputFingerprint,
      routingType,
      archiveOnlyProfile: archiveSubtype,
      planningMode: 'ARCHIVE_ONLY',
      documentCategory: input.documentCategory,
      documentSubtype: input.documentSubtype,
      effectiveDocumentType: input.effectiveDocumentType,
      applyMode: input.applyMode,
      isBlocked,
      actionTypes: actions.map((action) => action.actionType),
      semanticActions: actions
        .map((action) => (action.previewPayload as Record<string, unknown> | undefined)?.semanticAction)
        .filter(Boolean),
      blockingReasonCodes: blockingReasons.map((reason) => reason.code),
      followUpCandidateTypes,
      entityLinkCount: input.entityLinks.length,
      entityCandidateCount: input.entityCandidates.length,
      plausibilityOverallStatus: input.plausibility.overallStatus,
      noDownstreamApply: true,
      noAutomaticContact: true,
    },
  };

  return {
    planDraft,
    actions,
    blockingReasons,
    missingRequirements: [],
    followUpCandidateTypes,
  };
}

function planDownstreamDocumentActions(input: DocumentActionPlannerInput): DocumentActionPlannerResult {
  const plannerVersion = input.plannerVersion ?? DOCUMENT_ACTION_PLANNER_VERSION;
  const routingType = resolvePlannerRoutingType(input);
  const vehicleEntityId = findVehicleEntityId(input.entityLinks);
  const inputFingerprint = buildDocumentActionPlannerInputFingerprint({
    ...input,
    plannerVersion,
  });

  const blockingReasons: DocumentActionBlockingReason[] = [];
  const missingRequirements = [
    ...collectFieldMissingRequirements(routingType, input.confirmedData),
    ...collectEntityMissingRequirements(routingType, input.entityLinks),
  ];

  blockingReasons.push(...collectPlausibilityBlockers(input));
  blockingReasons.push(
    ...missingRequirements.map((missing) =>
      toBlockingReasonFromMissing(
        missing,
        missing.entityType ? 'ENTITY' : 'REQUIREMENT',
      ),
    ),
  );

  if (!input.featureFlags.actionPreviewEnabled) {
    blockingReasons.push({
      code: 'ACTION_PREVIEW_DISABLED',
      message: 'Action preview is disabled by feature flag.',
      source: 'FEATURE_FLAG',
      severity: 'BLOCKER',
    });
  }

  if (!routingType && input.documentCategory && input.documentCategory !== 'GENERAL') {
    blockingReasons.push({
      code: 'ROUTING_TYPE_UNRESOLVED',
      message: `Document category ${input.documentCategory} requires effectiveDocumentType for concrete downstream planning.`,
      source: 'ROUTING',
      severity: 'BLOCKER',
    });
  }

  const ctx: DocumentActionPlannerBuildContext = {
    input: { ...input, plannerVersion },
    vehicleEntityId,
    routingType,
  };

  let actions: PlannedDocumentActionInput[] = [];
  if (routingType) {
    const materialized = materializeTemplateActions(ctx, input);
    actions = materialized.actions;
    blockingReasons.push(...materialized.capabilityBlockers);
  }

  const isBlocked =
    blockingReasons.length > 0 ||
    (routingType != null && !hasExecutableRequiredAction(actions) && routingType !== 'OTHER' && routingType !== 'VEHICLE_CONDITION');

  if (isBlocked) {
    actions = stripExecutableActions(actions);
    if (input.featureFlags.archiveOnlyFallback || actions.length === 0) {
      const archiveAction = buildBlockedArchiveOnlyAction(ctx);
      if (!actions.some((action) => action.actionType === 'ARCHIVE_ONLY')) {
        actions = [archiveAction];
      }
    }
  }

  const followUpCandidateTypes = resolveFollowUpCandidateTypes(routingType, input, isBlocked);

  const planDraft: DocumentActionPlanDraft = {
    plannerVersion,
    documentCategory: input.documentCategory,
    documentSubtype: input.documentSubtype,
    effectiveDocumentType: input.effectiveDocumentType,
    inputFingerprint,
    applyMode: input.applyMode,
    isBlocked,
    summary: buildPlannerSummary(routingType, actions.length, isBlocked),
    snapshot: {
      plannerVersion,
      inputFingerprint,
      routingType,
      documentCategory: input.documentCategory,
      documentSubtype: input.documentSubtype,
      effectiveDocumentType: input.effectiveDocumentType,
      applyMode: input.applyMode,
      isBlocked,
      actionTypes: actions.map((action) => action.actionType),
      actionRequirements: actions.map((action) => ({
        actionType: action.actionType,
        requirement: action.requirement ?? 'REQUIRED',
        capabilityKey: DOCUMENT_ACTION_CAPABILITY_KEYS[action.actionType],
      })),
      blockingReasonCodes: blockingReasons.map((reason) => reason.code),
      missingRequirementCodes: missingRequirements.map((missing) => missing.code),
      followUpCandidateTypes,
      entityLinkCount: input.entityLinks.length,
      entityCandidateCount: input.entityCandidates.length,
      plausibilityOverallStatus: input.plausibility.overallStatus,
    },
  };

  return {
    planDraft,
    actions,
    blockingReasons,
    missingRequirements,
    followUpCandidateTypes,
  };
}

export const DocumentActionPlannerEngine = {
  plan: planDocumentActions,
};
