import { DOCUMENT_TITLE_DE } from '@modules/documents/documents.constants';

const DOCUMENT_STATUS_LABEL_DE: Record<string, string> = {
  DRAFT: 'Entwurf',
  GENERATED: 'Bereit',
  SENT: 'Versendet',
  VOID: 'Ungültig',
  FAILED: 'Fehlgeschlagen',
};

const OUTBOUND_EMAIL_STATUS_LABEL_DE: Record<string, string> = {
  QUEUED: 'Warteschlange',
  SENDING: 'Wird gesendet',
  SENT: 'Zugestellt',
  SENT_SIMULATED: 'Simuliert gesendet',
  FAILED: 'Fehlgeschlagen',
};

export function documentTypeLabelDe(documentType: string): string {
  return DOCUMENT_TITLE_DE[documentType] ?? 'Rechnungs-PDF';
}

export function documentStatusLabelDe(status: string): string {
  return DOCUMENT_STATUS_LABEL_DE[status] ?? 'Unbekannt';
}

export function outboundEmailStatusLabelDe(status: string): string {
  return OUTBOUND_EMAIL_STATUS_LABEL_DE[status] ?? 'Unbekannt';
}

export function formatFileSizeLabel(sizeBytes: number | null | undefined): string | null {
  if (sizeBytes == null || sizeBytes <= 0) return null;
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function userDisplayName(user: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
} | null | undefined): string | null {
  if (!user) return null;
  if (user.name?.trim()) return user.name.trim();
  const combined = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  return user.email?.trim() ?? null;
}
