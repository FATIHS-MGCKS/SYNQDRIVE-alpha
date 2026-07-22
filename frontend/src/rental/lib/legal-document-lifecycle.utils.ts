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

export interface LifecycleActionAvailability {
  action: LegalDocumentLifecycleAction;
  label: string;
  disabled: boolean;
  disabledReason?: string;
}

function labelForScope(value: string | undefined | null, options: readonly { value: string; label: string }[]) {
  if (!value) return '—';
  return options.find((o) => o.value === value)?.label ?? value;
}

export function formatLegalDocumentTypeLabel(document: LegalDocumentDto): string {
  const config = LEGAL_DOCUMENT_TYPE_CONFIGS.find((c) => c.key === document.documentType);
  return config?.title ?? document.title ?? document.documentType;
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
): LifecycleActionAvailability[] {
  const actions: LifecycleActionAvailability[] = [];
  const activePeer = findActivePeer(document, allDocs);
  const scanBlocked = isScanBlocking(document);

  const push = (
    action: LegalDocumentLifecycleAction,
    label: string,
    allowed: boolean,
    disabledReason?: string,
  ) => {
    if (!allowed) return;
    actions.push({ action, label, disabled: Boolean(disabledReason), disabledReason });
  };

  if (document.status === 'DRAFT') {
    push(
      'submit_review',
      'Review anfordern',
      permissions.canWrite,
      scanBlocked ? 'Malware-Scan nicht bestanden' : undefined,
    );
    push('archive', 'Archivieren', permissions.canWrite);
  }

  if (document.status === 'IN_REVIEW') {
    push(
      'approve',
      'Freigeben',
      permissions.canManage,
      violatesFourEyes(document, currentUserId, settings, 'approve')
        ? 'Vier-Augen: Sie haben diese Version eingereicht oder hochgeladen'
        : undefined,
    );
    push('request_changes', 'Änderungen anfordern', permissions.canManage);
    push('archive', 'Archivieren', permissions.canWrite);
  }

  if (document.status === 'APPROVED' || document.status === 'SCHEDULED') {
    const activateDisabled = violatesFourEyes(document, currentUserId, settings, 'activate')
      ? 'Vier-Augen: Sie haben diese Version hochgeladen'
      : scanBlocked
        ? 'Malware-Scan nicht bestanden'
        : undefined;

    if (document.status === 'APPROVED') {
      push('schedule_activation', 'Aktivierung planen', permissions.canWrite, activateDisabled);
    }

    if (activePeer) {
      push(
        'replace_active',
        'Aktive Version ersetzen',
        permissions.canManage,
        activateDisabled,
      );
    } else {
      push('activate_now', 'Sofort aktivieren', permissions.canManage, activateDisabled);
    }

    push('archive', 'Archivieren', permissions.canWrite);
  }

  if (document.status === 'ACTIVE') {
    push('revoke', 'Widerrufen', permissions.canManage);
  }

  if (document.status === 'SUPERSEDED' || document.status === 'REVOKED') {
    push('archive', 'Archivieren', permissions.canWrite);
  }

  return actions;
}

export function validateLifecycleForm(
  action: LegalDocumentLifecycleAction,
  form: LegalDocumentLifecycleFormState,
): Partial<Record<keyof LegalDocumentLifecycleFormState, string>> {
  const config = LEGAL_LIFECYCLE_ACTION_CONFIG[action];
  const errors: Partial<Record<keyof LegalDocumentLifecycleFormState, string>> = {};

  if (config.requiresReason) {
    const reason = form.statusReason.trim();
    if (!reason) {
      errors.statusReason = 'Begründung ist erforderlich.';
    } else if (reason.length < config.reasonMinLength) {
      errors.statusReason = `Mindestens ${config.reasonMinLength} Zeichen erforderlich.`;
    }
  }

  if (config.requiresValidFrom) {
    if (!form.validFrom.trim()) {
      errors.validFrom = 'Gültigkeitsbeginn ist erforderlich.';
    } else {
      const date = new Date(form.validFrom);
      if (Number.isNaN(date.getTime())) {
        errors.validFrom = 'Ungültiges Datum.';
      } else if (date.getTime() <= Date.now()) {
        errors.validFrom = 'Der Gültigkeitsbeginn muss in der Zukunft liegen.';
      }
    }
  }

  return errors;
}

export function buildLifecycleImpactRows(
  document: LegalDocumentDto,
  activePeer: LegalDocumentDto | null,
  action: LegalDocumentLifecycleAction,
) {
  const rows: { label: string; value: string }[] = [
    { label: 'Neue Version', value: `v${document.versionLabel}` },
    {
      label: 'Bisher aktive Version',
      value: activePeer ? `v${activePeer.versionLabel}` : 'Keine aktive Version',
    },
    {
      label: 'Gültigkeitsbeginn',
      value:
        action === 'schedule_activation'
          ? '(wird beim Planen festgelegt)'
          : document.validFrom
            ? new Date(document.validFrom).toLocaleString('de-DE')
            : 'Bei Aktivierung sofort',
    },
    {
      label: 'Sprache',
      value: labelForScope(document.language, LEGAL_UPLOAD_LANGUAGES),
    },
    {
      label: 'Jurisdiktion',
      value: labelForScope(document.jurisdiction, LEGAL_UPLOAD_JURISDICTIONS),
    },
    {
      label: 'Kanal',
      value: labelForScope(document.channelScope, LEGAL_UPLOAD_BOOKING_CHANNELS),
    },
    {
      label: 'Kundensegment',
      value: labelForScope(document.customerSegment, LEGAL_UPLOAD_CUSTOMER_SEGMENTS),
    },
    {
      label: 'Bestehende Buchungen',
      value: 'Bleiben unverändert (gebundene Snapshots)',
    },
    {
      label: 'Neue Buchungen',
      value:
        action === 'revoke'
          ? 'Erhalten diese Version nicht mehr — Widerruf wirkt vorwärts'
          : action === 'archive'
            ? 'Unverändert — Archivierung betrifft nur den Workflow'
            : action === 'request_changes' || action === 'submit_review' || action === 'approve'
              ? 'Noch keine Änderung — erst nach Aktivierung'
              : 'Verwenden die neue Version nach Aktivierung',
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

export function formatLifecycleEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    SUBMITTED_FOR_REVIEW: 'Review angefordert',
    APPROVED: 'Freigegeben',
    SCHEDULED: 'Aktivierung geplant',
    ACTIVATED: 'Aktiviert',
    SUPERSEDED: 'Ersetzt',
    REVOKED: 'Widerrufen',
    ARCHIVED: 'Archiviert',
    RETURNED_TO_DRAFT: 'Änderungen angefordert',
  };
  return labels[eventType] ?? eventType;
}
