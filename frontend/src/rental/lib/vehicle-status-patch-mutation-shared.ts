export type VehicleStatusPatchMutationLocale = 'de' | 'en';

export type VehicleStatusPatchMutationDomain = 'operational' | 'cleaning';

export function classifyVehicleStatusPatchMutationError(
  error: unknown,
  locale: VehicleStatusPatchMutationLocale = 'de',
  domain: VehicleStatusPatchMutationDomain = 'operational',
): string {
  const message = error instanceof Error ? error.message : '';
  const lower = message.toLowerCase();
  const de = locale === 'de';

  if (lower.includes('session expired') || lower.includes('401')) {
    return de ? 'Sitzung abgelaufen. Bitte erneut anmelden.' : 'Session expired. Please sign in again.';
  }
  if (lower.includes('403') || lower.includes('forbidden') || lower.includes('permission')) {
    return domain === 'cleaning'
      ? de
        ? 'Keine Berechtigung zum Ändern des Reinigungsstatus.'
        : 'You do not have permission to change the cleaning status.'
      : de
        ? 'Keine Berechtigung zum Ändern des Fahrzeugstatus.'
        : 'You do not have permission to change the vehicle status.';
  }
  if (lower.includes('404') || lower.includes('not found')) {
    return de
      ? 'Fahrzeug nicht gefunden oder gehört nicht zu dieser Organisation.'
      : 'Vehicle not found or does not belong to this organization.';
  }
  if (
    domain === 'operational' &&
    (lower.includes('cannot be set via the admin status endpoint') ||
      lower.includes('rented') ||
      lower.includes('reserved'))
  ) {
    return de
      ? 'Dieser Status kann nicht direkt gesetzt werden. Vermietet/Reserviert entsteht über Buchungen.'
      : 'This status cannot be set directly. Rented/Reserved are derived from bookings.';
  }
  if (lower.includes('400') || lower.includes('bad request') || lower.includes('validation')) {
    return de ? 'Ungültiger Statuswechsel.' : 'Invalid status transition.';
  }
  return domain === 'cleaning'
    ? de
      ? 'Reinigungsstatus konnte nicht gespeichert werden.'
      : 'Cleaning status could not be saved.'
    : de
      ? 'Fahrzeugstatus konnte nicht gespeichert werden.'
      : 'Vehicle status could not be saved.';
}
