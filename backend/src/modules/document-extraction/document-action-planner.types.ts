import type {
  DocumentActionType,
  DocumentApplyMode,
  DocumentCategory,
  DocumentEntityType,
  DocumentExtractionType,
} from '@prisma/client';
import type { DocumentActionPlanEntityLinkSnapshot } from './document-action-plan.types';
import type { PlannedDocumentActionInput } from './document-action.types';
import type { PlausibilityResult } from './document-extraction-plausibility.service';

export const DOCUMENT_FOLLOW_UP_CANDIDATE_TYPES = [
  'CREATE_TASK',
  'REQUEST_CUSTOMER_INFO',
  'SCHEDULE_INSPECTION',
  'NOTIFY_DRIVER',
  'LINK_TO_BOOKING',
  'MANUAL_REVIEW',
] as const;

export type DocumentFollowUpCandidateType =
  (typeof DOCUMENT_FOLLOW_UP_CANDIDATE_TYPES)[number];

export const DOCUMENT_ACTION_PLANNER_VERSION = 'document-action-planner-v3';

export type DocumentActionPlannerFeatureFlags = {
  /** Gate for V2 intake surfaces (preview, entity links, maturity). */
  documentIntakeV2: boolean;
  /** Allow action-preview / dry-run planning output. */
  actionPreviewEnabled: boolean;
  /** Future auto-apply path — planner still emits actions but may add safety blockers. */
  autoApplyEnabled: boolean;
  /** When blocked, suggest archive-only fallback in the plan. */
  archiveOnlyFallback: boolean;
};

export type DocumentDownstreamCapabilities = {
  serviceEvents: boolean;
  vehicleInspections: boolean;
  invoices: boolean;
  fines: boolean;
  damages: boolean;
  tireMeasurements: boolean;
  brakeEvidence: boolean;
  batteryEvidence: boolean;
  tasks: boolean;
};

export type DocumentEntityCandidateSnapshot = {
  entityType: DocumentEntityType | string;
  entityId?: string | null;
  confidence?: number | null;
  status?: string | null;
  matchReasonCodes?: string[];
};

export type DocumentActionBlockingReason = {
  code: string;
  message: string;
  source: 'PLAUSIBILITY' | 'REQUIREMENT' | 'ENTITY' | 'CAPABILITY' | 'FEATURE_FLAG' | 'ROUTING';
  severity: 'BLOCKER';
};

export type DocumentActionMissingRequirement = {
  code: string;
  message: string;
  fieldKeys?: string[];
  entityType?: DocumentEntityType | string;
};

export type DocumentActionPlannerInput = {
  organizationId: string;
  extractionId: string;
  documentCategory: DocumentCategory | null;
  documentSubtype: string | null;
  /** Legacy routing key — preferred when present for per-type action templates. */
  effectiveDocumentType: DocumentExtractionType | null;
  confirmedData: Record<string, unknown>;
  plausibility: PlausibilityResult;
  entityLinks: DocumentActionPlanEntityLinkSnapshot[];
  entityCandidates: DocumentEntityCandidateSnapshot[];
  featureFlags: DocumentActionPlannerFeatureFlags;
  downstreamCapabilities: DocumentDownstreamCapabilities;
  plannerVersion?: string;
  applyMode: DocumentApplyMode;
  applySafetyDecision?: Record<string, unknown>;
};

export type DocumentActionPlanDraft = {
  plannerVersion: string;
  documentCategory: DocumentCategory | null;
  documentSubtype: string | null;
  effectiveDocumentType: DocumentExtractionType | null;
  inputFingerprint: string;
  applyMode: DocumentApplyMode;
  isBlocked: boolean;
  summary: string;
  /** Serializable snapshot for DocumentActionPlanRepository.persist. */
  snapshot: Record<string, unknown>;
};

export type DocumentActionPlannerResult = {
  planDraft: DocumentActionPlanDraft;
  actions: PlannedDocumentActionInput[];
  blockingReasons: DocumentActionBlockingReason[];
  missingRequirements: DocumentActionMissingRequirement[];
  followUpCandidateTypes: DocumentFollowUpCandidateType[];
};

export type DocumentActionPlannerActionTemplate = {
  actionType: DocumentActionType;
  requirement: PlannedDocumentActionInput['requirement'];
  capabilityKey: keyof DocumentDownstreamCapabilities;
  targetEntityType?: DocumentEntityType | null;
  buildPayload: (ctx: DocumentActionPlannerBuildContext) => Record<string, unknown>;
  buildPreview?: (ctx: DocumentActionPlannerBuildContext) => Record<string, unknown>;
};

export type DocumentActionPlannerBuildContext = {
  input: DocumentActionPlannerInput;
  vehicleEntityId: string | null;
  routingType: DocumentExtractionType | null;
};
