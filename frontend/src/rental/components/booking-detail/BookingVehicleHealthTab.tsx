import { StatusChip } from '../../../components/patterns';
import type { BookingDetailDto } from '../../../lib/api';
import { RentalHealthBadge } from '../rental-health/RentalHealthBadge';
import { useVehicleHealth } from '../../hooks/useVehicleHealth';
import { EM_DASH } from './bookingDetailUtils';

const card = 'rounded-lg border border-border bg-card p-4';

interface BookingVehicleHealthTabProps {
  orgId: string;
  detail: BookingDetailDto;
  onOpenVehicle?: (vehicleId: string) => void;
}

export function BookingVehicleHealthTab({ orgId, detail, onOpenVehicle }: BookingVehicleHealthTabProps) {
  const v = detail.vehicle;
  const { data: health, loading } = useVehicleHealth(orgId, v.vehicleId);

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-bold">Fahrzeug</h3>
          {onOpenVehicle && (
            <button
              type="button"
              onClick={() => onOpenVehicle(v.vehicleId)}
              className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
            >
              Fahrzeug öffnen
            </button>
          )}
        </div>
        <dl className="space-y-2 text-xs">
          <Row label="Bezeichnung" value={v.displayName} />
          <Row label="Kennzeichen" value={v.licensePlate || EM_DASH} />
          <Row label="VIN" value={v.vin ?? EM_DASH} />
          <Row label="Status" value={v.vehicleStatus ?? EM_DASH} />
          <Row
            label="Kilometerstand"
            value={v.odometerKm != null ? `${v.odometerKm.toLocaleString('de-DE')} km` : EM_DASH}
          />
        </dl>
      </div>

      <div className={card}>
        <h3 className="text-xs font-bold mb-3">Rental Health</h3>
        {loading && !health ? (
          <p className="text-xs text-muted-foreground">Lade Health-Daten…</p>
        ) : health ? (
          <div className="space-y-3">
            <RentalHealthBadge health={health} size="md" showBlockingLabel />
            {health.rental_blocked && (
              <p className="text-xs text-[color:var(--status-critical)]">
                {health.blocking_reasons.join(' · ')}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {detail.health.overallState
              ? `Zusammenfassung: ${detail.health.overallState}`
              : 'Keine Live-Health-Daten verfügbar'}
          </p>
        )}
        {(detail.health.criticalWarnings.length > 0 || detail.health.warningWarnings.length > 0) && (
          <div className="mt-4 space-y-2">
            {detail.health.criticalWarnings.map((w) => (
              <StatusChip key={w} tone="critical">
                {w}
              </StatusChip>
            ))}
            {detail.health.warningWarnings.map((w) => (
              <StatusChip key={w} tone="warning">
                {w}
              </StatusChip>
            ))}
          </div>
        )}
      </div>
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
