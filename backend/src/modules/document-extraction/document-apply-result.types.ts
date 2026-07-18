export type PublicDocumentApplyActionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'SKIPPED';

export type PublicDocumentApplyEntityLinkDto = {
  entityType: string;
  entityId: string;
  label: string;
  targetModule: string;
  targetModuleLabel: string;
};

export type PublicDocumentApplyActionResultDto = {
  actionIndex: number;
  semanticAction: string;
  labelKey: string;
  title: string;
  requirement: 'REQUIRED' | 'OPTIONAL' | 'INFORMATIONAL';
  status: PublicDocumentApplyActionStatus;
  targetModule: string;
  targetModuleLabel: string;
  resultEntityType: string | null;
  resultEntityId: string | null;
  entityLink: PublicDocumentApplyEntityLinkDto | null;
  errorCode: string | null;
  errorMessage: string | null;
  skippedReason: string | null;
};

export type PublicDocumentApplyResultDto = {
  lifecycleStatus: string;
  extractionStatus: string;
  summary: string;
  detailSummary: string | null;
  isTerminal: boolean;
  applyingInProgress: boolean;
  nonCancellable: boolean;
  requiredActionsComplete: boolean;
  canRetryFailedActions: boolean;
  partiallyApplied: boolean;
  applyFailed: boolean;
  fingerprint: string | null;
  actions: PublicDocumentApplyActionResultDto[];
};
