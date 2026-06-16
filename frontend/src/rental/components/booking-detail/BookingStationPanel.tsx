import { MapPin, Phone, Mail, Clock, AlertTriangle } from 'lucide-react';
import type { BookingStationContext } from '../../../lib/api';
import { StatusChip } from '../../../components/patterns';
import { formatOpeningHoursSummary, parseOpeningHours } from '../../lib/stationUtils';
import type { Station } from '../../../lib/api';

const card = 'rounded-lg border border-border bg-card p-4';

function StationCard({
  title,
  planned,
  actual,
  purpose,
}: {
  title: string;
  planned: BookingStationContext | null;
  actual: BookingStationContext | null;
  purpose: 'pickup' | 'return';
}) {
  const hasDeviation =
    planned &&
    actual &&
    planned.stationId !== actual.stationId;
  const instructions =
    purpose === 'pickup'
      ? planned?.handoverInstructions
      : planned?.returnInstructions;

  if (!planned && !actual) {
    return (
      <div className={card}>
        <h3 className="text-xs font-bold mb-2">{title}</h3>
        <p className="text-xs text-muted-foreground">Keine Station hinterlegt (Legacy-Freitext möglich).</p>
      </div>
    );
  }

  const display = actual ?? planned;

  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-xs font-bold">{title}</h3>
        {hasDeviation && (
          <StatusChip tone="warning" icon={<AlertTriangle className="w-3 h-3" />}>
            Abweichung
          </StatusChip>
        )}
      </div>
      {display && (
        <>
          <p className="text-sm font-semibold">{display.name}</p>
          {display.address && (
            <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {display.address}
            </p>
          )}
          <dl className="mt-3 space-y-1.5 text-xs">
            {planned && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Geplant</dt>
                <dd className="font-medium text-right">{planned.name}</dd>
              </div>
            )}
            {actual && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Tatsächlich</dt>
                <dd className="font-medium text-right">{actual.name}</dd>
              </div>
            )}
            {display.phone && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="w-3 h-3" />
                {display.phone}
              </div>
            )}
            {display.email && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Mail className="w-3 h-3" />
                {display.email}
              </div>
            )}
            {display.openingHours != null && (
              <div className="flex items-start gap-1.5 text-muted-foreground">
                <Clock className="w-3 h-3 shrink-0 mt-0.5" />
                {typeof display.openingHours === 'string'
                  ? display.openingHours
                  : formatOpeningHoursSummary(
                      parseOpeningHours(display.openingHours as Station['openingHours']),
                    )}
              </div>
            )}
          </dl>
          {instructions && (
            <p className="text-xs mt-3 pt-3 border-t border-border/60 whitespace-pre-wrap text-muted-foreground">
              {instructions}
            </p>
          )}
        </>
      )}
    </div>
  );
}

interface BookingStationPanelProps {
  stations: {
    pickup: BookingStationContext | null;
    return: BookingStationContext | null;
    actualPickup: BookingStationContext | null;
    actualReturn: BookingStationContext | null;
    isOneWayRental: boolean;
  };
}

export function BookingStationPanel({ stations }: BookingStationPanelProps) {
  return (
    <div className="space-y-3">
      {stations.isOneWayRental && (
        <p className="text-xs px-3 py-2 rounded-lg border border-border sq-tone-info">
          One-Way-Miete: unterschiedliche Abhol- und Rückgabestation.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <StationCard
          title="Abholstation"
          planned={stations.pickup}
          actual={stations.actualPickup}
          purpose="pickup"
        />
        <StationCard
          title="Rückgabestation"
          planned={stations.return}
          actual={stations.actualReturn}
          purpose="return"
        />
      </div>
    </div>
  );
}
