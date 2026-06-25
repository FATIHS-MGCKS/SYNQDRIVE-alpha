import { useMemo } from 'react';
import type { Station } from '../../../lib/api';
import { StatusChip } from '../../../components/patterns';
import {
  getStationWarnings,
  isOneWayRental,
  stationLabel,
  stationsForPickup,
  stationsForReturn,
} from '../../lib/stationBookingUtils';

interface StationSelectFieldsProps {
  stations: Station[];
  pickupStationId: string;
  returnStationId: string;
  sameReturnStation: boolean;
  onPickupChange: (id: string) => void;
  onReturnChange: (id: string) => void;
  onSameReturnChange: (same: boolean) => void;
  compact?: boolean;
  /** Operator/mobile — 48px touch targets */
  touchFriendly?: boolean;
}

export function StationSelectFields({
  stations,
  pickupStationId,
  returnStationId,
  sameReturnStation,
  onPickupChange,
  onReturnChange,
  onSameReturnChange,
  compact,
  touchFriendly,
}: StationSelectFieldsProps) {
  const pickupOptions = useMemo(() => stationsForPickup(stations), [stations]);
  const returnOptions = useMemo(() => stationsForReturn(stations), [stations]);
  const pickupStation = stations.find((s) => s.id === pickupStationId);
  const returnStation = stations.find((s) => s.id === returnStationId);
  const oneWay = isOneWayRental(pickupStationId, returnStationId);
  const pickupWarnings = getStationWarnings(pickupStation, 'pickup');
  const returnWarnings = getStationWarnings(returnStation, 'return');
  const labelClass = compact ? 'text-[10px] mb-1 block text-muted-foreground' : 'text-xs mb-1 block text-muted-foreground';
  const inputClass = touchFriendly
    ? 'w-full h-12 px-3 rounded-xl text-base border border-border bg-card text-foreground focus:border-[color:var(--brand)] outline-none'
    : 'w-full px-3 py-2 rounded-lg text-xs border border-border bg-[color:var(--input-background)] text-foreground focus:border-[color:var(--brand)] outline-none';

  return (
    <div className="space-y-3">
      <div className={compact ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
        <div>
          <label className={labelClass}>Abholstation *</label>
          <select
            value={pickupStationId}
            onChange={(e) => onPickupChange(e.target.value)}
            className={inputClass}
          >
            <option value="">Station wählen…</option>
            {pickupOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {stationLabel(s)}
                {s.isPrimary ? ' · Hauptstation' : ''}
              </option>
            ))}
          </select>
          {pickupWarnings.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {pickupWarnings.map((w) => (
                <StatusChip key={w} tone="warning">
                  {w === 'pickupDisabled' ? 'Kein Pickup' : w === 'archived' ? 'Archiviert' : 'Inaktiv'}
                </StatusChip>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className={labelClass}>Rückgabestation *</label>
          <select
            value={sameReturnStation ? pickupStationId : returnStationId}
            disabled={sameReturnStation}
            onChange={(e) => onReturnChange(e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
          >
            <option value="">Station wählen…</option>
            {returnOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {stationLabel(s)}
              </option>
            ))}
          </select>
          {!sameReturnStation && returnWarnings.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {returnWarnings.map((w) => (
                <StatusChip key={w} tone="warning">
                  {w === 'returnDisabled' ? 'Kein Return' : w === 'archived' ? 'Archiviert' : 'Inaktiv'}
                </StatusChip>
              ))}
            </div>
          )}
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={sameReturnStation}
          onChange={(e) => {
            onSameReturnChange(e.target.checked);
            if (e.target.checked && pickupStationId) onReturnChange(pickupStationId);
          }}
        />
        Gleiche Station für Rückgabe
      </label>
      {oneWay && (
        <p className="text-xs sq-tone-info px-3 py-2 rounded-lg border border-border">
          One-Way: Abholung und Rückgabe an unterschiedlichen Stationen.
        </p>
      )}
    </div>
  );
}
