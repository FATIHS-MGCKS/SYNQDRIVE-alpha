import { Icon } from '../ui/Icon';
import { Button } from '../../../components/ui/button';
import type { BookingPlannerView, BookingFiltersState, BookingStatusFilter } from './bookingTypes';
import type { VehicleData } from '../../data/vehicles';
import { BOOKING_FOCUS_RING } from './bookings-a11y';

function vehicleLabel(v: VehicleData): string {
  const head = [v.make, v.model].filter(Boolean).join(' ').trim();
  return head || v.model;
}

interface StationOption {
  id: string;
  name: string;
}

interface BookingsToolbarProps {
  filters: BookingFiltersState;
  onFiltersChange: (patch: Partial<BookingFiltersState>) => void;
  view: BookingPlannerView;
  onViewChange: (view: BookingPlannerView) => void;
  vehicles: VehicleData[];
  stations: StationOption[];
  onCreateNewBooking?: () => void;
  timelineRange: 'week' | 'month';
  onTimelineRangeChange: (range: 'week' | 'month') => void;
}

const STATUS_OPTIONS: { value: BookingStatusFilter; label: string }[] = [
  { value: 'all', label: 'Alle Status' },
  { value: 'active', label: 'Aktiv' },
  { value: 'confirmed', label: 'Bestätigt' },
  { value: 'pending', label: 'Ausstehend' },
  { value: 'completed', label: 'Abgeschlossen' },
  { value: 'cancelled', label: 'Storniert' },
  { value: 'no_show', label: 'No-Show' },
];

const VIEW_LABELS: Record<BookingPlannerView, string> = {
  timeline: 'Timeline',
  table: 'Tabelle',
  calendar: 'Kalender',
};

export function BookingsToolbar({
  filters,
  onFiltersChange,
  view,
  onViewChange,
  vehicles,
  stations,
  onCreateNewBooking,
  timelineRange,
  onTimelineRangeChange,
}: BookingsToolbarProps) {
  const filterControlClass = `text-[10px] font-medium min-h-11 px-2 py-1.5 rounded-lg border border-border surface-premium ${BOOKING_FOCUS_RING}`;

  return (
    <div className="surface-premium rounded-2xl p-3 shadow-[var(--shadow-1)] space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
          <input
            type="search"
            placeholder="Kunde, Fahrzeug, Kennzeichen, Buchungs-Nr.…"
            value={filters.search}
            onChange={(e) => onFiltersChange({ search: e.target.value })}
            aria-label="Buchungen durchsuchen"
            className={`w-full min-h-11 pl-9 pr-3 py-2 rounded-lg border border-border/70 bg-background text-xs outline-none focus:border-[color:var(--brand)] ${BOOKING_FOCUS_RING}`}
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1" role="tablist" aria-label="Ansicht wählen">
          {(['timeline', 'table', 'calendar'] as BookingPlannerView[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => onViewChange(v)}
              className={`min-h-11 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold capitalize ${BOOKING_FOCUS_RING} ${
                view === v ? 'sq-tone-brand' : 'text-muted-foreground hover:surface-premium'
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
        {onCreateNewBooking && (
          <Button type="button" variant="primary" size="sm" onClick={onCreateNewBooking} className="min-h-11">
            <Icon name="plus" className="h-3.5 w-3.5" aria-hidden />
            Neue Buchung
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={filters.status}
          onChange={(e) => onFiltersChange({ status: e.target.value as BookingStatusFilter })}
          aria-label="Status filtern"
          className={filterControlClass}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filters.vehicleId ?? ''}
          onChange={(e) => onFiltersChange({ vehicleId: e.target.value || null })}
          aria-label="Fahrzeug filtern"
          className={`${filterControlClass} max-w-[160px]`}
        >
          <option value="">Alle Fahrzeuge</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.license} · {vehicleLabel(v)}
            </option>
          ))}
        </select>
        <select
          value={filters.stationId ?? ''}
          onChange={(e) => onFiltersChange({ stationId: e.target.value || null })}
          aria-label="Station filtern"
          className={`${filterControlClass} max-w-[160px]`}
        >
          <option value="">Alle Stationen</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={(e) => onFiltersChange({ dateFrom: e.target.value || null })}
          aria-label="Zeitraum von"
          className={filterControlClass}
        />
        <input
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(e) => onFiltersChange({ dateTo: e.target.value || null })}
          aria-label="Zeitraum bis"
          className={filterControlClass}
        />
        {view === 'timeline' && (
          <select
            value={timelineRange}
            onChange={(e) => onTimelineRangeChange(e.target.value as 'week' | 'month')}
            aria-label="Timeline-Zeitraum"
            className={filterControlClass}
          >
            <option value="week">Woche</option>
            <option value="month">Monat</option>
          </select>
        )}
        <label className="flex items-center gap-1.5 min-h-11 text-[10px] text-muted-foreground ml-auto">
          <input
            type="checkbox"
            checked={filters.showTerminal}
            onChange={(e) => onFiltersChange({ showTerminal: e.target.checked })}
            className="size-4"
          />
          Storniert / No-Show
        </label>
      </div>
    </div>
  );
}
