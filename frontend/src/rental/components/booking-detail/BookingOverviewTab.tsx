import { StatusChip } from '../../../components/patterns';
import type { BookingDetailDto } from '../../../lib/api';
import { normalizeBookingStatus } from '../bookings/bookingStatus';
import type { BookingActionMatrix } from './bookingDetailTypes';
import {
  EM_DASH,
  formatDateTime,
  isPickupOverdue,
} from './bookingDetailUtils';
import { getPrimaryBookingAction } from './bookingActionRules';
import { BookingStationPanel } from './BookingStationPanel';
import { bd } from './booking-detail-ui';

interface BookingOverviewTabProps {
  detail: BookingDetailDto;
  matrix: BookingActionMatrix;
}

export function BookingOverviewTab({ detail, matrix }: BookingOverviewTabProps) {
  const uiStatus = normalizeBookingStatus(detail.core.statusEnum, detail.core.status);
  const primary = getPrimaryBookingAction(detail, matrix);
  const warnings: string[] = [];
  if (detail.health.criticalWarnings.length) warnings.push(...detail.health.criticalWarnings);
  if (detail.eligibility?.blockingReasons.length) warnings.push(...detail.eligibility.blockingReasons);
  if (isPickupOverdue(detail)) warnings.push('Pickup überfällig — noch kein Übergabeprotokoll');

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="rounded-lg border border-current/20 sq-tone-warning px-4 py-3 space-y-1">
          <p className="text-xs font-semibold">Wichtige Hinweise</p>
          <ul className="text-xs space-y-1 list-disc pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={bd.card}>
          <h3 className="text-xs font-bold mb-3">Buchung</h3>
          <dl className="space-y-2 text-xs">
            <Row label="Status" value={detail.core.status} />
            <Row label="Erstellt" value={formatDateTime(detail.core.createdAt)} />
            <Row label="Km inkl." value={detail.core.kmIncluded != null ? `${detail.core.kmIncluded} km` : EM_DASH} />
            <Row label="Km gefahren" value={detail.core.kmDriven != null ? `${detail.core.kmDriven} km` : EM_DASH} />
            <Row
              label="Versicherung"
              value={detail.core.insuranceOptions.length ? detail.core.insuranceOptions.join(', ') : EM_DASH}
            />
          </dl>
        </div>

        <div className={bd.card}>
          <h3 className="text-xs font-bold mb-3">Nächste Aktion</h3>
          <p className="text-sm font-semibold text-foreground">{primary.label}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {uiStatus === 'confirmed' && !detail.handover.pickup
              ? 'Pickup vorbereiten oder No-Show prüfen'
              : uiStatus === 'active'
                ? 'Rückgabe durchführen wenn Fahrzeug zurück ist'
                : 'Keine dringende Aktion'}
          </p>
        </div>

        <div className={bd.card}>
          <h3 className="text-xs font-bold mb-3">Kunde</h3>
          <p className="text-sm font-semibold">{detail.customer.fullName}</p>
          <p className="text-xs text-muted-foreground mt-1">{detail.customer.phone ?? EM_DASH}</p>
          <p className="text-xs text-muted-foreground">{detail.customer.email ?? EM_DASH}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {detail.customer.riskLevel && (
              <StatusChip tone="warning">Risiko: {detail.customer.riskLevel}</StatusChip>
            )}
            {detail.customer.noShowCount > 0 && (
              <StatusChip tone="critical">No-Shows: {detail.customer.noShowCount}</StatusChip>
            )}
          </div>
        </div>

        <div className={bd.card}>
          <h3 className="text-xs font-bold mb-3">Fahrzeug</h3>
          <p className="text-sm font-semibold">
            {detail.vehicle.displayName}
            {detail.vehicle.licensePlate ? ` · ${detail.vehicle.licensePlate}` : ''}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Status: {detail.vehicle.vehicleStatus ?? EM_DASH}</p>
          {detail.vehicle.rentalBlocked && (
            <p className="text-xs text-[color:var(--status-critical)] mt-2">
              Nicht vermietbar: {detail.vehicle.blockingReasons.join(' · ') || 'Blockiert'}
            </p>
          )}
        </div>
      </div>

      {detail.stations && (
        <div>
          <h3 className="text-xs font-bold mb-3">Stationen</h3>
          <BookingStationPanel stations={detail.stations} />
        </div>
      )}

      {detail.core.notes && (        <div className={bd.card}>
          <h3 className="text-xs font-bold mb-2">Notizen</h3>
          <p className="text-xs whitespace-pre-wrap text-foreground">{detail.core.notes}</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground text-right">{value}</dd>
    </div>
  );
}
