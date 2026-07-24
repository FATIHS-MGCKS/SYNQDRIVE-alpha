import { Icon } from '../ui/Icon';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import type { BookingPlannerView, BookingFiltersState, BookingStatusFilter } from './bookingTypes';
import type { VehicleData } from '../../data/vehicles';

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
  const { t } = useLanguage();

  const STATUS_OPTIONS: { value: BookingStatusFilter; label: string }[] = [
    { value: 'all', label: t('bookings.allStatuses') },
    { value: 'active', label: t('bookings.active') },
    { value: 'confirmed', label: t('bookings.confirmed') },
    { value: 'pending', label: t('bookings.planner.pending') },
    { value: 'completed', label: t('bookings.completed') },
    { value: 'cancelled', label: t('bookings.cancelled') },
    { value: 'no_show', label: t('bookings.planner.noShow') },
  ];

  return (
    <div className="surface-premium rounded-2xl p-3 shadow-[var(--shadow-1)] space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            placeholder={t('bookings.planner.searchPlaceholder')}
            value={filters.search}
            onChange={(e) => onFiltersChange({ search: e.target.value })}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border/70 bg-background text-xs outline-none focus:border-[color:var(--brand)]"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1">
          {(['timeline', 'table', 'calendar'] as BookingPlannerView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onViewChange(v)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold capitalize ${
                view === v ? 'sq-tone-brand' : 'text-muted-foreground hover:surface-premium'
              }`}
            >
              {v === 'timeline'
                ? t('bookings.planner.viewTimeline')
                : v === 'table'
                  ? t('bookings.planner.viewTable')
                  : t('bookings.planner.viewCalendar')}
            </button>
          ))}
        </div>
        {onCreateNewBooking && (
          <Button type="button" variant="primary" size="sm" onClick={onCreateNewBooking}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            {t('bookings.newBooking')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={filters.status}
          onChange={(e) => onFiltersChange({ status: e.target.value as BookingStatusFilter })}
          className="text-[10px] font-medium px-2 py-1.5 rounded-lg border border-border surface-premium"
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
          className="text-[10px] font-medium px-2 py-1.5 rounded-lg border border-border surface-premium max-w-[160px]"
        >
          <option value="">{t('bookings.planner.allVehicles')}</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.license} · {vehicleLabel(v)}
            </option>
          ))}
        </select>
        <select
          value={filters.stationId ?? ''}
          onChange={(e) => onFiltersChange({ stationId: e.target.value || null })}
          className="text-[10px] font-medium px-2 py-1.5 rounded-lg border border-border surface-premium max-w-[160px]"
        >
          <option value="">{t('bookings.planner.allStations')}</option>
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
          className="text-[10px] px-2 py-1.5 rounded-lg border border-border surface-premium"
          title={t('bookings.planner.dateFrom')}
        />
        <input
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(e) => onFiltersChange({ dateTo: e.target.value || null })}
          className="text-[10px] px-2 py-1.5 rounded-lg border border-border surface-premium"
          title={t('bookings.planner.dateTo')}
        />
        {view === 'timeline' && (
          <select
            value={timelineRange}
            onChange={(e) => onTimelineRangeChange(e.target.value as 'week' | 'month')}
            className="text-[10px] font-medium px-2 py-1.5 rounded-lg border border-border surface-premium"
          >
            <option value="week">{t('bookings.planner.rangeWeek')}</option>
            <option value="month">{t('bookings.planner.rangeMonth')}</option>
          </select>
        )}
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground ml-auto">
          <input
            type="checkbox"
            checked={filters.showTerminal}
            onChange={(e) => onFiltersChange({ showTerminal: e.target.checked })}
          />
          {t('bookings.planner.showTerminal')}
        </label>
      </div>
    </div>
  );
}
