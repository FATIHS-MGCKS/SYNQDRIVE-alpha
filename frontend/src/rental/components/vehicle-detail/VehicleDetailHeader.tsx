import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { BrandLogoMark, getBrandFromModel } from '../BrandLogo';
import { useDocumentDark } from '../../hooks/useDocumentDark';
import { StatusChip } from '../../../components/patterns';
import type { VehicleData } from '../../data/vehicles';
import { useEffectiveHealth } from '../../FleetContext';
import {
  resolveVehicleDetailHeaderReadinessChip,
  type VehicleOperationalUiStatus,
} from '../../lib/vehicle-detail-header-status';
import {
  formatVehicleOperationalEditStatusLabel,
  mapVehicleOperationalEditStatusToCanonical,
  operationalStatusIconName,
  VEHICLE_OPERATIONAL_EDIT_STATUSES,
} from '../../lib/vehicle-operational-state';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { VehicleOperationalStatusCallout } from '../fleet/VehicleOperationalStatusCallout';
import {
  VehicleConnectionBadge,
  VehicleHealthChip,
} from './VehicleDetailHeaderBadges';

export type { VehicleOperationalUiStatus };
export type VehicleCleaningUiStatus = 'Clean' | 'Needs Cleaning';

export interface VehicleDetailHeaderProps {
  vehicle: VehicleData;
  vehicleStatus: VehicleOperationalUiStatus;
  vehicleStatusBusy?: boolean;
  canEditOperationalStatus?: boolean;
  cleaningStatus: VehicleCleaningUiStatus;
  isStatusDropdownOpen: boolean;
  isCleaningDropdownOpen: boolean;
  onToggleStatusDropdown: () => void;
  onToggleCleaningDropdown: () => void;
  onVehicleStatusChange: (status: VehicleOperationalUiStatus) => void;
  onCleaningStatusChange: (status: VehicleCleaningUiStatus) => void;
  onBack: () => void;
  onRefreshOperationalStatus?: () => void;
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

const backButtonClassName =
  'sq-press shrink-0 rounded-xl border border-border/60 bg-background p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]';

export function VehicleDetailHeader({
  vehicle,
  vehicleStatus,
  vehicleStatusBusy = false,
  canEditOperationalStatus = true,
  cleaningStatus,
  isStatusDropdownOpen,
  isCleaningDropdownOpen,
  onToggleStatusDropdown,
  onToggleCleaningDropdown,
  onVehicleStatusChange,
  onCleaningStatusChange,
  onBack,
  onRefreshOperationalStatus,
}: VehicleDetailHeaderProps) {
  const isDarkMode = useDocumentDark();
  const { locale } = useLanguage();
  const { userRole, hasPermission } = useRentalOrg();
  const { health: rentalHealth } = useEffectiveHealth(vehicle.id ?? null);
  const readinessChip = resolveVehicleDetailHeaderReadinessChip(vehicle, rentalHealth, locale);
  const statusControlsDisabled = vehicleStatusBusy || !canEditOperationalStatus;
  const readinessIcon = (
    <Icon
      name={operationalStatusIconName(readinessChip.statusBadge.status)}
      className="h-3 w-3"
    />
  );
  const editLocale = locale.startsWith('de') ? 'de' : 'en';
  const title = `${vehicle.make ?? ''} ${vehicle.model} ${vehicle.year}`.trim();
  const brand = getBrandFromModel({ make: vehicle.make, model: vehicle.model });
  const hasLicense = Boolean(vehicle.license);
  const hasStation = Boolean(vehicle.station);

  return (
    <div className="mb-3 animate-fade-up">
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
                  <MetaItem icon={<Icon name="car" className="h-3.5 w-3.5" />}>
                    {vehicle.license}
                  </MetaItem>
                ) : null}
                {hasLicense && hasStation ? (
                  <span className="h-3 w-px shrink-0 bg-border/60" aria-hidden="true" />
                ) : null}
                {hasStation ? (
                  <MetaItem icon={<Icon name="map-pin" className="h-3.5 w-3.5" />}>
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
              <div className="relative">
                <button
                  type="button"
                  onClick={onToggleStatusDropdown}
                  disabled={statusControlsDisabled}
                  aria-busy={vehicleStatusBusy}
                  className="sq-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] disabled:cursor-not-allowed disabled:opacity-60"
                  aria-expanded={isStatusDropdownOpen}
                  aria-haspopup="menu"
                >
                  <StatusChip tone={readinessChip.tone} icon={readinessIcon}>
                    {vehicleStatusBusy ? '…' : readinessChip.label}
                  </StatusChip>
                </button>

                {isStatusDropdownOpen && !statusControlsDisabled ? (
                  <div className="sq-overlay animate-fade-up absolute left-0 top-full z-50 mt-1.5 min-w-[170px] rounded-xl p-1">
                    {VEHICLE_OPERATIONAL_EDIT_STATUSES.map((editStatus) => (
                      <button
                        key={editStatus}
                        type="button"
                        onClick={() => onVehicleStatusChange(editStatus)}
                        disabled={vehicleStatusBusy}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Icon
                          name={operationalStatusIconName(
                            mapVehicleOperationalEditStatusToCanonical(editStatus),
                          )}
                          className={`h-3.5 w-3.5 ${
                            editStatus === 'Available'
                              ? 'text-[color:var(--status-positive)]'
                              : editStatus === 'Maintenance'
                                ? 'text-[color:var(--status-attention)]'
                                : 'text-[color:var(--status-critical)]'
                          }`}
                        />
                        <span className="text-[12px] font-medium text-foreground">
                          {formatVehicleOperationalEditStatusLabel(editStatus, editLocale)}
                        </span>
                      </button>
                    ))}
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
