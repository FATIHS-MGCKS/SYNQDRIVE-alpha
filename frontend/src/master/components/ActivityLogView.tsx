import {
  Activity,
  Building2,
  Calendar,
  Car,
  CreditCard,
  Cpu,
  LifeBuoy,
  MapPin,
  Package,
  Plug,
  RefreshCw,
  Search,
  UserCircle,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PageHeader,
  DataCard,
  MetricCard,
  StatusChip,
  EmptyState,
  ErrorState,
  SkeletonRows,
  activityActionTone,
} from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';

export interface ActivityLogViewProps {
  /** @deprecated Theme is token-driven via CSS variables — prop kept for App.tsx compat. */
  isDarkMode?: boolean;
}

export interface ActivityLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  description: string;
  userId?: string | null;
  userName?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  createdAt: string;
}

interface ActivityLogMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const LIMIT = 50;

const ENTITY_OPTIONS = [
  ['', 'All entities'],
  ['ORGANIZATION', 'Organization'],
  ['USER', 'User'],
  ['VEHICLE', 'Vehicle'],
  ['BOOKING', 'Booking'],
  ['CUSTOMER', 'Customer'],
  ['PROSPECT', 'Prospect'],
  ['INTEGRATION', 'Integration'],
  ['SUBSCRIPTION', 'Subscription'],
  ['STATION', 'Station'],
  ['PRODUCT', 'Product'],
  ['DIMO_VEHICLE', 'DIMO vehicle'],
  ['SUPPORT_TICKET', 'Support ticket'],
] as const;

const ACTION_OPTIONS = [
  ['', 'All actions'],
  ['CREATE', 'Create'],
  ['UPDATE', 'Update'],
  ['DELETE', 'Delete'],
  ['LOGIN', 'Login'],
  ['LOGOUT', 'Logout'],
  ['CONNECT', 'Connect'],
  ['DISCONNECT', 'Disconnect'],
  ['REGISTER', 'Register'],
  ['IMPORT', 'Import'],
  ['CONVERT', 'Convert'],
  ['SYNC', 'Sync'],
  ['CANCEL', 'Cancel'],
] as const;

const ENTITY_ICONS: Record<string, LucideIcon> = {
  ORGANIZATION: Building2,
  USER: Users,
  VEHICLE: Car,
  BOOKING: Calendar,
  CUSTOMER: UserCircle,
  PROSPECT: UserPlus,
  INTEGRATION: Plug,
  SUBSCRIPTION: CreditCard,
  STATION: MapPin,
  PRODUCT: Package,
  DIMO_VEHICLE: Cpu,
  SUPPORT_TICKET: LifeBuoy,
};

const INPUT =
  'px-3 py-2 rounded-lg border text-sm font-medium bg-muted/50 border-border text-foreground outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--ring)]';

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return String(iso);
  const diffSec = Math.round((Date.now() - t) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const s = Math.sign(diffSec) * -1;
  const a = Math.abs(diffSec);
  if (a < 60) return rtf.format(s * a, 'second');
  const m = Math.round(a / 60);
  if (m < 60) return rtf.format(s * m, 'minute');
  const h = Math.round(m / 60);
  if (h < 48) return rtf.format(s * h, 'hour');
  const d = Math.round(h / 24);
  return d < 14 ? rtf.format(s * d, 'day') : new Date(iso).toLocaleString();
}

function pageList(cur: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, cur, cur - 1, cur + 1]);
  const sorted = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

function entityIcon(entity: string): LucideIcon {
  return ENTITY_ICONS[(entity || '').toUpperCase()] ?? Activity;
}

export function ActivityLogView(_props: ActivityLogViewProps) {
  void _props;
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [rows, setRows] = useState<ActivityLogEntry[]>([]);
  const [meta, setMeta] = useState<ActivityLogMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.activityLog({
        page,
        limit: LIMIT,
        entity: entity || undefined,
        action: action || undefined,
      });
      const data = (res?.data ?? []) as ActivityLogEntry[];
      const m = res?.meta as ActivityLogMeta | undefined;
      const limit = m?.limit ?? LIMIT;
      const total = m?.total ?? data.length;
      const totalPages = m?.totalPages && m.totalPages > 0 ? m.totalPages : Math.max(1, Math.ceil(total / limit));
      setRows(data);
      setMeta({ total, page: m?.page ?? page, limit, totalPages });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity log');
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [page, entity, action]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.description ?? '').toLowerCase().includes(q));
  }, [rows, searchQuery]);

  const totalPages = meta?.totalPages ?? 1;
  const pages = pageList(page, totalPages);
  const emptyApi = !loading && !error && rows.length === 0;
  const emptySearch = !loading && !error && rows.length > 0 && filteredRows.length === 0;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Activity Log"
        eyebrow="Master Admin"
        description="Platform-wide audit trail and administrative events"
        icon={<Activity className="w-4 h-4" />}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
        meta={
          meta ? (
            <>
              <span>{meta.total.toLocaleString()} total events</span>
              <span className="text-border">·</span>
              <span>
                Page {meta.page} of {totalPages}
              </span>
            </>
          ) : undefined
        }
      />

      {meta && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Total events" value={meta.total.toLocaleString()} status="info" />
          <MetricCard label="This page" value={filteredRows.length} status="neutral" />
          <MetricCard label="Page size" value={meta.limit} status="neutral" />
          <MetricCard label="Pages" value={totalPages} status="neutral" />
        </div>
      )}

      <DataCard title="Filters" flush>
        <div className="p-4 flex flex-col lg:flex-row gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg border min-w-[200px] bg-muted/50 border-border">
            <Search className="w-4 h-4 shrink-0 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search description…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <select
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setPage(1);
            }}
            className={`${INPUT} appearance-none cursor-pointer min-w-[150px]`}
            aria-label="Filter by entity"
          >
            {ENTITY_OPTIONS.map(([v, l]) => (
              <option key={v || 'all-e'} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className={`${INPUT} appearance-none cursor-pointer min-w-[140px]`}
            aria-label="Filter by action"
          >
            {ACTION_OPTIONS.map(([v, l]) => (
              <option key={v || 'all-a'} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </DataCard>

      <DataCard flush bodyClassName="relative min-h-[200px]">
        {loading && <SkeletonRows rows={8} />}
        {error && (
          <ErrorState error={error} onRetry={() => void load()} compact />
        )}
        {emptyApi && (
          <EmptyState
            icon={<Activity className="w-5 h-5" />}
            title="No activity found"
            description="Try adjusting your filters or check back later."
            compact
          />
        )}
        {emptySearch && (
          <EmptyState
            icon={<Search className="w-5 h-5" />}
            title="No matches"
            description="No activity matches your search on this page."
            compact
          />
        )}
        {!loading && !error && filteredRows.length > 0 && (
          <div className="divide-y divide-border">
            {filteredRows.map((entry) => {
              const Icon = entityIcon(entry.entity);
              const label = String(entry.action ?? '').replace(/_/g, ' ');
              const tone = activityActionTone(entry.action);
              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-4 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 sq-tone-brand">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start gap-2 justify-between">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <StatusChip tone={tone} dot>
                          {label}
                        </StatusChip>
                        <p className="text-sm font-semibold break-words text-foreground">
                          {entry.description}
                        </p>
                      </div>
                      <span
                        className="text-xs whitespace-nowrap shrink-0 text-muted-foreground tabular-nums"
                        title={entry.createdAt ? new Date(entry.createdAt).toLocaleString() : undefined}
                      >
                        {formatRelativeTime(entry.createdAt)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                      {entry.userName ? (
                        <span>
                          <span className="opacity-70">User </span>
                          <span className="font-medium text-foreground">{entry.userName}</span>
                        </span>
                      ) : null}
                      {entry.userName && entry.organizationName ? (
                        <span className="opacity-40">·</span>
                      ) : null}
                      {entry.organizationName ? (
                        <span className="flex items-center gap-1 min-w-0">
                          <Building2 className="w-3 h-3 shrink-0" />
                          <span className="truncate">{entry.organizationName}</span>
                        </span>
                      ) : null}
                      {!entry.userName && !entry.organizationName ? (
                        <span>System</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DataCard>

      {!loading && !error && meta && totalPages > 1 && (
        <DataCard flush>
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <div className="flex flex-wrap justify-center gap-1">
              {pages.map((item, idx) =>
                item === '…' ? (
                  <span key={idx} className="px-2 text-sm text-muted-foreground">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPage(item)}
                    className={`min-w-[2.25rem] px-2 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                      item === page
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-transparent text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </DataCard>
      )}
    </div>
  );
}
