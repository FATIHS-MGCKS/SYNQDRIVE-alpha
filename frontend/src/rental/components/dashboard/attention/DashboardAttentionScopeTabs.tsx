import { cn } from '../../../../components/ui/utils';
import { NOTIFICATION_PANEL_TYPO } from '../notifications/notificationPanelTypography';
import type { TranslationKey } from '../../../i18n/translations/en';
import {
  DASHBOARD_ATTENTION_SCOPES,
  DASHBOARD_ATTENTION_SCOPE_LABEL_KEYS,
  type DashboardAttentionScope,
} from './dashboardAttentionScope';

function scopeTabBadgeClass(count: number): string {
  if (count <= 0) return 'bg-muted/50 text-muted-foreground';
  return 'bg-[color:color-mix(in_srgb,var(--brand)_10%,transparent)] text-[color:var(--brand)]';
}

interface DashboardAttentionScopeTabsProps {
  activeScope: DashboardAttentionScope;
  operationsCount: number;
  fleetCount: number;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onChange: (scope: DashboardAttentionScope) => void;
}

export function DashboardAttentionScopeTabs({
  activeScope,
  operationsCount,
  fleetCount,
  t,
  onChange,
}: DashboardAttentionScopeTabsProps) {
  const counts: Record<DashboardAttentionScope, number> = {
    operations: operationsCount,
    fleet: fleetCount,
  };

  return (
    <div
      className="sq-tab-bar sq-tab-bar--inset grid w-full grid-cols-2 gap-0.5 p-1"
      role="tablist"
      aria-label={t('notification.panelTitle')}
      data-testid="dashboard-attention-scope-tabs"
    >
      {DASHBOARD_ATTENTION_SCOPES.map((scope) => {
        const isActive = activeScope === scope;
        const count = counts[scope];
        return (
          <button
            key={scope}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-testid={`dashboard-attention-scope-${scope}`}
            onClick={() => onChange(scope)}
            className={cn(
              'inline-flex min-h-11 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius-md)-2px)] px-2 py-2 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              NOTIFICATION_PANEL_TYPO.tab,
              isActive
                ? 'surface-premium text-foreground shadow-[var(--shadow-1)]'
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
            )}
          >
            <span>{t(DASHBOARD_ATTENTION_SCOPE_LABEL_KEYS[scope] as TranslationKey)}</span>
            <span
              className={cn(NOTIFICATION_PANEL_TYPO.tabBadge, scopeTabBadgeClass(count))}
              aria-label={String(count)}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
