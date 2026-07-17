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
import {
  assessFineDraftRequirements,
  buildFinePlannerActions,
  buildFinePlannerSummary,
  FINE_DOCUMENT_MODES,
  isFineDocumentProfile,
  resolveFineDocumentMode,
  resolveFineFollowUpCandidateTypes,
} from './document-action-planner.fine-rules';
import {
  assessFinanceDraftRequirements,
  buildFinancePlannerActions,
  buildFinancePlannerSummary,
  FINANCE_PLAN_OUTCOMES,
  isFinanceDocumentProfile,
  resolveFinanceDocumentMode,
  resolveFinanceFollowUpCandidateTypes,
  stripFinanceDraftActions,
} from './document-action-planner.invoice-rules';
import {
  assessMaintenanceDraftRequirements,
  buildMaintenancePlannerActions,
  buildMaintenancePlannerSummary,
  collectMaintenanceReadinessBlockers,
  isMaintenanceDocumentProfile,
  resolveMaintenanceFollowUpCandidateTypes,
  stripMaintenanceExecutableActions,
} from './document-action-planner.maintenance-rules';
import {
  assessEvidenceDraftRequirements,
  buildEvidencePlannerActions,
  buildEvidencePlannerSummary,
  collectEvidenceReadinessBlockers,
  EVIDENCE_PLAN_OUTCOMES,
  isEvidenceDocumentProfile,
  resolveEvidenceDocumentMode,
  resolveEvidenceFollowUpCandidateTypes,
  stripEvidenceExecutableActions,
} from './document-action-planner.evidence-rules';

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
  if (isFineDocumentProfile(input)) {
    return planFineDocument(input);
  }
  if (isFinanceDocumentProfile(input)) {
    return planFinanceDocument(input);
  }
  if (isEvidenceDocumentProfile(input)) {
    return planEvidenceDocument(input);
  }
  if (isMaintenanceDocumentProfile(input)) {
    return planMaintenanceDocument(input);
  }
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

function planFineDocument(input: DocumentActionPlannerInput): DocumentActionPlannerResult {
  const plannerVersion = input.plannerVersion ?? DOCUMENT_ACTION_PLANNER_VERSION;
  const routingType = resolvePlannerRoutingType(input);
  const vehicleEntityId = findVehicleEntityId(input.entityLinks);
  const fineMode = resolveFineDocumentMode(input);
  const assessment = assessFineDraftRequirements(input);
  const inputFingerprint = buildDocumentActionPlannerInputFingerprint({
    ...input,
    plannerVersion,
  });

  const blockingReasons: DocumentActionBlockingReason[] = [];
  const missingRequirements =
    fineMode === FINE_DOCUMENT_MODES.FINE_NOTICE ? assessment.missingRequirements : [];

  if (fineMode === FINE_DOCUMENT_MODES.FINE_NOTICE) {
    blockingReasons.push(
      ...missingRequirements.map((missing) =>
        toBlockingReasonFromMissing(
          missing,
          missing.entityType ? 'ENTITY' : 'REQUIREMENT',
        ),
      ),
    );
  }
  blockingReasons.push(...collectPlausibilityBlockers(input));

  if (!input.featureFlags.actionPreviewEnabled) {
    blockingReasons.push({
      code: 'ACTION_PREVIEW_DISABLED',
      message: 'Action preview is disabled by feature flag.',
      source: 'FEATURE_FLAG',
      severity: 'BLOCKER',
    });
  }

  if (
    fineMode === FINE_DOCUMENT_MODES.FINE_NOTICE &&
    assessment.canCreateFineDraft &&
    !isDownstreamCapabilityEnabled(input.downstreamCapabilities, 'fines')
  ) {
    blockingReasons.push({
      code: 'CAPABILITY_DISABLED_FINES',
      message: 'Downstream fines capability is disabled for fine draft creation.',
      source: 'CAPABILITY',
      severity: 'BLOCKER',
    });
  }

  const ctx: DocumentActionPlannerBuildContext = {
    input: { ...input, plannerVersion },
    vehicleEntityId,
    routingType,
  };

  let actions =
    blockingReasons.some((reason) => reason.code === 'ACTION_PREVIEW_DISABLED')
      ? []
      : buildFinePlannerActions(ctx);

  const isBlocked =
    blockingReasons.length > 0 ||
    (fineMode === FINE_DOCUMENT_MODES.FINE_NOTICE && !assessment.canCreateFineDraft);

  if (isBlocked) {
    actions = stripExecutableActions(actions);
  }

  const followUpCandidateTypes = resolveFineFollowUpCandidateTypes(
    fineMode,
    assessment.canCreateFineDraft,
  );

  const planDraft: DocumentActionPlanDraft = {
    plannerVersion,
    documentCategory: input.documentCategory,
    documentSubtype: input.documentSubtype,
    effectiveDocumentType: input.effectiveDocumentType,
    inputFingerprint,
    applyMode: input.applyMode,
    isBlocked,
    summary: buildFinePlannerSummary(fineMode, assessment.canCreateFineDraft, actions.length),
    snapshot: {
      plannerVersion,
      inputFingerprint,
      routingType,
      planningMode: 'FINE',
      fineDocumentMode: fineMode,
      documentCategory: input.documentCategory,
      documentSubtype: input.documentSubtype,
      effectiveDocumentType: input.effectiveDocumentType,
      applyMode: input.applyMode,
      isBlocked,
      canCreateFineDraft: assessment.canCreateFineDraft,
      actionTypes: actions.map((action) => action.actionType),
      semanticActions: actions
        .map((action) => (action.previewPayload as Record<string, unknown> | undefined)?.semanticAction)
        .filter(Boolean),
      blockingReasonCodes: blockingReasons.map((reason) => reason.code),
      missingRequirementCodes: missingRequirements.map((missing) => missing.code),
      followUpCandidateTypes,
      entityLinkCount: input.entityLinks.length,
      entityCandidateCount: input.entityCandidates.length,
      plausibilityOverallStatus: input.plausibility.overallStatus,
      noAutomaticContact: true,
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

function planFinanceDocument(input: DocumentActionPlannerInput): DocumentActionPlannerResult {
  const plannerVersion = input.plannerVersion ?? DOCUMENT_ACTION_PLANNER_VERSION;
  const routingType = resolvePlannerRoutingType(input);
  const vehicleEntityId = findVehicleEntityId(input.entityLinks);
  const financeMode = resolveFinanceDocumentMode(input);
  const assessment = assessFinanceDraftRequirements(input);
  const inputFingerprint = buildDocumentActionPlannerInputFingerprint({
    ...input,
    plannerVersion,
  });

  const blockingReasons: DocumentActionBlockingReason[] = [];
  const missingRequirements =
    assessment.planOutcome === FINANCE_PLAN_OUTCOMES.BLOCKED
      ? assessment.missingRequirements
      : assessment.planOutcome === FINANCE_PLAN_OUTCOMES.DRAFT_ONLY
        ? assessment.missingRequirements
        : [];

  if (assessment.planOutcome === FINANCE_PLAN_OUTCOMES.BLOCKED) {
    blockingReasons.push(
      ...assessment.missingRequirements.map((missing) =>
        toBlockingReasonFromMissing(
          missing,
          missing.entityType ? 'ENTITY' : 'REQUIREMENT',
        ),
      ),
    );
  }

  blockingReasons.push(...collectPlausibilityBlockers(input));

  if (!input.featureFlags.actionPreviewEnabled) {
    blockingReasons.push({
      code: 'ACTION_PREVIEW_DISABLED',
      message: 'Action preview is disabled by feature flag.',
      source: 'FEATURE_FLAG',
      severity: 'BLOCKER',
    });
  }

  const wantsInvoiceDraft =
    assessment.canCreateInvoiceDraft || assessment.canCreateCreditNoteDraft;
  if (
    wantsInvoiceDraft &&
    !isDownstreamCapabilityEnabled(input.downstreamCapabilities, 'invoices')
  ) {
    blockingReasons.push({
      code: 'CAPABILITY_DISABLED_INVOICES',
      message: 'Downstream invoices capability is disabled for finance draft creation.',
      source: 'CAPABILITY',
      severity: 'BLOCKER',
    });
  }

  const ctx: DocumentActionPlannerBuildContext = {
    input: { ...input, plannerVersion },
    vehicleEntityId,
    routingType,
  };

  let actions =
    blockingReasons.some((reason) => reason.code === 'ACTION_PREVIEW_DISABLED')
      ? []
      : buildFinancePlannerActions(ctx);

  const isBlocked =
    assessment.planOutcome === FINANCE_PLAN_OUTCOMES.BLOCKED ||
    blockingReasons.some(
      (reason) =>
        reason.code === 'PLAUSIBILITY_OVERALL_BLOCKER' ||
        reason.code === 'ACTION_PREVIEW_DISABLED' ||
        reason.code === 'CAPABILITY_DISABLED_INVOICES',
    );

  if (isBlocked) {
    actions = stripExecutableActions(actions);
  } else if (assessment.planOutcome === FINANCE_PLAN_OUTCOMES.DRAFT_ONLY) {
    actions = stripFinanceDraftActions(actions);
  }

  const followUpCandidateTypes = resolveFinanceFollowUpCandidateTypes(
    financeMode,
    assessment.planOutcome,
  );

  const planDraft: DocumentActionPlanDraft = {
    plannerVersion,
    documentCategory: input.documentCategory,
    documentSubtype: input.documentSubtype,
    effectiveDocumentType: input.effectiveDocumentType,
    inputFingerprint,
    applyMode: input.applyMode,
    isBlocked,
    summary: buildFinancePlannerSummary(financeMode, assessment.planOutcome, actions.length),
    snapshot: {
      plannerVersion,
      inputFingerprint,
      routingType,
      planningMode: 'FINANCE',
      financeDocumentMode: financeMode,
      financePlanOutcome: assessment.planOutcome,
      documentCategory: input.documentCategory,
      documentSubtype: input.documentSubtype,
      effectiveDocumentType: input.effectiveDocumentType,
      applyMode: input.applyMode,
      isBlocked,
      canCreateInvoiceDraft: assessment.canCreateInvoiceDraft,
      canCreateCreditNoteDraft: assessment.canCreateCreditNoteDraft,
      amountSemantics: assessment.amountTaxAssessment.amountSemantics,
      taxSemantics: assessment.amountTaxAssessment.taxSemantics,
      actionTypes: actions.map((action) => action.actionType),
      semanticActions: actions
        .map((action) => (action.previewPayload as Record<string, unknown> | undefined)?.semanticAction)
        .filter(Boolean),
      blockingReasonCodes: blockingReasons.map((reason) => reason.code),
      missingRequirementCodes: missingRequirements.map((missing) => missing.code),
      followUpCandidateTypes,
      entityLinkCount: input.entityLinks.length,
      entityCandidateCount: input.entityCandidates.length,
      plausibilityOverallStatus: input.plausibility.overallStatus,
      vendorRequiresConfirmation: true,
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

function planMaintenanceDocument(input: DocumentActionPlannerInput): DocumentActionPlannerResult {
  const plannerVersion = input.plannerVersion ?? DOCUMENT_ACTION_PLANNER_VERSION;
  const routingType = resolvePlannerRoutingType(input);
  const vehicleEntityId = findVehicleEntityId(input.entityLinks);
  const assessment = assessMaintenanceDraftRequirements(input);
  const inputFingerprint = buildDocumentActionPlannerInputFingerprint({
    ...input,
    plannerVersion,
  });

  const blockingReasons: DocumentActionBlockingReason[] = [];
  const missingRequirements = assessment.missingRequirements;

  blockingReasons.push(
    ...missingRequirements.map((missing) =>
      toBlockingReasonFromMissing(
        missing,
        missing.entityType ? 'ENTITY' : 'REQUIREMENT',
      ),
    ),
  );
  blockingReasons.push(...collectPlausibilityBlockers(input));
  blockingReasons.push(...collectMaintenanceReadinessBlockers(input));

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

  let actions =
    blockingReasons.some((reason) => reason.code === 'ACTION_PREVIEW_DISABLED')
      ? []
      : buildMaintenancePlannerActions(ctx);

  const capabilitySensitiveActions = actions.filter((action) => action.requirement === 'REQUIRED');
  for (const action of capabilitySensitiveActions) {
    const semantic = (action.previewPayload as Record<string, unknown> | undefined)?.semanticAction;
    if (
      (action.actionType === 'CREATE_SERVICE_EVENT' || semantic === 'CREATE_INSPECTION_DRAFT') &&
      !isDownstreamCapabilityEnabled(input.downstreamCapabilities, 'serviceEvents')
    ) {
      blockingReasons.push({
        code: 'CAPABILITY_DISABLED_SERVICEEVENTS',
        message: 'Downstream service events capability is disabled.',
        source: 'CAPABILITY',
        severity: 'BLOCKER',
      });
    }
    if (
      action.actionType === 'UPDATE_VEHICLE_INSPECTION' &&
      !isDownstreamCapabilityEnabled(input.downstreamCapabilities, 'vehicleInspections')
    ) {
      blockingReasons.push({
        code: 'CAPABILITY_DISABLED_VEHICLEINSPECTIONS',
        message: 'Downstream vehicle inspections capability is disabled.',
        source: 'CAPABILITY',
        severity: 'BLOCKER',
      });
    }
    if (
      action.actionType === 'CREATE_DAMAGE' &&
      !isDownstreamCapabilityEnabled(input.downstreamCapabilities, 'damages')
    ) {
      blockingReasons.push({
        code: 'CAPABILITY_DISABLED_DAMAGES',
        message: 'Downstream damages capability is disabled.',
        source: 'CAPABILITY',
        severity: 'BLOCKER',
      });
    }
  }

  const hardBlockCodes = new Set([
    'PLAUSIBILITY_OVERALL_BLOCKER',
    'ACTION_PREVIEW_DISABLED',
    'APPLY_SAFETY_BLOCKED',
    'READINESS_POLICY_BLOCKED',
    'CONFIRMED_ACTION_REQUIRED',
    'CAPABILITY_DISABLED_SERVICEEVENTS',
    'CAPABILITY_DISABLED_VEHICLEINSPECTIONS',
    'CAPABILITY_DISABLED_DAMAGES',
  ]);

  const isBlocked =
    !assessment.isReady ||
    blockingReasons.some((reason) => hardBlockCodes.has(reason.code));

  if (isBlocked) {
    actions = stripMaintenanceExecutableActions(actions);
    if (blockingReasons.some((reason) => hardBlockCodes.has(reason.code))) {
      actions = stripExecutableActions(actions);
    }
  }

  const followUpCandidateTypes = resolveMaintenanceFollowUpCandidateTypes(
    routingType,
    input,
    isBlocked,
  );

  const planDraft: DocumentActionPlanDraft = {
    plannerVersion,
    documentCategory: input.documentCategory,
    documentSubtype: input.documentSubtype,
    effectiveDocumentType: input.effectiveDocumentType,
    inputFingerprint,
    applyMode: input.applyMode,
    isBlocked,
    summary: buildMaintenancePlannerSummary(routingType, assessment.isReady, actions.length),
    snapshot: {
      plannerVersion,
      inputFingerprint,
      routingType,
      planningMode: 'MAINTENANCE',
      documentCategory: input.documentCategory,
      documentSubtype: input.documentSubtype,
      effectiveDocumentType: input.effectiveDocumentType,
      applyMode: input.applyMode,
      isBlocked,
      maintenanceReady: assessment.isReady,
      actionTypes: actions.map((action) => action.actionType),
      semanticActions: actions
        .map((action) => (action.previewPayload as Record<string, unknown> | undefined)?.semanticAction)
        .filter(Boolean),
      blockingReasonCodes: blockingReasons.map((reason) => reason.code),
      missingRequirementCodes: missingRequirements.map((missing) => missing.code),
      followUpCandidateTypes,
      entityLinkCount: input.entityLinks.length,
      entityCandidateCount: input.entityCandidates.length,
      plausibilityOverallStatus: input.plausibility.overallStatus,
      noCurrentDateFallback: true,
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

function planEvidenceDocument(input: DocumentActionPlannerInput): DocumentActionPlannerResult {
  const plannerVersion = input.plannerVersion ?? DOCUMENT_ACTION_PLANNER_VERSION;
  const routingType = resolvePlannerRoutingType(input);
  const vehicleEntityId = findVehicleEntityId(input.entityLinks);
  const evidenceMode = resolveEvidenceDocumentMode(input);
  const assessment = assessEvidenceDraftRequirements(input);
  const inputFingerprint = buildDocumentActionPlannerInputFingerprint({
    ...input,
    plannerVersion,
  });

  const blockingReasons: DocumentActionBlockingReason[] = [];
  const missingRequirements = assessment.missingRequirements;

  blockingReasons.push(
    ...missingRequirements.map((missing) =>
      toBlockingReasonFromMissing(
        missing,
        missing.entityType ? 'ENTITY' : 'REQUIREMENT',
      ),
    ),
  );
  blockingReasons.push(
    ...assessment.measurementIssues
      .filter((issue) => issue.severity === 'BLOCKER')
      .map((issue) => ({
        code: issue.code,
        message: issue.message,
        source: 'REQUIREMENT' as const,
        severity: 'BLOCKER' as const,
      })),
  );
  blockingReasons.push(...collectPlausibilityBlockers(input));
  blockingReasons.push(...collectEvidenceReadinessBlockers(input));

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

  let actions =
    blockingReasons.some((reason) => reason.code === 'ACTION_PREVIEW_DISABLED')
      ? []
      : buildEvidencePlannerActions(ctx);

  const capabilityChecks: Array<{
    enabled: boolean;
    code: string;
    message: string;
    actionTypes: string[];
  }> = [
    {
      enabled: isDownstreamCapabilityEnabled(input.downstreamCapabilities, 'tireMeasurements'),
      code: 'CAPABILITY_DISABLED_TIREMEASUREMENTS',
      message: 'Downstream tire measurements capability is disabled.',
      actionTypes: ['RECORD_TIRE_MEASUREMENT'],
    },
    {
      enabled: isDownstreamCapabilityEnabled(input.downstreamCapabilities, 'brakeEvidence'),
      code: 'CAPABILITY_DISABLED_BRAKEEVIDENCE',
      message: 'Downstream brake evidence capability is disabled.',
      actionTypes: ['RECORD_BRAKE_EVIDENCE'],
    },
    {
      enabled: isDownstreamCapabilityEnabled(input.downstreamCapabilities, 'batteryEvidence'),
      code: 'CAPABILITY_DISABLED_BATTERYEVIDENCE',
      message: 'Downstream battery evidence capability is disabled.',
      actionTypes: ['RECORD_BATTERY_EVIDENCE'],
    },
    {
      enabled: isDownstreamCapabilityEnabled(input.downstreamCapabilities, 'serviceEvents'),
      code: 'CAPABILITY_DISABLED_SERVICEEVENTS',
      message: 'Downstream service events capability is disabled.',
      actionTypes: ['CREATE_SERVICE_EVENT'],
    },
  ];

  for (const check of capabilityChecks) {
    if (check.enabled) continue;
    if (!actions.some((action) => check.actionTypes.includes(action.actionType))) continue;
    blockingReasons.push({
      code: check.code,
      message: check.message,
      source: 'CAPABILITY',
      severity: 'BLOCKER',
    });
  }

  const hardBlockCodes = new Set([
    'PLAUSIBILITY_OVERALL_BLOCKER',
    'ACTION_PREVIEW_DISABLED',
    'APPLY_SAFETY_BLOCKED',
    'READINESS_POLICY_BLOCKED',
    'CONFIRMED_ACTION_REQUIRED',
    'CAPABILITY_DISABLED_TIREMEASUREMENTS',
    'CAPABILITY_DISABLED_BRAKEEVIDENCE',
    'CAPABILITY_DISABLED_BATTERYEVIDENCE',
    'CAPABILITY_DISABLED_SERVICEEVENTS',
  ]);

  const isBlocked =
    assessment.planOutcome === EVIDENCE_PLAN_OUTCOMES.BLOCKED ||
    blockingReasons.some((reason) => hardBlockCodes.has(reason.code));

  if (isBlocked) {
    actions = stripEvidenceExecutableActions(actions);
    if (blockingReasons.some((reason) => hardBlockCodes.has(reason.code))) {
      actions = stripExecutableActions(actions);
    }
  } else if (assessment.planOutcome === EVIDENCE_PLAN_OUTCOMES.REQUIRES_REMEASUREMENT) {
    actions = stripEvidenceExecutableActions(actions);
  }

  const followUpCandidateTypes = resolveEvidenceFollowUpCandidateTypes(
    assessment.planOutcome,
    isBlocked,
  );

  const planDraft: DocumentActionPlanDraft = {
    plannerVersion,
    documentCategory: input.documentCategory,
    documentSubtype: input.documentSubtype,
    effectiveDocumentType: input.effectiveDocumentType,
    inputFingerprint,
    applyMode: input.applyMode,
    isBlocked,
    summary: buildEvidencePlannerSummary(evidenceMode, assessment.planOutcome, actions.length),
    snapshot: {
      plannerVersion,
      inputFingerprint,
      routingType,
      planningMode: 'EVIDENCE',
      evidenceDocumentMode: evidenceMode,
      evidencePlanOutcome: assessment.planOutcome,
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
      missingRequirementCodes: missingRequirements.map((missing) => missing.code),
      measurementIssueCodes: assessment.measurementIssues.map((issue) => issue.code),
      followUpCandidateTypes,
      entityLinkCount: input.entityLinks.length,
      entityCandidateCount: input.entityCandidates.length,
      plausibilityOverallStatus: input.plausibility.overallStatus,
      noHealthScoreOverwrite: true,
      supplementalEvidenceOnly: true,
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
