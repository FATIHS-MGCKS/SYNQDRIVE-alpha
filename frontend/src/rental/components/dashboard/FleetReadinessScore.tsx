import { dt } from './dashboard-i18n';
import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { readinessStatusTone } from './controlSignalsBuilder';
import {
  DashboardPanelHeader,
  PANEL_BODY_CLASS,
  panelShellClass,
} from './dashboardShell';
import type { DashboardViewModel, FleetReadinessBreakdown } from './dashboardTypes';

interface FleetReadinessScoreProps {
  vm: DashboardViewModel;
}

function BreakdownRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'watch' | 'critical' | 'neutral';
}) {
  if (value <= 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-[12.5px]">
      <span className="text-muted-foreground">{label}</span>
      <StatusChip tone={tone ?? 'neutral'} className="!min-w-[30px] justify-center tabular-nums">
        {value}
      </StatusChip>
    </div>
  );
}
function breakdownRows(b: FleetReadinessBreakdown, de: boolean) {
  return (
    <>
      <BreakdownRow label={dt(locale, 'dashboard.label.ready')} value={b.ready} tone="success" />
      <BreakdownRow label={dt(locale, 'dashboard.label.blocked')} value={b.blocked} tone="critical" />
      <BreakdownRow label={dt(locale, 'dashboard.fleet.overdueReturns')} value={b.overdueReturns} tone="critical" />
      <BreakdownRow label={dt(locale, 'dashboard.fleet.criticalAlerts')} value={b.criticalAlerts} tone="critical" />
      <BreakdownRow label={dt(locale, 'dashboard.fleet.cleaningPending')} value={b.cleaningNeeded} tone="watch" />
      <BreakdownRow label={dt(locale, 'dashboard.fleet.softOffline')} value={b.softOfflineCount} tone="watch" />
      <BreakdownRow label={dt(locale, 'dashboard.label.offline')} value={b.offlineCount} tone="critical" />
      <BreakdownRow label={dt(locale, 'dashboard.label.conflicts')} value={b.conflicts} tone="watch" />
    </>
  );
}

export function FleetReadinessScore({ vm }: FleetReadinessScoreProps) {
  const { fleetReadiness, locale } = vm;
  const de = locale === 'de';
  const { breakdown, status, statusLabel, scorePercent, hasReliableBasis } = fleetReadiness;
  const tone = readinessStatusTone(status);

  return (
    <section
      className={panelShellClass('secondary', 'h-full')}
      aria-label={dt(locale, 'dashboard.fleet.readinessAria')}
    >
      <DashboardPanelHeader
        icon={<Icon name="gauge" className="h-4 w-4" />}
        iconToneClass="sq-tone-success"
        title={dt(locale, 'dashboard.fleet.readinessTitle')}
        subtitle={dt(locale, 'dashboard.fleet.readinessSubtitle')}
        trailing={
          <StatusChip tone={tone} className="uppercase">
            {statusLabel}
          </StatusChip>
        }
      />

      <div className={cn(PANEL_BODY_CLASS, 'flex flex-1 flex-col gap-3')}>
        {scorePercent != null && hasReliableBasis ? (
          <p className="text-[12.5px] text-muted-foreground text-pretty">
            {dt(locale, 'dashboard.label.orientation')}:{' '}
            <span className="text-[15px] font-bold tabular-nums text-foreground">{scorePercent}%</span>{' '}
            {dt(locale, 'dashboard.label.readyInScope')}
          </p>
        ) : (
          <p className="text-[12.5px] text-muted-foreground text-pretty">
            {status === 'not-enough-data'
              ? de
                ? 'Nicht genug Daten für eine Bewertung.'
                : 'Not enough data for a score.'
              : de
                ? 'Kein Prozent-Score — Datenbasis zu schwach oder unvollständig.'
                : 'No percent score — data basis is partial or weak.'}
          </p>
        )}

        <div className="space-y-2">{breakdownRows(breakdown, de)}</div>
      </div>
    </section>
  );
}
