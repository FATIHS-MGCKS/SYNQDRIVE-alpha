import { getToken } from '../../lib/auth';
import type { LegalDocumentDto } from '../../lib/api';
import { LEGAL_LIFECYCLE_CONFLICT_MESSAGES } from './legal-document-lifecycle.constants';

const BASE_URL = '/api/v1';

export class LegalDocumentMutationError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly field?: string;
  readonly isConflict: boolean;

  constructor(status: number, body: { message?: string | string[]; code?: string; field?: string }) {
    const raw = body.message;
    const message = Array.isArray(raw)
      ? raw.join(', ')
      : typeof raw === 'string'
        ? raw
        : `API-Fehler ${status}`;
    super(message);
    this.name = 'LegalDocumentMutationError';
    this.status = status;
    this.code = body.code;
    this.field = body.field;
    this.isConflict = status === 409;
  }
}

export function formatLegalDocumentMutationError(err: unknown): string {
  if (err instanceof LegalDocumentMutationError) {
    if (err.code && LEGAL_LIFECYCLE_CONFLICT_MESSAGES[err.code]) {
      return LEGAL_LIFECYCLE_CONFLICT_MESSAGES[err.code];
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Unbekannter Fehler';
}

export async function postLegalDocumentMutation(
  orgId: string,
  suffix: string,
  body: Record<string, unknown> = {},
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
    throw new LegalDocumentMutationError(res.status, payload);
  }

  return payload as LegalDocumentDto;
}
