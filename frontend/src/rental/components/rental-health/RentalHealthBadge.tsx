import { AlertCircle, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';
import { Icon } from '../ui/Icon';
import React from 'react';

import type {
  RentalHealthState,
  VehicleHealthResponse,
} from '../../../lib/api';
import {
  healthUnavailableMessage,
  isHealthPipelineDegraded,
  isRentalBlockedConfirmed,
} from '../../lib/rental-health-availability';

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
  /** Retained for call-site compatibility; theming is now token-driven. */
  isDarkMode?: boolean;
  size?: 'sm' | 'md';
  /** When true, shows a compact "Nicht vermietbar" pill instead of the state label. */
  showBlockingLabel?: boolean;
  className?: string;
}

interface StateVisuals {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Canonical tone class from theme.css (soft bg + fg, theme-aware). */
  tone: string;
}

// Rental-Health-V1 states fold onto the shared semantic scale so every
// surface shows the same colour for the same state:
//   good → success · warning → watch (amber) · critical → critical (red)
//   unknown → neutral · n_a → no-data (slate)
const STATE_VISUALS: Record<RentalHealthState, StateVisuals> = {
  good: { label: 'OK', Icon: CheckCircle, tone: 'sq-tone-success' },
  warning: { label: 'Warnung', Icon: AlertTriangle, tone: 'sq-tone-watch' },
  critical: { label: 'Kritisch', Icon: AlertCircle, tone: 'sq-tone-critical' },
  unknown: { label: 'Unbekannt', Icon: HelpCircle, tone: 'sq-tone-neutral' },
  n_a: { label: 'N/A', Icon: HelpCircle, tone: 'sq-tone-nodata' },
};

export function RentalHealthBadge({
  health,
  size = 'sm',
  showBlockingLabel = false,
  className = '',
}: RentalHealthBadgeProps) {
  if (!health) {
    return null;
  }

  const sz = size === 'sm' ? 'text-[10px] px-1.5 py-0.5 gap-1' : 'text-xs px-2 py-1 gap-1.5';
  const iconSz = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  if (isHealthPipelineDegraded(health)) {
    return (
      <span
        title={health.degradation?.message ?? healthUnavailableMessage('de')}
        className={`inline-flex items-center rounded-md border border-current/15 font-semibold sq-tone-nodata ${sz} ${className}`}
      >
        <HelpCircle className={iconSz} />
        Unevaluable
      </span>
    );
  }

  // Blocked takes visual priority — a vehicle that is rental-blocked is
  // never rendered as "just warning" even if one contributing module is
  // only at warning level (should not happen in practice, but defensive).
  if (isRentalBlockedConfirmed(health) && showBlockingLabel) {
    return (
      <span
        title={health.blocking_reasons.join(' · ')}
        className={`inline-flex items-center rounded-md border border-current/15 font-semibold sq-tone-critical ${sz} ${className}`}
      >
        <Icon name="ban" className={iconSz} />
        Nicht vermietbar
      </span>
    );
  }

  const visuals = STATE_VISUALS[health.overall_state];

  return (
    <span
      title={
        isRentalBlockedConfirmed(health)
          ? `Nicht vermietbar: ${health.blocking_reasons.join(' · ')}`
          : visuals.label
      }
      className={`inline-flex items-center rounded-md border border-current/15 font-semibold ${visuals.tone} ${sz} ${className}`}
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
}: {
  moduleKey: string;
  moduleHealth: {
    state: RentalHealthState;
    reason: string;
    last_updated_at: string | null;
    data_stale: boolean;
  };
  /** Retained for call-site compatibility; theming is now token-driven. */
  isDarkMode?: boolean;
}) {
  const visuals = STATE_VISUALS[moduleHealth.state];
  return (
    <div
      className={`flex items-start gap-2 px-2 py-1.5 rounded-md border border-current/10 ${visuals.tone}`}
    >
      <visuals.Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {MODULE_LABELS[moduleKey] ?? moduleKey}
        </div>
        <div className="text-xs text-foreground">
          {moduleHealth.reason}
        </div>
        {moduleHealth.data_stale ? (
          <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Icon name="clock" className="w-2.5 h-2.5" />
            Datenstand verzögert
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
