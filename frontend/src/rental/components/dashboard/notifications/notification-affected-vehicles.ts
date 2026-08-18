import { dt } from '../dashboard-i18n';
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
  const shown = vehicles.slice(0, maxVisible).map((vehicle) => vehicle.label);
  const rest = vehicles.length - shown.length;
  const base = shown.join(' · ');
  if (rest > 0) {
    return `${base} · ${dt(locale, 'notification.affected.more', { count: rest })}`;
  }
  return base;
}

export function affectedVehiclesSectionLabel(count: number, locale: string): string {
  if (count === 1) return dt(locale, 'notification.affected.one');
  return dt(locale, 'notification.affected.many', { count });
}
