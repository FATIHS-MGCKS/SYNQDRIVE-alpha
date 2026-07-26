import type { NotificationAffectedVehicle } from './notification-affected-vehicles';
import { createNotificationTranslator } from '../notificationQueueEnricher';

export type { NotificationAffectedVehicle };

export function formatAffectedVehiclesPreview(
  vehicles: NotificationAffectedVehicle[],
  locale: string,
  maxVisible = 3,
): string {
  if (vehicles.length === 0) return '';
  const t = createNotificationTranslator(locale);
  const shown = vehicles.slice(0, maxVisible).map((vehicle) => vehicle.label);
  const rest = vehicles.length - shown.length;
  const base = shown.join(' · ');
  if (rest > 0) {
    return `${base} · ${t('notification.affected.more', { count: rest })}`;
  }
  return base;
}

export function affectedVehiclesSectionLabel(count: number, locale: string): string {
  const t = createNotificationTranslator(locale);
  if (count === 1) return t('notification.affected.sectionOne');
  return t('notification.affected.sectionMany', { count });
}
