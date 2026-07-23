import type { ResolvedDeposit } from './deposit-resolver.types';

/** Canonical frozen deposit stored on BookingPriceSnapshot.pricingInputJson. */
export interface FrozenBookingDeposit {
  amountCents: number;
  currency: string;
  source: string;
  ruleRevisionId: string | null;
  reason: string;
  manualOverride: boolean;
  calculatedAt: string;
  /** Set when booking is confirmed — snapshot deposit must not change after this. */
  frozenAt: string | null;
}

export function toFrozenBookingDeposit(
  resolved: ResolvedDeposit,
  frozenAt: string | null = null,
): FrozenBookingDeposit {
  return {
    amountCents: resolved.amount,
    currency: resolved.currency,
    source: resolved.source,
    ruleRevisionId: resolved.ruleRevisionId,
    reason: resolved.reason,
    manualOverride: resolved.manualOverride,
    calculatedAt: resolved.calculatedAt,
    frozenAt,
  };
}

export function parseFrozenBookingDeposit(raw: unknown): FrozenBookingDeposit | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const amountCents =
    typeof row.amountCents === 'number'
      ? row.amountCents
      : typeof row.amount === 'number'
        ? row.amount
        : null;
  if (amountCents == null || typeof row.currency !== 'string') return null;
  return {
    amountCents,
    currency: row.currency,
    source: typeof row.source === 'string' ? row.source : 'TARIFF_RATE',
    ruleRevisionId: typeof row.ruleRevisionId === 'string' ? row.ruleRevisionId : null,
    reason: typeof row.reason === 'string' ? row.reason : '',
    manualOverride: row.manualOverride === true,
    calculatedAt: typeof row.calculatedAt === 'string' ? row.calculatedAt : new Date(0).toISOString(),
    frozenAt: typeof row.frozenAt === 'string' ? row.frozenAt : null,
  };
}
