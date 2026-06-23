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
import { Icon } from '../ui/Icon';
import { QUICK_ISSUE_CARDS, formatRelativeTime, sp, type SupportCenterStats } from './support-center.utils';
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
  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Support"
        description="Erstelle Tickets, verfolge Antworten und kommuniziere direkt mit dem SynqDrive Support."
        icon={<Headphones className="h-4 w-4 text-[color:var(--brand)]" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {onOpenHelpCenter && (
              <Button type="button" variant="outline" size="sm" onClick={onOpenHelpCenter}>
                <BookOpen className="h-4 w-4" />
                Help Center öffnen
              </Button>
            )}
            <Button type="button" size="sm" onClick={onCreateTicket}>
              <Plus className="h-4 w-4" />
              Neues Ticket erstellen
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricCard
          label="Offene Tickets"
          value={stats.openCount}
          icon={<Inbox className="h-4 w-4" />}
          loading={loading}
        />
        <MetricCard
          label="Wartet auf deine Antwort"
          value={stats.waitingOnYouCount}
          icon={<MessageCircle className="h-4 w-4" />}
          status={stats.waitingOnYouCount > 0 ? 'watch' : 'neutral'}
          loading={loading}
        />
        <MetricCard
          label="Letzte Support-Antwort"
          value={stats.lastSupportReplyAt ? formatRelativeTime(stats.lastSupportReplyAt) : '—'}
          icon={<Clock className="h-4 w-4" />}
          loading={loading}
          className="col-span-2 lg:col-span-1"
        />
        <MetricCard
          label="Gelöste Tickets"
          value={stats.resolvedCount}
          icon={<Headphones className="h-4 w-4" />}
          status="success"
          loading={loading}
        />
      </div>

      <div className={cn(sp.glassPanel, 'p-4 sm:p-5')}>
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
            Schnellhilfe
          </p>
          <p className="mt-0.5 text-[13px] font-semibold tracking-[-0.02em] text-foreground">
            Wobei können wir helfen?
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_ISSUE_CARDS.map((card) => (
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
