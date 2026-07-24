import { Icon } from '../ui/Icon';
import { SupportContextButton } from '../../../components/support/SupportContextButton';
import type { BookingDetailDto } from '../../../lib/api';
import {
  BookingStatusBadge,
  normalizeBookingStatus,
} from '../bookings/bookingStatus';
import { StatusChip } from '../../../components/patterns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import type { BookingActionMatrix, BookingPrimaryAction } from './bookingDetailTypes';
import {
  documentsShortStatus,
  financeShortStatus,
  formatDateRange,
  handoverShortStatus,
} from './bookingDetailUtils';
import { BOOKING_FOCUS_RING } from '../bookings/bookings-a11y';

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
            className={`min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 ${BOOKING_FOCUS_RING}`}
            aria-label="Zurück"
          >
            <Icon name="arrow-left" className="w-5 h-5" aria-hidden />
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
            aria-label={primaryDisabled && primaryReason ? `${primary.label}: ${primaryReason}` : primary.label}
            onClick={onPrimaryAction}
            className={`sq-press min-h-11 px-4 py-2 rounded-lg text-xs font-semibold ${BOOKING_FOCUS_RING} ${
              primaryDisabled
                ? 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground'
                : 'sq-tone-brand'
            }`}
          >
            {primary.label}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-haspopup="menu"
                className={`sq-press min-h-11 px-3 py-2 rounded-lg text-xs font-semibold border border-border surface-premium hover:bg-muted ${BOOKING_FOCUS_RING}`}
              >
                Aktionen
                <Icon name="chevron-down" className="w-3.5 h-3.5 inline ml-1" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                disabled={!matrix.edit.allowed || !onEdit}
                title={!matrix.edit.allowed ? matrix.edit.reason : undefined}
                onSelect={() => onEdit?.()}
              >
                Bearbeiten
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!matrix.cancel.allowed || !onCancel}
                title={!matrix.cancel.allowed ? matrix.cancel.reason : undefined}
                onSelect={() => onCancel?.()}
              >
                Stornieren
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!matrix.no_show.allowed || !onNoShow}
                title={!matrix.no_show.allowed ? matrix.no_show.reason : undefined}
                onSelect={() => onNoShow?.()}
              >
                No-Show markieren
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
