import { Icon } from '../ui/Icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { VEHICLE_DETAIL_SCROLL_ROW_CLASS } from '../../lib/vehicle-detail-mobile-ui';

interface VehicleTripsFilterBarProps {
  tripsCount: number;
  selectedDate: string;
  selectedDriver: string;
  tripDriverOptions: string[];
  hasActiveFilters: boolean;
  onSelectedDateChange: (date: string) => void;
  onSelectedDriverChange: (driver: string) => void;
  onClearFilters: () => void;
}

function formatTripDateLabel(selectedDate: string): string {
  if (!selectedDate) return 'All Time';
  const [y, m, d] = selectedDate.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function VehicleTripsFilterBar({
  tripsCount,
  selectedDate,
  selectedDriver,
  tripDriverOptions,
  hasActiveFilters,
  onSelectedDateChange,
  onSelectedDriverChange,
  onClearFilters,
}: VehicleTripsFilterBarProps) {
  const dateLabel = formatTripDateLabel(selectedDate);
  const driverLabel = selectedDriver === 'all' ? 'All Drivers' : selectedDriver;

  return (
    <div className="mb-2 min-w-0 max-w-full">
      <div
        className={`rounded-lg border border-border surface-premium px-2.5 py-1 shadow-sm shrink-0 ${VEHICLE_DETAIL_SCROLL_ROW_CLASS}`}
        role="toolbar"
        aria-label="Trip filters"
      >
        <div className="mr-auto flex shrink-0 items-center gap-2 rounded-xl border border-transparent px-3 py-1.5 sq-tone-info">
          <span className="text-xs font-bold" aria-live="polite" aria-atomic="true">
            {tripsCount} {tripsCount === 1 ? 'Trip' : 'Trips'}
          </span>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-testid="vehicle-trips-date-filter"
              aria-label={`Filter trips by date, currently ${dateLabel}`}
              className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-1.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] motion-reduce:transition-none sm:min-h-0 ${
                selectedDate
                  ? 'bg-[color:var(--brand-soft)] border-transparent text-[color:var(--brand-ink)] ring-1 ring-[color:var(--brand-soft)]'
                  : 'surface-premium border-border text-foreground hover:bg-muted'
              }`}
            >
              <Icon
                name="calendar"
                className={`h-4 w-4 ${selectedDate ? 'text-[color:var(--brand)]' : 'text-muted-foreground'}`}
              />
              <span className="text-xs font-medium">{dateLabel}</span>
              <Icon
                name="chevron-down"
                className={`h-3.5 w-3.5 ${selectedDate ? 'text-[color:var(--brand)]' : 'text-muted-foreground'}`}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-auto p-2.5 motion-reduce:animate-none"
          >
            <label htmlFor="vehicle-trips-date-input" className="sr-only">
              Select trip date
            </label>
            <input
              id="vehicle-trips-date-input"
              type="date"
              value={selectedDate}
              onChange={(event) => onSelectedDateChange(event.target.value)}
              className="rounded-lg border border-border bg-[color:var(--input-background)] px-3 py-2 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
            />
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="vehicle-trips-driver-filter"
              aria-label={`Filter trips by driver, currently ${driverLabel}`}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] motion-reduce:transition-none sm:min-h-0 ${
                selectedDriver !== 'all'
                  ? 'bg-[color:var(--brand-soft)] border-transparent text-[color:var(--brand-ink)] ring-1 ring-[color:var(--brand-soft)]'
                  : 'surface-premium border-border text-foreground hover:bg-muted'
              }`}
            >
              <Icon
                name="user"
                className={`h-4 w-4 ${selectedDriver !== 'all' ? 'text-[color:var(--brand)]' : 'text-muted-foreground'}`}
              />
              <span className="text-xs font-medium">{driverLabel}</span>
              <Icon
                name="chevron-down"
                className={`h-3.5 w-3.5 ${selectedDriver !== 'all' ? 'text-[color:var(--brand)]' : 'text-muted-foreground'}`}
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px] motion-reduce:animate-none">
            {['all', ...tripDriverOptions].map((driver) => (
              <DropdownMenuItem
                key={driver}
                className={`text-sm font-medium ${
                  selectedDriver === driver
                    ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                    : ''
                }`}
                onClick={() => onSelectedDriverChange(driver)}
              >
                {driver === 'all' ? 'All Drivers' : driver}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClearFilters}
            aria-label="Clear trip filters"
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-transparent px-3 py-1.5 transition-all duration-200 sq-tone-critical hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] motion-reduce:transition-none sm:min-h-0"
          >
            <Icon name="x" className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Clear</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
