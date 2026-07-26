import { NotificationSeverity } from '../notification.enums';
import type { NotificationEventTypeDefinition } from './notification-event-registry.types';

export interface ResolvedRegistryTemplateKeys {
  titleKey: string;
  bodyKey: string;
  shortLabelKey?: string;
}

/** Resolve i18n keys for a registry definition, including SUCCESS recovery variants. */
export function resolveRegistryTemplateKeys(
  def: Pick<
    NotificationEventTypeDefinition,
    'titleKey' | 'bodyKey' | 'shortLabelKey' | 'recoveryTitleKey' | 'recoveryBodyKey'
  >,
  severity: NotificationSeverity,
): ResolvedRegistryTemplateKeys {
  if (
    severity === NotificationSeverity.SUCCESS
    && def.recoveryTitleKey
    && def.recoveryBodyKey
  ) {
    return {
      titleKey: def.recoveryTitleKey,
      bodyKey: def.recoveryBodyKey,
      shortLabelKey: def.shortLabelKey,
    };
  }

  return {
    titleKey: def.titleKey,
    bodyKey: def.bodyKey,
    shortLabelKey: def.shortLabelKey,
  };
}
