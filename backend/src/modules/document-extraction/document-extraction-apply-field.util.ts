import type { DocumentApplyTypedResult } from './document-extraction-apply-result.types';
import { createApplyFailure } from './document-extraction-apply-result.util';

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

export function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim().length > 0) {
    const parsed = Number(v.trim().replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function int(v: unknown): number | undefined {
  const n = num(v);
  return n != null ? Math.round(n) : undefined;
}

export function dateFrom(v: unknown): Date | undefined {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const parsed = new Date(v);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}

export function requireStr(
  value: unknown,
  code: string,
): DocumentApplyTypedResult | string {
  const parsed = str(value);
  return parsed ?? createApplyFailure([code]);
}

export function requirePositiveInt(
  value: unknown,
  code: string,
): DocumentApplyTypedResult | number {
  const parsed = int(value);
  if (parsed == null || parsed <= 0) return createApplyFailure([code]);
  return parsed;
}

export function requireEventDate(
  data: Record<string, unknown>,
): DocumentApplyTypedResult | string {
  const eventDate = str(data.eventDate) ?? str(data.serviceDate) ?? str(data.invoiceDate);
  return eventDate ?? createApplyFailure(['EVENT_DATE_REQUIRED']);
}

export function isApplyFailure(
  value: DocumentApplyTypedResult | string | number,
): value is DocumentApplyTypedResult {
  return typeof value === 'object' && value != null && value.success === false;
}
