export const DOCUMENT_ACTION_PREVIEW_STATUSES = {
  READY: 'READY',
  BLOCKED: 'BLOCKED',
  DISABLED: 'DISABLED',
  SUGGESTION: 'SUGGESTION',
  INFORMATIONAL: 'INFORMATIONAL',
} as const;

export type DocumentActionPreviewStatus =
  (typeof DOCUMENT_ACTION_PREVIEW_STATUSES)[keyof typeof DOCUMENT_ACTION_PREVIEW_STATUSES];

export type PublicDocumentActionPreviewFieldDto = {
  key: string;
  label: string;
  value: string;
};

export type PublicDocumentActionPreviewIssueDto = {
  code: string;
  message: string;
};

export type PublicDocumentActionPreviewCardDto = {
  semanticAction: string;
  labelKey: string;
  title: string;
  targetModule: string;
  targetModuleLabel: string;
  targetEntityType: string | null;
  targetEntityLabel: string | null;
  requirement: 'REQUIRED' | 'OPTIONAL' | 'INFORMATIONAL';
  status: DocumentActionPreviewStatus;
  sequence: number;
  writableFields: PublicDocumentActionPreviewFieldDto[];
  missingPrerequisites: PublicDocumentActionPreviewIssueDto[];
  conflicts: PublicDocumentActionPreviewIssueDto[];
  toggleable: boolean;
  enabled: boolean;
};

export type PublicDocumentActionPlanPreviewDto = {
  planId: string | null;
  fingerprint: string;
  planVersion: number;
  planOutcome: string;
  planStatus: 'PREVIEW' | 'INVALIDATED' | 'STALE';
  summary: string;
  blocked: boolean;
  canConfirm: boolean;
  confirmBlockedReason: string | null;
  disabledOptionalActions: string[];
  actions: PublicDocumentActionPreviewCardDto[];
};
