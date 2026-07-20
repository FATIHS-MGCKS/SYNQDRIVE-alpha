import { useMemo, useState } from 'react';
import type { ApiTaskPriority, ApiTaskSource, ApiTaskStatus, ApiTaskType, TaskBucket } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '../../../components/ui/sheet';
import { cn } from '../../../components/ui/utils';
import { Icon } from '../ui/Icon';
import {
  DEFAULT_TASKS_LIST_FILTERS,
  hasActiveTasksListFilters,
  TASK_FILTER_LABELS,
  type TasksListFilters,
} from './tasksListState';

export type TasksFilterState = TasksListFilters;
export const DEFAULT_TASKS_FILTER_STATE = DEFAULT_TASKS_LIST_FILTERS;
export const hasActiveTaskFilters = hasActiveTasksListFilters;

export interface EntityFilterOption {
  value: string;
  label: string;
}

export interface TasksFilterPanelProps {
  filters: TasksFilterState;
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  onChange: (patch: Partial<TasksFilterState>) => void;
  onClear: () => void;
  stationOptions: EntityFilterOption[];
  assigneeOptions: EntityFilterOption[];
  vehicleOptions: EntityFilterOption[];
  bookingOptions: EntityFilterOption[];
  customerOptions: EntityFilterOption[];
  invoiceOptions: EntityFilterOption[];
  serviceCaseOptions: EntityFilterOption[];
  hasActiveFilters: boolean;
  resultLabel: string;
}

const TASK_STATUSES = Object.keys(TASK_FILTER_LABELS.status) as ApiTaskStatus[];
const TASK_PRIORITIES = Object.keys(TASK_FILTER_LABELS.priority) as ApiTaskPriority[];
const TASK_SOURCES = Object.keys(TASK_FILTER_LABELS.source) as ApiTaskSource[];
const TASK_BUCKETS = Object.keys(TASK_FILTER_LABELS.bucket) as TaskBucket[];
const TASK_TYPES: ApiTaskType[] = [
  'VEHICLE_SERVICE',
  'VEHICLE_INSPECTION',
  'TIRE_CHECK',
  'BRAKE_CHECK',
  'BATTERY_CHECK',
  'VEHICLE_CLEANING',
  'BOOKING_PREPARATION',
  'BOOKING_PICKUP',
  'BOOKING_RETURN',
  'DOCUMENT_REVIEW',
  'INVOICE_REQUIRED',
  'CUSTOMER_FOLLOWUP',
  'REPAIR',
  'CUSTOM',
];

export function TasksFilterPanel({
  filters,
  searchDraft,
  onSearchDraftChange,
  onChange,
  onClear,
  stationOptions,
  assigneeOptions,
  vehicleOptions,
  bookingOptions,
  customerOptions,
  invoiceOptions,
  serviceCaseOptions,
  hasActiveFilters,
  resultLabel,
}: TasksFilterPanelProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchDraft.trim()) count += 1;
    if (filters.status !== 'all') count += 1;
    if (filters.bucket !== 'all') count += 1;
    if (filters.priority !== 'all') count += 1;
    if (filters.type !== 'all') count += 1;
    if (filters.source !== 'all') count += 1;
    if (filters.stationId) count += 1;
    if (filters.assignedUserId) count += 1;
    if (filters.vehicleId) count += 1;
    if (filters.bookingId) count += 1;
    if (filters.customerId) count += 1;
    if (filters.invoiceId) count += 1;
    if (filters.serviceCaseId) count += 1;
    if (filters.activatesFrom || filters.activatesTo) count += 1;
    if (filters.dueFrom || filters.dueTo) count += 1;
    if (filters.overdue) count += 1;
    return count;
  }, [filters, searchDraft]);

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
            value={searchDraft}
            onChange={(event) => onSearchDraftChange(event.target.value)}
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
              stationOptions={stationOptions}
              assigneeOptions={assigneeOptions}
              vehicleOptions={vehicleOptions}
              bookingOptions={bookingOptions}
              customerOptions={customerOptions}
              invoiceOptions={invoiceOptions}
              serviceCaseOptions={serviceCaseOptions}
              layout="inline"
              section="primary"
            />
          </div>
        </div>
      </div>

      <div className="hidden md:block">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="text-[11px] font-semibold text-[color:var(--brand)]"
        >
          {advancedOpen ? 'Erweiterte Filter ausblenden' : 'Erweiterte Filter anzeigen'}
        </button>
        {advancedOpen ? (
          <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3">
            <FilterFields
              filters={filters}
              onChange={onChange}
              stationOptions={stationOptions}
              assigneeOptions={assigneeOptions}
              vehicleOptions={vehicleOptions}
              bookingOptions={bookingOptions}
              customerOptions={customerOptions}
              invoiceOptions={invoiceOptions}
              serviceCaseOptions={serviceCaseOptions}
              layout="inline"
              section="advanced"
            />
          </div>
        ) : null}
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
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pb-6 pt-4">
          <SheetTitle className="mb-4 text-base font-semibold">Filter</SheetTitle>
          <FilterFields
            filters={filters}
            onChange={onChange}
            stationOptions={stationOptions}
            assigneeOptions={assigneeOptions}
            vehicleOptions={vehicleOptions}
            bookingOptions={bookingOptions}
            customerOptions={customerOptions}
            invoiceOptions={invoiceOptions}
            serviceCaseOptions={serviceCaseOptions}
            layout="stacked"
            section="all"
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
  stationOptions,
  assigneeOptions,
  vehicleOptions,
  bookingOptions,
  customerOptions,
  invoiceOptions,
  serviceCaseOptions,
  layout,
  section,
}: {
  filters: TasksFilterState;
  onChange: (patch: Partial<TasksFilterState>) => void;
  stationOptions: EntityFilterOption[];
  assigneeOptions: EntityFilterOption[];
  vehicleOptions: EntityFilterOption[];
  bookingOptions: EntityFilterOption[];
  customerOptions: EntityFilterOption[];
  invoiceOptions: EntityFilterOption[];
  serviceCaseOptions: EntityFilterOption[];
  layout: 'inline' | 'stacked';
  section: 'primary' | 'advanced' | 'all';
}) {
  const fieldClass = cn(
    'rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-[color:var(--brand)]',
    layout === 'inline' ? 'min-w-[9rem]' : 'w-full',
  );
  const wrapperClass = layout === 'inline' ? 'flex flex-wrap items-center gap-2' : 'space-y-3';

  const showPrimary = section === 'primary' || section === 'all';
  const showAdvanced = section === 'advanced' || section === 'all';

  const renderSelect = (
    label: string,
    value: string,
    options: Array<{ value: string; label: string }>,
    onValue: (value: string) => void,
    allLabel: string,
    ariaLabel: string,
  ) => (
    <label className={layout === 'stacked' ? 'block' : undefined}>
      {layout === 'stacked' ? (
        <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      ) : null}
      <select value={value} onChange={(event) => onValue(event.target.value)} className={fieldClass} aria-label={ariaLabel}>
        <option value="all">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  const renderEntitySelect = (
    label: string,
    value: string,
    options: EntityFilterOption[],
    onValue: (value: string) => void,
    allLabel: string,
    ariaLabel: string,
  ) => (
    <label className={layout === 'stacked' ? 'block' : undefined}>
      {layout === 'stacked' ? (
        <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      ) : null}
      <select value={value} onChange={(event) => onValue(event.target.value)} className={fieldClass} aria-label={ariaLabel}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className={wrapperClass}>
      {showPrimary ? (
        <>
          {renderSelect(
            'Status',
            filters.status,
            TASK_STATUSES.map((status) => ({
              value: status,
              label: TASK_FILTER_LABELS.status[status],
            })),
            (value) => onChange({ status: value as TasksFilterState['status'] }),
            'Alle Status',
            'Status filtern',
          )}
          {renderSelect(
            'Bucket',
            filters.bucket,
            TASK_BUCKETS.map((bucket) => ({
              value: bucket,
              label: TASK_FILTER_LABELS.bucket[bucket],
            })),
            (value) => onChange({ bucket: value as TasksFilterState['bucket'] }),
            'Alle Buckets',
            'Bucket filtern',
          )}
          {renderSelect(
            'Priorität',
            filters.priority,
            TASK_PRIORITIES.map((priority) => ({
              value: priority,
              label: TASK_FILTER_LABELS.priority[priority],
            })),
            (value) => onChange({ priority: value as TasksFilterState['priority'] }),
            'Alle Prioritäten',
            'Priorität filtern',
          )}
          {renderSelect(
            'Aufgabentyp',
            filters.type,
            TASK_TYPES.map((type) => ({ value: type, label: type.replaceAll('_', ' ') })),
            (value) => onChange({ type: value as TasksFilterState['type'] }),
            'Alle Typen',
            'Aufgabentyp filtern',
          )}
          {renderSelect(
            'Quelle',
            filters.source,
            TASK_SOURCES.map((source) => ({
              value: source,
              label: TASK_FILTER_LABELS.source[source],
            })),
            (value) => onChange({ source: value as TasksFilterState['source'] }),
            'Alle Quellen',
            'Quelle filtern',
          )}
          <label className={layout === 'stacked' ? 'flex items-center gap-2' : 'flex items-center gap-2 px-1'}>
            <input
              type="checkbox"
              checked={filters.overdue}
              onChange={(event) => onChange({ overdue: event.target.checked })}
              className="rounded border-border"
            />
            <span className="text-xs text-foreground">Nur überfällig</span>
          </label>
        </>
      ) : null}

      {showAdvanced ? (
        <>
          {renderEntitySelect(
            'Station',
            filters.stationId,
            stationOptions,
            (value) => onChange({ stationId: value }),
            'Alle Stationen',
            'Station filtern',
          )}
          {renderEntitySelect(
            'Verantwortlicher',
            filters.assignedUserId,
            assigneeOptions,
            (value) => onChange({ assignedUserId: value }),
            'Alle Verantwortlichen',
            'Verantwortlichen filtern',
          )}
          {renderEntitySelect(
            'Fahrzeug',
            filters.vehicleId,
            vehicleOptions,
            (value) => onChange({ vehicleId: value }),
            'Alle Fahrzeuge',
            'Fahrzeug filtern',
          )}
          {renderEntitySelect(
            'Buchung',
            filters.bookingId,
            bookingOptions,
            (value) => onChange({ bookingId: value }),
            'Alle Buchungen',
            'Buchung filtern',
          )}
          {renderEntitySelect(
            'Kunde',
            filters.customerId,
            customerOptions,
            (value) => onChange({ customerId: value }),
            'Alle Kunden',
            'Kunde filtern',
          )}
          {renderEntitySelect(
            'Rechnung',
            filters.invoiceId,
            invoiceOptions,
            (value) => onChange({ invoiceId: value }),
            'Alle Rechnungen',
            'Rechnung filtern',
          )}
          {renderEntitySelect(
            'Servicefall',
            filters.serviceCaseId,
            serviceCaseOptions,
            (value) => onChange({ serviceCaseId: value }),
            'Alle Servicefälle',
            'Servicefall filtern',
          )}
          <label className={layout === 'stacked' ? 'block' : undefined}>
            {layout === 'stacked' ? (
              <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                Aktivierung von
              </span>
            ) : null}
            <input
              type="date"
              value={filters.activatesFrom}
              onChange={(event) => onChange({ activatesFrom: event.target.value })}
              className={fieldClass}
              aria-label="Aktivierung von"
            />
          </label>
          <label className={layout === 'stacked' ? 'block' : undefined}>
            {layout === 'stacked' ? (
              <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                Aktivierung bis
              </span>
            ) : null}
            <input
              type="date"
              value={filters.activatesTo}
              onChange={(event) => onChange({ activatesTo: event.target.value })}
              className={fieldClass}
              aria-label="Aktivierung bis"
            />
          </label>
          <label className={layout === 'stacked' ? 'block' : undefined}>
            {layout === 'stacked' ? (
              <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Fällig von</span>
            ) : null}
            <input
              type="date"
              value={filters.dueFrom}
              onChange={(event) => onChange({ dueFrom: event.target.value })}
              className={fieldClass}
              aria-label="Fällig von"
            />
          </label>
          <label className={layout === 'stacked' ? 'block' : undefined}>
            {layout === 'stacked' ? (
              <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Fällig bis</span>
            ) : null}
            <input
              type="date"
              value={filters.dueTo}
              onChange={(event) => onChange({ dueTo: event.target.value })}
              className={fieldClass}
              aria-label="Fällig bis"
            />
          </label>
        </>
      ) : null}
    </div>
  );
}
