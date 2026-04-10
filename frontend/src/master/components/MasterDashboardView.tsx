import {
  Building2, Car, Users, DollarSign, Activity, AlertTriangle, CheckCircle,
  Clock, ArrowUpRight, Headphones, Wifi, UserPlus, Trash2, Settings,
  CreditCard, FileText, Shield, RefreshCw,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

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

const ENTITY_ICON_MAP: Record<string, { icon: typeof Building2; color: string }> = {
  ORGANIZATION: { icon: Building2, color: 'text-blue-500 bg-blue-500/10' },
  USER: { icon: Users, color: 'text-purple-500 bg-purple-500/10' },
  VEHICLE: { icon: Car, color: 'text-indigo-500 bg-indigo-500/10' },
  SUBSCRIPTION: { icon: CreditCard, color: 'text-emerald-500 bg-emerald-500/10' },
  INVOICE: { icon: FileText, color: 'text-amber-500 bg-amber-500/10' },
  ROLE: { icon: Shield, color: 'text-rose-500 bg-rose-500/10' },
  SETTINGS: { icon: Settings, color: 'text-gray-500 bg-gray-500/10' },
};

function getEntityVisuals(entity: string, action: string) {
  const mapped = ENTITY_ICON_MAP[entity];
  if (mapped) return mapped;
  if (action === 'DELETE') return { icon: Trash2, color: 'text-red-500 bg-red-500/10' };
  if (action === 'CREATE') return { icon: UserPlus, color: 'text-green-500 bg-green-500/10' };
  return { icon: Activity, color: 'text-gray-500 bg-gray-500/10' };
}

export function MasterDashboardView({ isDarkMode, onViewChange }: MasterDashboardViewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<PlatformAlert[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, []);

  const cardClass = 'bg-card border border-border rounded-lg shadow-sm p-4 hover:shadow transition-all duration-300';

  const hasCritical = alerts.some((a) => a.severity === 'critical');

  if (loading) {
    return (
      <div className="space-y-4 pb-4 animate-pulse">
        <div className="flex items-end justify-between">
          <div className="space-y-2">
            <div className="h-6 w-48 rounded-lg bg-muted" />
            <div className="h-4 w-64 rounded-lg bg-muted" />
          </div>
          <div className="h-8 w-32 rounded-xl bg-muted" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={`${cardClass} h-[100px]`}>
              <div className="h-8 w-8 rounded-lg mb-3 bg-muted" />
              <div className="h-5 w-20 rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`${cardClass} h-[72px]`} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className={`${cardClass} h-[340px]`} />
          <div className={`${cardClass} h-[340px]`} />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <AlertTriangle className="w-10 h-10 mb-3 opacity-50" />
        <p className="text-sm font-semibold">Failed to load dashboard data</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 flex items-center gap-1.5 text-xs font-bold text-blue-500 hover:text-blue-400 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  const kpiCards = [
    { label: 'Active Organizations', value: stats.activeOrganizations.toLocaleString(), icon: Building2, gradient: 'blue' },
    { label: 'Connected Vehicles', value: stats.totalVehicles.toLocaleString(), icon: Car, gradient: 'indigo' },
    { label: 'Platform Users', value: stats.totalUsers.toLocaleString(), icon: Users, gradient: 'purple' },
    { label: 'Monthly Recurring Revenue', value: formatMrr(stats.totalRevenueMrr), icon: DollarSign, gradient: 'emerald' },
  ];

  const gradientStyles: Record<string, { icon: string; iconBg: string }> = {
    blue: {
      icon: isDarkMode ? 'text-blue-400' : 'text-blue-600',
      iconBg: isDarkMode ? 'bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20' : 'bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50',
    },
    indigo: {
      icon: isDarkMode ? 'text-indigo-400' : 'text-indigo-600',
      iconBg: isDarkMode ? 'bg-gradient-to-br from-indigo-500/20 to-indigo-600/10 border border-indigo-500/20' : 'bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200/50',
    },
    purple: {
      icon: isDarkMode ? 'text-purple-400' : 'text-purple-600',
      iconBg: isDarkMode ? 'bg-gradient-to-br from-purple-500/20 to-purple-600/10 border border-purple-500/20' : 'bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200/50',
    },
    emerald: {
      icon: isDarkMode ? 'text-emerald-400' : 'text-emerald-600',
      iconBg: isDarkMode ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20' : 'bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200/50',
    },
  };

  const secondaryMetrics = [
    { label: 'DIMO Vehicles', value: stats.totalDimoVehicles, icon: Wifi },
    { label: 'Active Subscriptions', value: stats.activeSubscriptions, icon: CreditCard },
    { label: 'Trial Organizations', value: stats.trialOrganizations, icon: Clock },
    { label: 'Total Prospects', value: stats.totalProspects, icon: UserPlus },
    { label: 'Open Support Tickets', value: stats.openSupportTickets, icon: Headphones, clickable: true },
  ];

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Platform Overview
          </h1>
          <p className="text-xs mt-0.5 font-medium text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl border bg-card border-border shadow-sm flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${hasCritical ? 'bg-red-500' : 'bg-green-500'}`} />
            <span className={`text-xs font-semibold ${hasCritical ? 'text-red-500' : 'text-foreground'}`}>
              {hasCritical ? 'Issues Detected' : 'System Normal'}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((kpi) => {
          const gs = gradientStyles[kpi.gradient];
          return (
            <div key={kpi.label} className={cardClass}>
              <div className="flex items-start justify-between mb-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-inner ${gs.iconBg}`}>
                  <kpi.icon className={`w-4 h-4 ${gs.icon}`} />
                </div>
              </div>
              <div>
                <p className="text-lg font-bold tracking-tight text-foreground">{kpi.value}</p>
                <p className="text-xs font-medium mt-1 text-muted-foreground">{kpi.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {secondaryMetrics.map((m) => (
          <button
            key={m.label}
            disabled={!m.clickable}
            onClick={m.clickable ? () => onViewChange?.('support') : undefined}
            className={`${cardClass} text-left flex items-center gap-3 ${m.clickable ? 'cursor-pointer hover:ring-1 hover:ring-blue-500/30' : 'cursor-default'}`}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-muted">
              <m.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{m.value}</p>
              <p className="text-[10px] font-medium truncate text-muted-foreground">{m.label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Recent Activity */}
        <div className={`${cardClass} flex flex-col`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
              <p className="text-xs mt-0.5 text-muted-foreground">Latest platform events</p>
            </div>
            <button
              onClick={() => onViewChange?.('activity-log')}
              className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              View All <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
            {stats.recentActivity.length === 0 && (
              <p className="text-xs py-6 text-center text-muted-foreground">No recent activity</p>
            )}
            {stats.recentActivity.map((item) => {
              const ev = getEntityVisuals(item.entity, item.action);
              const Icon = ev.icon;
              return (
                <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl transition-all bg-muted/30 hover:bg-muted/60 border border-border">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${ev.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-xs font-semibold leading-snug text-foreground">{item.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[10px] font-medium text-muted-foreground">
                        {formatRelativeTime(item.createdAt)}
                      </p>
                      {item.organizationName && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {item.organizationName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Platform Alerts */}
        <div className={`${cardClass} flex flex-col`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Platform Alerts</h3>
              <p className="text-xs mt-0.5 text-muted-foreground">
                {alerts.length > 0 ? 'Action required' : 'Monitoring status'}
              </p>
            </div>
            {alerts.length > 0 ? (
              <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5" /> {alerts.length} Active
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-500/10 px-2.5 py-1 rounded-lg">
                <CheckCircle className="w-3.5 h-3.5" /> All Clear
              </span>
            )}
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
            {alerts.length === 0 && (
              <div className={`flex flex-col items-center justify-center py-10 rounded-xl border ${isDarkMode ? 'bg-green-900/5 border-green-500/10' : 'bg-green-50/30 border-green-200/30'}`}>
                <CheckCircle className="w-8 h-8 text-green-500 mb-2" />
                <p className={`text-xs font-semibold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>No active alerts</p>
                <p className="text-[10px] mt-0.5 text-muted-foreground">All systems operating normally</p>
              </div>
            )}
            {alerts.map((alert, idx) => {
              const severityStyles =
                alert.severity === 'critical'
                  ? { border: isDarkMode ? 'bg-red-900/10 border-red-500/20' : 'bg-red-50/50 border-red-200/50', text: 'text-red-500' }
                  : alert.severity === 'warning'
                  ? { border: isDarkMode ? 'bg-amber-900/10 border-amber-500/20' : 'bg-amber-50/50 border-amber-200/50', text: 'text-amber-500' }
                  : { border: isDarkMode ? 'bg-blue-900/10 border-blue-500/20' : 'bg-blue-50/50 border-blue-200/50', text: 'text-blue-500' };
              return (
                <div key={alert.id ?? idx} className={`flex items-start gap-3 p-3 rounded-xl border ${severityStyles.border}`}>
                  <div className={`mt-0.5 shrink-0 ${severityStyles.text}`}>
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-xs font-semibold leading-snug text-foreground">{alert.summary}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {formatRelativeTime(alert.lastSeen || alert.firstSeen)}
                      </span>
                      {alert.affectedComponent && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {alert.affectedComponent}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Newest Support Requests */}
      <NewestSupportWidget isDarkMode={isDarkMode} cardClass={cardClass} />
    </div>
  );
}

function NewestSupportWidget({ isDarkMode, cardClass }: { isDarkMode: boolean; cardClass: string }) {
  const [tickets, setTickets] = useState<any[]>([]);

  useEffect(() => {
    api.support.newest(6).then(setTickets).catch(() => setTickets([]));
  }, []);

  if (tickets.length === 0) return null;

  const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
    Open: { bg: 'bg-blue-500/15', text: 'text-blue-500', dot: 'bg-blue-500' },
    'In Progress': { bg: 'bg-amber-500/15', text: 'text-amber-500', dot: 'bg-amber-500' },
    Waiting: { bg: 'bg-purple-500/15', text: 'text-purple-500', dot: 'bg-purple-500' },
    Resolved: { bg: 'bg-emerald-500/15', text: 'text-emerald-500', dot: 'bg-emerald-500' },
    Closed: { bg: 'bg-gray-500/15', text: 'text-gray-400', dot: 'bg-gray-400' },
  };

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-100/50'}`}>
            <Headphones className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Newest Support Requests</h3>
            <p className="text-xs mt-0.5 text-muted-foreground">Latest tickets from organizations</p>
          </div>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-muted text-muted-foreground">
          {tickets.length} recent
        </span>
      </div>
      <div className="space-y-2">
        {tickets.map((t: any) => {
          const sc = statusColors[t.status] || statusColors.Open;
          return (
            <div key={t.id} className="flex items-start gap-3 p-3 rounded-xl border transition-colors bg-muted/30 border-border hover:bg-muted/50">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 bg-muted text-muted-foreground">
                #{t.ticketNumber}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold truncate text-foreground">{t.subject}</p>
                  <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${sc.bg} ${sc.text}`}>
                    <span className={`w-1 h-1 rounded-full ${sc.dot}`} /> {t.status}
                  </span>
                </div>
                <p className="text-[10px] mt-0.5 text-muted-foreground">
                  {t.reporterName || t.reporterEmail} · {formatRelativeTime(t.lastActivityAt || t.createdAt)}
                </p>
                {t.lastMessage && (
                  <p className="text-[10px] mt-1 truncate text-muted-foreground">
                    <span className="font-semibold">{t.lastMessage.senderName}:</span> {t.lastMessage.content}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
