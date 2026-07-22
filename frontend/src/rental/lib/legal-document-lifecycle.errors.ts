import { getToken } from '../../lib/auth';
import type { LegalDocumentDto } from '../../lib/api';
import { LEGAL_LIFECYCLE_CONFLICT_CODE_KEYS } from './legal-document-lifecycle.constants';
import type { LegalDocumentsTranslate } from './legal-documents-i18n';

const BASE_URL = '/api/v1';

export class LegalDocumentMutationError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly field?: string;
  readonly isConflict: boolean;

  constructor(
    status: number,
    body: { message?: string | string[]; code?: string; field?: string },
    t: LegalDocumentsTranslate,
  ) {
    const raw = body.message;
    const message = Array.isArray(raw)
      ? raw.join(', ')
      : typeof raw === 'string'
        ? raw
        : t('legalDocuments.error.api', { status });
    super(message);
    this.name = 'LegalDocumentMutationError';
    this.status = status;
    this.code = body.code;
    this.field = body.field;
    this.isConflict = status === 409;
  }
}

export function formatLegalDocumentMutationError(
  err: unknown,
  t: LegalDocumentsTranslate,
): string {
  if (err instanceof LegalDocumentMutationError) {
    if (err.code && LEGAL_LIFECYCLE_CONFLICT_CODE_KEYS[err.code]) {
      return t(LEGAL_LIFECYCLE_CONFLICT_CODE_KEYS[err.code]);
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return t('legalDocuments.error.unknown');
}

export async function postLegalDocumentMutation(
  orgId: string,
  suffix: string,
  body: Record<string, unknown> = {},
  t: LegalDocumentsTranslate,
): Promise<LegalDocumentDto> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/organizations/${orgId}/legal-documents${suffix}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    code?: string;
    field?: string;
  };

  if (!res.ok) {
    throw new LegalDocumentMutationError(res.status, payload, t);
  }

  return payload as LegalDocumentDto;
}
