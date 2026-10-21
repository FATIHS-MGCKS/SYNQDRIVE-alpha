/**
 * Query-string builder for GET /admin/vehicles/operational.
 * registryLifecycle=all must be sent explicitly (not dropped like other "all" filters).
 */
export function buildVehiclesOperationalListQuery(
  params?: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, val] of Object.entries(params ?? {})) {
    if (val === undefined || val === '') continue;
    if (key === 'registryLifecycle') {
      search.set(key, String(val));
      continue;
    }
    if (val !== 'all') search.set(key, String(val));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
