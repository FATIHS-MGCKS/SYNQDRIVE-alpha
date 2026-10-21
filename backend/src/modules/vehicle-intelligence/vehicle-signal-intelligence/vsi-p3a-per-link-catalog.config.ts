/**
 * P3A per-link provider catalog axes — default OFF (writer and resolver independent).
 */
export function isVsiP3aPerLinkCatalogWriteEnabled(): boolean {
  const raw = process.env.VSI_P3A_PER_LINK_CATALOG_WRITE_ENABLED;
  if (raw == null || raw === '') {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function isVsiP3aPerLinkCatalogResolverEnabled(): boolean {
  const raw = process.env.VSI_P3A_PER_LINK_CATALOG_RESOLVER_ENABLED;
  if (raw == null || raw === '') {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}
