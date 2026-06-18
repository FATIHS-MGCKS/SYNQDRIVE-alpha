import { MetricCard, StatusChip } from '../../../components/patterns';
import { Icon } from '../ui/Icon';
import type { DamageControlStats } from './damage-control.utils';
import { formatEstimatedOpenCost, formatOldestOpenAge } from './damage-control.utils';
import { damageRentalGateTone, isDamageRentalBlocked } from '../../lib/damage-rental-impact';

interface DamageControlSummaryProps {
  stats: DamageControlStats;
  onCreateRepairTask?: () => void;
  createRepairTaskBusy?: boolean;
  showRepairTaskCta?: boolean;
}

export function DamageControlSummary({
  stats,
  onCreateRepairTask,
  createRepairTaskBusy,
  showRepairTaskCta,
}: DamageControlSummaryProps) {
  const oldest = formatOldestOpenAge(stats.oldestOpenDamageAt);
  const gateTone = damageRentalGateTone(stats.rentalGate);
  const blocked = isDamageRentalBlocked(stats.rentalGate);

  return (
    <div className="space-y-3">
      <div
        className={`sq-card rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 backdrop-blur-md ${
          gateTone === 'critical'
            ? 'border-red-500/30 bg-red-500/8'
            : gateTone === 'warning'
              ? 'border-amber-500/25 bg-amber-500/5'
              : 'border-emerald-500/20 bg-emerald-500/5'
        }`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              gateTone === 'critical'
                ? 'sq-tone-critical'
                : gateTone === 'warning'
                  ? 'sq-tone-warning'
                  : 'sq-tone-success'
            }`}
          >
            <Icon
              name={
                gateTone === 'critical'
                  ? 'shield-alert'
                  : gateTone === 'warning'
                    ? 'alert-triangle'
                    : 'check-circle-2'
              }
              className="w-5 h-5"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">
              Rental status
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{stats.rentabilityLabel}</p>
            {blocked && stats.open > 0 && (
              <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                {stats.safetyCritical > 0
                  ? `${stats.safetyCritical} safety-critical · ${stats.blockingRental} rental block${stats.blockingRental === 1 ? '' : 's'}`
                  : `${stats.blockingRental} active damage${stats.blockingRental === 1 ? '' : 's'} block rental`}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <StatusChip tone={gateTone === 'critical' ? 'critical' : gateTone === 'warning' ? 'warning' : 'success'}>
            {stats.rentabilityLabel}
          </StatusChip>
          {blocked && showRepairTaskCta && onCreateRepairTask && (
            <button
              type="button"
              disabled={createRepairTaskBusy}
              onClick={onCreateRepairTask}
              className="sq-cta px-3 py-2 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Icon name="wrench" className="w-3.5 h-3.5" />
              {createRepairTaskBusy ? 'Creating…' : 'Create repair task'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-2">
        <MetricCard
          label="Open"
          value={stats.open}
          status={stats.open > 0 ? 'warning' : 'success'}
          hint="Active repair queue"
          icon={<Icon name="alert-triangle" className="w-4 h-4" />}
        />
        <MetricCard
          label="Rental blocking"
          value={stats.blockingRental}
          status={stats.blockingRental > 0 ? 'critical' : 'neutral'}
          hint="Blocks new bookings"
          icon={<Icon name="ban" className="w-4 h-4" />}
        />
        <MetricCard
          label="Safety critical"
          value={stats.safetyCritical}
          status={stats.safetyCritical > 0 ? 'critical' : 'neutral'}
          hint="Immediate attention"
          icon={<Icon name="shield-alert" className="w-4 h-4" />}
        />
        <MetricCard
          label="Missing evidence"
          value={stats.missingEvidence}
          status={stats.missingEvidence > 0 ? 'warning' : 'neutral'}
          hint="No photos yet"
          icon={<Icon name="camera" className="w-4 h-4" />}
        />
        <MetricCard
          label="Unplaced"
          value={stats.unplaced}
          status={stats.unplaced > 0 ? 'warning' : 'neutral'}
          hint="No map position"
          icon={<Icon name="map-pin" className="w-4 h-4" />}
        />
        <MetricCard
          label="Est. open cost"
          value={formatEstimatedOpenCost(stats.estimatedOpenCostCents)}
          status="neutral"
          hint="Active damages"
          icon={<Icon name="euro" className="w-4 h-4" />}
        />
        <MetricCard
          label="Oldest open"
          value={oldest ?? '—'}
          status={oldest && oldest !== 'Today' ? 'warning' : 'neutral'}
          hint="Age of oldest open case"
          icon={<Icon name="clock" className="w-4 h-4" />}
          className="col-span-2 sm:col-span-1"
        />
      </div>
    </div>
  );
}
