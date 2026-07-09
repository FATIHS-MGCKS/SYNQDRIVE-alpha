import { Icon } from '../ui/Icon';
import { SupportContextButton } from '../../../components/support/SupportContextButton';
import type { BookingDetailDto } from '../../../lib/api';
import {
  BookingStatusBadge,
  normalizeBookingStatus,
} from '../bookings/bookingStatus';
import { StatusChip } from '../../../components/patterns';
import type { BookingActionMatrix, BookingPrimaryAction } from './bookingDetailTypes';
import {
  documentsShortStatus,
  financeShortStatus,
  formatDateRange,
  handoverShortStatus,
} from './bookingDetailUtils';

interface BookingDetailHeaderProps {
  detail: BookingDetailDto;
  primary: BookingPrimaryAction;
  matrix: BookingActionMatrix;
  onBack: () => void;
  onPrimaryAction: () => void;
  onCancel?: () => void;
  onEdit?: () => void;
  onNoShow?: () => void;
  sticky?: boolean;
}

export function BookingDetailHeader({
  detail,
  primary,
  matrix,
  onBack,
  onPrimaryAction,
  onCancel,
  onEdit,
  onNoShow,
  sticky = true,
}: BookingDetailHeaderProps) {
  const uiStatus = normalizeBookingStatus(detail.core.statusEnum, detail.core.status);
  const primaryDisabled = primary.key === 'none';
  const primaryReason =
    primary.key === 'pickup'
      ? matrix.pickup.reason
      : primary.key === 'return'
        ? matrix.return.reason
        : primary.key === 'no_show'
          ? matrix.no_show.reason
          : primary.key === 'edit'
            ? matrix.edit.reason
            : undefined;

  return (
    <div
      className={`${sticky ? 'sticky top-0 z-20 surface-frosted' : ''} -mx-4 px-4 py-3 mb-4 border-b border-border`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Zurück"
          >
            <Icon name="arrow-left" className="w-5 h-5" />
          </button>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono font-semibold text-muted-foreground">
                {detail.core.bookingNumber}
              </span>
              <BookingStatusBadge status={uiStatus} />
            </div>
            <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">
              {detail.customer.fullName}
              <span className="text-muted-foreground font-normal">
                {' '}
                · {detail.vehicle.displayName}
                {detail.vehicle.licensePlate ? ` · ${detail.vehicle.licensePlate}` : ''}
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">
              {formatDateRange(detail.core.startDate, detail.core.endDate)}
            </p>
            <p className="text-xs text-muted-foreground">
              {detail.core.pickupStationName ?? '—'} → {detail.core.returnStationName ?? '—'}
            </p>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <StatusChip tone="neutral">{financeShortStatus(detail)}</StatusChip>
              <StatusChip tone="neutral">Dokumente: {documentsShortStatus(detail)}</StatusChip>
              <StatusChip tone="neutral">Übergabe: {handoverShortStatus(detail)}</StatusChip>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <SupportContextButton
            kind="booking"
            contextData={{
              bookingId: detail.core.bookingId,
              bookingRef: detail.core.bookingNumber,
              customerName: detail.customer?.fullName,
              vehicleId: detail.vehicle?.vehicleId,
              status: detail.core.statusEnum ?? detail.core.status,
            }}
          />
          <button
            type="button"
            disabled={primaryDisabled}
            title={primaryDisabled ? primaryReason : undefined}
            onClick={onPrimaryAction}
            className={`sq-press px-4 py-2 rounded-lg text-xs font-semibold ${
              primaryDisabled
                ? 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground'
                : 'sq-tone-brand'
            }`}
          >
            {primary.label}
          </button>
          <div className="relative group">
            <button
              type="button"
              className="sq-press px-3 py-2 rounded-lg text-xs font-semibold border border-border bg-card hover:bg-muted"
            >
              Aktionen
              <Icon name="chevron-down" className="w-3.5 h-3.5 inline ml-1" />
            </button>
            <div className="absolute right-0 mt-1 w-52 rounded-lg border border-border bg-card shadow-lg py-1 hidden group-hover:block group-focus-within:block z-30">
              <MenuItem
                label="Bearbeiten"
                disabled={!matrix.edit.allowed}
                reason={matrix.edit.reason}
                onClick={onEdit}
              />
              <MenuItem
                label="Stornieren"
                disabled={!matrix.cancel.allowed}
                reason={matrix.cancel.reason}
                onClick={onCancel}
              />
              <MenuItem
                label="No-Show markieren"
                disabled={!matrix.no_show.allowed}
                reason={matrix.no_show.reason}
                onClick={onNoShow}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuItem({
  label,
  disabled,
  reason,
  onClick,
}: {
  label: string;
  disabled: boolean;
  reason?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || !onClick}
      title={disabled ? reason : undefined}
      onClick={onClick}
      className={`w-full text-left px-3 py-2 text-xs ${
        disabled ? 'text-muted-foreground opacity-50 cursor-not-allowed' : 'hover:bg-muted text-foreground'
      }`}
    >
      {label}
    </button>
  );
}
