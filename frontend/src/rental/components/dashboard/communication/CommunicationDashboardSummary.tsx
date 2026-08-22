import type { ReactNode } from 'react';
import { cn } from '../../../../components/ui/utils';
import type { TranslationKey } from '../../../i18n/translations/en';
import { NOTIFICATION_PANEL_TYPO } from '../notifications/notificationPanelTypography';

interface CommunicationDashboardSummaryProps {
  unread: number | null;
  needsAttention: number | null;
  unassigned: number | null;
  loading: boolean;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onUnreadClick?: () => void;
  onNeedsAttentionClick?: () => void;
  onUnassignedClick?: () => void;
  error?: boolean;
}

function MetricCell({
  label,
  value,
  tone,
  onClick,
}: {
  label: ReactNode;
  value: number | string;
  tone?: 'critical' | 'watch' | 'neutral';
  onClick?: () => void;
}) {
  const content = (
    <>
      <span
        className={cn(
          NOTIFICATION_PANEL_TYPO.meta,
          'block text-center text-[10px] leading-3 text-muted-foreground min-[390px]:text-xs min-[390px]:leading-4',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          NOTIFICATION_PANEL_TYPO.meta,
          'mt-0.5 block text-center text-base font-semibold tabular-nums leading-5 text-foreground',
          tone === 'critical' && typeof value === 'number' && value > 0 && 'text-[color:var(--status-critical)]',
          tone === 'watch' && typeof value === 'number' && value > 0 && 'text-[color:var(--status-watch)]',
        )}
      >
        {value}
      </span>
    </>
  );

  if (!onClick) {
    return <div className="min-w-0 px-0.5 sm:px-1">{content}</div>;
  }

  return (
    <button
      type="button"
      className="min-h-11 min-w-0 rounded-md px-0.5 py-1 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] sm:min-h-0 sm:px-1 sm:py-0.5"
      onClick={onClick}
    >
      {content}
    </button>
  );
}

export function CommunicationDashboardSummary({
  unread,
  needsAttention,
  unassigned,
  loading,
  t,
  onUnreadClick,
  onNeedsAttentionClick,
  onUnassignedClick,
  error,
}: CommunicationDashboardSummaryProps) {
  const display = (value: number | null) => {
    if (loading) return '—';
    if (error || value == null) return '—';
    return value;
  };

  return (
    <div
      className="grid grid-cols-3 gap-1 border-b border-border/35 px-2 py-2 sm:px-3.5"
      data-testid="dashboard-communication-summary"
    >
      <MetricCell
        label={t('communication.dashboard.unread')}
        value={display(unread)}
        tone="watch"
        onClick={onUnreadClick}
      />
      <MetricCell
        label={t('communication.dashboard.needsAttention')}
        value={display(needsAttention)}
        tone="critical"
        onClick={onNeedsAttentionClick}
      />
      <MetricCell
        label={t('communication.dashboard.unassigned')}
        value={display(unassigned)}
        tone="neutral"
        onClick={onUnassignedClick}
      />
    </div>
  );
}
