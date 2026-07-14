/** Safe truncated Stripe reference for operator UI (no full IDs in lists). */
export function truncateStripeRef(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const id = value.trim();
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}
