export function formatCheckoutExpiryDays(seconds: number): number {
  return Math.max(1, Math.round(seconds / (24 * 60 * 60)));
}
