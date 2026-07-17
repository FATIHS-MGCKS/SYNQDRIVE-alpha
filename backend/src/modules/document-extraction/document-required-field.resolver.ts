import type { DocumentActionPlannerInput } from './document-action-planner.types';
import {
  isArchiveOnlyDocumentProfile,
  resolveArchiveOnlySubtype,
} from './document-action-planner.archive-rules';
import {
  isEvidenceDocumentProfile,
  resolveEvidenceDocumentMode,
} from './document-action-planner.evidence-rules';
import {
  FINE_DOCUMENT_MODES,
  isFineDocumentProfile,
  resolveFineDocumentMode,
} from './document-action-planner.fine-rules';
import {
  FINANCE_DOCUMENT_MODES,
  isFinanceDocumentProfile,
  resolveFinanceDocumentMode,
} from './document-action-planner.invoice-rules';
import { isMaintenanceDocumentProfile } from './document-action-planner.maintenance-rules';
import {
  evaluateRequiredFieldProfile,
  normalizeRegistryDocumentSubtype,
} from './document-required-field.evaluator';
import {
  DOCUMENT_REQUIRED_FIELD_PROFILES,
  getDocumentRequiredFieldProfile,
} from './document-required-field.registry';
import type {
  DocumentRequiredFieldProfile,
  RequiredFieldEvaluationContext,
  RequiredFieldProfileEvaluation,
  RequiredFieldStage,
} from './document-required-field.registry.types';
import { DOCUMENT_REQUIRED_FIELD_REGISTRY_VERSION } from './document-required-field.registry.types';

const FINE_MODE_TO_PROFILE_KEY: Record<string, string> = {
  [FINE_DOCUMENT_MODES.FINE_NOTICE]: 'fine.fine_notice',
  [FINE_DOCUMENT_MODES.HEARING_FORM]: 'fine.hearing_form',
  [FINE_DOCUMENT_MODES.DRIVER_INQUIRY]: 'fine.driver_inquiry',
};

const FINANCE_MODE_TO_PROFILE_KEY: Record<string, string> = {
  [FINANCE_DOCUMENT_MODES.INCOMING_INVOICE]: 'finance.incoming_invoice',
  [FINANCE_DOCUMENT_MODES.CREDIT_NOTE]: 'finance.credit_note',
  [FINANCE_DOCUMENT_MODES.PAYMENT_REMINDER]: 'finance.payment_reminder',
  [FINANCE_DOCUMENT_MODES.PAYMENT_PROOF]: 'finance.payment_proof',
};

const EVIDENCE_MODE_TO_PROFILE_KEY: Record<string, string> = {
  TIRE: 'evidence.tire',
  BRAKE: 'evidence.brake',
  BATTERY: 'evidence.battery',
  WORKSHOP_MEASUREMENT: 'evidence.workshop_measurement',
};

const MAINTENANCE_TYPE_TO_PROFILE_KEY: Record<string, string> = {
  SERVICE: 'maintenance.service',
  OIL_CHANGE: 'maintenance.oil_change',
  TUV_REPORT: 'maintenance.tuv_report',
  BOKRAFT_REPORT: 'maintenance.bokraft_report',
  DAMAGE: 'maintenance.damage',
  ACCIDENT: 'maintenance.accident',
  VEHICLE_CONDITION: 'maintenance.vehicle_condition',
};

const ARCHIVE_SUBTYPE_TO_PROFILE_KEY: Record<string, string> = {
  GENERAL_LETTER: 'archive.general_letter',
  CUSTOMER_CORRESPONDENCE: 'archive.customer_correspondence',
  DRIVER_DOCUMENT: 'archive.driver_document',
  INSURANCE_NOTICE: 'archive.insurance_notice',
  PAYMENT_PROOF: 'archive.payment_proof',
  GENERAL_PROOF: 'archive.general_proof',
  UNKNOWN_DOCUMENT_TYPE: 'archive.unknown_document_type',
  OTHER: 'archive.unknown_document_type',
  UNSPECIFIED: 'archive.unknown_document_type',
  STANDARD: 'archive.unknown_document_type',
};

function findProfileBySubtype(
  profiles: DocumentRequiredFieldProfile[],
  effectiveDocumentType: string,
  normalizedSubtype: string | null,
): DocumentRequiredFieldProfile | null {
  const typeMatches = profiles.filter(
    (profile) => profile.effectiveDocumentType === effectiveDocumentType,
  );
  if (typeMatches.length === 0) return null;

  if (normalizedSubtype) {
    const exact = typeMatches.find((profile) =>
      profile.documentSubtypes.some(
        (subtype) => subtype != null && subtype === normalizedSubtype,
      ),
    );
    if (exact) return exact;
  }

  return (
    typeMatches.find((profile) => profile.documentSubtypes.includes(null)) ?? typeMatches[0] ?? null
  );
}

export function resolveDocumentRequiredFieldProfileKey(
  input: Pick<
    DocumentActionPlannerInput,
    | 'effectiveDocumentType'
    | 'documentSubtype'
    | 'documentCategory'
    | 'confirmedData'
  >,
): string {
  const profile = resolveDocumentRequiredFieldProfile(input);
  return profile.profileKey;
}

export function resolveDocumentRequiredFieldProfile(
  input: Pick<
    DocumentActionPlannerInput,
    | 'effectiveDocumentType'
    | 'documentSubtype'
    | 'documentCategory'
    | 'confirmedData'
  >,
): DocumentRequiredFieldProfile {
  const normalizedSubtype = normalizeRegistryDocumentSubtype(input.documentSubtype);

  if (isFineDocumentProfile(input)) {
    const mode = resolveFineDocumentMode(input);
    const profileKey = FINE_MODE_TO_PROFILE_KEY[mode] ?? 'fine.fine_notice';
    return getDocumentRequiredFieldProfile(profileKey)!;
  }

  if (isFinanceDocumentProfile(input)) {
    const mode = resolveFinanceDocumentMode(input);
    const profileKey = FINANCE_MODE_TO_PROFILE_KEY[mode] ?? 'finance.incoming_invoice';
    return getDocumentRequiredFieldProfile(profileKey)!;
  }

  if (isEvidenceDocumentProfile(input)) {
    const mode = resolveEvidenceDocumentMode(input);
    const profileKey = EVIDENCE_MODE_TO_PROFILE_KEY[mode] ?? 'evidence.tire';
    return getDocumentRequiredFieldProfile(profileKey)!;
  }

  if (isMaintenanceDocumentProfile(input)) {
    const type = input.effectiveDocumentType ?? 'SERVICE';
    const profileKey = MAINTENANCE_TYPE_TO_PROFILE_KEY[type] ?? 'maintenance.service';
    return getDocumentRequiredFieldProfile(profileKey)!;
  }

  if (isArchiveOnlyDocumentProfile(input as DocumentActionPlannerInput)) {
    const archiveSubtype = resolveArchiveOnlySubtype(input);
    const profileKey =
      ARCHIVE_SUBTYPE_TO_PROFILE_KEY[archiveSubtype] ?? 'archive.unknown_document_type';
    return getDocumentRequiredFieldProfile(profileKey)!;
  }

  const type = input.effectiveDocumentType ?? 'OTHER';
  const bySubtype = findProfileBySubtype(
    DOCUMENT_REQUIRED_FIELD_PROFILES,
    type,
    normalizedSubtype,
  );
  if (bySubtype) return bySubtype;

  return getDocumentRequiredFieldProfile('archive.unknown_document_type')!;
}

export function buildRequiredFieldEvaluationContext(
  input: Pick<DocumentActionPlannerInput, 'confirmedData' | 'entityLinks'>,
): RequiredFieldEvaluationContext {
  return {
    confirmedData: input.confirmedData,
    entityLinks: input.entityLinks,
  };
}

export function evaluateDocumentRequiredFields(
  input: Pick<
    DocumentActionPlannerInput,
    | 'effectiveDocumentType'
    | 'documentSubtype'
    | 'documentCategory'
    | 'confirmedData'
    | 'entityLinks'
  >,
): RequiredFieldProfileEvaluation {
  const profile = resolveDocumentRequiredFieldProfile(input);
  return evaluateRequiredFieldProfile(profile, buildRequiredFieldEvaluationContext(input));
}

export function buildRequiredFieldRegistrySnapshot(
  input: Pick<
    DocumentActionPlannerInput,
    | 'effectiveDocumentType'
    | 'documentSubtype'
    | 'documentCategory'
    | 'confirmedData'
    | 'entityLinks'
  >,
): Record<string, unknown> {
  const profile = resolveDocumentRequiredFieldProfile(input);
  const evaluation = evaluateRequiredFieldProfile(profile, buildRequiredFieldEvaluationContext(input));

  return {
    requiredFieldRegistryVersion: DOCUMENT_REQUIRED_FIELD_REGISTRY_VERSION,
    requiredFieldProfileKey: profile.profileKey,
    requiredFieldPlanningMode: profile.planningMode,
    requiredFieldDocumentMode: profile.documentMode ?? null,
    requiredFieldEvaluation: {
      missingForReview: [
        ...evaluation.byStage.review.missingFieldKeys,
        ...evaluation.byStage.review.missingConditionalRuleIds,
      ],
      missingForDraft: [
        ...evaluation.byStage.draft.missingFieldKeys,
        ...evaluation.byStage.draft.missingConditionalRuleIds,
      ],
      missingForApply: [
        ...evaluation.byStage.apply.missingFieldKeys,
        ...evaluation.byStage.apply.missingConditionalRuleIds,
      ],
      missingEntitiesForApply: evaluation.byStage.apply.missingEntityTypes,
      satisfiedFields: evaluation.byStage.apply.satisfiedFieldKeys,
    },
    allowedActionsFromRegistry: profile.allowedActions,
    blockingRulesFromRegistry: profile.blockingRules.map((rule) => rule.code),
  };
}

export function listMissingRegistryFieldKeysForStage(
  input: Pick<
    DocumentActionPlannerInput,
    | 'effectiveDocumentType'
    | 'documentSubtype'
    | 'documentCategory'
    | 'confirmedData'
    | 'entityLinks'
  >,
  stage: RequiredFieldStage,
): string[] {
  const evaluation = evaluateDocumentRequiredFields(input);
  const stageEval = evaluation.byStage[stage];
  return [...new Set(stageEval.missingFieldKeys)].sort();
}
