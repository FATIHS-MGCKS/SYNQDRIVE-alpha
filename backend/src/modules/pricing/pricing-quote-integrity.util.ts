import { createHash } from 'crypto';
import type { BookingPricingInputDto } from './dto';

export function sortUuidList(ids?: string[] | null): string[] {
  return [...(ids ?? [])].sort();
}

export function canonicalPricingInput(
  input?: BookingPricingInputDto | null,
): Record<string, string | number | string[] | null> {
  return {
    selectedMileagePackageId: input?.selectedMileagePackageId ?? null,
    selectedInsuranceOptionIds: sortUuidList(input?.selectedInsuranceOptionIds),
    selectedExtraOptionIds: sortUuidList(input?.selectedExtraOptionIds),
    manualDiscountCents: input?.manualDiscountCents ?? null,
    manualAdjustmentCents: input?.manualAdjustmentCents ?? null,
  };
}

export function pricingInputsEqual(
  a?: BookingPricingInputDto | null,
  b?: BookingPricingInputDto | null,
): boolean {
  return JSON.stringify(canonicalPricingInput(a)) === JSON.stringify(canonicalPricingInput(b));
}

export function instantsEqual(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

export interface QuoteIntegrityPayload {
  organizationId: string;
  vehicleId: string;
  pickupAt: string;
  returnAt: string;
  tariffVersionId: string;
  currency: string;
  pricingInput: ReturnType<typeof canonicalPricingInput>;
  totals: {
    subtotalNetCents: number;
    taxAmountCents: number;
    totalGrossCents: number;
    depositAmountCents: number;
  };
}

export function buildQuoteIntegrityHash(payload: QuoteIntegrityPayload): string {
  const canonical = JSON.stringify(payload);
  return createHash('sha256').update(canonical).digest('hex');
}
