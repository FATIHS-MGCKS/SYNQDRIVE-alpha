import type { LegalDocumentDto } from '../../lib/api';
import {
  LEGAL_UPLOAD_BOOKING_CHANNELS,
  LEGAL_UPLOAD_CUSTOMER_SEGMENTS,
  LEGAL_UPLOAD_JURISDICTIONS,
  LEGAL_UPLOAD_LANGUAGES,
} from './legal-document-upload-wizard.constants';
import { LEGAL_DOCUMENT_TYPE_CONFIGS } from './legal-document-types';
import type {
  LegalDocumentLifecycleAction,
  LegalDocumentLifecycleFormState,
  LegalDocumentLifecyclePermissions,
  LegalDocumentWorkflowSettings,
} from './legal-document-lifecycle.types';
import { LEGAL_LIFECYCLE_ACTION_CONFIG } from './legal-document-lifecycle.constants';
import {
  formatLegalDocumentTypeTitle,
  formatLifecycleEventLabelI18n,
  formatOptionLabel,
  lifecycleActionLabelKey,
  type LegalDocumentsTranslate,
} from './legal-documents-i18n';

export interface LifecycleActionAvailability {
  action: LegalDocumentLifecycleAction;
  label: string;
  disabled: boolean;
  disabledReason?: string;
}

export function formatLegalDocumentTypeLabel(
  document: LegalDocumentDto,
  t: LegalDocumentsTranslate,
): string {
  return formatLegalDocumentTypeTitle(document.documentType, t) || document.title || document.documentType;
}

export function findActivePeer(
  document: LegalDocumentDto,
  allDocs: LegalDocumentDto[],
): LegalDocumentDto | null {
  return (
    allDocs.find(
      (d) =>
        d.id !== document.id &&
        d.documentType === document.documentType &&
        d.language === document.language &&
        d.status === 'ACTIVE',
    ) ?? null
  );
}

export function isScanBlocking(document: LegalDocumentDto): boolean {
  const status = document.scanStatus ?? '';
  return status !== '' && status !== 'SCAN_PASSED';
}

export function violatesFourEyes(
  document: LegalDocumentDto,
  currentUserId: string | null | undefined,
  settings: LegalDocumentWorkflowSettings,
  operation: 'approve' | 'activate',
): boolean {
  if (!settings.fourEyesEnabled || !currentUserId) return false;
  if (document.uploadedBy?.id === currentUserId) return true;
  if (operation === 'approve' && document.submittedForReviewBy?.id === currentUserId) {
    return true;
  }
  return false;
}

export function getLifecycleActionsForDocument(
  document: LegalDocumentDto,
  allDocs: LegalDocumentDto[],
  permissions: LegalDocumentLifecyclePermissions,
  settings: LegalDocumentWorkflowSettings,
  currentUserId: string | null | undefined,
  t: LegalDocumentsTranslate,
): LifecycleActionAvailability[] {
  const actions: LifecycleActionAvailability[] = [];
  const activePeer = findActivePeer(document, allDocs);
  const scanBlocked = isScanBlocking(document);

  const push = (
    action: LegalDocumentLifecycleAction,
    allowed: boolean,
    disabledReason?: string,
  ) => {
    if (!allowed) return;
    actions.push({
      action,
      label: t(lifecycleActionLabelKey(action)),
      disabled: Boolean(disabledReason),
      disabledReason,
    });
  };

  if (document.status === 'DRAFT') {
    push(
      'submit_review',
      permissions.canWrite,
      scanBlocked ? t('legalDocuments.lifecycle.disabled.scanFailed') : undefined,
    );
    push('archive', permissions.canWrite);
  }

  if (document.status === 'IN_REVIEW') {
    push(
      'approve',
      permissions.canManage,
      violatesFourEyes(document, currentUserId, settings, 'approve')
        ? t('legalDocuments.lifecycle.disabled.fourEyesReview')
        : undefined,
    );
    push('request_changes', permissions.canManage);
    push('archive', permissions.canWrite);
  }

  if (document.status === 'APPROVED' || document.status === 'SCHEDULED') {
    const activateDisabled = violatesFourEyes(document, currentUserId, settings, 'activate')
      ? t('legalDocuments.lifecycle.disabled.fourEyesUpload')
      : scanBlocked
        ? t('legalDocuments.lifecycle.disabled.scanFailed')
        : undefined;

    if (document.status === 'APPROVED') {
      push('schedule_activation', permissions.canWrite, activateDisabled);
    }

    if (activePeer) {
      push('replace_active', permissions.canManage, activateDisabled);
    } else {
      push('activate_now', permissions.canManage, activateDisabled);
    }

    push('archive', permissions.canWrite);
  }

  if (document.status === 'ACTIVE') {
    push('revoke', permissions.canManage);
  }

  if (document.status === 'SUPERSEDED' || document.status === 'REVOKED') {
    push('archive', permissions.canWrite);
  }

  return actions;
}

export function validateLifecycleForm(
  action: LegalDocumentLifecycleAction,
  form: LegalDocumentLifecycleFormState,
  t: LegalDocumentsTranslate,
): Partial<Record<keyof LegalDocumentLifecycleFormState, string>> {
  const config = LEGAL_LIFECYCLE_ACTION_CONFIG[action];
  const errors: Partial<Record<keyof LegalDocumentLifecycleFormState, string>> = {};

  if (config.requiresReason) {
    const reason = form.statusReason.trim();
    if (!reason) {
      errors.statusReason = t('legalDocuments.validation.reasonRequired');
    } else if (reason.length < config.reasonMinLength) {
      errors.statusReason = t('legalDocuments.validation.reasonMinLength', {
        min: config.reasonMinLength,
      });
    }
  }

  if (config.requiresValidFrom) {
    if (!form.validFrom.trim()) {
      errors.validFrom = t('legalDocuments.validation.validFromRequired');
    } else {
      const date = new Date(form.validFrom);
      if (Number.isNaN(date.getTime())) {
        errors.validFrom = t('legalDocuments.validation.validFromInvalid');
      } else if (date.getTime() <= Date.now()) {
        errors.validFrom = t('legalDocuments.validation.validFromFuture');
      }
    }
  }

  return errors;
}

function labelForScope(
  value: string | undefined | null,
  options: readonly { value: string; labelKey: import('../i18n/translations/en').TranslationKey }[],
  t: LegalDocumentsTranslate,
) {
  if (!value) return t('legalDocuments.common.emDash');
  const match = options.find((o) => o.value === value);
  return match ? t(match.labelKey) : value;
}

export function buildLifecycleImpactRows(
  document: LegalDocumentDto,
  activePeer: LegalDocumentDto | null,
  action: LegalDocumentLifecycleAction,
  t: LegalDocumentsTranslate,
) {
  const rows: { label: string; value: string }[] = [
    { label: t('legalDocuments.lifecycle.impact.newVersion'), value: `v${document.versionLabel}` },
    {
      label: t('legalDocuments.lifecycle.impact.previousActive'),
      value: activePeer
        ? `v${activePeer.versionLabel}`
        : t('legalDocuments.lifecycle.impact.noActive'),
    },
    {
      label: t('legalDocuments.lifecycle.impact.validFrom'),
      value:
        action === 'schedule_activation'
          ? t('legalDocuments.lifecycle.impact.validFromOnSchedule')
          : document.validFrom
            ? new Date(document.validFrom).toLocaleString()
            : t('legalDocuments.lifecycle.impact.validFromOnActivate'),
    },
    {
      label: t('legalDocuments.lifecycle.impact.language'),
      value: labelForScope(document.language, LEGAL_UPLOAD_LANGUAGES, t),
    },
    {
      label: t('legalDocuments.lifecycle.impact.jurisdiction'),
      value: labelForScope(document.jurisdiction, LEGAL_UPLOAD_JURISDICTIONS, t),
    },
    {
      label: t('legalDocuments.lifecycle.impact.channel'),
      value: labelForScope(document.channelScope, LEGAL_UPLOAD_BOOKING_CHANNELS, t),
    },
    {
      label: t('legalDocuments.lifecycle.impact.customerSegment'),
      value: labelForScope(document.customerSegment, LEGAL_UPLOAD_CUSTOMER_SEGMENTS, t),
    },
    {
      label: t('legalDocuments.lifecycle.impact.existingBookings'),
      value: t('legalDocuments.lifecycle.impact.existingBookingsValue'),
    },
    {
      label: t('legalDocuments.lifecycle.impact.newBookings'),
      value:
        action === 'revoke'
          ? t('legalDocuments.lifecycle.impact.newBookings.revoke')
          : action === 'archive'
            ? t('legalDocuments.lifecycle.impact.newBookings.archive')
            : action === 'request_changes' || action === 'submit_review' || action === 'approve'
              ? t('legalDocuments.lifecycle.impact.newBookings.pending')
              : t('legalDocuments.lifecycle.impact.newBookings.afterActivation'),
    },
  ];

  return rows;
}

export function resolveActivateAction(
  document: LegalDocumentDto,
  allDocs: LegalDocumentDto[],
): 'activate_now' | 'replace_active' {
  return findActivePeer(document, allDocs) ? 'replace_active' : 'activate_now';
}

export function formatLifecycleEventLabel(eventType: string, t?: LegalDocumentsTranslate): string {
  if (t) return formatLifecycleEventLabelI18n(eventType, t);
  return eventType;
}

export function resolveTypeConfigTitle(documentType: string, t: LegalDocumentsTranslate): string {
  const config = LEGAL_DOCUMENT_TYPE_CONFIGS.find((c) => c.key === documentType);
  return config ? t(config.titleKey) : documentType;
}
