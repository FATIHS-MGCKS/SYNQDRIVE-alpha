import { Icon } from './ui/Icon';
import { useMemo } from 'react';

import { VehicleData, isVehicleOffline, VEHICLE_OFFLINE_LABEL } from '../data/vehicles';
import { useFleetVehicles, useEffectiveHealth } from '../FleetContext';
import { RentalHealthBadge } from './rental-health/RentalHealthBadge';
import type { Station, VehicleHealthResponse } from '../../lib/api';
import { useAddress } from '../../lib/useAddress';
import { HomeAwayBadge, buildStationLookup } from './HomeAwayBadge';
import {
  formatOdometerKmFloor,
  formatFuelPercentCeil,
  formatFleetDateTime,
  formatMaintenanceReason,
} from '../../lib/formatVehicleDisplay';

// V4.6.85 — the fleet-status popups must honor the global card rule:
// every card shows health, fuel/SoC, odometer and last known address,
// with graceful "—" fallbacks when telemetry is absent. `canonicalFuel`
// / `canonicalOdometer` read the nullable canonical fields emitted by
// the backend (see `VehiclesService.deriveFleetStatusContext`). `0` is
// preserved as a valid reading ("empty tank"), only truly missing data
// resolves to `null`.
function canonicalFuel(v: VehicleData): number | null {
  const preferred = v.isElectric
    ? v.evSoc ?? v.fuelPercent
    : v.fuelPercent ?? v.evSoc;
  return typeof preferred === 'number' && Number.isFinite(preferred)
    ? preferred
    : null;
}

function canonicalOdometer(v: VehicleData): number | null {
  return typeof v.odometerKm === 'number' && Number.isFinite(v.odometerKm)
    ? v.odometerKm
    : null;
}

function VehicleAddress({ v, isDarkMode }: { v: VehicleData; isDarkMode: boolean }) {
  const { address } = useAddress(v.lat, v.lng);
  const label = address?.formatted && address.formatted !== '—' ? address.formatted : v.station;
  return <span className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{label}</span>;
}

// V4.7.06 — `HomeAwayBadge`, `StationLookup` and `resolveVehicleStation`
// were extracted to `./HomeAwayBadge.tsx` so the FleetView (Operations →
// Fleet status cards) can reuse exactly the same three-state geofence
// chip without duplicating the logic. This file imports `HomeAwayBadge`
// + `buildStationLookup` from there. See `HomeAwayBadge.tsx` for the
// canonical comments on the visual states (HOME / AWAY / UNKNOWN) and
// the underlying `isVehicleAtHomeStation` helper.

// V4.6.94 — fixed-width percent text + tabular-nums so values like "9%",
// "47%" and "100%" line up in a column across vehicle rows.
// V4.7.11 — Mirrors `FleetView > FuelCell`: at <20% the canonical fuel
// icon picks up the critical tone *and* a soft red drop-shadow halo,
// the percentage text flips to critical too. Three coherent cues at
// the most urgent end of the scale (icon glow, bar already red at
// ≤25%, red number) — static, no animation, so the row is unmissable
// without distracting from the rest of the list.
function FuelStripe({ v, isDarkMode }: { v: VehicleData; isDarkMode: boolean }) {
  const value = canonicalFuel(v);
  if (value == null) {
    return (
      <div className="flex items-center gap-1.5">
        <Icon name="fuel" className={`w-3 h-3 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
        <div className={`w-12 h-1 rounded-full overflow-hidden shrink-0 ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-100'}`} />
        <span className={`text-[10px] font-semibold shrink-0 w-8 text-right tabular-nums ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>—</span>
      </div>
    );
  }
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const isCriticallyLow = pct < 20;
  const fuelLabel = v.isElectric ? 'SoC' : 'Tank';
  const idleIconCls = isDarkMode ? 'text-gray-500' : 'text-gray-400';
  const idleTextCls = isDarkMode ? 'text-gray-500' : 'text-gray-400';
  const criticalCls =
    'text-[color:var(--status-critical)] drop-shadow-[0_0_4px_color-mix(in_srgb,var(--status-critical)_55%,transparent)]';
  return (
    <div className="flex items-center gap-1.5">
      <Icon name="fuel"
        className={`w-3 h-3 shrink-0 transition-colors ${
          isCriticallyLow ? criticalCls : idleIconCls
        }`}
        aria-label={isCriticallyLow ? `${fuelLabel} kritisch unter 20%` : undefined}
      />
      <div className={`w-12 h-1 rounded-full overflow-hidden shrink-0 ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-100'}`}>
        <div
          className={`h-full rounded-full ${
            pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-[10px] font-semibold shrink-0 w-8 text-right tabular-nums transition-colors ${
          isCriticallyLow ? 'text-[color:var(--status-critical)]' : idleTextCls
        }`}
      >
        {formatFuelPercentCeil(value)}
      </span>
    </div>
  );
}

// V4.6.94 — fixed-width odometer rendered right-aligned with tabular
// digits so values like "1.769 km" and "110.300 km" stack cleanly.
function OdometerText({ v, isDarkMode }: { v: VehicleData; isDarkMode: boolean }) {
  const km = canonicalOdometer(v);
  return (
    <span className={`text-[10px] font-semibold inline-block w-[68px] text-right tabular-nums shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
      {formatOdometerKmFloor(km)}
    </span>
  );
}

// V4.6.94 — Booking-duration helpers used by the Reserved / Active
// Rented cards. Pure functions (no React) so the rendering paths stay
// re-render cheap. Always return a string (never NaN) — graceful
// fallback "—" when timestamps are missing.
function formatDurationCompact(startIso?: string | null, endIso?: string | null): string {
  if (!startIso || !endIso) return '—';
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return '—';
  const diffMin = Math.round((e - s) / 60_000);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  return diffDays === 1 ? '1 Tag' : `${diffDays} Tage`;
}

// Returns a 0–100 integer percentage of elapsed time between booking
// start and end, or null when timestamps are missing. Capped at 100 —
// overdue is communicated separately via the bucket badge.
function timeProgressPercent(startIso?: string | null, endIso?: string | null): number | null {
  if (!startIso || !endIso) return null;
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  const now = Date.now();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  return Math.max(0, Math.min(100, Math.round(((now - s) / (e - s)) * 100)));
}

// Returns a percentage of allowance consumed. May exceed 100 — caller
// decides how to render the over-limit state.
function kmProgressPercent(driven: number | null | undefined, included: number | null | undefined): number | null {
  if (typeof driven !== 'number' || typeof included !== 'number' || included <= 0) return null;
  return Math.max(0, Math.round((driven / included) * 100));
}

function formatKmRemainingShort(driven: number | null | undefined, included: number | null | undefined): string {
  if (typeof driven !== 'number' || typeof included !== 'number') return '—';
  const remaining = Math.round(included - driven);
  if (remaining < 0) return `+${Math.abs(remaining).toLocaleString('de-DE')} km`;
  return `${remaining.toLocaleString('de-DE')} km`;
}

// V4.6.99 — Booking-Reference aus einer Booking-UUID. Spiegelt die
// Berechnung in `mapApiBooking` (`BK-${id.slice(-6).toUpperCase()}`),
// damit die im Dashboard-Popup angezeigte Buchungsnummer 1:1 derjenigen
// in der BookingsView entspricht. Liefert `null`, wenn keine UUID
// vorliegt — der Aufrufer rendert dann gar keinen Chip.
function bookingRefFromId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = String(id).trim();
  if (trimmed.length === 0) return null;
  return `BK-${trimmed.slice(-6).toUpperCase()}`;
}

// V4.6.96 — Overdue-Dauer seit der geplanten Rückgabe. Liefert kompakte
// Form ("+45m" / "+2h 15m" / "+27h" / "+72h 15m") oder `null`, wenn das
// Booking nicht fällig ist oder kein Return-Timestamp vorliegt. Vermeidet
// die doppelte Auszeichnung „Overdue-Badge + Wort 'Überfällig'", indem
// die Rückgabe-Zeile jetzt immer den geplanten Zeitpunkt + die Magnitude
// der Verspätung trägt.
//
// V4.6.98 — Days-Branch entfernt. Per Produkt-Entscheidung wird die
// Verspätung immer in Stunden ausgedrückt (auch jenseits 24h), damit der
// Operator die Magnitude in einer einheitlichen Skala lesen kann ohne
// mentale d→h-Umrechnung („+27h" statt „+1d", „+72h" statt „+3d").
function formatOverdueShort(returnIso?: string | null, nowMs: number = Date.now()): string | null {
  if (!returnIso) return null;
  const e = new Date(returnIso).getTime();
  if (!Number.isFinite(e) || e >= nowMs) return null;
  const diffMin = Math.floor((nowMs - e) / 60_000);
  if (diffMin < 60) return `+${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  const restMin = diffMin % 60;
  return restMin > 0 ? `+${diffHours}h ${restMin}m` : `+${diffHours}h`;
}

// V4.7.00 — Kompakte Pickup-Time-Form für den Reserved-Footer-Segment-1.
// Liefert „HH:mm DD.MM" (de-DE), z.B. „09:00 14.05". Wird zusammen mit
// dem Pickup-Station-Namen in einem einzigen truncatable Footer-Segment
// angezeigt (analog `VehicleAddress` im Available-Footer). `null`, wenn
// kein gültiges Datum vorliegt — der Aufrufer rendert dann nur die
// Station ohne den `·`-Separator.
function formatPickupShort(pickupIso?: string | null): string | null {
  if (!pickupIso) return null;
  const d = new Date(pickupIso);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return `${hh}:${mm} ${dd}.${mo}`;
}

// V4.6.75 — Pickup/Return items now carry `bookingId` + timestamps +
// pickupOdometerKm so the Übergabeprotokoll dialog can be launched directly
// from the Today tile. Legacy callers without these fields still work.
export interface PickupTileItem {
  time: string;
  vehicle: string;
  plate: string;
  customer: string;
  station: string;
  done: boolean;
  vehicleId: string;
  needsCleaning: boolean;
  hasAlert: boolean;
  hasError: boolean;
  bookingId?: string;
  startDate?: string;
  endDate?: string;
  // V4.6.81 — Überfällig-Flags aus findPickupsDue (BookingsService).
  // `isOverdue=true` bedeutet: startDate < jetzt und noch kein
  // PICKUP-Protokoll. `minutesOverdue` wird vom Backend berechnet.
  isOverdue?: boolean;
  minutesOverdue?: number;
}

export interface ReturnTileItem {
  time: string;
  vehicle: string;
  plate: string;
  customer: string;
  station: string;
  done: boolean;
  vehicleId: string;
  hasError?: boolean;
  kmExceeded?: boolean;
  extraKm?: number | null;
  isOverdue?: boolean;
  returnProtocolStatus?: string | null;
  hasAlert: boolean;
  bookingId?: string;
  startDate?: string;
  endDate?: string;
  pickupOdometerKm?: number | null;
}

interface StatInlineDetailProps {
  activePopup: string;
  isDarkMode: boolean;
  onClose: () => void;
  onVehicleSelect?: (vehicle: VehicleData) => void;
  onItemHover?: (vehicleName: string | null) => void;
  pickupItems: PickupTileItem[];
  returnItems: ReturnTileItem[];
  pickupNeedsCleaning: number;
  pickupAlerts: number;
  returnErrors: number;
  returnKmExceeded: number;
  returnOverdue?: number;
  returnAlerts: number;
  borderColor: string;
  hideHeader?: boolean;
  onConfirmPickup?: (item: PickupTileItem) => void;
  onConfirmReturn?: (item: ReturnTileItem) => void;
  // V4.6.99 — Click auf den BK-Chip eines Active-/Reserved-Eintrags.
  // Empfänger: der Dashboard-Container (`DashboardView`) reicht den
  // Booking-Detail-Open weiter an `App.tsx`, das die Bookings-Ansicht
  // mit aktivem `detailBookingId` öffnet. Optional, damit ältere
  // Aufrufer ohne Booking-Navigation weiterhin funktionieren.
  onOpenBookingById?: (bookingId: string) => void;
  // V4.7.04 — Stationen-Katalog der aktiven Org. Wird vom Dashboard via
  // `api.stations.list(orgId)` geladen und durchgereicht, damit jede
  // Fahrzeugkarte ihrer zugewiesenen Station (lat/lng + Geofence-Radius)
  // direkt nachschlagen kann, ohne dass `StatInlineDetail` selbst eine
  // zweite API-Runde fährt. Optional — bei `undefined` rendert die
  // Komponente das Home/Away-Badge schlicht nicht (kein false-positive
  // „AWAY" für Operatoren mit unvollständigem Lookup-Set).
  stations?: Station[];
}

export function StatInlineDetail({ activePopup, isDarkMode, onClose, onVehicleSelect, onItemHover, pickupItems, returnItems, pickupNeedsCleaning, pickupAlerts, returnErrors, returnKmExceeded, returnOverdue = 0, returnAlerts, borderColor, hideHeader, onConfirmPickup, onConfirmReturn, onOpenBookingById, stations }: StatInlineDetailProps) {
  const { fleetVehicles } = useFleetVehicles();

  // V4.7.04/V4.7.06 — Pre-build the byId / byName indices once per
  // `stations` change so each vehicle card resolves its assigned station
  // in O(1). `byName` is the safety net for legacy vehicles whose
  // backend payload did not carry `stationId` yet. The actual indexing
  // helper now lives in `./HomeAwayBadge.tsx > buildStationLookup` so it
  // can be reused by FleetView (Operations → Fleet status cards).
  const stationLookup = useMemo(() => buildStationLookup(stations), [stations]);

  // V4.7.23 — Single source of truth: the canonical Rental-Health-V1
  // map is shared via the FleetProvider. Every Dashboard popup card now
  // reads the same status as FleetView, FleetCondition and the Vehicle
  // Detail header — no more drift between surfaces. The earlier per-popup
  // `useFleetHealthMap` call (V4.6.86) is gone; we just consume the
  // already-loaded map.
  const { healthMap } = useFleetVehicles();

  const closeBtn = (
    <button onClick={(e) => { e.stopPropagation(); onClose(); }} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-neutral-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
      <Icon name="x" className="w-4 h-4" />
    </button>
  );

  const vehicleClick = (v: VehicleData) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onVehicleSelect?.(v);
    onClose();
  };

  // V4.7.01 — Booking-First-Click für die Active-Rented-Karten. Bei
  // einem laufenden Rental ist der primäre operationelle Drilldown
  // die Booking-Detail-Seite (Customer, Vertrag, Schaden-/Übergabe-
  // Protokolle, Rechnungen), NICHT der Vehicle-Overview. Wir bleiben
  // robust: wenn keine `activeBookingId` vorhanden ist oder der
  // `onOpenBookingById`-Prop fehlt, fällt der Click sauber auf den
  // bisherigen Vehicle-Overview zurück, sodass die Karte nie zu einem
  // toten Click-Target wird. Der bestehende `bookingChip`-Click in
  // Row 2 ruft denselben Pfad auf und bleibt unverändert (sein
  // `e.stopPropagation()` ist seit V4.7.01 funktional redundant, aber
  // schadlos — wir entfernen es nicht, damit die Chip-Semantik bei
  // möglichen späteren Layout-Änderungen lokal selbsttragend bleibt).
  const bookingFirstClick = (v: VehicleData, bookingId: string | null | undefined) =>
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (bookingId && onOpenBookingById) {
        onOpenBookingById(bookingId);
        onClose();
        return;
      }
      onVehicleSelect?.(v);
      onClose();
    };

  const cardClass = isDarkMode ? 'bg-neutral-800/60 border-neutral-700/50 hover:border-neutral-600' : 'bg-gray-50/80 border-gray-200/60 hover:border-gray-300';

  const fleetTitle = (v: VehicleData) => {
    const y = v.year ? String(v.year) : '';
    return [v.make, v.model, y].filter(Boolean).join(' ').trim() || v.model;
  };

  // V4.6.94 — `HealthFleetIcon` was retired in favor of inline health
  // pill badges (Healthy / Warning / Alert) inside each card's badge
  // cluster. Removing the helper keeps the icon-color matrix and the
  // badge-color matrix from drifting apart.

  // V4.7.23 / V4.7.24 — Canonical health chip for the Dashboard Fleet
  // Status popups. Reads the SAME Rental-Health-V1 map every other
  // Rental surface uses. Renders a pill ONLY when the vehicle is in
  // Warning or Critical state — Healthy / Unknown / Loading collapse to
  // nothing so the popup cards stop carrying empty placeholder chips.
  // Per user feedback (2026-05-02): „nur noch bei dashboard fleet status
  // die leeren badges entfernen, wenn warning oder alerts gibt sollten
  // die badges angezeigt werden ansonsten keine schongar nicht leere
  // badges."
  const HealthChip = ({ vehicleId }: { vehicleId: string | undefined }) => {
    const { status, health } = useEffectiveHealth(vehicleId ?? null);
    if (status !== 'Critical' && status !== 'Warning') return null;

    const reasons: string[] = [];
    if (health?.rental_blocked && health.blocking_reasons.length > 0) {
      reasons.push(`Blocked: ${health.blocking_reasons.join(' · ')}`);
    }
    if (health) {
      for (const [name, mod] of Object.entries(health.modules)) {
        if (mod.state === 'critical' || mod.state === 'warning') {
          reasons.push(`${name.replace(/_/g, ' ')}: ${mod.reason}`);
        }
      }
    }
    const title = reasons.join(' · ') || undefined;
    const base =
      'shrink-0 inline-block min-w-[60px] text-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide';
    if (status === 'Critical') {
      return (
        <span title={title} className={`${base} ${isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700'}`}>
          Alert
        </span>
      );
    }
    return (
      <span title={title} className={`${base} ${isDarkMode ? 'bg-yellow-500/15 text-yellow-400' : 'bg-yellow-50 text-yellow-700'}`}>
        Warning
      </span>
    );
  };

  // V4.6.86 — Rental-blocking pill. Renders the same "Nicht vermietbar"
  // badge the Fleet page shows next to `v.license`.
  const BlockingBadge = ({ vehicleId }: { vehicleId: string | undefined }) => {
    const health: VehicleHealthResponse | null = vehicleId
      ? healthMap.get(vehicleId) ?? null
      : null;
    if (!health?.rental_blocked) return null;
    return (
      <RentalHealthBadge
        health={health}
        isDarkMode={isDarkMode}
        size="sm"
        showBlockingLabel
      />
    );
  };

  return (
    <div className={`mt-0.5 rounded-2xl border p-5 ${borderColor} ${isDarkMode ? 'bg-neutral-900/60' : 'bg-white'}`}>
      {/* Available */}
      {activePopup === 'Available' && (() => {
        const vehicles = fleetVehicles.filter(v => v.status === 'Available');
        return (
          <>
            {!hideHeader && <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center"><Icon name="car" className="w-4 h-4 text-blue-600" /></div>
                <div>
                  <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Available Vehicles</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{vehicles.length} vehicles ready for rental</p>
                </div>
              </div>
              {closeBtn}
            </div>}
            <div
              className="overflow-y-auto space-y-2 pr-0.5"
              style={{ maxHeight: '318px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(156,163,175,0.4) transparent' }}
            >
              {vehicles.map((v) => {
                const vHealth: VehicleHealthResponse | null = v.id
                  ? healthMap.get(v.id) ?? null
                  : null;
                const isBlocked = !!vHealth?.rental_blocked;
                // V4.7.62 — Offline (Last Signal ≥ 1 day) → "Not Ready"
                // + greyed card + explicit "Vehicle Offline - Check
                // Device" line, mirroring the Fleet-page Fleet-Status box.
                const offline = isVehicleOffline(v);
                return (
                <div key={v.id} onClick={vehicleClick(v)} onMouseEnter={() => onItemHover?.(v.model)} onMouseLeave={() => onItemHover?.(null)} className={`rounded-xl p-3 border transition-all hover:shadow-sm cursor-pointer ${cardClass} ${offline ? 'opacity-60 grayscale' : ''}`}>
                  {/* Row 1: License + MMY + Clean / Health / Ready badges + chevron.
                      V4.6.88 — Clean & Health switched from icons to pill badges
                      that share the same visual language as the Ready badge so
                      operators can scan all three statuses at a glance. The
                      Ready badge moved up here to sit directly to the right of
                      Clean + Health (was previously in the footer row). */}
                  <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0 flex-1">
                      <span className={`text-[10.5px] font-bold leading-tight shrink-0 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{v.license}</span>
                      <span className={`text-[10px] font-semibold tracking-wide truncate ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{fleetTitle(v)}</span>
                      <BlockingBadge vehicleId={v.id} />
                    </div>
                    {/* V4.6.94 — Badge-Farbsemantik vereinheitlicht:
                        Clean = blau, Dirty = rot.
                        Healthy = grün, Warning = gelb, Alert = rot.
                        Ready = grün, Not Ready = rot (statt unsichtbar
                        ausgeblendet — blockierte Fahrzeuge werden so in
                        derselben Spalte sichtbar markiert, der separate
                        BlockingBadge neben dem Kennzeichen liefert weiterhin
                        die Klartext-Begründung). */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={`shrink-0 inline-block min-w-[44px] text-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide ${
                          v.cleaningStatus === 'Clean'
                            ? (isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-700')
                            : (isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700')
                        }`}
                        title={v.cleaningStatus === 'Clean' ? 'Clean' : 'Needs cleaning'}
                      >
                        {v.cleaningStatus === 'Clean' ? 'Clean' : 'Dirty'}
                      </span>
                      <HealthChip vehicleId={v.id} />
                      <span
                        className={`shrink-0 inline-block w-[72px] text-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide ${
                          offline
                            ? (isDarkMode ? 'bg-neutral-700/60 text-gray-300' : 'bg-gray-100 text-gray-500')
                            : !isBlocked
                              ? (isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700')
                              : (isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700')
                        }`}
                        title={offline ? VEHICLE_OFFLINE_LABEL : !isBlocked ? 'Ready for rental' : 'Not ready — rental blocked'}
                      >
                        {!offline && !isBlocked ? 'Ready' : 'Not Ready'}
                      </span>
                      <Icon name="chevron-right" className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                    </div>
                  </div>
                  {/* Row 2: Location · Home/Away · Fuel · Odometer — Ready moved to header row.
                      V4.7.04 — Direkt hinter der Adresse sitzt eine kleine
                      symmetrische HOME/AWAY-Pille (44px breit), die anzeigt,
                      ob das Fahrzeug aktuell innerhalb des Geofence-Umkreises
                      seiner zugewiesenen Station steht. Bei fehlender
                      Station, fehlenden Koordinaten oder fehlendem GPS-Fix
                      wird gar nichts gerendert (kein false-positive AWAY). */}
                  {offline ? (
                    <div className={`flex items-center gap-1.5 pt-1.5 border-t min-w-0 overflow-hidden ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-100'}`}>
                      <Icon name="wifi-off" className={`w-2.5 h-2.5 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <span className={`truncate min-w-0 flex-1 text-[10px] font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {VEHICLE_OFFLINE_LABEL}
                      </span>
                    </div>
                  ) : (
                    <div className={`flex items-center gap-1.5 pt-1.5 border-t min-w-0 overflow-hidden ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-100'}`}>
                      <Icon name="map-pin" className={`w-2.5 h-2.5 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <div className="truncate min-w-0 flex-1 text-[10px]">
                        <VehicleAddress v={v} isDarkMode={isDarkMode} />
                      </div>
                      <HomeAwayBadge v={v} stationLookup={stationLookup} isDarkMode={isDarkMode} />
                      <div className={`w-px h-3 shrink-0 ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`} />
                      <FuelStripe v={v} isDarkMode={isDarkMode} />
                      <div className={`w-px h-3 shrink-0 ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`} />
                      <OdometerText v={v} isDarkMode={isDarkMode} />
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* Reserved
          V4.7.00 — True 2-Zeilen-Available-Twin-Layout. Customer + BK-
          Chip rutschen aus Row 2 in Row 1 (ersetzen MMY), weil bei
          einer Reservierung der Kunde der relevantere Identifier als
          das Modell ist. Footer-Skelett ist 1:1 identisch zu Available
          (`pt-1.5 border-t gap-1.5` mit zwei dünnen vertikalen
          Trennstrichen zwischen drei Segmenten): Pickup-Station +
          Pickup-Time | FuelStripe | OdometerText. Die Bucket-Pill
          übernimmt im Overdue-State den 2-Segment-Cluster aus Active
          Rented (V4.6.97): „OVERDUE" + „+Xh Ym"-Magnitude. Reservie-
          rungs-Dauer landet im Tooltip auf dem Pickup-Segment, damit
          die Karte auf schmalen Cards nicht in eine dritte Zeile fällt.
          Clean-Pille entfällt analog zu Active Rented (V4.6.94) — bei
          committedten Pickups checkt der Operator die Reinigung über
          den Pick-Up-Today-Tab bzw. Vehicle-Detail; im Reserved-Über-
          blick verschluckt sie nur knappen Header-Platz. */}
      {activePopup === 'Reserved' && (() => {
        const vehicles = fleetVehicles.filter(v => v.status === 'Reserved');
        const overdueCount = vehicles.filter(v => v.reservedIsOverdue).length;
        return (
          <>
            {!hideHeader && <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center"><Icon name="calendar" className="w-4 h-4 text-purple-600" /></div>
                <div>
                  <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Reserved Vehicles</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{vehicles.length} reserved{overdueCount > 0 ? ` · ${overdueCount} überfällig` : ''}</p>
                </div>
              </div>
              {closeBtn}
            </div>}
            <div
              className="overflow-y-auto space-y-2 pr-0.5"
              style={{ maxHeight: '318px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(156,163,175,0.4) transparent' }}
            >
              {vehicles.map((v) => {
                const isOverdue = !!v.reservedIsOverdue;
                const duration = formatDurationCompact(v.reservedPickupAt, v.reservedReturnAt);
                // Overdue-Magnitude relativ zum geplanten Pickup (nicht
                // zum Return) — wir zählen die Verspätung des Customers
                // bis zur Abholung, nicht bis zur Rückgabe.
                const overdueShort = isOverdue ? formatOverdueShort(v.reservedPickupAt) : null;
                const pickupShort = formatPickupShort(v.reservedPickupAt);
                const pickupFull = v.reservedPickupAt ? formatFleetDateTime(v.reservedPickupAt) : null;
                const stationLabel = v.reservedPickupStationName || v.station || '—';
                const customerLabel = v.reservedCustomerName || 'Nicht zugeordnet';
                const footerTooltip = [
                  stationLabel,
                  pickupFull ? `Pickup ${pickupFull}` : null,
                  duration !== '—' ? `Dauer ${duration}` : null,
                ].filter(Boolean).join(' · ');
                return (
                  <div key={v.id} onClick={vehicleClick(v)} onMouseEnter={() => onItemHover?.(v.model)} onMouseLeave={() => onItemHover?.(null)} className={`rounded-xl p-3 border transition-all hover:shadow-sm cursor-pointer ${cardClass}`}>
                    {/* Row 1: License + Customer + BK-Chip + BlockingBadge | Health + Reserved/Overdue + Chevron */}
                    <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                      <div className="flex items-baseline gap-2 min-w-0 flex-1">
                        <span className={`text-[10.5px] font-bold leading-tight shrink-0 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{v.license}</span>
                        <span
                          className={`text-[10px] font-medium tracking-wide truncate min-w-0 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                          title={customerLabel}
                        >
                          {customerLabel}
                        </span>
                        {(() => {
                          const bkRef = bookingRefFromId(v.reservedBookingId);
                          if (!bkRef) return null;
                          const clickable = !!onOpenBookingById && !!v.reservedBookingId;
                          return (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (clickable) {
                                  onOpenBookingById!(v.reservedBookingId!);
                                  onClose();
                                }
                              }}
                              disabled={!clickable}
                              title={clickable ? `Buchung ${bkRef} öffnen` : `Buchung ${bkRef}`}
                              className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-semibold tabular-nums tracking-wide transition-colors ${
                                clickable ? 'cursor-pointer' : 'cursor-default'
                              } ${
                                isDarkMode
                                  ? `bg-neutral-800/60 text-gray-400 ${clickable ? 'hover:bg-blue-500/15 hover:text-blue-300' : ''}`
                                  : `bg-gray-100 text-gray-500 ${clickable ? 'hover:bg-blue-50 hover:text-blue-700' : ''}`
                              }`}
                            >
                              {bkRef}
                            </button>
                          );
                        })()}
                        <BlockingBadge vehicleId={v.id} />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <HealthChip vehicleId={v.id} />
                        {/* V4.7.00 — Bucket-Pill „RESERVED" / „OVERDUE +Xh Ym".
                            Reserved-State: einsegment, lila, w-[72px] analog
                            Available's Ready-Pille. Overdue-State: 2-Segment-
                            Cluster wie Active Rented (V4.6.97) — Status-Word
                            links, Verspätungs-Magnitude rechts in tabular-
                            nums ohne Uppercase, damit Einheiten (h, m) lesbar
                            bleiben. Tooltip trägt im Reserved-State zusätz-
                            lich den geplanten Pickup-Datetime, damit der
                            Operator den vollen Kontext beim Hovern sieht. */}
                        <span
                          className={`shrink-0 inline-flex items-stretch rounded-md overflow-hidden ${
                            isOverdue
                              ? (isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700')
                              : (isDarkMode ? 'bg-purple-500/15 text-purple-400' : 'bg-purple-50 text-purple-700')
                          }`}
                          title={
                            isOverdue
                              ? overdueShort
                                ? `Pickup überfällig — ${overdueShort.replace(/^\+/, '')} verspätet`
                                : 'Pickup-Zeit verstrichen'
                              : pickupFull
                                ? `Reserviert · Pickup ${pickupFull}${duration !== '—' ? ` · Dauer ${duration}` : ''}`
                                : 'Reserviert'
                          }
                        >
                          <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap ${!isOverdue ? 'min-w-[60px] text-center' : ''}`}>
                            {isOverdue ? 'Overdue' : 'Reserved'}
                          </span>
                          {isOverdue && overdueShort && (
                            <span className={`px-1.5 py-0.5 text-[9px] font-bold tabular-nums whitespace-nowrap border-l ${
                              isDarkMode ? 'border-red-400/25' : 'border-red-200/70'
                            }`}>
                              {overdueShort}
                            </span>
                          )}
                        </span>
                        <Icon name="chevron-right" className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                      </div>
                    </div>
                    {/* Row 2: Pickup-Station + Pickup-Time | FuelStripe | OdometerText
                        V4.7.00 — Identisches Footer-Skelett wie Available.
                        Segment 1 trägt Pickup-Station-Name (Fallback auf
                        `v.station` wenn der Booking-Wert fehlt) gefolgt
                        vom kompakten Pickup-Time „HH:mm DD.MM"; der Tool-
                        tip enthält zusätzlich den vollen Datetime + die
                        Reservierungs-Dauer, damit kein Detail verloren
                        geht. */}
                    <div className={`flex items-center gap-1.5 pt-1.5 border-t min-w-0 overflow-hidden ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-100'}`}>
                      <Icon name="map-pin" className={`w-2.5 h-2.5 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <div
                        className={`truncate min-w-0 flex-1 text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
                        title={footerTooltip}
                      >
                        {stationLabel}{pickupShort ? ` · ${pickupShort}` : ''}
                      </div>
                      {/* V4.7.04 — Home/Away neben dem Pickup-Station-Label.
                          Beantwortet für Disponenten direkt: „Steht das
                          reservierte Fahrzeug schon abholbereit am Pickup-
                          Standort?". Logik vergleicht GPS gegen die
                          *zugewiesene* Station (nicht die Pickup-Station),
                          weil das Fahrzeug i.d.R. dort steht — sobald
                          eine andere Pickup-Station gepflegt wird, ist
                          AWAY der erwartete und nützliche Zustand. */}
                      <HomeAwayBadge v={v} stationLookup={stationLookup} isDarkMode={isDarkMode} />
                      <div className={`w-px h-3 shrink-0 ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`} />
                      <FuelStripe v={v} isDarkMode={isDarkMode} />
                      <div className={`w-px h-3 shrink-0 ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`} />
                      <OdometerText v={v} isDarkMode={isDarkMode} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* Active Rented
          V4.6.94 — Symmetric tri-row layout aligned with Available /
          Reserved / Maintenance. Bucket badge: "On Time" (emerald) →
          "Overdue" (red) when activeIsOverdue. Clean is intentionally
          omitted (per ops feedback: cleanliness is irrelevant once a
          rental is in flight). The middle row exposes a time-progress
          and km-progress mini-bar so dispatchers can spot at-risk
          rentals at a glance. */}
      {activePopup === 'Active Rented' && (() => {
        const vehicles = fleetVehicles.filter(v => v.status === 'Active Rented');
        const overdueCount = vehicles.filter(v => v.activeIsOverdue).length;
        return (
          <>
            {!hideHeader && <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center"><Icon name="trending-up" className="w-4 h-4 text-green-600" /></div>
                <div>
                  <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Active Rentals</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{vehicles.length} vehicles currently rented{overdueCount > 0 ? ` · ${overdueCount} überfällig` : ''}</p>
                </div>
              </div>
              {closeBtn}
            </div>}
            <div
              className="overflow-y-auto space-y-2 pr-0.5"
              style={{ maxHeight: '318px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(156,163,175,0.4) transparent' }}
            >
              {vehicles.map((v) => {
                const isOverdue = !!v.activeIsOverdue;
                const timePct = timeProgressPercent(v.activeStartAt, v.activeReturnAt);
                const kmPct = kmProgressPercent(v.activeKmDriven, v.activeKmIncluded);
                const kmRemainingLabel = formatKmRemainingShort(v.activeKmDriven, v.activeKmIncluded);
                const kmOver = kmPct != null && kmPct > 100;
                // V4.6.96 — Overdue-Magnitude („+2h 15m") nur wenn isOverdue
                // UND `activeReturnAt` vorhanden. Wird inline an die Rückgabe-
                // Zeile angehängt, statt das Datum durch das redundante Wort
                // „Überfällig" zu ersetzen.
                const overdueShort = isOverdue ? formatOverdueShort(v.activeReturnAt) : null;
                return (
                  <div
                    key={v.id}
                    onClick={bookingFirstClick(v, v.activeBookingId)}
                    onMouseEnter={() => onItemHover?.(v.model)}
                    onMouseLeave={() => onItemHover?.(null)}
                    className={`rounded-xl p-3 border transition-all hover:shadow-sm cursor-pointer ${cardClass}`}
                    title={v.activeBookingId ? 'Buchung öffnen' : undefined}
                  >
                    {/* Row 1: License + MMY + BlockingBadge | Health / On-Time badges + Chevron */}
                    <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                      <div className="flex items-baseline gap-2 min-w-0 flex-1">
                        <span className={`text-[10.5px] font-bold leading-tight shrink-0 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{v.license}</span>
                        <span className={`text-[10px] font-semibold tracking-wide truncate ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{fleetTitle(v)}</span>
                        <BlockingBadge vehicleId={v.id} />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <HealthChip vehicleId={v.id} />
                        {/* V4.6.97 — Overdue-State + Magnitude in einem
                            kompakten Badge-Cluster. Das OVERDUE-Label bleibt
                            konsistent zum ON TIME-Pendant; die Verspätungs-
                            Dauer („+2h 15m" / „+1d") hängt rechts daran als
                            tabular-nums-Chip ohne Uppercase, sodass die
                            Einheits-Buchstaben (h, m, d) lesbar bleiben.
                            Damit braucht Row 2 keine Rückgabe-Zeile mehr im
                            Overdue-Fall — der Operator sieht „WER + WIE
                            LANGE überfällig" auf einen Blick. */}
                        <span
                          className={`shrink-0 inline-flex items-stretch rounded-md overflow-hidden ${
                            isOverdue
                              ? (isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700')
                              : (isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700')
                          }`}
                          title={
                            isOverdue
                              ? overdueShort
                                ? `Rückgabe überfällig — ${overdueShort.replace(/^\+/, '')} verspätet`
                                : 'Rückgabe überfällig'
                              : 'Rückgabe pünktlich erwartet'
                          }
                        >
                          <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap">
                            {isOverdue ? 'Overdue' : 'On Time'}
                          </span>
                          {isOverdue && overdueShort && (
                            <span className={`px-1.5 py-0.5 text-[9px] font-bold tabular-nums whitespace-nowrap border-l ${
                              isDarkMode ? 'border-red-400/25' : 'border-red-200/70'
                            }`}>
                              {overdueShort}
                            </span>
                          )}
                        </span>
                        <Icon name="chevron-right" className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                      </div>
                    </div>
                    {/* Row 2: Customer · BK-Ref · Return time
                        V4.6.97 — Bei Overdue blendet die Zeile die rechte
                        Rückgabe-Spalte komplett aus (Anti-Duplikation).
                        V4.6.99 — Buchungsnummer (`BK-XXXXXX`) als kompakter
                        Chip direkt nach dem Customer-Namen — sichtbar in
                        beiden States (Overdue/On-Time), klickbar als
                        eigener Tab-Stop, öffnet die Booking-Detail-Seite
                        in der BookingsView.
                        V4.7.01 — Der Container-Click öffnet seit dem
                        Booking-First-Click ebenfalls die Booking-Detail-
                        Seite (siehe `bookingFirstClick`). Das Chip-Click-
                        Event stoppt die Propagation, ist also funktional
                        redundant zum Container-Click — wir lassen es
                        explizit stehen, damit der Chip ein eigener Tab-
                        Stop bleibt und bei künftigen Layout-Änderungen
                        (z.B. wenn der Container-Click auf Vehicle-
                        Overview zurückwechseln sollte) lokal selbst-
                        tragend wirkt. */}
                    <div className="flex items-center gap-2 mb-1.5 min-w-0 text-[10.5px]">
                      <span className={`inline-flex items-center gap-1 truncate min-w-0 ${isOverdue ? 'flex-1' : 'max-w-[55%]'} ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <Icon name="users" className={`w-3 h-3 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                        <span className="truncate font-medium">{v.activeCustomerName || 'Nicht zugeordnet'}</span>
                      </span>
                      {(() => {
                        const bkRef = bookingRefFromId(v.activeBookingId);
                        if (!bkRef) return null;
                        const clickable = !!onOpenBookingById && !!v.activeBookingId;
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (clickable) {
                                onOpenBookingById!(v.activeBookingId!);
                                onClose();
                              }
                            }}
                            disabled={!clickable}
                            title={clickable ? `Buchung ${bkRef} öffnen` : `Buchung ${bkRef}`}
                            className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-semibold tabular-nums tracking-wide transition-colors ${
                              clickable ? 'cursor-pointer' : 'cursor-default'
                            } ${
                              isDarkMode
                                ? `bg-neutral-800/60 text-gray-400 ${clickable ? 'hover:bg-blue-500/15 hover:text-blue-300' : ''}`
                                : `bg-gray-100 text-gray-500 ${clickable ? 'hover:bg-blue-50 hover:text-blue-700' : ''}`
                            }`}
                          >
                            {bkRef}
                          </button>
                        );
                      })()}
                      {!isOverdue && (
                        <span
                          className={`ml-auto inline-flex items-center gap-1 ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`}
                          title="Geplante Rückgabezeit"
                        >
                          <Icon name="calendar" className="w-3 h-3 shrink-0" />
                          <span className="font-semibold whitespace-nowrap">
                            Rückgabe {v.activeReturnAt ? formatFleetDateTime(v.activeReturnAt) : '—'}
                          </span>
                        </span>
                      )}
                    </div>
                    {/* Row 3: Time progress + Km progress mini bars */}
                    <div className="flex items-center gap-3 mb-1.5">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <Icon name="clock" className={`w-3 h-3 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                        <div className={`flex-1 h-1 rounded-full overflow-hidden ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-100'}`}>
                          <div
                            className={`h-full rounded-full ${
                              isOverdue
                                ? 'bg-red-500'
                                : (timePct ?? 0) > 85
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(timePct ?? 0, 100)}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-semibold tabular-nums shrink-0 w-9 text-right ${
                          isOverdue ? (isDarkMode ? 'text-red-400' : 'text-red-600') : (isDarkMode ? 'text-gray-400' : 'text-gray-500')
                        }`}>
                          {timePct != null ? `${timePct}%` : '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <Icon name="gauge" className={`w-3 h-3 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                        <div className={`flex-1 h-1 rounded-full overflow-hidden ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-100'}`}>
                          <div
                            className={`h-full rounded-full ${
                              kmOver
                                ? 'bg-red-500'
                                : (kmPct ?? 0) > 85
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(kmPct ?? 0, 100)}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-semibold tabular-nums shrink-0 w-[60px] text-right ${
                          kmOver ? (isDarkMode ? 'text-red-400' : 'text-red-600') : (isDarkMode ? 'text-gray-400' : 'text-gray-500')
                        }`}>
                          {kmRemainingLabel}
                        </span>
                      </div>
                    </div>
                    {/* Row 4: Address · Home/Away · Fuel · Odometer (symmetric footer).
                        V4.7.04 — Same Home/Away pill as Available — bei einem
                        laufenden Rental beantwortet sie die Frage „ist das
                        Fahrzeug schon zurück an seiner Station?" auf einen
                        Blick (Return-Inspector-Workflow). */}
                    <div className={`flex items-center gap-1.5 pt-1.5 border-t min-w-0 overflow-hidden ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-100'}`}>
                      <Icon name="map-pin" className={`w-2.5 h-2.5 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <div className="truncate min-w-0 flex-1 text-[10px]">
                        <VehicleAddress v={v} isDarkMode={isDarkMode} />
                      </div>
                      <HomeAwayBadge v={v} stationLookup={stationLookup} isDarkMode={isDarkMode} />
                      <div className={`w-px h-3 shrink-0 ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`} />
                      <FuelStripe v={v} isDarkMode={isDarkMode} />
                      <div className={`w-px h-3 shrink-0 ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`} />
                      <OdometerText v={v} isDarkMode={isDarkMode} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* Pick Up Today */}
      {activePopup === 'Pick Up Today' && (() => {
        return (
          <>
            {!hideHeader && <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center"><Icon name="clock" className="w-4 h-4 text-orange-600" /></div>
                <div>
                  <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Pick Ups Today</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{pickupItems.filter(p => p.done).length} of {pickupItems.length} completed</p>
                </div>
              </div>
              {closeBtn}
            </div>}
            {/* V4.6.81 — Überfällig-Banner. Wird oberhalb der Cleaning/Alert-Summary
                ausgegeben, wenn das Backend überfällige Pickups (startDate < jetzt,
                noch kein PICKUP-Protokoll) mitliefert. Rot > Amber, weil ein
                überfälliger Pickup operativ schwerer wiegt als ein offenes
                Cleaning-Todo. */}
            {(() => {
              const overdueCount = pickupItems.filter(p => p.isOverdue && !p.done).length;
              if (overdueCount === 0) return null;
              return (
                <div className={`flex items-center gap-2 mb-2 px-3 py-2 rounded-xl ${
                  isDarkMode ? 'bg-rose-900/20 border border-rose-800/40' : 'bg-rose-50 border border-rose-200/70'
                }`}>
                  <Icon name="octagon-alert" className={`w-3.5 h-3.5 shrink-0 ${isDarkMode ? 'text-rose-400' : 'text-rose-500'}`} />
                  <span className={`text-[11px] font-medium ${isDarkMode ? 'text-rose-300' : 'text-rose-700'}`}>
                    {overdueCount} überfällige{overdueCount === 1 ? 'r' : ''} Pickup{overdueCount === 1 ? '' : 's'} — bitte nachtragen oder als No-Show markieren
                  </span>
                </div>
              );
            })()}
            {(pickupNeedsCleaning > 0 || pickupAlerts > 0) && (
              <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-amber-900/20 border border-amber-800/30' : 'bg-amber-50 border border-amber-200/60'}`}>
                <Icon name="alert-triangle" className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className={`text-[11px] font-medium ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                  {pickupNeedsCleaning > 0 && `${pickupNeedsCleaning} vehicle${pickupNeedsCleaning > 1 ? 's' : ''} needs cleaning`}
                  {pickupNeedsCleaning > 0 && pickupAlerts > 0 && ' · '}
                  {pickupAlerts > 0 && `${pickupAlerts} active alert${pickupAlerts > 1 ? 's' : ''}`}
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              {pickupItems.map((p, i) => {
                const hasIssues = p.needsCleaning || p.hasAlert || p.hasError;
                const hasAlertOrError = p.hasAlert || p.hasError;
                const linkedVehicle = p.vehicleId ? fleetVehicles.find(v => v.id === p.vehicleId) : null;
                const canConfirm = !p.done && !!p.bookingId && !!onConfirmPickup;
                // V4.6.81 — „Überfällig" dominiert die Zeilenfarbe: Ein
                // Pickup, dessen Startzeit schon vorbei ist, ist operativ
                // dringender als Cleaning/Alert. done hat Vorrang (grün).
                const showOverdue = !p.done && !!p.isOverdue;
                const overdueHours = Math.floor((p.minutesOverdue ?? 0) / 60);
                const overdueMins = (p.minutesOverdue ?? 0) % 60;
                const overdueLabel = overdueHours >= 24
                  ? `${Math.floor(overdueHours / 24)}d`
                  : overdueHours > 0
                    ? `${overdueHours}h ${overdueMins}m`
                    : `${overdueMins}m`;
                return (
                  <div key={i} onClick={(e) => { e.stopPropagation(); if (linkedVehicle) { onVehicleSelect?.(linkedVehicle); onClose(); } }} onMouseEnter={() => onItemHover?.(p.vehicle)} onMouseLeave={() => onItemHover?.(null)} className={`rounded-lg p-3 border transition-all ${linkedVehicle ? 'cursor-pointer hover:shadow-sm' : ''} ${(!p.done && (hasAlertOrError || showOverdue)) ? 'border-l-[3px]' : ''} ${p.done ? (isDarkMode ? 'bg-green-900/10 border-green-800/30' : 'bg-green-50/60 border-green-200/50') : showOverdue ? (isDarkMode ? 'bg-rose-900/15 border-rose-800/40 border-l-rose-500' : 'bg-rose-50/50 border-rose-200/70 border-l-rose-500') : hasAlertOrError ? (isDarkMode ? 'bg-red-900/10 border-red-800/30 border-l-red-500' : 'bg-red-50/40 border-red-200/60 border-l-red-500') : hasIssues ? (isDarkMode ? 'bg-amber-900/10 border-amber-800/30' : 'bg-amber-50/40 border-amber-200/60') : cardClass}`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-[12px] font-bold w-10 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{p.time}</span>
                      {p.done ? <Icon name="check-circle" className="w-3.5 h-3.5 text-green-500 shrink-0" /> : showOverdue ? <div className="relative shrink-0"><Icon name="octagon-alert" className="w-3.5 h-3.5 text-rose-500" /><div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-rose-500 rounded-full animate-ping opacity-75" /></div> : hasAlertOrError ? <div className="relative shrink-0"><Icon name="alert-triangle" className="w-3.5 h-3.5 text-red-500" /><div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-ping opacity-75" /></div> : <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${isDarkMode ? 'border-neutral-600' : 'border-gray-300'}`} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[12px] font-semibold ${p.done ? (isDarkMode ? 'text-gray-500 line-through' : 'text-gray-400 line-through') : showOverdue ? (isDarkMode ? 'text-rose-300' : 'text-rose-700') : hasAlertOrError ? (isDarkMode ? 'text-red-400' : 'text-red-700') : (isDarkMode ? 'text-white' : 'text-gray-900')}`}>{p.vehicle} ({p.plate})</span>
                          {showOverdue && (
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${
                              isDarkMode ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-rose-100 text-rose-700 border border-rose-200'
                            }`}>
                              <Icon name="clock" className="w-2.5 h-2.5" />
                              Überfällig · {overdueLabel}
                            </span>
                          )}
                          {!p.done && !showOverdue && hasAlertOrError && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                        </div>
                        <div className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{p.customer} · {p.station}</div>
                        {!p.done && hasIssues && (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {p.needsCleaning && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-100 text-amber-700"><Icon name="sparkles" className="w-2.5 h-2.5" />Cleaning</span>}
                            {p.hasAlert && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-100 text-red-700"><Icon name="alert-triangle" className="w-2.5 h-2.5" />Alert</span>}
                            {p.hasError && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-100 text-red-700"><Icon name="shield-alert" className="w-2.5 h-2.5" />Error</span>}
                          </div>
                        )}
                      </div>
                      {/* V4.6.75 — inline "Übergabe" CTA per row.
                          V4.6.81 — Für überfällige Pickups wird der Button
                          visuell hervorgehoben (Rosé-Ton), damit Disponenten
                          sofort sehen, wo sofortiges Nachtragen nötig ist. */}
                      {canConfirm ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onConfirmPickup?.(p); }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-white transition-colors shadow-sm shrink-0 ${
                            showOverdue ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                          title={showOverdue ? 'Pickup jetzt nachtragen' : 'Pickup bestätigen'}
                        >
                          <Icon name="file-signature" className="w-3 h-3" />
                          {showOverdue ? 'Nachtragen' : 'Übergabe'}
                        </button>
                      ) : (
                        <Icon name="chevron-right" className={`w-3.5 h-3.5 shrink-0 ${linkedVehicle ? (isDarkMode ? 'text-gray-500' : 'text-gray-400') : (isDarkMode ? 'text-gray-700' : 'text-gray-200')}`} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* Return Today */}
      {activePopup === 'Return Today' && (() => {
        return (
          <>
            {!hideHeader && <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center"><Icon name="clock" className="w-4 h-4 text-orange-600" /></div>
                <div>
                  <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Returns Today</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{returnItems.filter(r => r.done).length} of {returnItems.length} completed</p>
                </div>
              </div>
              {closeBtn}
            </div>}
            {(returnErrors > 0 || returnKmExceeded > 0 || returnOverdue > 0 || returnAlerts > 0) && (
              <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-red-900/20 border border-red-800/30' : 'bg-red-50 border border-red-200/60'}`}>
                <Icon name="alert-triangle" className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span className={`text-[11px] font-medium ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>
                  {returnErrors > 0 && `${returnErrors} error code${returnErrors > 1 ? 's' : ''}`}
                  {returnErrors > 0 && (returnKmExceeded > 0 || returnOverdue > 0) && ' · '}
                  {returnKmExceeded > 0 && `${returnKmExceeded} km exceeded`}
                  {(returnErrors > 0 || returnKmExceeded > 0) && returnOverdue > 0 && ' · '}
                  {returnOverdue > 0 && `${returnOverdue} overdue`}
                  {(returnErrors > 0 || returnKmExceeded > 0 || returnOverdue > 0) && returnAlerts > 0 && ' · '}
                  {returnAlerts > 0 && `${returnAlerts} alert${returnAlerts > 1 ? 's' : ''}`}
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              {returnItems.map((r, i) => {
                const hasIssues = !!(r.hasError || r.kmExceeded || r.hasAlert || r.isOverdue);
                const hasAlertOrError = !!(r.hasAlert || r.hasError || r.isOverdue);
                const linkedVehicle = r.vehicleId ? fleetVehicles.find(v => v.id === r.vehicleId) : null;
                const canConfirm = !r.done && !!r.bookingId && !!onConfirmReturn;
                return (
                  <div key={i} onClick={(e) => { e.stopPropagation(); if (linkedVehicle) { onVehicleSelect?.(linkedVehicle); onClose(); } }} onMouseEnter={() => onItemHover?.(r.vehicle)} onMouseLeave={() => onItemHover?.(null)} className={`rounded-lg p-3 border transition-all ${linkedVehicle ? 'cursor-pointer hover:shadow-sm' : ''} ${!r.done && hasAlertOrError ? 'border-l-[3px]' : ''} ${r.done ? (isDarkMode ? 'bg-green-900/10 border-green-800/30' : 'bg-green-50/60 border-green-200/50') : hasAlertOrError ? (isDarkMode ? 'bg-red-900/10 border-red-800/30 border-l-red-500' : 'bg-red-50/40 border-red-200/60 border-l-red-500') : hasIssues ? (isDarkMode ? 'bg-amber-900/10 border-amber-800/30' : 'bg-amber-50/40 border-amber-200/60') : cardClass}`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-[12px] font-bold w-10 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{r.time}</span>
                      {r.done ? <Icon name="check-circle" className="w-3.5 h-3.5 text-green-500 shrink-0" /> : hasAlertOrError ? <div className="relative shrink-0"><Icon name="alert-triangle" className="w-3.5 h-3.5 text-red-500" /><div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-ping opacity-75" /></div> : <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${isDarkMode ? 'border-neutral-600' : 'border-gray-300'}`} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[12px] font-semibold ${r.done ? (isDarkMode ? 'text-gray-500 line-through' : 'text-gray-400 line-through') : hasAlertOrError ? (isDarkMode ? 'text-red-400' : 'text-red-700') : (isDarkMode ? 'text-white' : 'text-gray-900')}`}>{r.vehicle} ({r.plate})</span>
                          {!r.done && hasAlertOrError && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                        </div>
                        <div className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{r.customer} · {r.station}</div>
                        {!r.done && hasIssues && (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {r.hasError && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-100 text-red-700"><Icon name="shield-alert" className="w-2.5 h-2.5" />Error</span>}
                            {r.kmExceeded && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-100 text-red-700">
                                <Icon name="gauge" className="w-2.5 h-2.5" />
                                {typeof r.extraKm === 'number' && r.extraKm > 0
                                  ? `${r.extraKm} km über Limit`
                                  : 'KM überschritten'}
                              </span>
                            )}
                            {r.isOverdue && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-100 text-red-700">
                                <Icon name="clock" className="w-2.5 h-2.5" />
                                Überfällig
                              </span>
                            )}
                            {r.returnProtocolStatus && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-muted text-muted-foreground">
                                {r.returnProtocolStatus}
                              </span>
                            )}
                            {r.hasAlert && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-orange-100 text-orange-700"><Icon name="alert-triangle" className="w-2.5 h-2.5" />Alert</span>}
                          </div>
                        )}
                      </div>
                      {/* V4.6.75 — inline "Rückgabe" CTA per row */}
                      {canConfirm ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onConfirmReturn?.(r); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm shrink-0"
                          title="Rückgabe bestätigen"
                        >
                          <Icon name="file-signature" className="w-3 h-3" />
                          Rückgabe
                        </button>
                      ) : (
                        <Icon name="chevron-right" className={`w-3.5 h-3.5 shrink-0 ${linkedVehicle ? (isDarkMode ? 'text-gray-500' : 'text-gray-400') : (isDarkMode ? 'text-gray-700' : 'text-gray-200')}`} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* In Maintenance
          V4.6.94 — Symmetric tri-row layout aligned with Available /
          Reserved / Active Rented. Bucket badge: maintenance type
          ("Planned" / "Unplanned" / "Service" when urgency is unknown).
          Reason row exposes the operational cause (SCHEDULED_SERVICE /
          OPERATIONAL_BLOCK label). Workshop "where" is approximated by
          the last-known address — workshop names are not yet persisted
          per the existing V4.6.84 architecture decision. */}
      {activePopup === 'Maintenance' && (() => {
        const vehicles = fleetVehicles.filter(v => v.status === 'Maintenance');
        const unplannedCount = vehicles.filter(v => v.maintenanceUrgency === 'urgent').length;
        return (
          <>
            {!hideHeader && <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center"><Icon name="wrench" className="w-4 h-4 text-red-600" /></div>
                <div>
                  <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>In Maintenance</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{vehicles.length} vehicles in workshop{unplannedCount > 0 ? ` · ${unplannedCount} ungeplant` : ''}</p>
                </div>
              </div>
              {closeBtn}
            </div>}
            <div
              className="overflow-y-auto space-y-2 pr-0.5"
              style={{ maxHeight: '318px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(156,163,175,0.4) transparent' }}
            >
              {vehicles.map((v) => {
                const isClean = v.cleaningStatus === 'Clean';
                const isPlanned = v.maintenanceUrgency === 'planned';
                const isUnplanned = v.maintenanceUrgency === 'urgent';
                const reasonLabel = formatMaintenanceReason(v.maintenanceReasonCode, v.maintenanceReason);
                const bucketLabel = isPlanned ? 'Planned' : isUnplanned ? 'Unplanned' : 'Service';
                return (
                  <div key={v.id} onClick={vehicleClick(v)} onMouseEnter={() => onItemHover?.(v.model)} onMouseLeave={() => onItemHover?.(null)} className={`rounded-xl p-3 border transition-all hover:shadow-sm cursor-pointer ${cardClass}`}>
                    {/* Row 1: License + MMY + BlockingBadge | Clean / Health / Bucket badges + Chevron */}
                    <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                      <div className="flex items-baseline gap-2 min-w-0 flex-1">
                        <span className={`text-[10.5px] font-bold leading-tight shrink-0 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{v.license}</span>
                        <span className={`text-[10px] font-semibold tracking-wide truncate ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{fleetTitle(v)}</span>
                        <BlockingBadge vehicleId={v.id} />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`shrink-0 inline-block min-w-[44px] text-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide ${
                            isClean
                              ? (isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-700')
                              : (isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700')
                          }`}
                          title={isClean ? 'Clean' : 'Needs cleaning'}
                        >
                          {isClean ? 'Clean' : 'Dirty'}
                        </span>
                        <HealthChip vehicleId={v.id} />
                        <span
                          className={`shrink-0 inline-block w-[72px] text-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide ${
                            isPlanned
                              ? (isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-700')
                              : isUnplanned
                                ? (isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700')
                                : (isDarkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700')
                          }`}
                          title={isPlanned ? 'Geplante Wartung' : isUnplanned ? 'Ungeplante Wartung / Operational Block' : 'Service ohne Dringlichkeitsangabe'}
                        >
                          {bucketLabel}
                        </span>
                        <Icon name="chevron-right" className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                      </div>
                    </div>
                    {/* Row 2: Reason · (urgent flag) */}
                    <div className="flex items-center gap-2 mb-1.5 min-w-0 text-[10.5px]">
                      <span className={`inline-flex items-center gap-1 truncate min-w-0 flex-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <Icon name="wrench" className={`w-3 h-3 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                        <span className="truncate font-semibold">
                          {reasonLabel !== '—' ? reasonLabel : 'In Wartung'}
                        </span>
                      </span>
                      {isUnplanned && (
                        <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide ${
                          isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700'
                        }`}>
                          <Icon name="alert-triangle" className="w-2.5 h-2.5" />
                          Dringend
                        </span>
                      )}
                    </div>
                    {/* Row 3: Workshop (last known address) · Home/Away · Fuel · Odometer.
                        V4.7.04 — Auch im Wartungs-Popup zeigen wir HOME/AWAY,
                        damit auf einen Blick erkennbar ist, ob das Fahrzeug
                        in der Werkstatt der eigenen Station steht oder
                        extern (Vendor / Auswärtsservice). */}
                    <div className={`flex items-center gap-1.5 pt-1.5 border-t min-w-0 overflow-hidden ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-100'}`}>
                      <Icon name="map-pin" className={`w-2.5 h-2.5 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <div className="truncate min-w-0 flex-1 text-[10px]">
                        <VehicleAddress v={v} isDarkMode={isDarkMode} />
                      </div>
                      <HomeAwayBadge v={v} stationLookup={stationLookup} isDarkMode={isDarkMode} />
                      <div className={`w-px h-3 shrink-0 ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`} />
                      <FuelStripe v={v} isDarkMode={isDarkMode} />
                      <div className={`w-px h-3 shrink-0 ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`} />
                      <OdometerText v={v} isDarkMode={isDarkMode} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}
    </div>
  );
}