import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { Button } from '../../../components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '../../../components/ui/sheet';
import { cn } from '../../../components/ui/utils';
import {
  TASK_CATEGORIES,
  type TaskCategory,
} from '../../lib/task-create.utils';
import type { TaskListPriority } from '../../lib/task-list.utils';

export interface TasksFilterState {
  search: string;
  priority: string;
  category: string;
  vehicleLicense: string;
  assigneeName: string;
  sortBy: 'dueDate' | 'priority' | 'status' | 'created';
}

export const DEFAULT_TASKS_FILTER_STATE: TasksFilterState = {
  search: '',
  priority: 'all',
  category: 'all',
  vehicleLicense: 'all',
  assigneeName: 'all',
  sortBy: 'dueDate',
};

export interface TasksFilterPanelProps {
  filters: TasksFilterState;
  onChange: (patch: Partial<TasksFilterState>) => void;
  onClear: () => void;
  vehicleOptions: Array<{ value: string; label: string }>;
  assigneeOptions: Array<{ value: string; label: string }>;
  hasActiveFilters: boolean;
  resultLabel: string;
}

export function TasksFilterPanel({
  filters,
  onChange,
  onClear,
  vehicleOptions,
  assigneeOptions,
  hasActiveFilters,
  resultLabel,
}: TasksFilterPanelProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeFilterCount = [
    filters.priority !== 'all',
    filters.category !== 'all',
    filters.vehicleLicense !== 'all',
    filters.assigneeName !== 'all',
    filters.search.trim().length > 0,
  ].filter(Boolean).length;

  return (
    <div className="space-y-3" data-testid="tasks-filter-panel">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Suchen …"
            aria-label="Aufgaben suchen"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[color:var(--brand)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="md:hidden"
            onClick={() => setSheetOpen(true)}
            data-testid="tasks-filter-sheet-trigger"
          >
            <Icon name="filter" className="h-3.5 w-3.5" />
            Filter
            {activeFilterCount > 0 ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>

          <div className="hidden items-center gap-2 md:flex">
            <FilterFields
              filters={filters}
              onChange={onChange}
              vehicleOptions={vehicleOptions}
              assigneeOptions={assigneeOptions}
              layout="inline"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span data-testid="tasks-result-label">{resultLabel}</span>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="font-semibold text-[color:var(--brand)]"
          >
            Filter zurücksetzen
          </button>
        ) : null}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl px-4 pb-6 pt-4">
          <SheetTitle className="mb-4 text-base font-semibold">Filter</SheetTitle>
          <FilterFields
            filters={filters}
            onChange={onChange}
            vehicleOptions={vehicleOptions}
            assigneeOptions={assigneeOptions}
            layout="stacked"
          />
          <div className="mt-5 flex gap-2">
            <Button
              type="button"
              variant="neutral"
              className="flex-1"
              onClick={() => {
                onClear();
                setSheetOpen(false);
              }}
            >
              Zurücksetzen
            </Button>
            <Button type="button" className="flex-1" onClick={() => setSheetOpen(false)}>
              Anwenden
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterFields({
  filters,
  onChange,
  vehicleOptions,
  assigneeOptions,
  layout,
}: {
  filters: TasksFilterState;
  onChange: (patch: Partial<TasksFilterState>) => void;
  vehicleOptions: Array<{ value: string; label: string }>;
  assigneeOptions: Array<{ value: string; label: string }>;
  layout: 'inline' | 'stacked';
}) {
  const fieldClass = cn(
    'rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-[color:var(--brand)]',
    layout === 'inline' ? 'min-w-[9rem]' : 'w-full',
  );

  const priorities: Array<{ value: string; label: string }> = [
    { value: 'all', label: 'Alle Prioritäten' },
    { value: 'Critical', label: 'Kritisch' },
    { value: 'High', label: 'Hoch' },
    { value: 'Medium', label: 'Mittel' },
    { value: 'Low', label: 'Niedrig' },
  ];

  const sortOptions: Array<{ value: TasksFilterState['sortBy']; label: string }> = [
    { value: 'dueDate', label: 'Fälligkeit' },
    { value: 'priority', label: 'Priorität' },
    { value: 'status', label: 'Status' },
    { value: 'created', label: 'Neueste' },
  ];

  const wrapperClass = layout === 'inline' ? 'flex flex-wrap items-center gap-2' : 'space-y-3';

  return (
    <div className={wrapperClass}>
      <label className={layout === 'stacked' ? 'block' : undefined}>
        {layout === 'stacked' ? (
          <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Priorität</span>
        ) : null}
        <select
          value={filters.priority}
          onChange={(event) => onChange({ priority: event.target.value })}
          className={fieldClass}
          aria-label="Priorität filtern"
        >
          {priorities.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className={layout === 'stacked' ? 'block' : undefined}>
        {layout === 'stacked' ? (
          <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Kategorie</span>
        ) : null}
        <select
          value={filters.category}
          onChange={(event) => onChange({ category: event.target.value })}
          className={fieldClass}
          aria-label="Kategorie filtern"
        >
          <option value="all">Alle Kategorien</option>
          {TASK_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>

      <label className={layout === 'stacked' ? 'block' : undefined}>
        {layout === 'stacked' ? (
          <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Fahrzeug</span>
        ) : null}
        <select
          value={filters.vehicleLicense}
          onChange={(event) => onChange({ vehicleLicense: event.target.value })}
          className={fieldClass}
          aria-label="Fahrzeug filtern"
        >
          <option value="all">Alle Fahrzeuge</option>
          {vehicleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className={layout === 'stacked' ? 'block' : undefined}>
        {layout === 'stacked' ? (
          <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Zuständig</span>
        ) : null}
        <select
          value={filters.assigneeName}
          onChange={(event) => onChange({ assigneeName: event.target.value })}
          className={fieldClass}
          aria-label="Zuständigen filtern"
        >
          <option value="all">Alle Zuständigen</option>
          {assigneeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className={layout === 'stacked' ? 'block' : undefined}>
        {layout === 'stacked' ? (
          <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Sortierung</span>
        ) : null}
        <select
          value={filters.sortBy}
          onChange={(event) =>
            onChange({ sortBy: event.target.value as TasksFilterState['sortBy'] })
          }
          className={fieldClass}
          aria-label="Sortierung"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function applyClientTaskFilters<T extends {
  title: string;
  vehicleLicense: string;
  vehicleModel: string;
  assignedUserName: string;
  createdByUserName: string;
  id: string;
  priority: TaskListPriority;
  category: TaskCategory;
}>(
  rows: T[],
  filters: TasksFilterState,
): T[] {
  const query = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    const matchesSearch =
      !query ||
      row.title.toLowerCase().includes(query) ||
      row.vehicleLicense.toLowerCase().includes(query) ||
      row.vehicleModel.toLowerCase().includes(query) ||
      row.assignedUserName.toLowerCase().includes(query) ||
      row.createdByUserName.toLowerCase().includes(query) ||
      row.id.toLowerCase().includes(query);
    const matchesPriority = filters.priority === 'all' || row.priority === filters.priority;
    const matchesCategory = filters.category === 'all' || row.category === filters.category;
    const matchesVehicle =
      filters.vehicleLicense === 'all' || row.vehicleLicense === filters.vehicleLicense;
    const matchesAssignee =
      filters.assigneeName === 'all' || row.assignedUserName === filters.assigneeName;
    return matchesSearch && matchesPriority && matchesCategory && matchesVehicle && matchesAssignee;
  });
}

export function hasActiveTaskFilters(filters: TasksFilterState): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.priority !== 'all' ||
    filters.category !== 'all' ||
    filters.vehicleLicense !== 'all' ||
    filters.assigneeName !== 'all'
  );
}
