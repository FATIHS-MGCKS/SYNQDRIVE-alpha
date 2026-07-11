import { Icon } from '../../ui/Icon';
import { cn } from '../../../../components/ui/utils';
import { DataTrustHint } from '../DataTrustHint';
import { sectionTrustHint } from '../dataTrustBuilder';
import { attentionExpandLabel } from '../attentionItemDisplay';
import type { DashboardViewModel } from '../dashboardTypes';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import type { headerStatusTone } from './notificationPanelFilters';
import type { useLanguage } from '../../../i18n/LanguageContext';

function statusDotClass(tone: ReturnType<typeof headerStatusTone>): string {
  if (tone === 'critical') return 'bg-[color:var(--status-critical)]';
  if (tone === 'warning') return 'bg-[color:var(--status-watch)]';
  if (tone === 'success') return 'bg-[color:var(--status-success)]';
  return 'bg-muted-foreground/40';
}

function statusAriaLabel(
  tone: ReturnType<typeof headerStatusTone>,
  t: ReturnType<typeof useLanguage>['t'],
): string {
  if (tone === 'critical') return t('notification.header.status.critical');
  if (tone === 'warning') return t('notification.header.status.warning');
  return t('notification.header.status.clear');
}

export function NotificationPanelHeader({
  vm,
  statusTone,
  totalCount,
  isExpanded,
  onToggle,
  controlsId,
  t,
}: {
  vm: DashboardViewModel;
  statusTone: ReturnType<typeof headerStatusTone>;
  totalCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  controlsId: string;
  t: ReturnType<typeof useLanguage>['t'];
}) {
  const { locale, operatorFocusMode } = vm;
  const de = locale === 'de';
  const title = operatorFocusMode
    ? de
      ? 'Kritische Aktionen'
      : 'Critical actions'
    : t('notification.panelTitle');

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/35 px-3.5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', statusDotClass(statusTone))}
          aria-hidden
        />
        <span className="sr-only">{statusAriaLabel(statusTone, t)}</span>
        <h2 className={NOTIFICATION_PANEL_TYPO.boxTitle}>{title}</h2>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <DataTrustHint
          hint={sectionTrustHint('operations', vm.dataTrust)}
          locale={locale}
          className="hidden text-right sm:block"
        />
        {totalCount > 0 ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-controls={controlsId}
            className={cn(
              NOTIFICATION_PANEL_TYPO.cta,
              'sq-press inline-flex min-h-11 shrink-0 items-center rounded-md px-2.5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
            )}
          >
            {attentionExpandLabel(totalCount, de, isExpanded)}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function NotificationPanelErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="border-b border-border/40 bg-muted/30 px-4 py-2.5 text-xs leading-[17px] text-muted-foreground"
      role="status"
    >
      <Icon name="alert-circle" className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom opacity-70" aria-hidden />
      {message}
    </div>
  );
}
