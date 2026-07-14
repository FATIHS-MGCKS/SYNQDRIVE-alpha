import {
  OrgInvoiceProcessStatus,
  OrgInvoiceProcessType,
} from '@prisma/client';

const PROCESS_LABELS: Record<OrgInvoiceProcessType, string> = {
  BOOKING_INVOICE_CREATE: 'Buchungsrechnung anlegen',
  BOOKING_FINANCE_SYNC: 'Finanzsynchronisation',
  INVOICE_DOCUMENT_GENERATE: 'Rechnungsdokument erzeugen',
  DOCUMENT_STORE: 'Dokument speichern',
  INVOICE_DOCUMENT_LINK: 'Rechnungsdokument verknüpfen',
  INVOICE_EMAIL_SEND: 'Rechnung per E-Mail versenden',
  PROVIDER_STATUS_SYNC: 'Provider-Status synchronisieren',
  PAYMENT_SYNC: 'Zahlung synchronisieren',
  LINKED_TASK_UPDATE: 'Zahlungsaufgabe aktualisieren',
};

const STATUS_LABELS: Record<OrgInvoiceProcessStatus, string> = {
  PENDING: 'Ausstehend',
  PROCESSING: 'In Bearbeitung',
  COMPLETED: 'Abgeschlossen',
  FAILED: 'Fehlgeschlagen',
  RETRY_SCHEDULED: 'Wiederholung geplant',
  MANUAL_REVIEW: 'Manuelle Prüfung erforderlich',
};

export function invoiceProcessTypeLabel(type: OrgInvoiceProcessType): string {
  return PROCESS_LABELS[type] ?? 'Rechnungsprozess';
}

export function invoiceProcessStatusLabel(status: OrgInvoiceProcessStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function classifyProcessError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error && typeof error === 'object') {
    const e = error as { code?: string; message?: string; status?: number };
    if (e.code === 'P2002') {
      return {
        code: 'DUPLICATE',
        message: 'Vorgang bereits ausgeführt',
        retryable: false,
      };
    }
    if (e.status === 404 || e.code === 'NOT_FOUND') {
      return {
        code: 'NOT_FOUND',
        message: 'Zugehöriger Datensatz nicht gefunden',
        retryable: false,
      };
    }
    if (e.status === 400 || e.code === 'BAD_REQUEST') {
      return {
        code: 'VALIDATION',
        message: 'Ungültige Eingabe für den Rechnungsprozess',
        retryable: false,
      };
    }
  }

  const raw = error instanceof Error ? error.message : String(error ?? 'unknown');
  const lower = raw.toLowerCase();
  if (lower.includes('timeout') || lower.includes('econnreset') || lower.includes('network')) {
    return {
      code: 'TRANSIENT_NETWORK',
      message: 'Temporäre Verbindungsstörung',
      retryable: true,
    };
  }
  if (lower.includes('lock') || lower.includes('deadlock')) {
    return {
      code: 'TRANSIENT_LOCK',
      message: 'Datenbank vorübergehend gesperrt — wird erneut versucht',
      retryable: true,
    };
  }

  return {
    code: 'PROCESS_FAILED',
    message: 'Rechnungsprozess konnte nicht abgeschlossen werden',
    retryable: true,
  };
}

export function sanitizeProcessErrorMessage(message: string): string {
  return message
    .replace(/sk_[a-zA-Z0-9]+/g, '[redacted]')
    .replace(/pi_[a-zA-Z0-9]+/g, '[redacted]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
    .slice(0, 500);
}

export function buildProcessUserMessage(input: {
  processType: OrgInvoiceProcessType;
  status: OrgInvoiceProcessStatus;
  lastErrorCode?: string | null;
}): string {
  const label = invoiceProcessTypeLabel(input.processType);
  if (input.status === OrgInvoiceProcessStatus.COMPLETED) {
    return `${label} erfolgreich abgeschlossen.`;
  }
  if (input.status === OrgInvoiceProcessStatus.MANUAL_REVIEW) {
    return `${label}: Manuelle Prüfung erforderlich. Bitte Support kontaktieren oder erneut versuchen.`;
  }
  if (input.status === OrgInvoiceProcessStatus.RETRY_SCHEDULED) {
    return `${label}: Wird automatisch erneut versucht.`;
  }
  if (input.lastErrorCode === 'NOT_FOUND') {
    return `${label}: Verknüpfte Daten fehlen.`;
  }
  return `${label}: ${invoiceProcessStatusLabel(input.status)}.`;
}
