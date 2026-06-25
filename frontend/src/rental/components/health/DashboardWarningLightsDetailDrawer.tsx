import tellTaleOilIcon from '../../../assets/icons/telltale/oil.svg';
import tellTaleCelIcon from '../../../assets/icons/telltale/cel.svg';
import tellTaleBrakePadIcon from '../../../assets/icons/telltale/brake-pad.svg';
import tellTaleTirePressureIcon from '../../../assets/icons/telltale/tire-pressure.svg';
import tellTaleBatteryIcon from '../../../assets/icons/telltale/battery.svg';
import { DetailDrawer, StatusChip } from '../../../components/patterns';
import type { DashboardWarningLight, DashboardWarningLightsResponse } from '../../../lib/api';
import {
  DASHBOARD_TELLTALE_KEYS,
  deriveTelltaleDisplayCategory,
  formatObservedAtAbsolute,
  formatRelativeObservedAt,
  resolveSourceFooter,
  resolveTelltalePanelPresentation,
  sortDashboardLights,
  telltaleDetailExplanation,
  telltaleDisplayCategoryLabel,
  telltaleShortLabel,
  telltaleToneFromLight,
} from '../../lib/dashboard-warning-lights-display';
import {
  findBookingForTelltale,
  findTripForTelltale,
  formatTripWindow,
  resolveTelltaleContextInstant,
} from '../../lib/dashboard-warning-lights-context';
import { useRentalOrg } from '../../RentalContext';
import { Icon } from '../ui/Icon';
import { useTelltaleDetailContext } from './useTelltaleDetailContext';

export interface DashboardWarningLightsDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telltales?: DashboardWarningLightsResponse | null;
  vehicleId?: string;
  onOpenBooking?: (bookingId: string) => void;
  onOpenTrips?: (dateIso?: string) => void;
}

function iconForKey(key: string): string {
  if (key === 'engine_oil_level') return tellTaleOilIcon;
  if (key === 'engine_limp_mode' || key === 'check_engine_light') return tellTaleCelIcon;
  if (key === 'brake_lining_wear_pre_warning') return tellTaleBrakePadIcon;
  if (key === 'tire_pressure_warning') return tellTaleTirePressureIcon;
  if (key === 'battery_warning_light') return tellTaleBatteryIcon;
  return tellTaleCelIcon;
}

function freshnessLabel(freshness: DashboardWarningLightsResponse['freshness'] | undefined): string {
  switch (freshness) {
    case 'fresh':
      return 'Aktuell';
    case 'aging':
      return 'Leicht verzögert';
    case 'stale':
      return 'Veraltet';
    case 'no_data':
      return 'Keine Daten';
    case 'error':
      return 'Fehler';
    default:
      return 'Unbekannt';
  }
}

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 text-[10px]">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right tabular-nums">{value}</span>
    </div>
  );
}

function LightDetailCard({
  light,
  envelopeFreshness,
  onOpenBooking,
  onOpenTrips,
  bookings,
  trips,
}: {
  light: DashboardWarningLight;
  envelopeFreshness?: DashboardWarningLightsResponse['freshness'];
  onOpenBooking?: (bookingId: string) => void;
  onOpenTrips?: (dateIso?: string) => void;
  bookings: ReturnType<typeof useTelltaleDetailContext>['bookings'];
  trips: ReturnType<typeof useTelltaleDetailContext>['trips'];
}) {
  const category = deriveTelltaleDisplayCategory(light, envelopeFreshness);
  const tone = telltaleToneFromLight(light);
  const contextInstant = resolveTelltaleContextInstant(light);
  const booking = findBookingForTelltale(bookings, contextInstant);
  const trip = findTripForTelltale(trips, contextInstant);
  const source = light.sourceSignal ? light.sourceSignal.replace(/^.*\./, '') : 'HM/OEM Health';

  const toneBorder =
    tone === 'critical'
      ? 'border-red-500/30'
      : tone === 'alert'
        ? 'border-amber-500/30'
        : 'border-border/60';

  return (
    <div className={`rounded-xl border ${toneBorder} bg-card/50 p-3 space-y-2`}>
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
          <img src={iconForKey(light.key)} alt="" aria-hidden className="w-4 h-4 object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] font-semibold text-foreground">{telltaleShortLabel(light.key)}</span>
            <StatusChip
              tone={
                category === 'active'
                  ? light.severity === 'critical'
                    ? 'critical'
                    : 'watch'
                  : category === 'historical'
                    ? 'watch'
                    : category === 'stale'
                      ? 'neutral'
                      : category === 'off_confirmed'
                        ? 'success'
                        : 'neutral'
              }
              className="!text-[9px]"
            >
              {telltaleDisplayCategoryLabel(category)}
            </StatusChip>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
            {telltaleDetailExplanation(light, category)}
          </p>
        </div>
      </div>

      <div className="space-y-1 pt-1 border-t border-border/40">
        <MetaRow label="Zuletzt gesehen" value={formatObservedAtAbsolute(light.lastSeenAt ?? light.observedAt)} />
        <MetaRow label="Zuletzt aktiv bestätigt" value={formatObservedAtAbsolute(light.lastConfirmedActiveAt)} />
        <MetaRow label="Zuletzt aus bestätigt" value={formatObservedAtAbsolute(light.lastConfirmedOffAt)} />
        <MetaRow label="Datenquelle" value={source} />
        <MetaRow
          label="Datenfrische"
          value={freshnessLabel(light.freshness ?? envelopeFreshness)}
        />
        {light.freshness === 'stale' || envelopeFreshness === 'stale' ? (
          <MetaRow
            label="Alter"
            value={formatRelativeObservedAt(light.lastSeenAt ?? light.observedAt) ?? undefined}
          />
        ) : null}
      </div>

      <div className="pt-1 border-t border-border/40 space-y-1.5">
        {booking ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] text-muted-foreground min-w-0">
              <span className="font-medium text-foreground">{booking.bookingNumber}</span>
              {' · '}
              {booking.customerName}
              {booking.status ? ` · ${booking.status}` : ''}
            </div>
            {onOpenBooking && (
              <button
                type="button"
                onClick={() => onOpenBooking(booking.id)}
                className="text-[10px] font-medium text-[color:var(--brand)] hover:underline shrink-0"
              >
                Buchung öffnen
              </button>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">Keiner Buchung zugeordnet</p>
        )}

        {trip ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">{formatTripWindow(trip)}</span>
            {onOpenTrips && (
              <button
                type="button"
                onClick={() => onOpenTrips(trip.startTime)}
                className="text-[10px] font-medium text-[color:var(--brand)] hover:underline shrink-0"
              >
                Fahrt prüfen
              </button>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground">Kein Fahrtenkontext verfügbar</p>
        )}
      </div>
    </div>
  );
}

export function DashboardWarningLightsDetailDrawer({
  open,
  onOpenChange,
  telltales,
  vehicleId,
  onOpenBooking,
  onOpenTrips,
}: DashboardWarningLightsDetailDrawerProps) {
  const { orgId } = useRentalOrg();
  const presentation = resolveTelltalePanelPresentation(telltales);
  const { bookings, trips, loading: contextLoading, error: contextError } = useTelltaleDetailContext({
    orgId,
    vehicleId,
    enabled: open,
  });

  const envelopeFreshness = telltales?.freshness;
  const lights = sortDashboardLights(
    (telltales?.lights ?? []).filter((l) =>
      (DASHBOARD_TELLTALE_KEYS as readonly string[]).includes(l.key),
    ),
  );
  const lastUpdateAbs = formatObservedAtAbsolute(telltales?.lastObservedAt);
  const lastUpdateRel = formatRelativeObservedAt(telltales?.lastObservedAt);

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Tacho Warnleuchten"
      eyebrow="Fahrzeug · Health"
      description={presentation.summaryText}
      status={
        <StatusChip tone={presentation.badgeTone} dot>
          {presentation.badgeLabel}
        </StatusChip>
      }
      widthClassName="sm:max-w-xl"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
          <div className="flex flex-wrap justify-between gap-2 text-[10px]">
            <span className="text-muted-foreground">{resolveSourceFooter(telltales)}</span>
            {lastUpdateRel && (
              <span className="text-muted-foreground tabular-nums">
                {lastUpdateAbs} ({lastUpdateRel})
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-muted-foreground block text-[9px] uppercase tracking-wide">Aktiv</span>
              <span className="font-semibold tabular-nums">{presentation.activeCount}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[9px] uppercase tracking-wide">Historisch</span>
              <span className="font-semibold tabular-nums">{presentation.historicalCount}</span>
            </div>
          </div>
          {envelopeFreshness === 'stale' && (
            <p className="text-[10px] text-[color:var(--status-watch)] flex items-center gap-1">
              <Icon name="alert-triangle" className="w-3 h-3" />
              Datenstand verzögert — keine Aktiv-Zählung ohne frische Bestätigung.
            </p>
          )}
          {!presentation.isConnected && (
            <p className="text-[10px] text-muted-foreground">
              Fahrzeug nicht mit HM/OEM Health verbunden oder Telltales nicht unterstützt.
            </p>
          )}
        </div>

        {contextLoading && (
          <p className="text-[10px] text-muted-foreground">Buchungs- und Fahrtkontext wird geladen …</p>
        )}
        {contextError && (
          <p className="text-[10px] text-[color:var(--status-watch)]">{contextError}</p>
        )}

        <div className="space-y-2.5">
          {lights.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Keine Warnleuchten-Daten verfügbar.</p>
          ) : (
            lights.map((light) => (
              <LightDetailCard
                key={light.key}
                light={light}
                envelopeFreshness={envelopeFreshness}
                onOpenBooking={onOpenBooking}
                onOpenTrips={onOpenTrips}
                bookings={bookings}
                trips={trips}
              />
            ))
          )}
        </div>
      </div>
    </DetailDrawer>
  );
}
