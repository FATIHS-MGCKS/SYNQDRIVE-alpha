import { cn } from '../../../components/ui/utils';
import {
  getVisibleTasksPageViews,
  type TasksPageView,
  type TasksPageViewMeta,
} from '../../lib/tasks-page.utils';

export interface TasksPageViewsProps {
  activeView: TasksPageView;
  onViewChange: (view: TasksPageView) => void;
  canViewUnassigned: boolean;
  counts?: Partial<Record<TasksPageView, number>>;
}

export function TasksPageViews({
  activeView,
  onViewChange,
  canViewUnassigned,
  counts,
}: TasksPageViewsProps) {
  const views = getVisibleTasksPageViews(canViewUnassigned);

  return (
    <div
      className="sq-tab-bar sq-tab-bar--inset flex gap-1 overflow-x-auto p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="Aufgaben-Ansichten"
      data-testid="tasks-page-views"
    >
      {views.map((view) => (
        <ViewTab
          key={view.id}
          view={view}
          active={activeView === view.id}
          count={counts?.[view.id]}
          onSelect={() => onViewChange(view.id)}
        />
      ))}
    </div>
  );
}

function ViewTab({
  view,
  active,
  count,
  onSelect,
}: {
  view: TasksPageViewMeta;
  active: boolean;
  count?: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-view={view.id}
      onClick={onSelect}
      className={cn(
        'sq-press shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:text-[13px]',
        active
          ? 'surface-premium text-foreground shadow-[var(--shadow-1)]'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span>{view.label}</span>
      {typeof count === 'number' && count > 0 ? (
        <span
          className={cn(
            'ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-md px-1 py-0.5 text-[10px] font-bold tabular-nums',
            active ? 'bg-muted text-foreground' : 'bg-muted/60 text-muted-foreground',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </button>
  );
}
