import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { BrandLogoMark, getBrandFromModel } from '../BrandLogo';
import { useDocumentDark } from '../../hooks/useDocumentDark';
import { StatusChip, type StatusTone } from '../../../components/patterns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import type { VehicleData } from '../../data/vehicles';
import { useEffectiveHealth } from '../../FleetContext';
import { resolveFleetVehicleDisplayState } from '../../lib/fleetVehicleDisplay';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { VehicleOperationalStatusCallout } from '../fleet/VehicleOperationalStatusCallout';
import {
  VehicleConnectionBadge,
  VehicleHealthChip,
} from './VehicleDetailHeaderBadges';
import {
  VEHICLE_DETAIL_BACK_BUTTON_CLASS,
  VEHICLE_DETAIL_CHIP_TRIGGER_CLASS,
} from '../../lib/vehicle-detail-mobile-ui';

export type VehicleOperationalUiStatus = 'Available' | 'Manual Block' | 'Maintenance';
export type VehicleCleaningUiStatus = 'Clean' | 'Needs Cleaning';

export interface VehicleDetailHeaderProps {
  vehicle: VehicleData;
  vehicleStatus: VehicleOperationalUiStatus;
  cleaningStatus: VehicleCleaningUiStatus;
  onVehicleStatusChange: (status: VehicleOperationalUiStatus) => void;
  onCleaningStatusChange: (status: VehicleCleaningUiStatus) => void;
  onBack: () => void;
  onRefreshOperationalStatus?: () => void;
}

function MetaItem({
  icon,
  children,
  dataTestId,
}: {
  icon: ReactNode;
  children: ReactNode;
  dataTestId?: string;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-[11px] font-medium leading-none text-muted-foreground">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/80">
        {icon}
      </span>
      <span className="truncate" data-testid={dataTestId}>
        {children}
      </span>
    </span>
  );
}

const backButtonClassName =
  'sq-press shrink-0 rounded-xl border border-border/60 bg-background text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] ' +
  VEHICLE_DETAIL_BACK_BUTTON_CLASS;

function readinessChipFromDisplay(
  vehicleStatus: VehicleOperationalUiStatus,
  vehicle: VehicleData,
  rentalHealth: ReturnType<typeof useEffectiveHealth>['health'],
  locale: string,
): {
  label: string;
  tone: StatusTone;
  icon: ReactNode;
  supplement: string | null;
  supplementDetail: string | null;
  statusBadge: ReturnType<typeof resolveFleetVehicleDisplayState>['statusBadge'];
} {
  if (vehicleStatus === 'Manual Block') {
    return {
      label: 'Manual Block',
      tone: 'critical',
      icon: <Icon name="x-circle" className="h-3 w-3" />,
      supplement: null,
      supplementDetail: null,
      statusBadge: resolveFleetVehicleDisplayState(vehicle, { rentalHealth, locale }).statusBadge,
    };
  }
  if (vehicleStatus === 'Maintenance') {
    return {
      label: 'Maintenance',
      tone: 'warning',
      icon: <Icon name="wrench" className="h-3 w-3" />,
      supplement: null,
      supplementDetail: null,
      statusBadge: resolveFleetVehicleDisplayState(vehicle, { rentalHealth, locale }).statusBadge,
    };
  }

  const display = resolveFleetVehicleDisplayState(vehicle, {
    rentalHealth,
    locale,
    compact: false,
  });
  const { statusBadge, bookingSupplement } = display;

  return {
    label: statusBadge.label,
    tone: statusBadge.tone,
    icon:
      statusBadge.status === 'AVAILABLE' ? (
        <Icon name="check-circle" className="h-3 w-3" />
      ) : statusBadge.status === 'ACTIVE_RENTED' ? (
        <Icon name="car" className="h-3 w-3" />
      ) : statusBadge.status === 'RESERVED' ? (
        <Icon name="calendar" className="h-3 w-3" />
      ) : (
        <Icon name="alert-triangle" className="h-3 w-3" />
      ),
    supplement:
      statusBadge.unreliableExplanation ??
      bookingSupplement?.short ??
      statusBadge.dataQualityHint,
    supplementDetail:
      statusBadge.unreliableExplanation ??
      bookingSupplement?.detail ??
      statusBadge.dataQualityHint,
    statusBadge,
  };
}

export function VehicleDetailHeader({
  vehicle,
  vehicleStatus,
  cleaningStatus,
  onVehicleStatusChange,
  onCleaningStatusChange,
  onBack,
  onRefreshOperationalStatus,
}: VehicleDetailHeaderProps) {
  const isDarkMode = useDocumentDark();
  const { locale } = useLanguage();
  const { userRole, hasPermission } = useRentalOrg();
  const { health: rentalHealth } = useEffectiveHealth(vehicle.id ?? null);
  const readinessChip = readinessChipFromDisplay(vehicleStatus, vehicle, rentalHealth, locale);
  const title = `${vehicle.make ?? ''} ${vehicle.model} ${vehicle.year}`.trim();
  const brand = getBrandFromModel({ make: vehicle.make, model: vehicle.model });
  const hasLicense = Boolean(vehicle.license);
  const hasStation = Boolean(vehicle.station);
  const [statusAnnouncement, setStatusAnnouncement] = useState('');

  useEffect(() => {
    setStatusAnnouncement(`Vehicle status updated to ${vehicleStatus}`);
  }, [vehicleStatus]);

  useEffect(() => {
    setStatusAnnouncement(`Cleaning status updated to ${cleaningStatus}`);
  }, [cleaningStatus]);

  return (
    <div
      className="mb-3 min-w-0 max-w-full animate-fade-up overflow-x-clip motion-reduce:animate-none"
      data-testid="vehicle-detail-header"
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {statusAnnouncement}
      </p>
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          {/* Row 1 — Meta / Navigation / Signal */}
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:gap-2">
              <button
                type="button"
                onClick={onBack}
                className={`${backButtonClassName} sm:hidden`}
                title="Back to Fleet"
                aria-label="Back to Fleet"
              >
                <Icon name="arrow-left" className="h-4 w-4" />
              </button>

              <div className="flex min-w-0 flex-1 items-center gap-x-2 overflow-hidden sm:flex-wrap sm:gap-x-3 sm:gap-y-1">
                {hasLicense ? (
                  <MetaItem
                    icon={<Icon name="car" className="h-3.5 w-3.5" />}
                    dataTestId="vehicle-detail-license"
                  >
                    {vehicle.license}
                  </MetaItem>
                ) : null}
                {hasLicense && hasStation ? (
                  <span className="h-3 w-px shrink-0 bg-border/60" aria-hidden="true" />
                ) : null}
                {hasStation ? (
                  <MetaItem
                    icon={<Icon name="map-pin" className="h-3.5 w-3.5" />}
                    dataTestId="vehicle-detail-station"
                  >
                    {vehicle.station}
                  </MetaItem>
                ) : null}
                {!hasLicense && !hasStation ? (
                  <span className="truncate text-[11px] font-medium text-muted-foreground">Vehicle</span>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 sm:hidden">
              <VehicleConnectionBadge compact vehicleId={vehicle.id} />
            </div>
          </div>

          {/* Row 2 — Vehicle identity + status chips (responsive on mobile) */}
          <div className="flex flex-col gap-1.5 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between min-[420px]:gap-2 sm:flex-col sm:items-start">
            <div className="flex min-w-0 items-center gap-2">
              <BrandLogoMark brand={brand} isDarkMode={isDarkMode} />
              <h1 className="min-w-0 truncate font-display text-[20px] font-bold leading-[1.2] tracking-[-0.02em] text-foreground sm:text-[24px] lg:text-[28px]">
                {title}
              </h1>
            </div>

            <div className="flex min-w-0 flex-col items-start gap-1 sm:shrink-0">
              <div className="flex flex-wrap items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    data-testid="vehicle-detail-status-trigger"
                    className={`sq-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] ${VEHICLE_DETAIL_CHIP_TRIGGER_CLASS}`}
                    aria-label={`Vehicle readiness status, currently ${readinessChip.label}`}
                  >
                    <StatusChip tone={readinessChip.tone} icon={readinessChip.icon}>
                      {readinessChip.label}
                    </StatusChip>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="sq-overlay min-w-[170px] rounded-xl p-1 motion-reduce:animate-none"
                >
                  <DropdownMenuItem
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium"
                    onClick={() => onVehicleStatusChange('Available')}
                  >
                    <Icon name="check-circle" className="h-3.5 w-3.5 text-[color:var(--status-positive)]" />
                    Available
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium"
                    onClick={() => onVehicleStatusChange('Manual Block')}
                  >
                    <Icon name="x-circle" className="h-3.5 w-3.5 text-[color:var(--status-critical)]" />
                    Manual Block
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium"
                    onClick={() => onVehicleStatusChange('Maintenance')}
                  >
                    <Icon name="wrench" className="h-3.5 w-3.5 text-[color:var(--status-attention)]" />
                    Maintenance
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    data-testid="vehicle-detail-cleaning-trigger"
                    className={`sq-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] ${VEHICLE_DETAIL_CHIP_TRIGGER_CLASS}`}
                    aria-label={`Cleaning status, currently ${cleaningStatus}`}
                  >
                    <StatusChip
                      tone={cleaningStatus === 'Clean' ? 'info' : 'critical'}
                      icon={<Icon name="sparkles" className="h-3 w-3" />}
                    >
                      {cleaningStatus}
                    </StatusChip>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="sq-overlay min-w-[170px] rounded-xl p-1 motion-reduce:animate-none"
                >
                  <DropdownMenuItem
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium"
                    onClick={() => onCleaningStatusChange('Clean')}
                  >
                    <Icon name="sparkles" className="h-3.5 w-3.5 text-[color:var(--status-info)]" />
                    Clean
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium"
                    onClick={() => onCleaningStatusChange('Needs Cleaning')}
                  >
                    <Icon name="alert-triangle" className="h-3.5 w-3.5 text-[color:var(--status-critical)]" />
                    Needs Cleaning
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <VehicleHealthChip vehicleId={vehicle.id ?? null} />

              <div className="hidden sm:block">
                <VehicleConnectionBadge vehicleId={vehicle.id} />
              </div>
              </div>

              {readinessChip.supplement && !readinessChip.statusBadge.showUnreliableCallout ? (
                <p
                  className="max-w-full truncate text-[10.5px] text-muted-foreground sm:max-w-[min(100%,420px)]"
                  title={readinessChip.supplementDetail ?? readinessChip.supplement}
                >
                  {readinessChip.supplement}
                </p>
              ) : null}

              {readinessChip.statusBadge.showUnreliableCallout ? (
                <VehicleOperationalStatusCallout
                  vehicle={vehicle}
                  statusBadge={readinessChip.statusBadge}
                  locale={locale}
                  access={{ userRole, hasPermission }}
                  onRefresh={onRefreshOperationalStatus}
                  className="w-full max-w-[min(100%,420px)]"
                />
              ) : null}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onBack}
          className={`${backButtonClassName} hidden sm:inline-flex`}
          title="Back to Fleet"
          aria-label="Back to Fleet"
        >
          <Icon name="arrow-left" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
