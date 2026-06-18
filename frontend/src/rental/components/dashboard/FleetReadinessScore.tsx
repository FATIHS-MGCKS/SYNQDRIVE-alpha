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
    <div className="flex items-center justify-between gap-2 text-[10px]">
      <span className="text-muted-foreground">{label}</span>
      <StatusChip tone={tone ?? 'neutral'} className="!min-w-[28px] justify-center text-[10px] tabular-nums">
        {value}
      </StatusChip>
    </div>
  );
}
function breakdownRows(b: FleetReadinessBreakdown, de: boolean) {
  return (
    <>
      <BreakdownRow label={de ? 'Bereit' : 'Ready'} value={b.ready} tone="success" />
      <BreakdownRow label={de ? 'Blockiert' : 'Blocked'} value={b.blocked} tone="critical" />
      <BreakdownRow label={de ? 'Überfällige Returns' : 'Overdue returns'} value={b.overdueReturns} tone="critical" />
      <BreakdownRow label={de ? 'Kritische Alerts' : 'Critical alerts'} value={b.criticalAlerts} tone="critical" />
      <BreakdownRow label={de ? 'Reinigung offen' : 'Cleaning pending'} value={b.cleaningNeeded} tone="watch" />
      <BreakdownRow label={de ? 'Stale/Offline Daten' : 'Stale/offline data'} value={b.staleData} tone="watch" />
      <BreakdownRow label={de ? 'Konflikte' : 'Conflicts'} value={b.conflicts} tone="watch" />
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
      aria-label={de ? 'Flotten-Einsatzbereitschaft' : 'Fleet readiness'}
    >
      <DashboardPanelHeader
        icon={<Icon name="gauge" className="h-4 w-4" />}
        iconToneClass="sq-tone-success"
        title={de ? 'Einsatzbereitschaft' : 'Fleet readiness'}
        subtitle={de ? 'Nachvollziehbar aus Flottenzustand' : 'Derived from fleet state'}
        trailing={
          <StatusChip tone={tone} className="text-[10px] uppercase">
            {statusLabel}
          </StatusChip>
        }
      />

      <div className={cn(PANEL_BODY_CLASS, 'flex flex-1 flex-col gap-3')}>
        {scorePercent != null && hasReliableBasis ? (          <p className="text-[11px] text-muted-foreground">
            {de ? 'Orientierungswert' : 'Orientation'}:{' '}
            <span className="font-semibold tabular-nums text-foreground">{scorePercent}%</span>{' '}
            {de ? 'bereit im Scope' : 'ready in scope'}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {status === 'not-enough-data'
              ? de
                ? 'Nicht genug Daten für eine Bewertung.'
                : 'Not enough data for a score.'
              : de
                ? 'Kein Prozent-Score — Datenbasis zu schwach oder unvollständig.'
                : 'No percent score — data basis is partial or weak.'}
          </p>
        )}

        <div className="space-y-1.5">{breakdownRows(breakdown, de)}</div>      </div>
    </section>
  );
}
