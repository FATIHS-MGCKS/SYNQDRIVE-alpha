import React from 'react';
import { AlertTriangle, AlertCircle, CheckCircle, HelpCircle, Ban, Clock } from 'lucide-react';
import type {
  RentalHealthState,
  VehicleHealthResponse,
} from '../../../lib/api';

/**
 * V4.6.76 Rental Health V1 — compact badge.
 *
 * One deterministic render path for every surface (Fleet list, Bookings
 * list, Vehicle Detail header, Booking detail sheet). Use this component
 * instead of inlining state-to-color mappings; the spec is specific
 * about what each HealthState means and how it renders.
 *
 * The component is intentionally visual-only — it does NOT launch any
 * modals or popovers. Surfaces that need a drill-down popover should
 * compose it with their own click handler and a detail panel.
 */

interface RentalHealthBadgeProps {
  health: VehicleHealthResponse | null | undefined;
  isDarkMode: boolean;
  size?: 'sm' | 'md';
  /** When true, shows a compact "Nicht vermietbar" pill instead of the state label. */
  showBlockingLabel?: boolean;
  className?: string;
}

interface StateVisuals {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  light: { bg: string; text: string; border: string };
  dark: { bg: string; text: string; border: string };
}

const STATE_VISUALS: Record<RentalHealthState, StateVisuals> = {
  good: {
    label: 'OK',
    Icon: CheckCircle,
    light: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    dark: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/20' },
  },
  warning: {
    label: 'Warnung',
    Icon: AlertTriangle,
    light: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    dark: { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/20' },
  },
  critical: {
    label: 'Kritisch',
    Icon: AlertCircle,
    light: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
    dark: { bg: 'bg-rose-500/10', text: 'text-rose-300', border: 'border-rose-500/20' },
  },
  unknown: {
    label: 'Unbekannt',
    Icon: HelpCircle,
    light: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
    dark: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' },
  },
  n_a: {
    label: 'N/A',
    Icon: HelpCircle,
    light: { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' },
    dark: { bg: 'bg-gray-500/5', text: 'text-gray-500', border: 'border-gray-500/10' },
  },
};

export function RentalHealthBadge({
  health,
  isDarkMode,
  size = 'sm',
  showBlockingLabel = false,
  className = '',
}: RentalHealthBadgeProps) {
  if (!health) {
    return null;
  }

  // Blocked takes visual priority — a vehicle that is rental-blocked is
  // never rendered as "just warning" even if one contributing module is
  // only at warning level (should not happen in practice, but defensive).
  if (health.rental_blocked && showBlockingLabel) {
    const light = 'bg-rose-50 text-rose-700 border-rose-200';
    const dark = 'bg-rose-500/10 text-rose-300 border-rose-500/20';
    const sz = size === 'sm' ? 'text-[10px] px-1.5 py-0.5 gap-1' : 'text-xs px-2 py-1 gap-1.5';
    const iconSz = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
    return (
      <span
        title={health.blocking_reasons.join(' · ')}
        className={`inline-flex items-center rounded-md border font-semibold ${sz} ${
          isDarkMode ? dark : light
        } ${className}`}
      >
        <Ban className={iconSz} />
        Nicht vermietbar
      </span>
    );
  }

  const visuals = STATE_VISUALS[health.overall_state];
  const palette = isDarkMode ? visuals.dark : visuals.light;
  const sz = size === 'sm' ? 'text-[10px] px-1.5 py-0.5 gap-1' : 'text-xs px-2 py-1 gap-1.5';
  const iconSz = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      title={
        health.rental_blocked
          ? `Nicht vermietbar: ${health.blocking_reasons.join(' · ')}`
          : visuals.label
      }
      className={`inline-flex items-center rounded-md border font-semibold ${sz} ${palette.bg} ${palette.text} ${palette.border} ${className}`}
    >
      <visuals.Icon className={iconSz} />
      {visuals.label}
    </span>
  );
}

/**
 * Compact inline row for a single module — used inside popovers / detail
 * sheets to expose the full 7-module breakdown. Shows state, reason, and
 * the data_stale marker when relevant.
 */
export function RentalHealthModuleRow({
  moduleKey,
  moduleHealth,
  isDarkMode,
}: {
  moduleKey: string;
  moduleHealth: {
    state: RentalHealthState;
    reason: string;
    last_updated_at: string | null;
    data_stale: boolean;
  };
  isDarkMode: boolean;
}) {
  const visuals = STATE_VISUALS[moduleHealth.state];
  const palette = isDarkMode ? visuals.dark : visuals.light;
  return (
    <div
      className={`flex items-start gap-2 px-2 py-1.5 rounded-md border ${palette.bg} ${palette.border}`}
    >
      <visuals.Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${palette.text}`} />
      <div className="min-w-0 flex-1">
        <div
          className={`text-[11px] font-semibold uppercase tracking-wide ${
            isDarkMode ? 'text-gray-400' : 'text-gray-500'
          }`}
        >
          {MODULE_LABELS[moduleKey] ?? moduleKey}
        </div>
        <div className={`text-xs ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
          {moduleHealth.reason}
        </div>
        {moduleHealth.data_stale ? (
          <div
            className={`mt-0.5 inline-flex items-center gap-1 text-[10px] ${
              isDarkMode ? 'text-gray-500' : 'text-gray-400'
            }`}
          >
            <Clock className="w-2.5 h-2.5" />
            Daten veraltet
          </div>
        ) : null}
      </div>
    </div>
  );
}

const MODULE_LABELS: Record<string, string> = {
  battery: 'Batterie',
  tires: 'Reifen',
  brakes: 'Bremsen',
  error_codes: 'Fehlercodes',
  service_compliance: 'Service & Prüfung',
  complaints: 'Reklamationen',
  vehicle_alerts: 'OEM-Warnleuchten',
};
