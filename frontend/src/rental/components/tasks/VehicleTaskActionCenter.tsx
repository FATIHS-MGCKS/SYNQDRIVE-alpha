import type { NextBestAction } from '../../lib/task-operator.utils';
import {
  formatHoursUntilPickup,
  taskBlockingBadgeLabel,
  type VehicleNextBookingContext,
} from '../../lib/task-operator.utils';
import { formatTaskDueDate } from '../../lib/task-display.utils';
import { Icon } from '../ui/Icon';

interface VehicleTaskActionCenterProps {
  nextAction: NextBestAction | null;
  nextBooking: VehicleNextBookingContext | null;
  blockingCount: number;
  activeCount: number;
  overdueCount: number;
  onOpenTask: (taskId: string) => void;
  onCreateTask: () => void;
  canCreate: boolean;
}

export function VehicleTaskActionCenter({
  nextAction,
  nextBooking,
  blockingCount,
  activeCount,
  overdueCount,
  onOpenTask,
  onCreateTask,
  canCreate,
}: VehicleTaskActionCenterProps) {
  return (
    <div className="surface-premium rounded-xl p-3 sm:p-4 shadow-[var(--shadow-1)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-4">
        {/* Next best action — primary focus */}
        <div className="min-w-0 flex-1 rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <Icon name="zap" className="w-3.5 h-3.5 text-[color:var(--brand)] shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Nächste Aktion
            </span>
          </div>
          {nextAction ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground truncate leading-snug">
                  {nextAction.task.title}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                  {nextAction.reason}
                  <span className="text-muted-foreground/70">
                    {' '}
                    · Fällig {formatTaskDueDate(nextAction.task.dueDate)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenTask(nextAction.task.id)}
                className="sq-cta shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold transition-opacity hover:opacity-90"
              >
                {nextAction.label}
                <Icon name="arrow-right" className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              {activeCount === 0
                ? 'Keine aktiven Aufgaben — Fahrzeug ist operativ frei.'
                : 'Keine priorisierte Aktion ermittelbar.'}
            </p>
          )}
        </div>

        {/* Operational context — compact stats */}
        <div className="flex flex-row flex-wrap lg:flex-col gap-2 lg:w-[200px] shrink-0">
          <StatPill
            icon="shield-alert"
            label="Blockiert"
            value={blockingCount > 0 ? String(blockingCount) : '—'}
            tone={blockingCount > 0 ? 'critical' : 'neutral'}
          />
          <StatPill
            icon="clock"
            label="Überfällig"
            value={overdueCount > 0 ? String(overdueCount) : '—'}
            tone={overdueCount > 0 ? 'warning' : 'neutral'}
          />
          <StatPill
            icon="clipboard-list"
            label="Aktiv"
            value={String(activeCount)}
            tone={activeCount > 0 ? 'info' : 'neutral'}
          />
        </div>

        {/* Next booking — when available */}
        {nextBooking && (
          <div className="lg:w-[220px] shrink-0 rounded-lg border border-border/60 surface-premium px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon name="calendar" className="w-3.5 h-3.5 text-[color:var(--brand)]" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Nächste Buchung
              </span>
            </div>
            <p className="text-[12px] font-medium text-foreground leading-snug">{nextBooking.pickupLabel}</p>
            {nextBooking.customerLabel && (
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{nextBooking.customerLabel}</p>
            )}
            <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
              in {formatHoursUntilPickup(nextBooking.hoursUntilPickup)}
            </p>
          </div>
        )}

        {/* Create CTA — desktop sidebar of strip */}
        <div className="flex items-end lg:w-[148px] shrink-0">
          <button
            type="button"
            onClick={onCreateTask}
            disabled={!canCreate}
            title={canCreate ? 'Neue Aufgabe für dieses Fahrzeug anlegen' : 'Fahrzeugkontext fehlt'}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border surface-premium px-3 py-2 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed sq-press"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            Neue Aufgabe
          </button>
        </div>
      </div>
    </div>
  );
}

function StatPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  tone: 'info' | 'warning' | 'critical' | 'neutral';
}) {
  const toneClass =
    tone === 'critical'
      ? 'text-[color:var(--status-critical)]'
      : tone === 'warning'
        ? 'text-[color:var(--status-attention)]'
        : tone === 'info'
          ? 'text-[color:var(--status-info)]'
          : 'text-muted-foreground';

  return (
    <div className="flex flex-1 min-w-[88px] items-center justify-between gap-2 rounded-lg border border-border/60 bg-popover px-2.5 py-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon name={icon} className={`w-3 h-3 shrink-0 ${toneClass}`} />
        <span className="text-[10px] text-muted-foreground truncate">{label}</span>
      </div>
      <span className={`text-[12px] font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}

export function TaskSourceBadgePill({ label }: { label: string }) {
  return (
    <span className="sq-chip sq-chip-neutral text-[10px] font-medium px-2 py-0.5">
      {label}
    </span>
  );
}

export function TaskBlockingBadgePill({
  badge,
}: {
  badge: 'blocks_rental' | 'attention' | 'no_block';
}) {
  if (badge === 'no_block') return null;
  const chipClass = badge === 'blocks_rental' ? 'sq-chip-critical' : 'sq-chip-warning';
  return (
    <span className={`sq-chip ${chipClass} text-[10px] font-semibold px-2 py-0.5`}>
      {taskBlockingBadgeLabel(badge)}
    </span>
  );
}

export function TaskDueBeforeBookingPill() {
  return (
    <span className="sq-chip sq-chip-info text-[10px] font-medium px-2 py-0.5 inline-flex items-center gap-1">
      <Icon name="calendar-clock" className="w-3 h-3" />
      Vor Buchung
    </span>
  );
}
