import { BadRequestException } from '@nestjs/common';
import type { DocumentEntityType } from '@prisma/client';

export const DOCUMENT_ENTITY_RESOLVER_VERSION = 'document-entity-resolver-v1';

export const DOCUMENT_ENTITY_LINK_SOURCES = {
  MANUAL_CONFIRMATION: 'MANUAL_CONFIRMATION',
  CANDIDATE_CONFIRMATION: 'CANDIDATE_CONFIRMATION',
  OPERATOR_OVERRIDE: 'OPERATOR_OVERRIDE',
} as const;

export type DocumentEntityLinkSource =
  (typeof DOCUMENT_ENTITY_LINK_SOURCES)[keyof typeof DOCUMENT_ENTITY_LINK_SOURCES];

/** Context-only entity types — never auto-confirmed into links. */
export const CONTEXT_DOCUMENT_ENTITY_TYPES = new Set<DocumentEntityType>(['ORGANIZATION']);

export type DocumentEntityMatchReason = {
  code: string;
  detail?: string;
};

export type DocumentEntityConflict = {
  code: string;
  detail?: string;
  severity?: 'warning' | 'blocker';
};

export type ProposedDocumentEntityCandidateInput = {
  entityType: DocumentEntityType;
  entityId?: string | null;
  confidence?: number | null;
  matchReasons?: DocumentEntityMatchReason[];
  conflicts?: DocumentEntityConflict[];
};

export type ReplaceDocumentEntityCandidatesInput = {
  organizationId: string;
  extractionId: string;
  resolverVersion?: string;
  candidates: ProposedDocumentEntityCandidateInput[];
};

export type ConfirmDocumentEntityCandidateInput = {
  organizationId: string;
  extractionId: string;
  candidateId: string;
  confirmedByUserId: string;
  source?: DocumentEntityLinkSource;
};

export type SupersedeDocumentEntityLinkInput = {
  organizationId: string;
  linkId: string;
  supersededAt?: Date;
};

export function isContextDocumentEntityType(entityType: DocumentEntityType): boolean {
  return CONTEXT_DOCUMENT_ENTITY_TYPES.has(entityType);
}

export function assertEntityTypeAllowsConfirmation(
  entityType: DocumentEntityType,
  source: DocumentEntityLinkSource,
): void {
  if (
    isContextDocumentEntityType(entityType) &&
    source !== DOCUMENT_ENTITY_LINK_SOURCES.MANUAL_CONFIRMATION &&
    source !== DOCUMENT_ENTITY_LINK_SOURCES.OPERATOR_OVERRIDE
  ) {
    throw new BadRequestException(
      `Context entity type ${entityType} requires explicit manual confirmation`,
    );
  }
}

export function isDistinctPersonEntityType(entityType: DocumentEntityType): boolean {
  return entityType === 'CUSTOMER' || entityType === 'DRIVER';
}
