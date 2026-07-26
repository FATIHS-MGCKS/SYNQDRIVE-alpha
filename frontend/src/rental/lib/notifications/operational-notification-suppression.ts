import { isV2CanonicalInsightType } from './v2-canonical-insight-types';
import { shouldUseV2NotificationSource } from './notifications-v2-flag';

/**
 * When V2 is the active inbox source, dashboard insights with canonical V2
 * producers must not also appear as client-built operational notifications.
 */
export function shouldSuppressCanonicalInsightAsOperationalNotification(
  insightType: string,
): boolean {
  if (!shouldUseV2NotificationSource()) return false;
  return isV2CanonicalInsightType(insightType);
}
