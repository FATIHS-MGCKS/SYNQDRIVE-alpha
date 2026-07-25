import type {
  OperatorConnectivityBannerModel,
  OperatorConnectivitySignals,
  OperatorConnectivityStateId,
  OperatorConnectivityTone,
} from './operatorConnectivity.types';

export interface ConnectivityPresentation {
  stateId: OperatorConnectivityStateId;
  tone: OperatorConnectivityTone;
  message: string;
  announce: boolean;
}

function pluralUploads(count: number): string {
  return count === 1 ? '1 Upload' : `${count} Uploads`;
}

export function resolveOperatorConnectivityPresentation(
  signals: OperatorConnectivitySignals,
): ConnectivityPresentation | null {
  if (signals.authExpired) {
    return {
      stateId: 'auth-expired',
      tone: 'error',
      message: signals.draftBufferedLocally
        ? 'Anmeldung abgelaufen – Vorgang wurde als Draft erhalten.'
        : 'Anmeldung abgelaufen – bitte erneut anmelden.',
      announce: true,
    };
  }

  if (!signals.browserOnline) {
    return {
      stateId: 'browser-offline',
      tone: 'watch',
      message: 'Offline – Änderungen werden noch nicht synchronisiert.',
      announce: true,
    };
  }

  if (signals.backendReachable === false) {
    return {
      stateId: 'backend-unreachable',
      tone: 'error',
      message: 'Server nicht erreichbar – gespeicherte Daten bleiben lokal.',
      announce: true,
    };
  }

  if (signals.queueBlockingFailed) {
    return {
      stateId: 'upload-failed',
      tone: 'error',
      message: 'Upload fehlgeschlagen – Abschluss ist noch nicht möglich.',
      announce: true,
    };
  }

  if (signals.draftSaveFailed) {
    return {
      stateId: 'draft-save-failed',
      tone: 'error',
      message: 'Entwurf konnte nicht gespeichert werden – lokale Änderungen bleiben erhalten.',
      announce: true,
    };
  }

  const pendingWork =
    signals.queuePendingCount > 0 || signals.queueUploadingCount > 0 || signals.draftSyncing;

  if (signals.recentlyReconnected && pendingWork) {
    const uploadCount = signals.queuePendingCount + signals.queueUploadingCount;
    return {
      stateId: 'connection-restored',
      tone: 'info',
      message:
        uploadCount > 0
          ? `Verbindung wiederhergestellt – ${pluralUploads(uploadCount)} werden synchronisiert.`
          : 'Verbindung wiederhergestellt – Entwurf wird synchronisiert.',
      announce: true,
    };
  }

  if (signals.apiPartialFailure) {
    return {
      stateId: 'api-partial',
      tone: 'watch',
      message: 'Einige Daten konnten nicht geladen werden – Anzeige ist unvollständig.',
      announce: true,
    };
  }

  if (signals.uploadServiceDegraded) {
    return {
      stateId: 'upload-service-degraded',
      tone: 'watch',
      message: 'Upload-Dienst gestört – einige Dateien warten auf erneuten Versuch.',
      announce: true,
    };
  }

  if (signals.queuePendingCount > 0) {
    return {
      stateId: 'queue-pending',
      tone: 'info',
      message: `${pluralUploads(signals.queuePendingCount)} ausstehend – Synchronisation bei Verbindung.`,
      announce: true,
    };
  }

  if (signals.draftSyncing || signals.queueUploadingCount > 0) {
    return {
      stateId: 'syncing',
      tone: 'info',
      message: 'Synchronisierung läuft…',
      announce: false,
    };
  }

  if (signals.recentlyReconnected && !pendingWork) {
    return {
      stateId: 'synced',
      tone: 'success',
      message: 'Vollständig synchronisiert.',
      announce: true,
    };
  }

  return null;
}

export function computeOperatorConnectivityBanner(
  signals: OperatorConnectivitySignals,
): OperatorConnectivityBannerModel {
  const presentation = resolveOperatorConnectivityPresentation(signals);
  if (!presentation) {
    return {
      stateId: null,
      tone: 'info',
      message: '',
      visible: false,
      announce: false,
    };
  }

  return {
    stateId: presentation.stateId,
    tone: presentation.tone,
    message: presentation.message,
    visible: true,
    announce: presentation.announce,
  };
}
