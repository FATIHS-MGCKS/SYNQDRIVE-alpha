import { cn } from '../../../components/ui/utils';
import type { TasksPageKpiItem, TasksPageView } from '../../lib/tasks-page.utils';

export interface TasksKpiStripProps {
  items: TasksPageKpiItem[];
  activeView: TasksPageView;
  onSelectView: (view: TasksPageView) => void;
}

export function TasksKpiStrip({ items, activeView, onSelectView }: TasksKpiStripProps) {
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5"
      data-testid="tasks-kpi-strip"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          data-kpi={item.id}
          aria-pressed={activeView === item.view}
          onClick={() => onSelectView(item.view)}
          className={cn(
            'sq-press rounded-xl border px-3 py-2.5 text-left transition-colors',
            'border-border/50 surface-premium/60 hover:border-border',
            activeView === item.view && 'ring-2 ring-[color:var(--brand)]/45',
            item.tone === 'critical' && item.value > 0 && 'border-[color:var(--status-critical)]/30',
            item.tone === 'watch' && item.value > 0 && 'border-[color:var(--status-watch)]/25',
          )}
        >
          <p className="text-[10px] font-medium text-muted-foreground">{item.label}</p>
          <p
            className={cn(
              'mt-0.5 text-xl font-semibold tabular-nums leading-none tracking-tight',
              item.tone === 'critical' && item.value > 0 && 'text-[color:var(--status-critical)]',
              item.tone === 'watch' && item.value > 0 && 'text-[color:var(--status-watch)]',
              item.value === 0 && 'text-muted-foreground',
            )}
          >
            {item.value}
          </p>
        </button>
      ))}
    </div>
  );
}
