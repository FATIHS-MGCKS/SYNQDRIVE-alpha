import { Icon } from '../../ui/Icon';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import type { NotificationEmptyVariant } from './notificationPanelTypes';
import type { useLanguage } from '../../../i18n/LanguageContext';

const EMPTY_CONFIG: Record<
  NotificationEmptyVariant,
  { icon: string; titleKey: string; hintKey?: string; tone?: 'success' | 'neutral' | 'error' }
> = {
  'none-active': {
    icon: 'check-circle',
    titleKey: 'notification.empty.noneActive',
    hintKey: 'notification.empty.noneActiveHint',
    tone: 'success',
  },
  'none-critical': {
    icon: 'shield-check',
    titleKey: 'notification.empty.noneCritical',
    tone: 'success',
  },
  'none-warning': {
    icon: 'check-circle',
    titleKey: 'notification.empty.noneWarning',
    tone: 'success',
  },
  'none-resolved': {
    icon: 'history',
    titleKey: 'notification.empty.noneResolved',
    tone: 'neutral',
  },
  'filter-empty': {
    icon: 'filter',
    titleKey: 'notification.empty.filter',
    tone: 'neutral',
  },
  'api-error': {
    icon: 'alert-circle',
    titleKey: 'notification.empty.apiError',
    tone: 'error',
  },
};

function toneClass(tone: 'success' | 'neutral' | 'error' = 'neutral'): string {
  if (tone === 'success') return 'sq-tone-success';
  if (tone === 'error') return 'sq-tone-critical';
  return 'bg-muted/40 text-muted-foreground';
}

export function NotificationEmptyState({
  variant,
  t,
}: {
  variant: NotificationEmptyVariant;
  t: ReturnType<typeof useLanguage>['t'];
}) {
  const config = EMPTY_CONFIG[variant];
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass(config.tone)}`}
        aria-hidden
      >
        <Icon name={config.icon} className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className={NOTIFICATION_PANEL_TYPO.emptyTitle}>{t(config.titleKey as never)}</p>
        {config.hintKey ? (
          <p className={NOTIFICATION_PANEL_TYPO.emptyBody}>{t(config.hintKey as never)}</p>
        ) : null}
      </div>
    </div>
  );
}
