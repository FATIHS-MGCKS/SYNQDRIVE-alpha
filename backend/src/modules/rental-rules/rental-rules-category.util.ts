/** Canonical category name normalization for uniqueness per organization. */
export function normalizeRentalCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
