import type { DocumentApplyMode, DocumentExtractionType } from '@prisma/client';

/** Confirmed entity link snapshot included in plan input fingerprint. */
export type DocumentActionPlanEntityLinkSnapshot = {
  role: string;
  entityType: string;
  entityId: string;
};

/** Stable identity for deterministic plan input fingerprinting. */
export type DocumentActionPlanInputIdentity = {
  organizationId: string;
  extractionId: string;
  effectiveDocumentType: DocumentExtractionType | string;
  confirmedData: Record<string, unknown>;
  entityLinks?: DocumentActionPlanEntityLinkSnapshot[];
  applyMode: DocumentApplyMode;
  applySafetyDecision?: Record<string, unknown>;
  schemaVersion?: number;
};

export const DOCUMENT_ACTION_PLAN_FINGERPRINT_SCHEMA_VERSION = 1;

export const DOCUMENT_ACTION_PLAN_INVALIDATION_REASONS = {
  INPUT_FINGERPRINT_CHANGED: 'INPUT_FINGERPRINT_CHANGED',
  ENTITY_ASSIGNMENT_CHANGED: 'ENTITY_ASSIGNMENT_CHANGED',
  CONFIRMED_DATA_CHANGED: 'CONFIRMED_DATA_CHANGED',
  MANUAL_INVALIDATION: 'MANUAL_INVALIDATION',
} as const;

export type DocumentActionPlanInvalidationReason =
  (typeof DOCUMENT_ACTION_PLAN_INVALIDATION_REASONS)[keyof typeof DOCUMENT_ACTION_PLAN_INVALIDATION_REASONS];

export type CreateDocumentActionPlanInput = {
  organizationId: string;
  extractionId: string;
  identity: Omit<DocumentActionPlanInputIdentity, 'organizationId' | 'extractionId'>;
  snapshot: Record<string, unknown>;
  summary?: string | null;
  blockingReasons?: unknown[] | null;
  generatedBy?: string | null;
  applyMode?: DocumentApplyMode;
  generatedAt?: Date;
};

export type ResolveDocumentActionPlanResult = {
  plan: {
    id: string;
    organizationId: string;
    extractionId: string;
    planVersion: number;
    inputFingerprint: string;
    status: string;
    applyMode: DocumentApplyMode;
    supersedesPlanId: string | null;
    invalidatedAt: Date | null;
  };
  created: boolean;
  deduplicated: boolean;
  supersededPlanId: string | null;
};

export type DocumentActionPlanVersionRow = {
  id: string;
  planVersion: number;
  inputFingerprint: string;
  invalidatedAt: Date | null;
  status: string;
};
