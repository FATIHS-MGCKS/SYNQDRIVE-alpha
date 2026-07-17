import type {
  DocumentActionRequirement,
  DocumentActionStatus,
  DocumentActionType,
  DocumentEntityType,
} from '@prisma/client';

export type DocumentActionPayload = Record<string, unknown>;

export type PlannedDocumentActionInput = {
  actionType: DocumentActionType;
  requirement?: DocumentActionRequirement;
  targetEntityType?: DocumentEntityType | null;
  targetEntityId?: string | null;
  inputPayload: DocumentActionPayload;
  previewPayload?: DocumentActionPayload | null;
  sequence?: number;
};

export type CreatePlannedDocumentActionsInput = {
  organizationId: string;
  extractionId: string;
  actionPlanId: string;
  actions: PlannedDocumentActionInput[];
};

export type CreatePlannedDocumentActionsResult = {
  created: Array<{
    id: string;
    idempotencyKey: string;
    actionType: DocumentActionType;
    requirement: DocumentActionRequirement;
    status: DocumentActionStatus;
    sequence: number;
  }>;
  deduplicatedKeys: string[];
};

export type DocumentActionIdempotencyIdentity = {
  organizationId: string;
  extractionId: string;
  actionPlanId: string;
  actionType: DocumentActionType;
  sequence: number;
  targetEntityType?: DocumentEntityType | string | null;
  targetEntityId?: string | null;
};
