import { toast } from 'sonner';
import { getToken } from '../../lib/auth';
import {
  BOOKING_VERSION_CONFLICT_CODE,
  BOOKING_VERSION_REQUIRED_CODE,
} from './booking-version-conflict.constants';

export type BookingVersionRefreshPayload = {
  bookingId: string;
  updatedAt: string;
  status: string;
  vehicleId: string;
  customerId: string;
  startDate: string;
  endDate: string;
  totalPriceCents: number | null;
};

function parseErrorMessage(body: Record<string, unknown>): string {
  const raw = body.message;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.map(String).join(', ');
  if (raw && typeof raw === 'object') {
    const nested = raw as { message?: unknown; error?: unknown };
    if (typeof nested.message === 'string') return nested.message;
    if (typeof nested.error === 'string') return nested.error;
  }
  return 'Booking request failed';
}

function parseErrorCode(body: Record<string, unknown>): string | undefined {
  if (typeof body.code === 'string') return body.code;
  const raw = body.message;
  if (raw && typeof raw === 'object' && typeof (raw as { code?: unknown }).code === 'string') {
    return (raw as { code: string }).code;
  }
  return undefined;
}

function parseCurrentPayload(
  body: Record<string, unknown>,
): BookingVersionRefreshPayload | null {
  const direct = body.current;
  if (direct && typeof direct === 'object') {
    return direct as BookingVersionRefreshPayload;
  }
  const raw = body.message;
  if (raw && typeof raw === 'object' && (raw as { current?: unknown }).current) {
    const nested = (raw as { current: unknown }).current;
    if (nested && typeof nested === 'object') {
      return nested as BookingVersionRefreshPayload;
    }
  }
  return null;
}

export class BookingMutationError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly current?: BookingVersionRefreshPayload | null;

  constructor(status: number, body: Record<string, unknown>) {
    super(parseErrorMessage(body));
    this.name = 'BookingMutationError';
    this.status = status;
    this.code = parseErrorCode(body);
    this.current = parseCurrentPayload(body);
  }

  get isVersionConflict(): boolean {
    return this.status === 409 && this.code === BOOKING_VERSION_CONFLICT_CODE;
  }

  get isVersionRequired(): boolean {
    return this.status === 400 && this.code === BOOKING_VERSION_REQUIRED_CODE;
  }
}

export async function bookingMutate<T>(
  method: 'PATCH' | 'POST' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api/v1${path}`, {
    method,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401 && !path.includes('/auth/')) {
    const { clearAuth } = await import('../../lib/auth');
    clearAuth();
    window.location.href = '/login';
    throw new BookingMutationError(401, { message: 'Session expired' });
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new BookingMutationError(res.status, payload);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function showBookingVersionConflictToast(onReload?: () => void): void {
  toast.warning('Buchung wurde zwischenzeitlich geändert', {
    description: 'Bitte Daten neu laden und Ihre Änderung erneut versuchen.',
    ...(onReload
      ? {
          action: {
            label: 'Neu laden',
            onClick: onReload,
          },
        }
      : {}),
  });
}

export function handleBookingMutationError(
  err: unknown,
  options?: {
    onConflictReload?: () => void;
    onOtherError?: (message: string) => void;
  },
): boolean {
  if (err instanceof BookingMutationError) {
    if (err.isVersionConflict || err.isVersionRequired) {
      showBookingVersionConflictToast(options?.onConflictReload);
      return true;
    }
    options?.onOtherError?.(err.message);
    return false;
  }
  const message = err instanceof Error ? err.message : 'Aktion fehlgeschlagen';
  options?.onOtherError?.(message);
  return false;
}

export function resolveBookingUpdatedAt(
  source: { updatedAt?: string | null } | null | undefined,
): string {
  const value = source?.updatedAt?.trim();
  if (!value) {
    throw new Error('Buchungsversion fehlt — bitte Seite neu laden.');
  }
  return value;
}
