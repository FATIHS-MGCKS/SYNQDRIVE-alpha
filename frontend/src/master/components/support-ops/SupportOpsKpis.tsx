import type { ReactNode } from 'react';
import { Clock, Flame, Inbox, Mail, Sparkles } from 'lucide-react';
import type { SupportTicketStats } from '../../../lib/api';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import { formatSupportOpsDurationMs } from './support-ops-i18n';
import { sop } from './support-ops.utils';

interface SupportOpsKpisProps {
  stats: SupportTicketStats | null;
  loading?: boolean;
}

function KpiCell({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2 px-2 py-1.5', accent && 'text-[color:var(--status-critical)]')}>
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[10px] text-muted-foreground">{label}</p>
        <p className="text-[13px] font-semibold tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function SupportOpsKpis({ stats, loading }: SupportOpsKpisProps) {
  const { t, locale } = useLanguage();

  if (loading && !stats) {
    return (
      <div className={cn(sop.kpiStrip, 'animate-pulse h-14')} aria-hidden />
    );
  }

  return (
    <div className={cn(sop.kpiStrip, 'grid grid-cols-2 gap-1 sm:grid-cols-4 xl:grid-cols-7')}>
      <KpiCell label={t('support.ops.kpi.open')} value={stats?.totalOpen ?? stats?.open ?? 0} icon={<Inbox className="h-3.5 w-3.5" />} />
      <KpiCell label={t('support.ops.kpi.new')} value={stats?.newTickets ?? stats?.open ?? 0} icon={<Sparkles className="h-3.5 w-3.5" />} />
      <KpiCell
        label={t('support.ops.kpi.critical')}
        value={stats?.criticalOpen ?? 0}
        icon={<Flame className="h-3.5 w-3.5" />}
        accent={(stats?.criticalOpen ?? 0) > 0}
      />
      <KpiCell
        label={t('support.ops.kpi.waitingCustomer')}
        value={stats?.waitingForCustomer ?? stats?.waiting ?? 0}
        icon={<Clock className="h-3.5 w-3.5" />}
      />
      <KpiCell label={t('support.ops.kpi.unread')} value={stats?.unreadForAdmin ?? 0} icon={<Mail className="h-3.5 w-3.5" />} />
      <KpiCell
        label={t('support.ops.kpi.avgFirstResponse')}
        value={formatSupportOpsDurationMs(locale, stats?.avgFirstResponseTimeMs)}
        icon={<Clock className="h-3.5 w-3.5" />}
      />
      <KpiCell
        label={t('support.ops.kpi.avgResolution')}
        value={formatSupportOpsDurationMs(locale, stats?.avgResolutionTimeMs)}
        icon={<Clock className="h-3.5 w-3.5" />}
      />
    </div>
  );
}
