import { getToken } from '../../../../lib/auth';
import { RENTAL_RULES_VERSION_CONFLICT_CODE } from './rental-rules-concurrency.constants';

const BASE_URL = '/api/v1';

export class RentalRulesMutationError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly entityType?: string;
  readonly expectedVersion?: number;
  readonly currentVersion?: number;
  readonly current?: Record<string, unknown> | null;

  constructor(status: number, body: Record<string, unknown>) {
    const raw = body.message;
    const message = Array.isArray(raw)
      ? raw.join(', ')
      : typeof raw === 'string'
        ? raw
        : 'Rental rules request failed';
    super(message);
    this.name = 'RentalRulesMutationError';
    this.status = status;
    this.code = typeof body.code === 'string' ? body.code : undefined;
    this.entityType = typeof body.entityType === 'string' ? body.entityType : undefined;
    this.expectedVersion =
      typeof body.expectedVersion === 'number' ? body.expectedVersion : undefined;
    this.currentVersion =
      typeof body.currentVersion === 'number' ? body.currentVersion : undefined;
    this.current =
      body.current && typeof body.current === 'object'
        ? (body.current as Record<string, unknown>)
        : null;
  }

  get isVersionConflict(): boolean {
    return this.status === 409 && this.code === RENTAL_RULES_VERSION_CONFLICT_CODE;
  }
}

export async function rentalRulesMutate<T>(
  method: 'PATCH' | 'POST' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = getToken();
  const url =
    method === 'DELETE' && body?.expectedVersion != null
      ? `${BASE_URL}${path}?expectedVersion=${encodeURIComponent(String(body.expectedVersion))}`
      : `${BASE_URL}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body && method !== 'DELETE' ? { body: JSON.stringify(body) } : {}),
  });

  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new RentalRulesMutationError(res.status, payload);
  }
  return payload as T;
}
