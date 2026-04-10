import {
  Activity,
  Building2,
  Calendar,
  Car,
  CreditCard,
  Cpu,
  LifeBuoy,
  Loader2,
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
import { api } from '../../lib/api';

export interface ActivityLogViewProps {
  isDarkMode: boolean;
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

const ENTITY_UI: Record<string, { Icon: LucideIcon; L: string; D: string }> = {
  ORGANIZATION: { Icon: Building2, L: 'text-blue-600 bg-blue-50', D: 'text-blue-400 bg-blue-500/15' },
  USER: { Icon: Users, L: 'text-purple-600 bg-purple-50', D: 'text-purple-400 bg-purple-500/15' },
  VEHICLE: { Icon: Car, L: 'text-indigo-600 bg-indigo-50', D: 'text-indigo-400 bg-indigo-500/15' },
  BOOKING: { Icon: Calendar, L: 'text-amber-600 bg-amber-50', D: 'text-amber-400 bg-amber-500/15' },
  CUSTOMER: { Icon: UserCircle, L: 'text-cyan-600 bg-cyan-50', D: 'text-cyan-400 bg-cyan-500/15' },
  PROSPECT: { Icon: UserPlus, L: 'text-fuchsia-600 bg-fuchsia-50', D: 'text-fuchsia-400 bg-fuchsia-500/15' },
  INTEGRATION: { Icon: Plug, L: 'text-teal-600 bg-teal-50', D: 'text-teal-400 bg-teal-500/15' },
  SUBSCRIPTION: { Icon: CreditCard, L: 'text-emerald-600 bg-emerald-50', D: 'text-emerald-400 bg-emerald-500/15' },
  STATION: { Icon: MapPin, L: 'text-orange-600 bg-orange-50', D: 'text-orange-400 bg-orange-500/15' },
  PRODUCT: { Icon: Package, L: 'text-slate-600 bg-slate-100', D: 'text-slate-300 bg-slate-500/15' },
  DIMO_VEHICLE: { Icon: Cpu, L: 'text-violet-600 bg-violet-50', D: 'text-violet-400 bg-violet-500/15' },
  SUPPORT_TICKET: { Icon: LifeBuoy, L: 'text-rose-600 bg-rose-50', D: 'text-rose-400 bg-rose-500/15' },
};

const ACTION_BADGE: Record<string, { L: string; D: string }> = {
  CREATE: { L: 'bg-emerald-50 text-emerald-800 border-emerald-200', D: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  UPDATE: { L: 'bg-blue-50 text-blue-800 border-blue-200', D: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  DELETE: { L: 'bg-red-50 text-red-800 border-red-200', D: 'bg-red-500/15 text-red-300 border-red-500/30' },
  LOGIN: { L: 'bg-purple-50 text-purple-800 border-purple-200', D: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  LOGOUT: { L: 'bg-slate-100 text-slate-800 border-slate-200', D: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  CONNECT: { L: 'bg-teal-50 text-teal-800 border-teal-200', D: 'bg-teal-500/15 text-teal-300 border-teal-500/30' },
  DISCONNECT: { L: 'bg-orange-50 text-orange-800 border-orange-200', D: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  REGISTER: { L: 'bg-green-50 text-green-800 border-green-200', D: 'bg-green-500/15 text-green-300 border-green-500/30' },
  IMPORT: { L: 'bg-cyan-50 text-cyan-800 border-cyan-200', D: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  CONVERT: { L: 'bg-amber-50 text-amber-900 border-amber-200', D: 'bg-amber-500/15 text-amber-200 border-amber-500/30' },
  SYNC: { L: 'bg-indigo-50 text-indigo-800 border-indigo-200', D: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  CANCEL: { L: 'bg-rose-50 text-rose-800 border-rose-200', D: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
};

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

function entityRow(entity: string) {
  const key = (entity || '').toUpperCase();
  return ENTITY_UI[key] ?? { Icon: Activity, L: 'text-gray-600 bg-gray-100', D: 'text-gray-400 bg-neutral-500/15' };
}

function badgeClass(isDark: boolean, action: string): string {
  const a = (action || '').toUpperCase();
  const pair = ACTION_BADGE[a] ?? { L: 'bg-gray-100 text-gray-800 border-gray-200', D: 'bg-neutral-500/15 text-gray-300 border-neutral-600/40' };
  return `inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${isDark ? pair.D : pair.L}`;
}

export function ActivityLogView({ isDarkMode }: ActivityLogViewProps) {
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

  const card = 'bg-card border border-border rounded-lg shadow-xs';
  const field = 'px-3 py-2 rounded-md border text-sm font-semibold bg-muted border-border text-foreground';
  const totalPages = meta?.totalPages ?? 1;
  const pages = pageList(page, totalPages);
  const emptyApi = !loading && !error && rows.length === 0;
  const emptySearch = !loading && !error && rows.length > 0 && filteredRows.length === 0;

  return (
    <div className="space-y-4 pb-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Activity Log</h1>
        <p className="text-sm mt-1 font-medium text-muted-foreground">
          Platform-wide audit trail and administrative events
        </p>
      </div>

      <div className={`${card} p-4`}>
        <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-md border min-w-[200px] bg-muted border-border">
            <Search className={`w-4 h-4 shrink-0 text-muted-foreground`} />
            <input
              type="text"
              placeholder="Search description…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`flex-1 bg-transparent outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground`}
            />
          </div>
          <select
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setPage(1);
            }}
            className={`${field} appearance-none cursor-pointer min-w-[150px]`}
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
            className={`${field} appearance-none cursor-pointer min-w-[140px]`}
            aria-label="Filter by action"
          >
            {ACTION_OPTIONS.map(([v, l]) => (
              <option key={v || 'all-a'} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm font-semibold disabled:opacity-50 bg-muted border-border text-foreground hover:bg-muted/80"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className={`${card} overflow-hidden relative min-h-[200px]`}>
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-card/70">
            <Loader2 className={`w-8 h-8 animate-spin text-muted-foreground`} />
            <span className="text-sm font-medium text-muted-foreground">Loading activity…</span>
          </div>
        )}
        {error && <div className="px-6 py-8 text-center text-sm text-destructive">{error}</div>}
        {emptyApi && <div className={`px-6 py-16 text-center text-sm font-medium text-muted-foreground`}>No activity found</div>}
        {emptySearch && <div className={`px-6 py-16 text-center text-sm font-medium text-muted-foreground`}>No activity matches your search</div>}
        {!loading && !error && filteredRows.length > 0 && (
          <div className="divide-y divide-border">
            {filteredRows.map((entry) => {
              const { Icon, L, D } = entityRow(entry.entity);
              const shell = isDarkMode ? D : L;
              const iconTint = shell.split(' ')[0];
              const label = String(entry.action ?? '').replace(/_/g, ' ');
              return (
                <div key={entry.id} className="flex items-start gap-4 px-5 py-2.5 hover:bg-muted/50">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${shell}`}>
                    <Icon className={`w-4 h-4 ${iconTint}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start gap-2 justify-between">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className={badgeClass(isDarkMode, String(entry.action))}>{label}</span>
                        <p className={`text-sm font-semibold break-words text-foreground`}>{entry.description}</p>
                      </div>
                      <span className={`text-xs whitespace-nowrap shrink-0 text-muted-foreground`} title={entry.createdAt ? new Date(entry.createdAt).toLocaleString() : undefined}>
                        {formatRelativeTime(entry.createdAt)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
                      {entry.userName ? (
                        <span className="text-muted-foreground">
                          <span className="text-muted-foreground/70">User </span>
                          <span className="font-medium text-foreground">{entry.userName}</span>
                        </span>
                      ) : null}
                      {entry.userName && entry.organizationName ? <span className="text-muted-foreground/50">·</span> : null}
                      {entry.organizationName ? (
                        <span className="flex items-center gap-1 min-w-0">
                          <Building2 className="w-3 h-3 shrink-0 text-muted-foreground" />
                          <span className="truncate text-muted-foreground">{entry.organizationName}</span>
                        </span>
                      ) : null}
                      {!entry.userName && !entry.organizationName ? <span className="text-muted-foreground">System</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!loading && !error && meta && totalPages > 1 && (
        <div className={`${card} px-4 py-3 flex flex-wrap items-center justify-between gap-3`}>
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className={`px-3 py-2 rounded-xl text-sm font-bold border disabled:opacity-40 ${isDarkMode ? 'border-neutral-700/50 text-gray-200 hover:bg-neutral-800/50' : 'border-gray-200/80 text-gray-800 hover:bg-gray-50'}`}>
            Previous
          </button>
          <div className="flex flex-wrap justify-center gap-1">
            {pages.map((item, idx) =>
              item === '…' ? (
                <span key={idx} className={`px-2 text-sm text-muted-foreground`}>
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPage(item)}
                  className={`min-w-[2.25rem] px-2 py-2 rounded-lg text-sm font-semibold border ${item === page ? 'bg-primary text-primary-foreground border-primary' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}
                >
                  {item}
                </button>
              ),
            )}
          </div>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-2 rounded-lg text-sm font-semibold border border-border disabled:opacity-40 text-foreground hover:bg-muted/50">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
