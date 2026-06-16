/** Aligns with documents/templates/template-helpers rentalDays — ceil partial days, min 1. */
export function computeRentalDays(pickupAt: Date, returnAt: Date): number {
  if (Number.isNaN(pickupAt.getTime()) || Number.isNaN(returnAt.getTime())) {
    return 1;
  }
  const ms = returnAt.getTime() - pickupAt.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}
