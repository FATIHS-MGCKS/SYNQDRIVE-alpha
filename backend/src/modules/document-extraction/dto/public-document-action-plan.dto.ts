import type {
  DocumentActionRequirement,
  DocumentActionType,
  DocumentApplyMode,
  DocumentEntityType,
  DocumentExtractionType,
} from '@prisma/client';
import type { DocumentFollowUpCandidateType } from '../document-action-planner.types';

export type DocumentActionPreviewStatus =
  | 'WOULD_CREATE'
  | 'WOULD_UPDATE'
  | 'WOULD_LINK'
  | 'WOULD_SUGGEST'
  | 'ARCHIVE_ONLY'
  | 'BLOCKED';

export class PublicDocumentActionPreviewDto {
  sequence!: number;
  actionType!: DocumentActionType | 'LINK_VEHICLE';
  previewStatus!: DocumentActionPreviewStatus;
  requirement!: DocumentActionRequirement;
  targetEntityType?: DocumentEntityType | null;
  targetEntityId?: string | null;
  preview!: Record<string, unknown>;
  blocked!: boolean;
}

export class PublicDocumentActionPlanBlockingReasonDto {
  code!: string;
  message!: string;
  source!: string;
}

export class PublicDocumentActionPlanMissingRequirementDto {
  code!: string;
  message!: string;
  fieldKeys?: string[];
  entityType?: string;
}

export class PublicDocumentActionPlanDto {
  planId!: string;
  extractionId!: string;
  organizationId!: string;
  planVersion!: number;
  inputFingerprint!: string;
  applyMode!: DocumentApplyMode;
  isBlocked!: boolean;
  deduplicated!: boolean;
  created!: boolean;
  supersededPlanId!: string | null;
  summary!: string;
  effectiveDocumentType!: DocumentExtractionType | null;
  blockingReasons!: PublicDocumentActionPlanBlockingReasonDto[];
  missingRequirements!: PublicDocumentActionPlanMissingRequirementDto[];
  followUpCandidateTypes!: DocumentFollowUpCandidateType[];
  actions!: PublicDocumentActionPreviewDto[];
  plausibilityOverallStatus!: string;
}
