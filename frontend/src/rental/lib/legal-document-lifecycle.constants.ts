import type { TranslationKey } from '../i18n/translations/en';
import type { LegalDocumentLifecycleAction } from './legal-document-lifecycle.types';

export const LEGAL_LIFECYCLE_ACTION_CONFIG: Record<
  LegalDocumentLifecycleAction,
  {
    titleKey: TranslationKey;
    descriptionKey: TranslationKey;
    confirmLabelKey: TranslationKey;
    tone: 'default' | 'critical';
    requiresReason: boolean;
    requiresValidFrom?: boolean;
    reasonMinLength: number;
  }
> = {
  submit_review: {
    titleKey: 'legalDocuments.lifecycle.action.submit_review.title',
    descriptionKey: 'legalDocuments.lifecycle.action.submit_review.description',
    confirmLabelKey: 'legalDocuments.lifecycle.action.submit_review.confirm',
    tone: 'default',
    requiresReason: false,
    reasonMinLength: 0,
  },
  request_changes: {
    titleKey: 'legalDocuments.lifecycle.action.request_changes.title',
    descriptionKey: 'legalDocuments.lifecycle.action.request_changes.description',
    confirmLabelKey: 'legalDocuments.lifecycle.action.request_changes.confirm',
    tone: 'default',
    requiresReason: true,
    reasonMinLength: 10,
  },
  approve: {
    titleKey: 'legalDocuments.lifecycle.action.approve.title',
    descriptionKey: 'legalDocuments.lifecycle.action.approve.description',
    confirmLabelKey: 'legalDocuments.lifecycle.action.approve.confirm',
    tone: 'default',
    requiresReason: false,
    reasonMinLength: 0,
  },
  schedule_activation: {
    titleKey: 'legalDocuments.lifecycle.action.schedule_activation.title',
    descriptionKey: 'legalDocuments.lifecycle.action.schedule_activation.description',
    confirmLabelKey: 'legalDocuments.lifecycle.action.schedule_activation.confirm',
    tone: 'default',
    requiresReason: true,
    requiresValidFrom: true,
    reasonMinLength: 10,
  },
  activate_now: {
    titleKey: 'legalDocuments.lifecycle.action.activate_now.title',
    descriptionKey: 'legalDocuments.lifecycle.action.activate_now.description',
    confirmLabelKey: 'legalDocuments.lifecycle.action.activate_now.confirm',
    tone: 'default',
    requiresReason: true,
    reasonMinLength: 10,
  },
  replace_active: {
    titleKey: 'legalDocuments.lifecycle.action.replace_active.title',
    descriptionKey: 'legalDocuments.lifecycle.action.replace_active.description',
    confirmLabelKey: 'legalDocuments.lifecycle.action.replace_active.confirm',
    tone: 'default',
    requiresReason: true,
    reasonMinLength: 10,
  },
  revoke: {
    titleKey: 'legalDocuments.lifecycle.action.revoke.title',
    descriptionKey: 'legalDocuments.lifecycle.action.revoke.description',
    confirmLabelKey: 'legalDocuments.lifecycle.action.revoke.confirm',
    tone: 'critical',
    requiresReason: true,
    reasonMinLength: 10,
  },
  archive: {
    titleKey: 'legalDocuments.lifecycle.action.archive.title',
    descriptionKey: 'legalDocuments.lifecycle.action.archive.description',
    confirmLabelKey: 'legalDocuments.lifecycle.action.archive.confirm',
    tone: 'critical',
    requiresReason: false,
    reasonMinLength: 0,
  },
};

export const LEGAL_LIFECYCLE_CONFLICT_CODE_KEYS: Record<string, TranslationKey> = {
  LEGAL_DOCUMENT_ACTIVE_CONFLICT: 'legalDocuments.lifecycle.conflict.ACTIVE_CONFLICT',
  LEGAL_DOCUMENT_SCOPE_CONFLICT: 'legalDocuments.lifecycle.conflict.SCOPE_CONFLICT',
  LEGAL_DOCUMENT_FOUR_EYES_VIOLATION: 'legalDocuments.lifecycle.conflict.FOUR_EYES_VIOLATION',
  LEGAL_DOCUMENT_INVALID_STATUS_TRANSITION:
    'legalDocuments.lifecycle.conflict.INVALID_STATUS_TRANSITION',
  LEGAL_DOCUMENT_NOT_ACTIVATABLE: 'legalDocuments.lifecycle.conflict.NOT_ACTIVATABLE',
  LEGAL_DOCUMENT_SCAN_NOT_PASSED: 'legalDocuments.lifecycle.conflict.SCAN_NOT_PASSED',
};
