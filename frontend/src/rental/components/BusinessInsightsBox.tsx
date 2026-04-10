import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle,
  Clock,
  Info,
  Loader2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';

// ─── Types (mirrors backend DashboardInsightsResponse) ───────────────

type InsightSeverity = 'CRITICAL' | 'WARNING' | 'OPPORTUNITY' | 'INFO';
type InsightType =
  | 'TIGHT_HANDOVER'
  | 'RETURN_NEEDS_INSPECTION'
  | 'STATION_SHORTAGE'
  | 'LOW_UTILIZATION'
  | 'SERVICE_WINDOW'
  | 'SERVICE_BEFORE_BOOKING';

interface DashboardInsight {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  priority: number;
  title: string;
  message: string;
  actionLabel?: string | null;
  actionType?: string | null;
  entityIds?: string[] | null;
  timeContext?: Record<string, string> | null;
  metrics?: Record<string, any> | null;
  reasons?: string[] | null;
  isGrouped: boolean;
  groupCount: number;
  createdAt: string;
}

interface InsightsResponse {
  generatedAt: string;
  summary: { total: number; critical: number; warning: number; opportunity: number; info: number };
  insights: DashboardInsight[];
}

// ─── Severity config ─────────────────────────────────────────────────

interface SeverityStyle {
  icon: LucideIcon;
  label: string;
  card: { light: string; dark: string };
  badge: { light: string; dark: string };
  icon_color: { light: string; dark: string };
  text: { light: string; dark: string };
}

const SEVERITY_CONFIG: Record<InsightSeverity, SeverityStyle> = {
  CRITICAL: {
    icon: AlertTriangle,
    label: 'Critical',
    card: {
      light: 'bg-red-50/60 border-red-200/40',
      dark: 'bg-red-900/15 border-red-800/20',
    },
    badge: {
      light: 'bg-red-500/15 text-red-600',
      dark: 'bg-red-500/20 text-red-400',
    },
    icon_color: { light: 'text-red-600', dark: 'text-red-400' },
    text: { light: 'text-red-700', dark: 'text-red-400' },
  },
  WARNING: {
    icon: Clock,
    label: 'Attention',
    card: {
      light: 'bg-orange-50/60 border-orange-200/40',
      dark: 'bg-orange-900/15 border-orange-800/20',
    },
    badge: {
      light: 'bg-orange-500/15 text-orange-600',
      dark: 'bg-orange-500/20 text-orange-400',
    },
    icon_color: { light: 'text-orange-600', dark: 'text-orange-400' },
    text: { light: 'text-orange-700', dark: 'text-orange-400' },
  },
  OPPORTUNITY: {
    icon: Calendar,
    label: 'Opportunity',
    card: {
      light: 'bg-blue-50/60 border-blue-200/40',
      dark: 'bg-blue-900/15 border-blue-800/20',
    },
    badge: {
      light: 'bg-blue-500/15 text-blue-600',
      dark: 'bg-blue-500/20 text-blue-400',
    },
    icon_color: { light: 'text-blue-600', dark: 'text-blue-400' },
    text: { light: 'text-blue-700', dark: 'text-blue-400' },
  },
  INFO: {
    icon: Info,
    label: 'Info',
    card: {
      light: 'bg-gray-50/60 border-gray-200/40',
      dark: 'bg-neutral-800/40 border-neutral-700/30',
    },
    badge: {
      light: 'bg-gray-500/15 text-gray-600',
      dark: 'bg-neutral-500/20 text-neutral-400',
    },
    icon_color: { light: 'text-gray-600', dark: 'text-neutral-400' },
    text: { light: 'text-gray-700', dark: 'text-neutral-400' },
  },
};

// ─── Component ───────────────────────────────────────────────────────

interface BusinessInsightsBoxProps {
  isDarkMode: boolean;
}

export function BusinessInsightsBox({ isDarkMode }: BusinessInsightsBoxProps) {
  const { orgId } = useRentalOrg();
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchInsights = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.dashboardInsights.get(orgId);
      if (res && typeof res === 'object' && Array.isArray((res as any).insights)) {
        setData(res as InsightsResponse);
      } else {
        setData({ generatedAt: new Date().toISOString(), summary: { total: 0, critical: 0, warning: 0, opportunity: 0, info: 0 }, insights: [] });
      }
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchInsights();
    const interval = setInterval(fetchInsights, 5 * 60_000);
    return () => clearInterval(interval);
  }, [fetchInsights]);

  const dm = isDarkMode;
  const cardBase = `rounded-lg p-4 border shadow-sm ${dm ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`;

  return (
    <div className={cardBase}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${dm ? 'bg-blue-600/20' : 'bg-blue-100/80'}`}>
            <Sparkles className={`w-4 h-4 ${dm ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
          <div>
            <h3 className={`text-sm font-semibold leading-tight ${dm ? 'text-white' : 'text-gray-900'}`}>
              Business Insights
            </h3>
            {data && !loading && data.insights.length > 0 && (
              <p className={`text-[10px] mt-0.5 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
                {formatRelativeTime(data.generatedAt)}
              </p>
            )}
          </div>
        </div>
        {data && !loading && data.summary.critical > 0 && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${dm ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600'}`}>
            {data.summary.critical} critical
          </span>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <LoadingState isDarkMode={dm} />
      ) : error ? (
        <ErrorState isDarkMode={dm} onRetry={fetchInsights} />
      ) : !data || data.insights.length === 0 ? (
        <EmptyState isDarkMode={dm} />
      ) : (
        <div className="space-y-2">
          {data.insights.slice(0, 4).map((insight) => (
            <InsightRow key={insight.id} insight={insight} isDarkMode={dm} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Insight Row ─────────────────────────────────────────────────────

function InsightRow({ insight, isDarkMode }: { insight: DashboardInsight; isDarkMode: boolean }) {
  const severity = SEVERITY_CONFIG[insight.severity] ?? SEVERITY_CONFIG.INFO;
  const SeverityIcon = severity.icon;
  const dm = isDarkMode;
  const hasAction = !!insight.actionLabel && !!insight.actionType;

  const title = safeTruncate(insight.title, 36);
  const message = safeTruncate(insight.message, 140);

  return (
    <div
      className={`rounded-lg p-3 border transition-colors ${dm ? severity.card.dark : severity.card.light} ${
        hasAction ? 'cursor-pointer hover:brightness-95' : ''
      }`}
      role={hasAction ? 'button' : undefined}
      tabIndex={hasAction ? 0 : undefined}
      onKeyDown={hasAction ? (e) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); } : undefined}
    >
      <div className="flex items-start gap-2.5">
        <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${dm ? 'bg-black/20' : 'bg-white'}`}>
          <SeverityIcon className={`w-3.5 h-3.5 ${dm ? severity.icon_color.dark : severity.icon_color.light}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-xs font-semibold truncate ${dm ? severity.text.dark : severity.text.light}`}>
              {title}
            </span>
            <span className={`text-[10px] px-1.5 py-px rounded-full font-medium shrink-0 ${dm ? severity.badge.dark : severity.badge.light}`}>
              {severity.label}
            </span>
          </div>

          <p className={`text-[11px] leading-relaxed ${dm ? 'text-gray-400' : 'text-gray-600'}`}>
            {message}
          </p>

          {hasAction && (
            <div className="mt-1.5 flex items-center gap-1">
              <span className={`text-[10px] font-medium ${dm ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>
                {insight.actionLabel}
              </span>
              <ArrowRight className={`w-3 h-3 ${dm ? 'text-gray-600' : 'text-gray-400'}`} />
            </div>
          )}
        </div>

        {insight.isGrouped && insight.groupCount > 1 && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${dm ? 'bg-neutral-700/60 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
            {insight.groupCount}x
          </span>
        )}
      </div>
    </div>
  );
}

// ─── State components ────────────────────────────────────────────────

function LoadingState({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`rounded-lg p-3 border animate-pulse ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700/30' : 'bg-gray-50/60 border-gray-200/40'}`}
        >
          <div className="flex items-start gap-2.5">
            <div className={`w-6 h-6 rounded-md ${isDarkMode ? 'bg-neutral-700/60' : 'bg-gray-200/60'}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-3 rounded w-1/3 ${isDarkMode ? 'bg-neutral-700/60' : 'bg-gray-200/60'}`} />
              <div className={`h-2.5 rounded w-4/5 ${isDarkMode ? 'bg-neutral-700/40' : 'bg-gray-200/40'}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className={`rounded-lg border p-6 text-center ${isDarkMode ? 'bg-neutral-800/30 border-neutral-700/30' : 'bg-gray-50/40 border-gray-200/40'}`}>
      <CheckCircle className={`w-5 h-5 mx-auto mb-2 ${isDarkMode ? 'text-green-500/60' : 'text-green-500/50'}`} />
      <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        No open items right now
      </p>
      <p className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
        Insights will appear when action is needed
      </p>
    </div>
  );
}

function ErrorState({ isDarkMode, onRetry }: { isDarkMode: boolean; onRetry: () => void }) {
  return (
    <div className={`rounded-lg border p-4 text-center ${isDarkMode ? 'bg-neutral-800/30 border-neutral-700/30' : 'bg-gray-50/40 border-gray-200/40'}`}>
      <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
        Could not load insights
      </p>
      <button
        onClick={onRetry}
        className={`mt-2 text-[10px] font-medium px-2.5 py-1 rounded-md transition-colors ${isDarkMode ? 'bg-neutral-700 text-gray-300 hover:bg-neutral-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
      >
        Retry
      </button>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function safeTruncate(s: string | undefined | null, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

function formatRelativeTime(iso: string | undefined | null): string {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60_000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return '';
  }
}
