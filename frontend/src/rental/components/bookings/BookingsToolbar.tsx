import { Icon } from '../ui/Icon';
import { Button } from '../../../components/ui/button';
import { useMemo } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
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

const STATUS_FILTER_KEYS: Record<BookingStatusFilter, TranslationKey | null> = {
  all: 'bookings.allStatuses',
  active: 'bookings.active',
  confirmed: 'bookings.confirmed',
  pending: 'bookings.pending',
  completed: 'bookings.completed',
  cancelled: 'bookings.cancelled',
  no_show: 'bookings.noShow',
};

const VIEW_KEYS: Record<BookingPlannerView, TranslationKey> = {
  timeline: 'bookings.view.timeline',
  table: 'bookings.view.table',
  calendar: 'bookings.view.calendar',
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
  const { t } = useLanguage();

  const statusOptions = useMemo(
    () =>
      (Object.entries(STATUS_FILTER_KEYS) as [BookingStatusFilter, TranslationKey | null][]).map(
        ([value, key]) => ({
          value,
          label: key ? t(key) : value,
        }),
      ),
    [t],
  );

  return (
    <div className="surface-premium rounded-2xl p-3 shadow-[var(--shadow-1)] space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
          <input
            type="search"
            placeholder={t('bookings.searchExtended')}
            value={filters.search}
            onChange={(e) => onFiltersChange({ search: e.target.value })}
            aria-label={t('bookings.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border/70 bg-background text-xs outline-none focus:border-[color:var(--brand)]"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-muted/40 p-1" role="tablist" aria-label={t('bookings.view.tabs')}>
          {(['timeline', 'table', 'calendar'] as BookingPlannerView[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => onViewChange(v)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold ${
                view === v ? 'sq-tone-brand' : 'text-muted-foreground hover:surface-premium'
              }`}
            >
              {t(VIEW_KEYS[v])}
            </button>
          ))}
        </div>
        {onCreateNewBooking && (
          <Button type="button" variant="primary" size="sm" onClick={onCreateNewBooking}>
            <Icon name="plus" className="h-3.5 w-3.5" aria-hidden />
            {t('bookings.newBooking')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={filters.status}
          onChange={(e) => onFiltersChange({ status: e.target.value as BookingStatusFilter })}
          aria-label={t('bookings.filter.status')}
          className="text-[10px] font-medium px-2 py-1.5 rounded-lg border border-border surface-premium"
        >
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filters.vehicleId ?? ''}
          onChange={(e) => onFiltersChange({ vehicleId: e.target.value || null })}
          aria-label={t('bookings.filter.vehicle')}
          className="text-[10px] font-medium px-2 py-1.5 rounded-lg border border-border surface-premium max-w-[160px]"
        >
          <option value="">{t('bookings.filter.allVehicles')}</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.license} · {vehicleLabel(v)}
            </option>
          ))}
        </select>
        <select
          value={filters.stationId ?? ''}
          onChange={(e) => onFiltersChange({ stationId: e.target.value || null })}
          aria-label={t('bookings.filter.station')}
          className="text-[10px] font-medium px-2 py-1.5 rounded-lg border border-border surface-premium max-w-[160px]"
        >
          <option value="">{t('bookings.filter.allStations')}</option>
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
          aria-label={t('bookings.filter.dateFrom')}
          className="text-[10px] px-2 py-1.5 rounded-lg border border-border surface-premium"
        />
        <input
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(e) => onFiltersChange({ dateTo: e.target.value || null })}
          aria-label={t('bookings.filter.dateTo')}
          className="text-[10px] px-2 py-1.5 rounded-lg border border-border surface-premium"
        />
        {view === 'timeline' && (
          <select
            value={timelineRange}
            onChange={(e) => onTimelineRangeChange(e.target.value as 'week' | 'month')}
            aria-label={t('bookings.filter.timelineRange')}
            className="text-[10px] font-medium px-2 py-1.5 rounded-lg border border-border surface-premium"
          >
            <option value="week">{t('bookings.range.week')}</option>
            <option value="month">{t('bookings.range.month')}</option>
          </select>
        )}
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground ml-auto">
          <input
            type="checkbox"
            checked={filters.showTerminal}
            onChange={(e) => onFiltersChange({ showTerminal: e.target.checked })}
          />
          {t('bookings.filter.showTerminal')}
        </label>
      </div>
    </div>
  );
}
