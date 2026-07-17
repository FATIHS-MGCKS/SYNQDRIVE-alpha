import {
  assessArchiveApplyGate,
  ARCHIVE_DOCUMENT_TYPES,
  ARCHIVE_SUBTYPES,
  buildDeadlineSuggestions,
  buildEntityLinkSuggestions,
  isArchiveDocumentType,
  resolveArchiveSubtype,
  type ArchiveDocumentType,
  type ArchiveSubtype,
} from './document-archive-extraction.rules';

export {
  ARCHIVE_DOCUMENT_TYPES,
  ARCHIVE_SUBTYPES,
  type ArchiveDocumentType,
  type ArchiveSubtype,
} from './document-archive-extraction.rules';

export const ARCHIVE_SEMANTIC_ACTIONS = {
  ARCHIVE_DOCUMENT: 'ARCHIVE_DOCUMENT',
  SUGGEST_ENTITY_LINK: 'SUGGEST_ENTITY_LINK',
  SUGGEST_DEADLINE_REMINDER: 'SUGGEST_DEADLINE_REMINDER',
  NO_AUTOMATIC_OUTREACH: 'NO_AUTOMATIC_OUTREACH',
} as const;

export type ArchiveSemanticAction =
  (typeof ARCHIVE_SEMANTIC_ACTIONS)[keyof typeof ARCHIVE_SEMANTIC_ACTIONS];

export const ARCHIVE_PLAN_OUTCOMES = {
  ARCHIVE_ONLY: 'ARCHIVE_ONLY',
  BLOCKED: 'BLOCKED',
} as const;

export type ArchivePlanOutcome =
  (typeof ARCHIVE_PLAN_OUTCOMES)[keyof typeof ARCHIVE_PLAN_OUTCOMES];

export type ArchivePlannerInput = {
  effectiveDocumentType: string;
  confirmedData: Record<string, unknown>;
};

export type ArchivePlannedAction = {
  semanticAction: ArchiveSemanticAction;
  requirement: 'REQUIRED' | 'OPTIONAL' | 'INFORMATIONAL';
};

export type ArchivePlanAssessment = {
  documentType: ArchiveDocumentType;
  archiveSubtype: ArchiveSubtype;
  planOutcome: ArchivePlanOutcome;
  actions: ArchivePlannedAction[];
  entityLinkSuggestions: ReturnType<typeof buildEntityLinkSuggestions>;
  deadlineSuggestions: ReturnType<typeof buildDeadlineSuggestions>;
  missingRequirements: Array<{ code: string; message: string; fieldKeys?: string[] }>;
};

const OUTREACH_ACTIONS = new Set<string>([
  'CONTACT_SENDER',
  'CONTACT_RECIPIENT',
  'SEND_EMAIL',
  'SEND_SMS',
  'CALL_CUSTOMER',
]);

export function isArchiveDocumentProfile(input: ArchivePlannerInput): boolean {
  return isArchiveDocumentType(input.effectiveDocumentType);
}

export function assessArchivePlan(input: ArchivePlannerInput): ArchivePlanAssessment {
  const documentType = input.effectiveDocumentType as ArchiveDocumentType;
  const archiveSubtype = resolveArchiveSubtype(input.confirmedData);
  const gate = assessArchiveApplyGate({
    documentType,
    fields: input.confirmedData,
  });

  const actions: ArchivePlannedAction[] = [];
  const missingRequirements: ArchivePlanAssessment['missingRequirements'] = [];

  if (gate.canArchive) {
    actions.push({
      semanticAction: ARCHIVE_SEMANTIC_ACTIONS.ARCHIVE_DOCUMENT,
      requirement: 'REQUIRED',
    });
  } else {
    missingRequirements.push(
      ...gate.blockers.map((blocker) => ({
        code: blocker.code,
        message: blocker.message,
        fieldKeys: blocker.fieldKeys,
      })),
    );
  }

  if (gate.entityLinkSuggestions.length > 0) {
    actions.push({
      semanticAction: ARCHIVE_SEMANTIC_ACTIONS.SUGGEST_ENTITY_LINK,
      requirement: 'OPTIONAL',
    });
  }

  if (gate.deadlineSuggestions.length > 0) {
    actions.push({
      semanticAction: ARCHIVE_SEMANTIC_ACTIONS.SUGGEST_DEADLINE_REMINDER,
      requirement: 'OPTIONAL',
    });
  }

  actions.push({
    semanticAction: ARCHIVE_SEMANTIC_ACTIONS.NO_AUTOMATIC_OUTREACH,
    requirement: 'INFORMATIONAL',
  });

  const planOutcome = gate.canArchive
    ? ARCHIVE_PLAN_OUTCOMES.ARCHIVE_ONLY
    : ARCHIVE_PLAN_OUTCOMES.BLOCKED;

  return {
    documentType,
    archiveSubtype,
    planOutcome,
    actions: actions.filter((action) => !OUTREACH_ACTIONS.has(action.semanticAction)),
    entityLinkSuggestions: gate.entityLinkSuggestions,
    deadlineSuggestions: gate.deadlineSuggestions,
    missingRequirements,
  };
}

export function buildArchivePlannerSummary(assessment: ArchivePlanAssessment): string {
  if (assessment.planOutcome === ARCHIVE_PLAN_OUTCOMES.BLOCKED) {
    return 'Archive plan blocked — minimal metadata missing.';
  }
  return `Archive-only plan for ${assessment.archiveSubtype}: archive and optional entity/deadline suggestions; no domain apply or outreach.`;
}

export function isArchiveSubtypeSupported(subtype: string): subtype is ArchiveSubtype {
  return (ARCHIVE_SUBTYPES as readonly string[]).includes(subtype);
}
