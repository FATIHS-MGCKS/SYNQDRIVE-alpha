import {
  Building2, Car, Users, DollarSign, Activity, AlertTriangle, CheckCircle,
  Clock, ArrowUpRight, Headphones, Wifi, UserPlus, Trash2, Settings,
  CreditCard, FileText, Shield,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import {
  PageHeader,
  MetricCard,
  DataCard,
  StatusChip,
  EmptyState,
  ErrorState,
  SkeletonMetricGrid,
  SkeletonCard,
} from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';

interface MasterDashboardViewProps {
  isDarkMode: boolean;
  onViewChange?: (view: string) => void;
}

interface DashboardStats {
  totalOrganizations: number;
  activeOrganizations: number;
  totalUsers: number;
  totalVehicles: number;
  totalDimoVehicles: number;
  totalRevenueMrr: number;
  activeSubscriptions: number;
  trialOrganizations: number;
  suspendedOrganizations: number;
  totalProspects: number;
  openSupportTickets: number;
  recentActivity: Array<{
    id: string;
    action: string;
    entity: string;
    entityId: string | null;
    description: string;
    userId: string | null;
    userName: string | null;
    organizationId: string | null;
    organizationName: string | null;
    createdAt: string;
  }>;
}

interface PlatformAlert {
  id?: string;
  severity: string;
  summary: string;
  affectedComponent: string;
  firstSeen: string;
  lastSeen: string;
}

function formatMrr(value: number): string {
  if (value >= 1000) return `€${(value / 1000).toFixed(1)}k`;
  return `€${value}`;
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function alertSeverityTone(severity: string): StatusTone {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'warning';
  return 'info';
}

const ENTITY_ICON_MAP: Record<string, { icon: typeof Building2; tone: string }> = {
  ORGANIZATION: { icon: Building2, tone: 'sq-tone-info' },
  USER: { icon: Users, tone: 'sq-tone-ai' },
  VEHICLE: { icon: Car, tone: 'sq-tone-brand' },
  SUBSCRIPTION: { icon: CreditCard, tone: 'sq-tone-success' },
  INVOICE: { icon: FileText, tone: 'sq-tone-watch' },
  ROLE: { icon: Shield, tone: 'sq-tone-critical' },
  SETTINGS: { icon: Settings, tone: 'sq-tone-neutral' },
};

function getEntityVisuals(entity: string, action: string) {
  const mapped = ENTITY_ICON_MAP[entity];
  if (mapped) return mapped;
  if (action === 'DELETE') return { icon: Trash2, tone: 'sq-tone-critical' };
  if (action === 'CREATE') return { icon: UserPlus, tone: 'sq-tone-success' };
  return { icon: Activity, tone: 'sq-tone-neutral' };
}

const SUPPORT_STATUS_TONE: Record<string, StatusTone> = {
  Open: 'info',
  'In Progress': 'watch',
  Waiting: 'ai',
  Resolved: 'success',
  Closed: 'neutral',
};

export function MasterDashboardView({ onViewChange }: MasterDashboardViewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<PlatformAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [dashData, alertData] = await Promise.all([
          api.admin.dashboard(),
          api.admin.monitoring.alerts().catch(() => [] as PlatformAlert[]),
        ]);
        if (!cancelled) {
          setStats(dashData);
          setAlerts(alertData ?? []);
        }
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const hasCritical = alerts.some((a) => a.severity === 'critical');

  if (loading) {
    return (
      <div className="space-y-5 pb-4">
        <div className="mb-5 space-y-2 animate-pulse">
          <div className="h-6 w-48 rounded-lg bg-muted" />
          <div className="h-4 w-64 rounded-lg bg-muted" />
        </div>
        <SkeletonMetricGrid count={4} />
        <SkeletonMetricGrid count={5} className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <SkeletonCard className="h-[340px]" />
          <SkeletonCard className="h-[340px]" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <ErrorState
        icon={<AlertTriangle className="h-5 w-5" />}
        title="Failed to load dashboard data"
        onRetry={() => setReloadKey((k) => k + 1)}
        retryLabel="Retry"
      />
    );
  }

  const kpiCards: Array<{
    label: string;
    value: string;
    icon: typeof Building2;
    status: StatusTone;
  }> = [
    { label: 'Active Organizations', value: stats.activeOrganizations.toLocaleString(), icon: Building2, status: 'info' },
    { label: 'Connected Vehicles', value: stats.totalVehicles.toLocaleString(), icon: Car, status: 'neutral' },
    { label: 'Platform Users', value: stats.totalUsers.toLocaleString(), icon: Users, status: 'ai' },
    { label: 'Monthly Recurring Revenue', value: formatMrr(stats.totalRevenueMrr), icon: DollarSign, status: 'success' },
  ];

  const secondaryMetrics: Array<{
    label: string;
    value: number;
    icon: typeof Building2;
    clickable?: boolean;
    onClick?: () => void;
  }> = [
    { label: 'DIMO Vehicles', value: stats.totalDimoVehicles, icon: Wifi },
    { label: 'Active Subscriptions', value: stats.activeSubscriptions, icon: CreditCard },
    { label: 'Trial Organizations', value: stats.trialOrganizations, icon: Clock },
    { label: 'Total Prospects', value: stats.totalProspects, icon: UserPlus },
    {
      label: 'Open Support Tickets',
      value: stats.openSupportTickets,
      icon: Headphones,
      clickable: true,
      onClick: () => onViewChange?.('support'),
    },
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-5 pb-4">
      <PageHeader
        title="Platform Overview"
        description={dateLabel}
        status={
          <StatusChip
            tone={hasCritical ? 'critical' : 'success'}
            dot
          >
            {hasCritical ? 'Issues Detected' : 'System Normal'}
          </StatusChip>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi) => (
          <MetricCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            status={kpi.status}
            icon={<kpi.icon className="h-4 w-4" />}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {secondaryMetrics.map((m) => (
          <MetricCard
            key={m.label}
            label={m.label}
            value={m.value.toLocaleString()}
            icon={<m.icon className="h-4 w-4" />}
            onClick={m.clickable ? m.onClick : undefined}
            className={m.clickable ? undefined : 'cursor-default'}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <DataCard
          title="Recent Activity"
          description="Latest platform events"
          actions={
            <button
              type="button"
              onClick={() => onViewChange?.('activity-log')}
              className="sq-press flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              View All <ArrowUpRight className="h-3 w-3" />
            </button>
          }
          bodyClassName="max-h-[280px] overflow-y-auto pr-1 custom-scrollbar space-y-2.5"
        >
          {stats.recentActivity.length === 0 ? (
            <EmptyState
              compact
              title="No recent activity"
              description="Platform events will appear here as they occur."
            />
          ) : (
            stats.recentActivity.map((item) => {
              const ev = getEntityVisuals(item.entity, item.action);
              const Icon = ev.icon;
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3 transition-all hover:bg-muted/60"
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm ${ev.tone}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-xs font-semibold leading-snug text-foreground">{item.description}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-[10px] font-medium text-muted-foreground">
                        {formatRelativeTime(item.createdAt)}
                      </p>
                      {item.organizationName && (
                        <StatusChip tone="neutral" className="!text-[10px] !py-0.5">
                          {item.organizationName}
                        </StatusChip>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </DataCard>

        <DataCard
          title="Platform Alerts"
          description={alerts.length > 0 ? 'Action required' : 'Monitoring status'}
          actions={
            alerts.length > 0 ? (
              <StatusChip tone="warning" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
                {alerts.length} Active
              </StatusChip>
            ) : (
              <StatusChip tone="success" icon={<CheckCircle className="h-3.5 w-3.5" />}>
                All Clear
              </StatusChip>
            )
          }
          bodyClassName="max-h-[280px] overflow-y-auto pr-1 custom-scrollbar space-y-2"
        >
          {alerts.length === 0 ? (
            <EmptyState
              compact
              icon={<CheckCircle className="h-8 w-8" />}
              title="No active alerts"
              description="All systems operating normally"
            />
          ) : (
            alerts.map((alert, idx) => {
              const tone = alertSeverityTone(alert.severity);
              return (
                <div
                  key={alert.id ?? idx}
                  className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3"
                >
                  <StatusChip tone={tone} className="mt-0.5 shrink-0 !px-1.5 !py-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </StatusChip>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-xs font-semibold leading-snug text-foreground">{alert.summary}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {formatRelativeTime(alert.lastSeen || alert.firstSeen)}
                      </span>
                      {alert.affectedComponent && (
                        <StatusChip tone="neutral" className="!text-[10px] !py-0.5">
                          {alert.affectedComponent}
                        </StatusChip>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </DataCard>
      </div>

      <NewestSupportWidget />
    </div>
  );
}

function NewestSupportWidget() {
  const [tickets, setTickets] = useState<any[]>([]);

  useEffect(() => {
    api.support.newest(6).then(setTickets).catch(() => setTickets([]));
  }, []);

  if (tickets.length === 0) return null;

  return (
    <DataCard
      title="Newest Support Requests"
      description="Latest tickets from organizations"
      actions={
        <StatusChip tone="neutral">{tickets.length} recent</StatusChip>
      }
      bodyClassName="space-y-2"
    >
      {tickets.map((t: any) => {
        const tone = SUPPORT_STATUS_TONE[t.status] ?? SUPPORT_STATUS_TONE.Open;
        return (
          <div
            key={t.id}
            className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-[10px] font-bold text-muted-foreground">
              #{t.ticketNumber}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-xs font-semibold text-foreground">{t.subject}</p>
                <StatusChip tone={tone} className="shrink-0 !text-[9px]">
                  {t.status}
                </StatusChip>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t.reporterName || t.reporterEmail} · {formatRelativeTime(t.lastActivityAt || t.createdAt)}
              </p>
              {t.lastMessage && (
                <p className="mt-1 truncate text-[10px] text-muted-foreground">
                  <span className="font-semibold">{t.lastMessage.senderName}:</span> {t.lastMessage.content}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </DataCard>
  );
}
