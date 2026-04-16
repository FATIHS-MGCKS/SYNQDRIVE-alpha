export function isUsableHmCommandVehicleReference(
  reference: string | null | undefined,
  vin: string | null | undefined,
): boolean {
  const normalizedReference = reference?.trim();
  if (!normalizedReference) return false;
  const normalizedVin = vin?.trim().toUpperCase() ?? null;
  return normalizedReference.toUpperCase() !== normalizedVin;
}

export function extractHmProviderVehicleReference(
  payload: unknown,
  vin: string | null | undefined,
): string | null {
  const normalizedVin = vin?.trim().toUpperCase() ?? null;
  const seen = new Set<unknown>();

  const visit = (value: unknown): string | null => {
    if (value == null || typeof value !== 'object') return null;
    if (seen.has(value)) return null;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = visit(item);
        if (nested) return nested;
      }
      return null;
    }

    for (const [key, entry] of Object.entries(value)) {
      if ((key === 'vehicleId' || key === 'vehicle_id') && typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed && trimmed.toUpperCase() !== normalizedVin) return trimmed;
      }
    }

    for (const entry of Object.values(value)) {
      const nested = visit(entry);
      if (nested) return nested;
    }

    return null;
  };

  return visit(payload);
}
