import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { BrandLogo, getBrandFromModel } from '../BrandLogo';
import { StatusChip, type StatusTone } from '../../../components/patterns';
import type { VehicleData } from '../../data/vehicles';
import { useEffectiveHealth } from '../../FleetContext';
import { resolveFleetVehicleDisplayState } from '../../lib/fleetVehicleDisplay';
import {
  VehicleConnectionBadge,
  VehicleHealthChip,
} from './VehicleDetailHeaderBadges';

export type VehicleOperationalUiStatus = 'Available' | 'Manual Block' | 'Maintenance';
export type VehicleCleaningUiStatus = 'Clean' | 'Needs Cleaning';

export interface VehicleDetailHeaderProps {
  vehicle: VehicleData;
  vehicleStatus: VehicleOperationalUiStatus;
  cleaningStatus: VehicleCleaningUiStatus;
  isStatusDropdownOpen: boolean;
  isCleaningDropdownOpen: boolean;
  onToggleStatusDropdown: () => void;
  onToggleCleaningDropdown: () => void;
  onVehicleStatusChange: (status: VehicleOperationalUiStatus) => void;
  onCleaningStatusChange: (status: VehicleCleaningUiStatus) => void;
  onBack: () => void;
}

function MetaItem({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-[11px] font-medium leading-none text-muted-foreground">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/80">
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </span>
  );
}

function readinessChipFromDisplay(
  vehicleStatus: VehicleOperationalUiStatus,
  vehicle: VehicleData,
  rentalHealth: ReturnType<typeof useEffectiveHealth>['health'],
): { label: string; tone: StatusTone; icon: ReactNode } {
  if (vehicleStatus === 'Manual Block') {
    return {
      label: 'Manual Block',
      tone: 'critical',
      icon: <Icon name="x-circle" className="h-3 w-3" />,
    };
  }
  if (vehicleStatus === 'Maintenance') {
    return {
      label: 'Maintenance',
      tone: 'warning',
      icon: <Icon name="wrench" className="h-3 w-3" />,
    };
  }

  const display = resolveFleetVehicleDisplayState(vehicle, { rentalHealth, locale: 'en' });
  const { rentalDisplay } = display;
  if (rentalDisplay.status === 'ready') {
    return {
      label: 'Ready',
      tone: 'success',
      icon: <Icon name="check-circle" className="h-3 w-3" />,
    };
  }
  return {
    label: 'Not Ready',
    tone: rentalDisplay.status === 'blocked' ? 'critical' : 'warning',
    icon: <Icon name="x-circle" className="h-3 w-3" />,
  };
}

export function VehicleDetailHeader({
  vehicle,
  vehicleStatus,
  cleaningStatus,
  isStatusDropdownOpen,
  isCleaningDropdownOpen,
  onToggleStatusDropdown,
  onToggleCleaningDropdown,
  onVehicleStatusChange,
  onCleaningStatusChange,
  onBack,
}: VehicleDetailHeaderProps) {
  const { health: rentalHealth } = useEffectiveHealth(vehicle.id ?? null);
  const readinessChip = readinessChipFromDisplay(vehicleStatus, vehicle, rentalHealth);
  const title = `${vehicle.make ?? ''} ${vehicle.model} ${vehicle.year}`.trim();
  const brand = getBrandFromModel(vehicle.make || vehicle.model || '');

  return (
    <div className="mb-3 animate-fade-up">
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          {/* Meta row: plate + station; mobile last-signal top-right */}
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              {vehicle.license ? (
                <MetaItem icon={<Icon name="car" className="h-3.5 w-3.5" />}>
                  {vehicle.license}
                </MetaItem>
              ) : null}
              {vehicle.station ? (
                <MetaItem icon={<Icon name="map-pin" className="h-3.5 w-3.5" />}>
                  {vehicle.station}
                </MetaItem>
              ) : null}
              {!vehicle.license && !vehicle.station ? (
                <span className="text-[11px] font-medium text-muted-foreground">Vehicle</span>
              ) : null}
            </div>
            <div className="shrink-0 sm:hidden">
              <VehicleConnectionBadge compact vehicleId={vehicle.id} />
            </div>
          </div>

          {/* Title row: brand logo + make/model/year */}
          <div className="mb-2 flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card sm:h-8 sm:w-8">
              <BrandLogo brand={brand} size={22} />
            </span>
            <h1 className="min-w-0 truncate font-display text-[20px] font-bold leading-[1.2] tracking-[-0.02em] text-foreground sm:text-[24px] lg:text-[28px]">
              {title}
            </h1>
          </div>

          {/* Status chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <button
                type="button"
                onClick={onToggleStatusDropdown}
                className="sq-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
                aria-expanded={isStatusDropdownOpen}
                aria-haspopup="menu"
              >
                <StatusChip tone={readinessChip.tone} icon={readinessChip.icon}>
                  {readinessChip.label}
                </StatusChip>
              </button>

              {isStatusDropdownOpen ? (
                <div className="sq-overlay animate-fade-up absolute left-0 top-full z-50 mt-1.5 min-w-[170px] rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => onVehicleStatusChange('Available')}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <Icon name="check-circle" className="h-3.5 w-3.5 text-[color:var(--status-positive)]" />
                    <span className="text-[12px] font-medium text-foreground">Available</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onVehicleStatusChange('Manual Block')}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <Icon name="x-circle" className="h-3.5 w-3.5 text-[color:var(--status-critical)]" />
                    <span className="text-[12px] font-medium text-foreground">Manual Block</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onVehicleStatusChange('Maintenance')}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <Icon name="wrench" className="h-3.5 w-3.5 text-[color:var(--status-attention)]" />
                    <span className="text-[12px] font-medium text-foreground">Maintenance</span>
                  </button>
                </div>
              ) : null}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={onToggleCleaningDropdown}
                className="sq-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
                aria-expanded={isCleaningDropdownOpen}
                aria-haspopup="menu"
              >
                <StatusChip
                  tone={cleaningStatus === 'Clean' ? 'info' : 'critical'}
                  icon={<Icon name="sparkles" className="h-3 w-3" />}
                >
                  {cleaningStatus}
                </StatusChip>
              </button>

              {isCleaningDropdownOpen ? (
                <div className="sq-overlay animate-fade-up absolute left-0 top-full z-50 mt-1.5 min-w-[170px] rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => onCleaningStatusChange('Clean')}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <Icon name="sparkles" className="h-3.5 w-3.5 text-[color:var(--status-info)]" />
                    <span className="text-[12px] font-medium text-foreground">Clean</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onCleaningStatusChange('Needs Cleaning')}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <Icon name="alert-triangle" className="h-3.5 w-3.5 text-[color:var(--status-critical)]" />
                    <span className="text-[12px] font-medium text-foreground">Needs Cleaning</span>
                  </button>
                </div>
              ) : null}
            </div>

            <VehicleHealthChip vehicleId={vehicle.id ?? null} />

            <div className="hidden sm:block">
              <VehicleConnectionBadge vehicleId={vehicle.id} />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="sq-press shrink-0 rounded-xl border border-border/60 bg-card p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
          title="Back to Fleet"
          aria-label="Back to Fleet"
        >
          <Icon name="arrow-left" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
