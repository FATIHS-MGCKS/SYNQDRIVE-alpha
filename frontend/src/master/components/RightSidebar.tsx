import { Building2, CheckCircle, AlertTriangle, Users, Car, CreditCard, Activity, Headphones, ChevronRight, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

interface RightSidebarProps {
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

type ActivityFilter = 'all' | 'ORGANIZATION' | 'VEHICLE' | 'USER';

const ENTITY_ICONS: Record<string, typeof Building2> = {
  ORGANIZATION: Building2,
  VEHICLE: Car,
  USER: Users,
  SUBSCRIPTION: CreditCard,
};

function formatMrr(value: number): string {
  if (value >= 1000) return `€${(value / 1000).toFixed(1)}k`;
  return `€${value.toFixed(0)}`;
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'now';
  if (diff < 60) return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function RightSidebar({ onViewChange }: RightSidebarProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [healthy, setHealthy] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.admin.dashboard().then(d => { if (mounted) { setStats(d); setHealthy(true); } }).catch(() => { if (mounted) setHealthy(false); }),
      api.support.open(5).then(t => { if (mounted) setTickets(t); }).catch(() => { if (mounted) setTickets([]); }),
    ]).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const filteredActivity = (stats?.recentActivity ?? [])
    .filter(a => activityFilter === 'all' || a.entity === activityFilter)
    .slice(0, 8);

  const card = 'bg-card border-border';
  const heading = 'text-foreground';
  const muted = 'text-muted-foreground';
  const body = 'text-foreground/80';
  const divider = 'bg-border';

  if (loading) {
    return (
      <div className="hidden lg:flex w-[300px] h-screen border-l border-sidebar-border flex-col items-center justify-center shrink-0 bg-sidebar">
        <Loader2 className={`w-5 h-5 animate-spin ${muted}`} />
      </div>
    );
  }

  const quickStats = [
    { label: 'Active Orgs', value: stats?.activeOrganizations ?? 0, icon: Building2 },
    { label: 'Vehicles', value: stats?.totalVehicles ?? 0, icon: Car },
    { label: 'Users', value: stats?.totalUsers ?? 0, icon: Users },
    { label: 'MRR', value: formatMrr(stats?.totalRevenueMrr ?? 0), icon: CreditCard, isString: true },
  ];

  const filterButtons: { key: ActivityFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'ORGANIZATION', label: 'Organization' },
    { key: 'VEHICLE', label: 'Vehicle' },
    { key: 'USER', label: 'User' },
  ];

  // Vertical status bar tones (info / watch / ai) — semantic, theme-aware.
  const statusBar: Record<string, string> = {
    Open: 'bg-[color:var(--status-info)]',
    'In Progress': 'bg-[color:var(--status-watch)]',
    Waiting: 'bg-[color:var(--status-ai)]',
  };

  return (
    <div className="hidden lg:flex w-[300px] h-screen border-l border-sidebar-border flex-col shrink-0 overflow-y-auto bg-sidebar">
      <div className="px-4 py-4 space-y-3">

        {/* 1. Platform Status */}
        <div className="flex items-center justify-between">
          <h3 className={`text-sm font-bold ${heading}`}>Platform Status</h3>
          {healthy ? (
            <span className="sq-chip sq-chip-success !text-[10px] !font-semibold">
              <CheckCircle className="w-2.5 h-2.5" /> Operational
            </span>
          ) : (
            <span className="sq-chip sq-chip-watch !text-[10px] !font-semibold">
              <AlertTriangle className="w-2.5 h-2.5" /> Degraded
            </span>
          )}
        </div>

        {/* 2. Quick Stats */}
        <div className="grid grid-cols-2 gap-2">
          {quickStats.map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className={`p-2.5 rounded-lg border ${card}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className={`text-[10px] font-medium ${muted}`}>{s.label}</span>
                </div>
                <p className={`text-base font-semibold ${heading}`}>
                  {s.isString ? s.value : Number(s.value).toLocaleString()}
                </p>
              </div>
            );
          })}
        </div>

        <div className={`h-px ${divider}`} />

        {/* 3. Live Activity */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-sm font-bold ${heading}`}>Live Activity</h3>
            <div className="flex items-center gap-1">
              <span className="sq-dot sq-dot-success animate-online-pulse" />
              <span className={`text-[10px] font-medium ${muted}`}>Live</span>
            </div>
          </div>

          <div className="flex gap-1.5 mb-4 flex-wrap">
            {filterButtons.map(f => (
              <button
                key={f.key}
                onClick={() => setActivityFilter(f.key)}
                className={`px-3 py-1 rounded-full text-[10px] font-semibold transition-all ${
                  activityFilter === f.key
                    ? 'sq-tone-brand'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredActivity.length === 0 && (
              <p className={`text-xs py-4 text-center ${muted}`}>No recent activity</p>
            )}
            {filteredActivity.map(item => {
              const Icon = ENTITY_ICONS[item.entity] ?? Activity;
              return (
                <div key={item.id} className="flex items-start gap-3 p-2 rounded-md transition-colors hover:bg-muted/60">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-muted">
                    <Icon className={`w-3.5 h-3.5 ${body}`} />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className={`text-xs leading-snug truncate ${body}`}>{item.description}</p>
                    <span className={`text-[10px] ${muted}`}>{relativeTime(item.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`h-px ${divider}`} />

        {/* 4. Open Support Tickets */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Headphones className="w-4 h-4 text-[color:var(--status-info)]" />
              <h3 className={`text-sm font-bold ${heading}`}>Open Tickets</h3>
            </div>
            {tickets.length > 0 && (
              <span className="sq-chip sq-chip-info !text-[10px] !font-semibold">
                {tickets.length}
              </span>
            )}
          </div>

          {tickets.length === 0 ? (
            <p className={`text-xs ${muted}`}>No open tickets</p>
          ) : (
            <div className="space-y-2">
              {tickets.map((t: any) => (
                <div key={t.id} className={`flex items-center gap-3 p-2 rounded-md border cursor-pointer transition-all hover:shadow-sm hover:bg-muted/60 ${card}`}>
                  <div className={`w-1.5 h-5 rounded-full shrink-0 ${statusBar[t.status] || 'bg-[color:var(--status-info)]'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold truncate text-foreground">
                      <span className="text-[color:var(--status-info)]">#{t.ticketNumber}</span> {t.subject}
                    </p>
                    <p className={`text-[10px] ${muted}`}>{t.status}</p>
                  </div>
                  <span className={`text-[10px] font-medium shrink-0 ${muted}`}>{relativeTime(t.lastActivityAt || t.createdAt)}</span>
                </div>
              ))}
            </div>
          )}

          {tickets.length > 0 && (
            <button
              onClick={() => onViewChange?.('support')}
              className="mt-3 flex items-center gap-1 text-[11px] font-semibold transition-colors text-[color:var(--brand)] hover:opacity-80"
            >
              View All <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
