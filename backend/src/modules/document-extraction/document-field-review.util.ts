const META_CONFIRMED_KEYS = new Set(['acceptedEntityLinks', 'actionPlanPreferences']);

/** True when the user has persisted at least one reviewed field value (not only meta keys). */
export function hasSavedFieldReview(confirmedData: unknown): boolean {
  if (!confirmedData || typeof confirmedData !== 'object' || Array.isArray(confirmedData)) {
    return false;
  }
  return Object.keys(confirmedData as Record<string, unknown>).some(
    (key) => !META_CONFIRMED_KEYS.has(key),
  );
}

export function readPlausibilityChecks(
  plausibility: unknown,
): import('./document-plausibility.types').PlausibilityCheck[] {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return [];
  }
  const checks = (plausibility as { checks?: unknown }).checks;
  return Array.isArray(checks)
    ? (checks as import('./document-plausibility.types').PlausibilityCheck[])
    : [];
}

export function readPlausibilityOverallStatus(plausibility: unknown): string | null {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return null;
  }
  const status = (plausibility as { overallStatus?: unknown }).overallStatus;
  return typeof status === 'string' ? status : null;
}
