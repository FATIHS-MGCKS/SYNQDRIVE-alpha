import { Activity } from 'lucide-react';
import type { ApiTask } from '../../../lib/api';
import { healthContextFromTask } from '../../lib/health-task-bridge.utils';

interface HealthTaskContextPanelProps {
  task: ApiTask;
  onOpenVehicleHealth?: () => void;
}

export function HealthTaskContextPanel({ task, onOpenVehicleHealth }: HealthTaskContextPanelProps) {
  const ctx = healthContextFromTask(task);
  if (!ctx) return null;

  return (
    <section className="rounded-xl border border-[color:var(--brand)]/20 bg-[color:var(--brand-soft)]/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Activity className="w-3.5 h-3.5 text-[color:var(--brand-ink)]" />
        <h4 className="text-[11px] font-semibold text-foreground">Health-Kontext</h4>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px]">
        <dt className="text-muted-foreground">Modul</dt>
        <dd className="font-medium text-foreground">{ctx.moduleLabel}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd className="font-medium text-foreground">{ctx.stateLabel}</dd>
        {ctx.reason && (
          <>
            <dt className="text-muted-foreground">Signal</dt>
            <dd className="text-foreground">{ctx.reason}</dd>
          </>
        )}
      </dl>
      <p className="text-[10px] text-muted-foreground leading-relaxed">{ctx.explanation}</p>
      {onOpenVehicleHealth && task.vehicleId && (
        <button
          type="button"
          onClick={onOpenVehicleHealth}
          className="text-[10px] font-semibold text-[color:var(--brand-ink)] hover:underline"
        >
          Zum Health-Tab des Fahrzeugs →
        </button>
      )}
    </section>
  );
}
