/**
 * Central, reproducible monetary rounding for Voice billing (integer cents).
 */
export function eurosToCents(amountEuros: number): number {
  if (!Number.isFinite(amountEuros)) {
    return 0;
  }
  return Math.round(amountEuros * 100);
}

export function centsToEuros(amountCents: number): number {
  return Math.round(amountCents) / 100;
}

export function multiplyCents(unitCents: number, quantity: number): number {
  if (!Number.isFinite(unitCents) || !Number.isFinite(quantity) || quantity <= 0) {
    return 0;
  }
  return Math.round(unitCents * quantity);
}

export function sumCents(...values: Array<number | null | undefined>): number {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function marginCents(revenueCents: number, costCents: number): number {
  return Math.round(revenueCents) - Math.round(costCents);
}

export function marginPercent(revenueCents: number, costCents: number): number | null {
  if (revenueCents <= 0) {
    return null;
  }
  return Math.round(((revenueCents - costCents) / revenueCents) * 1000) / 10;
}
