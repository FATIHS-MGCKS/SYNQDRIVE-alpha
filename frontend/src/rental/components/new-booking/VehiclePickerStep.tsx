import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { VehicleHealthResponse } from '../../../lib/api';
import { SectionHeader } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { VehicleData } from '../../data/vehicles';
import {
  fleetStatusLabelDe,
  resolveBookingVehiclePreflight,
  vehicleStationDisplay,
} from '../../lib/booking-vehicle-preflight';
import { buildMMY } from '../../lib/vehicleMmy';
import { BrandLogoMark, getBrandFromModel } from '../BrandLogo';
import { RentalHealthBadge } from '../rental-health/RentalHealthBadge';
import { Icon } from '../ui/Icon';
import { VEHICLE_OPERATIONAL_STATUS } from '../../lib/vehicle-operational-state';

export interface VehiclePickerStationOption {
  id: string;
  label: string;
}

export interface VehiclePickerStepProps {
  vehicles: VehicleData[];
  selectedVehicleId: string | null;
  onSelectVehicle: (vehicle: VehicleData) => void;
  search: string;
  onSearchChange: (value: string) => void;
  brandFilter: string;
  onBrandFilterChange: (value: string) => void;
  stationFilter: string;
  onStationFilterChange: (value: string) => void;
  fuelFilter: string;
  onFuelFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  onResetFilters: () => void;
  brands: string[];
  stationOptions: VehiclePickerStationOption[];
  fuelTypes: string[];
  pickerHealthMap: Map<string, VehicleHealthResponse | null>;
  catalogLoading: boolean;
  vehicleHasTariff: (vehicleId: string) => boolean;
  getDailyRateLabel: (vehicleId: string) => string | null;
  isDarkMode: boolean;
}

const STATUS_TABS = [
  { label: 'Alle', value: 'all' },
  { label: 'Verfügbar', value: VEHICLE_OPERATIONAL_STATUS.AVAILABLE },
  { label: 'Reserviert', value: VEHICLE_OPERATIONAL_STATUS.RESERVED },
  { label: 'Vermietet', value: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED },
  { label: 'Wartung', value: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE },
] as const;

function fuelChipClass(fuelType: string): string {
  if (fuelType === 'Electric') return 'sq-chip-success';
  if (fuelType === 'Hybrid') return 'sq-chip-info';
  if (fuelType === 'Diesel') return 'sq-chip-watch';
  if (fuelType === 'Petrol') return 'sq-chip-warning';
  return 'sq-chip-neutral';
}

function SelectionIndicator({
  selected,
  disabled,
  caution,
}: {
  selected: boolean;
  disabled: boolean;
  caution?: boolean;
}) {
  if (selected && !disabled) {
    return (
      <div
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full',
          caution ? 'bg-brand/60' : 'bg-brand',
        )}
        aria-hidden
      >
        <Icon name="check" className="h-4 w-4 text-white" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative flex h-7 w-7 items-center justify-center rounded-full border-2',
        disabled ? 'border-border bg-muted/30' : caution ? 'border-[color:var(--status-critical)]/50' : 'border-border',
      )}
      aria-hidden
    >
      {disabled && (
        <div className="absolute top-1/2 left-1/2 h-0.5 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/50" />
      )}
    </div>
  );
}

function VehiclePickerCard({
  vehicle,
  selected,
  health,
  dailyLabel,
  catalogLoading,
  vehicleHasTariff,
  isDarkMode,
  onSelect,
}: {
  vehicle: VehicleData;
  selected: boolean;
  health: VehicleHealthResponse | null;
  dailyLabel: string | null;
  catalogLoading: boolean;
  vehicleHasTariff: (vehicleId: string) => boolean;
  isDarkMode: boolean;
  onSelect: () => void;
}) {
  const preflight = resolveBookingVehiclePreflight(
    vehicle,
    health,
    vehicleHasTariff(vehicle.id),
    catalogLoading,
  );
  const brandKey = getBrandFromModel({ make: vehicle.make, model: vehicle.model });
  const mmy = buildMMY(vehicle);
  const priceLabel = dailyLabel ?? 'Kein Tarif';
  const stationLabel = vehicleStationDisplay(vehicle);
  const fleetLabel = fleetStatusLabelDe(vehicle.status);

  return (
    <button
      type="button"
      disabled={!preflight.isSelectable}
      onClick={() => {
        if (!preflight.isSelectable) return;
        onSelect();
      }}
      className={cn(
        'w-full min-w-0 max-w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-200',
        !preflight.isSelectable && 'cursor-not-allowed border-border bg-muted/25 opacity-70 grayscale',
        preflight.isSelectable && preflight.muted && !selected && 'border-border bg-muted/35 hover:border-border hover:bg-muted/50',
        preflight.isSelectable && !preflight.muted && !selected && 'border-border bg-muted/40 hover:border-border hover:surface-premium',
        selected && preflight.isSelectable && 'border-[color:var(--brand)] bg-[color:var(--brand-soft)] ring-1 ring-[color:var(--brand-glow)]',
        preflight.rentalBlocked && 'border-[color:var(--status-critical)]/30',
      )}
    >
      <div className="flex items-start gap-2.5">
        <BrandLogoMark
          brand={brandKey}
          isDarkMode={isDarkMode}
          boxClassName={preflight.muted ? 'grayscale opacity-75' : undefined}
        />

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                'min-w-0 truncate text-[13px] font-semibold leading-snug',
                preflight.muted && !selected ? 'text-muted-foreground' : 'text-foreground',
                preflight.offline && 'line-through',
              )}
            >
              {mmy}
            </p>
            <div className="hidden shrink-0 text-right sm:block">
              <p
                className={cn(
                  'text-xs font-medium tabular-nums',
                  preflight.noTariff ? 'text-[color:var(--status-watch)]' : 'text-foreground',
                  preflight.offline && 'line-through text-muted-foreground',
                )}
              >
                {priceLabel}
              </p>
              <p className="text-[10px] text-muted-foreground">pro Tag</p>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
            <span className="shrink-0 font-semibold tabular-nums tracking-tight text-foreground/90">
              {vehicle.license}
            </span>
            <span aria-hidden className="text-muted-foreground/50">·</span>
            <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px]', fuelChipClass(vehicle.fuelType))}>
              {vehicle.fuelType}
            </span>
            {stationLabel !== '—' ? (
              <>
                <span aria-hidden className="text-muted-foreground/50">·</span>
                <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                  <Icon name="map-pin" className="h-3 w-3 shrink-0" />
                  <span className="truncate">{stationLabel}</span>
                </span>
              </>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-1.5 pt-0.5">
            {vehicle.status !== VEHICLE_OPERATIONAL_STATUS.AVAILABLE ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]',
                  vehicle.status === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE && 'sq-tone-critical',
                  vehicle.status === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED && 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
                  vehicle.status === VEHICLE_OPERATIONAL_STATUS.RESERVED && 'sq-tone-watch',
                )}
              >
                {fleetLabel}
              </span>
            ) : null}

            {preflight.offline ? (
              <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <Icon name="wifi-off" className="h-3 w-3 shrink-0" />
                <span className="truncate">{preflight.blockingReason}</span>
              </span>
            ) : null}

            {preflight.rentalBlocked ? (
              <RentalHealthBadge health={health} size="sm" showBlockingLabel />
            ) : preflight.healthWarningOnly ? (
              <RentalHealthBadge health={health} size="sm" />
            ) : null}

            {preflight.noTariff && preflight.isSelectable ? (
              <span className="text-[10px] text-[color:var(--status-watch)]">Kein Tarif</span>
            ) : null}

            {preflight.cautionReason &&
            !preflight.offline &&
            !preflight.rentalBlocked &&
            !preflight.noTariff &&
            vehicle.status === VEHICLE_OPERATIONAL_STATUS.AVAILABLE ? (
              <span className="truncate text-[10px] text-muted-foreground">{preflight.cautionReason}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
        <div className="min-w-0 sm:hidden">
          <p
            className={cn(
              'text-xs font-medium tabular-nums',
              preflight.noTariff ? 'text-[color:var(--status-watch)]' : 'text-foreground',
              preflight.offline && 'line-through text-muted-foreground',
            )}
          >
            {priceLabel}
          </p>
          <p className="text-[10px] text-muted-foreground">pro Tag</p>
        </div>
        <div className="ml-auto shrink-0">
          <SelectionIndicator
            selected={selected}
            disabled={!preflight.isSelectable}
            caution={vehicle.status === VEHICLE_OPERATIONAL_STATUS.MAINTENANCE}
          />
        </div>
      </div>
    </button>
  );
}

const selectClass =
  'min-w-0 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none';

export function VehiclePickerStep({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  search,
  onSearchChange,
  brandFilter,
  onBrandFilterChange,
  stationFilter,
  onStationFilterChange,
  fuelFilter,
  onFuelFilterChange,
  statusFilter,
  onStatusFilterChange,
  onResetFilters,
  brands,
  stationOptions,
  fuelTypes,
  pickerHealthMap,
  catalogLoading,
  vehicleHasTariff,
  getDailyRateLabel,
  isDarkMode,
}: VehiclePickerStepProps) {
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const hasActiveFilters =
    brandFilter !== 'all' || stationFilter !== 'all' || fuelFilter !== 'all';

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: vehicles.length };
    for (const tab of STATUS_TABS) {
      if (tab.value === 'all') continue;
      counts[tab.value] = vehicles.filter((v) => v.status === tab.value).length;
    }
    return counts;
  }, [vehicles]);

  const visibleVehicles = useMemo(
    () => vehicles.filter((v) => statusFilter === 'all' || v.status === statusFilter),
    [vehicles, statusFilter],
  );

  return (
    <div className="p-4">
      <SectionHeader title="Fahrzeug auswählen" className="mb-3" />

      <div className="relative mb-3">
        <Icon name="search" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Fahrzeug suchen…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-[color:var(--brand)]"
        />
      </div>

      <div className="mb-3 space-y-2 md:hidden">
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <select value={brandFilter} onChange={(e) => onBrandFilterChange(e.target.value)} className={selectClass}>
            <option value="all">Alle Marken</option>
            {brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select value={stationFilter} onChange={(e) => onStationFilterChange(e.target.value)} className={selectClass}>
            <option value="all">Alle Stationen</option>
            {stationOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setMoreFiltersOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        >
          <span>
            Weitere Filter
            {hasActiveFilters ? (
              <span className="ml-1.5 rounded-full sq-tone-brand px-1.5 py-0.5 text-[10px]">aktiv</span>
            ) : null}
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', moreFiltersOpen && 'rotate-180')} />
        </button>

        {moreFiltersOpen ? (
          <div className="grid min-w-0 grid-cols-1 gap-2 rounded-lg border border-border/70 bg-muted/20 p-2.5">
            <select value={fuelFilter} onChange={(e) => onFuelFilterChange(e.target.value)} className={selectClass}>
              <option value="all">Alle Kraftstoffe</option>
              {fuelTypes.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={onResetFilters}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border surface-premium px-3 py-2 text-xs text-muted-foreground hover:border-[color:var(--status-critical)] hover:text-[color:var(--status-critical)]"
              >
                <Icon name="x" className="h-3.5 w-3.5 shrink-0" />
                Filter zurücksetzen
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mb-3 hidden md:block">
        <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-3">
          <select value={brandFilter} onChange={(e) => onBrandFilterChange(e.target.value)} className={selectClass}>
            <option value="all">Alle Marken</option>
            {brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <select value={stationFilter} onChange={(e) => onStationFilterChange(e.target.value)} className={selectClass}>
            <option value="all">Alle Stationen</option>
            {stationOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <select value={fuelFilter} onChange={(e) => onFuelFilterChange(e.target.value)} className={selectClass}>
            <option value="all">Alle Kraftstoffe</option>
            {fuelTypes.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onResetFilters}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border surface-premium px-3 py-2 text-xs text-muted-foreground hover:border-[color:var(--status-critical)] hover:text-[color:var(--status-critical)]"
          >
            <Icon name="x" className="h-3.5 w-3.5 shrink-0" />
            Filter zurücksetzen
          </button>
        ) : null}
      </div>

      <div className="-mx-0.5 mb-3 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin [scrollbar-width:thin]">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onStatusFilterChange(tab.value)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs transition-all sm:px-3',
              statusFilter === tab.value
                ? 'sq-tone-brand border-border'
                : 'border-border bg-muted/40 text-muted-foreground hover:border-border',
            )}
          >
            {tab.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                statusFilter === tab.value ? 'sq-tone-brand' : 'sq-chip-neutral',
              )}
            >
              {statusCounts[tab.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="flex max-h-[min(480px,60vh)] flex-col gap-2 overflow-y-auto pr-0.5">
        {visibleVehicles.map((vehicle) => (
          <VehiclePickerCard
            key={vehicle.id}
            vehicle={vehicle}
            selected={selectedVehicleId === vehicle.id}
            health={pickerHealthMap.get(vehicle.id) ?? null}
            dailyLabel={getDailyRateLabel(vehicle.id)}
            catalogLoading={catalogLoading}
            vehicleHasTariff={vehicleHasTariff}
            isDarkMode={isDarkMode}
            onSelect={() => onSelectVehicle(vehicle)}
          />
        ))}

        {visibleVehicles.length === 0 ? (
          <div className="py-12 text-center">
            <Icon name="car" className="mx-auto mb-3 h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Keine Fahrzeuge in dieser Kategorie gefunden</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
