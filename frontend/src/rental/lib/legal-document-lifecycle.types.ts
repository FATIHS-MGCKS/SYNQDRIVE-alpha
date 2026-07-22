import type { LegalDocumentDto, LegalDocumentEventDto } from '../../lib/api';

export type LegalDocumentLifecycleAction =
  | 'submit_review'
  | 'request_changes'
  | 'approve'
  | 'schedule_activation'
  | 'activate_now'
  | 'replace_active'
  | 'revoke'
  | 'archive';

export interface LegalDocumentLifecycleDialogState {
  action: LegalDocumentLifecycleAction;
  document: LegalDocumentDto;
  activePeer: LegalDocumentDto | null;
}

export interface LegalDocumentLifecycleFormState {
  changeSummary: string;
  statusReason: string;
  validFrom: string;
}

export const EMPTY_LIFECYCLE_FORM: LegalDocumentLifecycleFormState = {
  changeSummary: '',
  statusReason: '',
  validFrom: '',
};

export interface LegalDocumentLifecyclePermissions {
  canWrite: boolean;
  canManage: boolean;
}

export interface LegalDocumentWorkflowSettings {
  fourEyesEnabled: boolean;
}

export interface LegalDocumentLifecycleSuccess {
  document: LegalDocumentDto;
  latestEvent: LegalDocumentEventDto | null;
  action: LegalDocumentLifecycleAction;
}
