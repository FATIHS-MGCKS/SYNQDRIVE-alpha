import type { DocumentFileIdentificationStatus } from '../rental/lib/document-extraction.types';

export const DOCUMENT_IDENTIFICATION_ERROR_CODES = [
  'FILE_CORRUPTED',
  'PDF_PASSWORD_REQUIRED',
  'FILE_TOO_COMPLEX',
  'FILE_TOO_MANY_PAGES',
  'FILE_IDENTIFICATION_TIMEOUT',
] as const;

export type DocumentIdentificationErrorCode = (typeof DOCUMENT_IDENTIFICATION_ERROR_CODES)[number];

export interface DocumentIdentificationRejectedPayload {
  statusCode: number;
  errorCode: DocumentIdentificationErrorCode;
  identificationStatus: DocumentFileIdentificationStatus;
  stage: string;
  message: string;
}

export class DocumentIdentificationRejectedError extends Error {
  readonly payload: DocumentIdentificationRejectedPayload;

  constructor(payload: DocumentIdentificationRejectedPayload) {
    super(payload.message);
    this.name = 'DocumentIdentificationRejectedError';
    this.payload = payload;
  }
}

const GERMAN_MESSAGES: Record<DocumentIdentificationErrorCode, string> = {
  FILE_CORRUPTED: 'Die Datei ist beschädigt oder unvollständig.',
  PDF_PASSWORD_REQUIRED:
    'Passwortgeschützte PDFs werden nicht unterstützt. Bitte das Passwort entfernen und erneut hochladen.',
  FILE_TOO_COMPLEX: 'Die Datei ist zu komplex oder die Auflösung ist zu hoch.',
  FILE_TOO_MANY_PAGES: 'Das PDF hat zu viele Seiten für den Upload.',
  FILE_IDENTIFICATION_TIMEOUT: 'Die Dateiprüfung hat zu lange gedauert. Bitte eine kleinere Datei verwenden.',
};

export function resolveIdentificationErrorMessage(
  errorCode: DocumentIdentificationErrorCode,
  fallback: string,
): string {
  return GERMAN_MESSAGES[errorCode] ?? fallback;
}

export function parseUploadIdentificationError(body: unknown): DocumentIdentificationRejectedError | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as Record<string, unknown>;
  const nested = row.message && typeof row.message === 'object' ? (row.message as Record<string, unknown>) : row;
  const errorCode = String(nested.errorCode ?? row.errorCode ?? '');
  if (!(DOCUMENT_IDENTIFICATION_ERROR_CODES as readonly string[]).includes(errorCode)) return null;

  const fallbackMessage = String(
    typeof nested.message === 'string'
      ? nested.message
      : typeof row.message === 'string'
        ? row.message
        : 'Upload fehlgeschlagen.',
  );

  return new DocumentIdentificationRejectedError({
    statusCode: Number(nested.statusCode ?? row.statusCode ?? 400),
    errorCode: errorCode as DocumentIdentificationErrorCode,
    identificationStatus: String(
      nested.identificationStatus ?? 'REJECTED_CORRUPT',
    ) as DocumentFileIdentificationStatus,
    stage: String(nested.stage ?? 'UPLOAD'),
    message: resolveIdentificationErrorMessage(errorCode, fallbackMessage),
  });
}

export function parseNestedUploadErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as Record<string, unknown>;
  if (typeof row.message === 'string') return row.message;
  if (row.message && typeof row.message === 'object') {
    const nested = row.message as Record<string, unknown>;
    if (typeof nested.message === 'string') return nested.message;
  }
  return null;
}
