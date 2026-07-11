import type { NotificationDomain } from '../notificationQueueModel';

/** Consistent domain → icon mapping for notification cards. */
export function notificationDomainIcon(domain: NotificationDomain | undefined, eventType?: string): string {
  if (eventType === 'DRIVING_ASSESSMENT_DEVICE_QUALITY') return 'gauge';
  if (eventType === 'TECHNICAL_OBSERVATION_ACTIVE') return 'alert-triangle';
  if (domain === 'driving-analysis') return 'gauge';
  if (domain === 'vehicle-health') return 'heart';
  if (domain === 'bookings') return 'calendar';
  if (domain === 'handovers') return 'key';
  if (domain === 'documents') return 'file-text';
  if (domain === 'billing') return 'wallet';
  if (domain === 'security') return 'shield';
  if (domain === 'system') return 'bell';
  if (domain === 'operations') return 'calendar-clock';
  return 'bell';
}
