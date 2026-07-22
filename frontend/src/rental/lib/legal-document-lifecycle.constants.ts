import type { LegalDocumentLifecycleAction } from './legal-document-lifecycle.types';

export const LEGAL_LIFECYCLE_ACTION_CONFIG: Record<
  LegalDocumentLifecycleAction,
  {
    title: string;
    description: string;
    confirmLabel: string;
    tone: 'default' | 'critical';
    requiresReason: boolean;
    requiresValidFrom?: boolean;
    reasonMinLength: number;
  }
> = {
  submit_review: {
    title: 'Review anfordern',
    description: 'Die Version wird zur fachlichen Prüfung eingereicht. Sie wird erst nach Freigabe und Aktivierung für neue Buchungen verbindlich.',
    confirmLabel: 'Review anfordern',
    tone: 'default',
    requiresReason: false,
    reasonMinLength: 0,
  },
  request_changes: {
    title: 'Änderungen anfordern',
    description: 'Die Version geht zurück in den Entwurfsstatus. Der Uploader kann Inhalte anpassen und erneut einreichen.',
    confirmLabel: 'Zurück an Entwurf',
    tone: 'default',
    requiresReason: true,
    reasonMinLength: 10,
  },
  approve: {
    title: 'Version freigeben',
    description: 'Nach der Freigabe kann die Version sofort oder zu einem geplanten Zeitpunkt aktiviert werden.',
    confirmLabel: 'Freigeben',
    tone: 'default',
    requiresReason: false,
    reasonMinLength: 0,
  },
  schedule_activation: {
    title: 'Aktivierung planen',
    description: 'Die Version wird für den gewählten Gültigkeitsbeginn geplant. Bis dahin bleibt die bisher aktive Version für neue Buchungen maßgeblich.',
    confirmLabel: 'Aktivierung planen',
    tone: 'default',
    requiresReason: true,
    requiresValidFrom: true,
    reasonMinLength: 10,
  },
  activate_now: {
    title: 'Sofort aktivieren',
    description: 'Die Version wird unmittelbar für neue Buchungen verbindlich. Bestehende Buchungen bleiben unverändert.',
    confirmLabel: 'Jetzt aktivieren',
    tone: 'default',
    requiresReason: true,
    reasonMinLength: 10,
  },
  replace_active: {
    title: 'Aktive Version ersetzen',
    description: 'Die neue Version wird sofort aktiv. Die bisher aktive Version wird als „Ersetzt“ markiert — kein Widerruf der Rechtstexte.',
    confirmLabel: 'Aktive Version ersetzen',
    tone: 'default',
    requiresReason: true,
    reasonMinLength: 10,
  },
  revoke: {
    title: 'Version widerrufen',
    description: 'Widerruf zieht die Version für neue Buchungen zurück. Dies ist keine normale Ersetzung — verwenden Sie Aktivierung nur bei inhaltlichen Updates.',
    confirmLabel: 'Widerrufen',
    tone: 'critical',
    requiresReason: true,
    reasonMinLength: 10,
  },
  archive: {
    title: 'Version archivieren',
    description: 'Die Version wird archiviert und aus dem operativen Workflow entfernt. Historische Snapshots und Nachweise bleiben erhalten — es erfolgt keine Löschung.',
    confirmLabel: 'Archivieren',
    tone: 'critical',
    requiresReason: false,
    reasonMinLength: 0,
  },
};

export const LEGAL_LIFECYCLE_CONFLICT_MESSAGES: Record<string, string> = {
  LEGAL_DOCUMENT_ACTIVE_CONFLICT:
    'Eine andere Version wurde parallel aktiviert. Die Daten wurden aktualisiert — bitte prüfen Sie den aktuellen Status erneut.',
  LEGAL_DOCUMENT_SCOPE_CONFLICT:
    'Der Geltungsbereich überschneidet sich mit einer bereits aktiven Version. Passen Sie Scope oder Version an.',
  LEGAL_DOCUMENT_FOUR_EYES_VIOLATION:
    'Vier-Augen-Prinzip: Freigabe oder Aktivierung durch denselben Benutzer wie Upload oder Review-Einreichung ist nicht erlaubt.',
  LEGAL_DOCUMENT_INVALID_STATUS_TRANSITION:
    'Der Status hat sich zwischenzeitlich geändert. Bitte laden Sie die Liste neu.',
  LEGAL_DOCUMENT_NOT_ACTIVATABLE:
    'Diese Version kann im aktuellen Status nicht aktiviert werden.',
  LEGAL_DOCUMENT_SCAN_NOT_PASSED:
    'Malware-Scan nicht bestanden — Aktivierung oder Review ist blockiert.',
};
