import type { BookingPaymentIntent } from '@prisma/client';
import {
  fromPrismaBookingPaymentIntent,
  toPrismaBookingPaymentIntent,
} from '../booking-payment-intent.types';

export function parseForeignTravelRequested(extrasJson: unknown): boolean {
  if (extrasJson == null) return false;
  if (Array.isArray(extrasJson)) {
    return extrasJson.some((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const record = entry as Record<string, unknown>;
      const key = String(record.key ?? record.id ?? record.code ?? '').toLowerCase();
      const label = String(record.label ?? record.name ?? '').toLowerCase();
      return (
        key.includes('foreign') ||
        key.includes('ausland') ||
        label.includes('foreign travel') ||
        label.includes('auslandsfahrt')
      );
    });
  }
  if (typeof extrasJson === 'object') {
    const record = extrasJson as Record<string, unknown>;
    if (record.foreignTravelRequested === true || record.foreignTravel === true) {
      return true;
    }
  }
  return false;
}

export function resolvePaymentIntentValue(
  value: unknown,
): BookingPaymentIntent | null | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (['payment_link', 'pay_on_pickup', 'cash', 'invoice'].includes(lower)) {
      return toPrismaBookingPaymentIntent(lower as never);
    }
    const fromPrisma = fromPrismaBookingPaymentIntent(value as BookingPaymentIntent);
    return fromPrisma ? toPrismaBookingPaymentIntent(fromPrisma) : undefined;
  }
  return undefined;
}

export function resolveGatekeeperPaymentIntent(
  value: unknown,
): 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice' | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (['payment_link', 'pay_on_pickup', 'cash', 'invoice'].includes(lower)) {
      return lower as 'payment_link' | 'pay_on_pickup' | 'cash' | 'invoice';
    }
    return fromPrismaBookingPaymentIntent(value as BookingPaymentIntent) ?? undefined;
  }
  return undefined;
}

export function resolvePaymentIntentChanged(existing: unknown, next: unknown): boolean {
  if (next === undefined) return false;
  const normalizedExisting = existing == null ? null : String(existing);
  const normalizedNext = next == null ? null : String(next);
  return normalizedExisting !== normalizedNext;
}
