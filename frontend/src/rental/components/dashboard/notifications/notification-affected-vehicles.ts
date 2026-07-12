export interface NotificationAffectedVehicle {
  id: string;
  label: string;
}

export function formatAffectedVehiclesPreview(
  vehicles: NotificationAffectedVehicle[],
  locale: string,
  maxVisible = 3,
): string {
  if (vehicles.length === 0) return '';
  const de = locale === 'de';
  const shown = vehicles.slice(0, maxVisible).map((vehicle) => vehicle.label);
  const rest = vehicles.length - shown.length;
  const base = shown.join(' · ');
  if (rest > 0) {
    return `${base} · ${de ? `+${rest} weitere` : `+${rest} more`}`;
  }
  return base;
}

export function affectedVehiclesSectionLabel(count: number, locale: string): string {
  const de = locale === 'de';
  if (de) {
    return count === 1 ? 'Betroffenes Fahrzeug' : `Betroffene Fahrzeuge (${count})`;
  }
  return count === 1 ? 'Affected vehicle' : `Affected vehicles (${count})`;
}
