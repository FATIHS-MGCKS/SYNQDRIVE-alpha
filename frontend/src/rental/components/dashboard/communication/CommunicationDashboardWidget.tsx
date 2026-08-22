import { MessagesSquare } from 'lucide-react';
import { ErrorState } from '../../../../components/patterns';
import { Button } from '../../../../components/ui/button';
import { cn } from '../../../../components/ui/utils';
import type { CommunicationApiChannel, CommunicationConversationListItem } from '../../../../lib/communication/types';
import { useRentalOrg } from '../../../RentalContext';
import type { CommunicationChannel } from '../../communication-center/communication-center.types';
import type { DashboardOpenCommunicationCenterOptions } from '../dashboardTypes';
import type { DashboardViewModel } from '../dashboardTypes';
import { useCommunicationDashboard } from '../useCommunicationDashboard';
import { NotificationCardSkeleton } from '../notifications/NotificationCardSkeleton';
import { NOTIFICATION_PANEL_TYPO } from '../notifications/notificationPanelTypography';
import { panelShellClass } from '../dashboardShell';
import { DashboardPanelScrollBlur } from '../DashboardPanelScrollBlur';
import { CommunicationDashboardSummary } from './CommunicationDashboardSummary';
import { CommunicationDashboardRow } from './CommunicationDashboardRow';

interface CommunicationDashboardWidgetProps {
  vm: DashboardViewModel;
  onOpenCommunicationCenter?: (options?: DashboardOpenCommunicationCenterOptions) => void;
}

function mapApiChannelToShell(channel: CommunicationApiChannel): CommunicationChannel {
  switch (channel) {
    case 'WHATSAPP':
      return 'whatsapp';
    case 'VOICE':
      return 'voice';
    case 'SMS':
      return 'sms';
    default:
      return 'all';
  }
}

export function CommunicationDashboardWidget({
  vm,
  onOpenCommunicationCenter,
}: CommunicationDashboardWidgetProps) {
  const { orgId, hasPermission } = useRentalOrg();
  const canReadCommunication = hasPermission('communication', 'read');

  const dashboard = useCommunicationDashboard({
    orgId,
    enabled: canReadCommunication,
  });

  if (!canReadCommunication) {
    return null;
  }

  const { t, locale } = vm;
  const intlLocale = locale === 'de' ? 'de-DE' : locale;
  const summaryFailed = Boolean(dashboard.summaryError);
  const listFailed = Boolean(dashboard.listError);
  const bothFailed = summaryFailed && listFailed;

  const openCenter = (options?: DashboardOpenCommunicationCenterOptions) => {
    onOpenCommunicationCenter?.(options);
  };

  const openConversation = (conversation: CommunicationConversationListItem) => {
    openCenter({
      conversationId: conversation.id,
      channel: mapApiChannelToShell(conversation.channel),
      mobilePane: 'conversation',
    });
  };

  const showEmptyAttention =
    !bothFailed &&
    !dashboard.loading &&
    dashboard.summary &&
    !dashboard.needsAttention &&
    dashboard.rows.length === 0;

  return (
    <section
      className={cn(
        panelShellClass('tertiary'),
        'flex min-w-0 flex-col overflow-hidden animate-fade-up',
        'max-lg:max-h-[min(320px,42vh)]',
      )}
      aria-label={t('communication.dashboard.title')}
      data-testid="dashboard-communication-widget"
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border/35 px-3.5 py-2.5">
        <div className="min-w-0">
          <h2 className={NOTIFICATION_PANEL_TYPO.boxTitle}>{t('communication.dashboard.title')}</h2>
          <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'mt-0.5 text-muted-foreground')}>
            {t('communication.dashboard.subtitle')}
          </p>
        </div>
        {onOpenCommunicationCenter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-2 text-[11px]"
            data-testid="dashboard-communication-open-center"
            onClick={() => openCenter()}
          >
            {t('communication.dashboard.openCenter')}
          </Button>
        )}
      </div>

      <CommunicationDashboardSummary
        unread={dashboard.summary?.unreadConversations ?? null}
        needsAttention={dashboard.summary?.requiresAttention ?? null}
        unassigned={dashboard.summary?.unassigned ?? null}
        loading={dashboard.summaryLoading}
        error={summaryFailed}
        t={t}
        onUnreadClick={() => openCenter({ inboxFilters: { unreadOnly: true } })}
        onNeedsAttentionClick={() =>
          openCenter({ inboxFilters: { status: 'HUMAN_REQUIRED' } })
        }
        onUnassignedClick={() => openCenter({ inboxFilters: { assignment: 'unassigned' } })}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {bothFailed ? (
          <div className="px-3.5 py-4">
            <ErrorState
              title={t('communication.dashboard.error')}
              retryLabel={t('communication.dashboard.retry')}
              onRetry={() => void dashboard.reload()}
              compact
            />
          </div>
        ) : listFailed ? (
          <div className="px-3.5 py-3">
            <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'text-[color:var(--status-critical)]')}>
              {t('communication.dashboard.rowsError')}
            </p>
          </div>
        ) : dashboard.loading ? (
          <div data-testid="dashboard-communication-loading" className="px-2 py-2">
            <NotificationCardSkeleton rows={3} />
          </div>
        ) : showEmptyAttention ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl sq-tone-success"
              aria-hidden
            >
              <MessagesSquare className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className={NOTIFICATION_PANEL_TYPO.emptyTitle}>{t('communication.dashboard.emptyTitle')}</p>
              <p className={NOTIFICATION_PANEL_TYPO.emptyBody}>{t('communication.dashboard.emptyDescription')}</p>
            </div>
          </div>
        ) : dashboard.rows.length > 0 ? (
          <DashboardPanelScrollBlur className="min-h-0 flex-1">
            <ul className="flex flex-col gap-2 px-2 py-2 sm:px-2.5" role="list">
              {dashboard.rows.map((conversation) => (
                <li key={conversation.id} className="list-none">
                  <CommunicationDashboardRow
                    conversation={conversation}
                    locale={intlLocale}
                    t={t}
                    onOpen={openConversation}
                  />
                </li>
              ))}
            </ul>
          </DashboardPanelScrollBlur>
        ) : summaryFailed ? (
          <div className="px-3.5 py-4">
            <ErrorState
              title={t('communication.dashboard.error')}
              retryLabel={t('communication.dashboard.retry')}
              onRetry={() => void dashboard.reload()}
              compact
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
