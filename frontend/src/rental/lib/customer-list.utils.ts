/** Merge API list with ephemeral additional customers (e.g. from NewBooking) without duplicates. */
export function mergeAdditionalCustomers<T extends { id: string }>(
  primary: T[],
  additional: T[],
): T[] {
  if (!additional.length) return primary;
  const seen = new Set(primary.map((c) => c.id));
  const merged = [...primary];
  for (const row of additional) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged;
}
