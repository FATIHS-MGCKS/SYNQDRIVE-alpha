import {
  Clock,
  Headphones,
  Inbox,
  MessageCircle,
  Plus,
  BookOpen,
} from 'lucide-react';
import { PageHeader } from '../../../components/patterns/page-header';
import { MetricCard } from '../../../components/patterns/data-card';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import { formatSupportRelativeTime, localizedQuickIssueCards } from './support-i18n';
import { sp, type SupportCenterStats } from './support-center.utils';
import type { SupportTicketCategory } from '../../../lib/api';

interface SupportCenterHeroProps {
  stats: SupportCenterStats;
  loading?: boolean;
  onCreateTicket: () => void;
  onOpenHelpCenter?: () => void;
  onQuickCategory: (category: SupportTicketCategory) => void;
}

export function SupportCenterHero({
  stats,
  loading,
  onCreateTicket,
  onOpenHelpCenter,
  onQuickCategory,
}: SupportCenterHeroProps) {
  const { t, locale } = useLanguage();
  const quickIssueCards = localizedQuickIssueCards(locale);

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={t('support.center.heroTitle')}
        icon={<Headphones className="h-4 w-4 text-[color:var(--brand)]" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {onOpenHelpCenter && (
              <Button type="button" variant="outline" size="sm" onClick={onOpenHelpCenter}>
                <BookOpen className="h-4 w-4" />
                {t('support.center.openHelpCenter')}
              </Button>
            )}
            <Button type="button" size="sm" onClick={onCreateTicket}>
              <Plus className="h-4 w-4" />
              {t('support.center.createTicketButton')}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricCard
          label={t('support.center.metricOpenTickets')}
          value={stats.openCount}
          icon={<Inbox className="h-4 w-4" />}
          loading={loading}
        />
        <MetricCard
          label={t('support.center.metricWaitingForYou')}
          value={stats.waitingOnYouCount}
          icon={<MessageCircle className="h-4 w-4" />}
          status={stats.waitingOnYouCount > 0 ? 'watch' : 'neutral'}
          loading={loading}
        />
        <MetricCard
          label={t('support.center.metricLastSupportReply')}
          value={
            stats.lastSupportReplyAt
              ? formatSupportRelativeTime(locale, stats.lastSupportReplyAt)
              : t('support.time.emDash')
          }
          icon={<Clock className="h-4 w-4" />}
          loading={loading}
          className="col-span-2 lg:col-span-1"
        />
        <MetricCard
          label={t('support.center.metricResolvedTickets')}
          value={stats.resolvedCount}
          icon={<Headphones className="h-4 w-4" />}
          status="success"
          loading={loading}
        />
      </div>

      <div className={cn(sp.glassPanel, 'p-4 sm:p-5')}>
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            {t('support.center.quickHelpTitle')}
          </p>
          <p className="mt-0.5 text-[13px] font-semibold tracking-[-0.02em] text-foreground">
            {t('support.center.quickHelpSubtitle')}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {quickIssueCards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onQuickCategory(card.category)}
              className={sp.quickCard}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-[color:var(--brand-soft)] group-hover:text-[color:var(--brand)]">
                  <Icon name={card.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-foreground">{card.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                    {card.description}
                  </span>
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
