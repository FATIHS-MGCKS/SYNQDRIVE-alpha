import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import { useAddress } from '../../../lib/useAddress';
import { TRIPS_COPY, tv } from './trips-view-ui';
import type { TripBehaviorEvent, TripEnrichment } from './trips-map.types';
import type { TripMapLayerState, TripMapPopoverState, TripMapRoutePoint, TripMapTripData } from './trips-map.types';
import { TripMapDataQualityOverlay } from './TripMapDataQualityOverlay';
import { TripMapLayerControls } from './TripMapLayerControls';
import { TripMapLegend } from './TripMapLegend';
import { TripMapSummaryOverlay } from './TripMapSummaryOverlay';
import { TripEventPopover } from './TripEventPopover';
import { deriveTripMapQuality } from './trips-map.utils';
import { DEFAULT_TRIP_MAP_LAYERS } from './utils/tripMapLayers';
import { useTripsRouteMap } from './useTripsRouteMap';

export interface TripsMapCardProps {
  isDarkMode: boolean;
  vehicleId?: string;
  selectedTrip: TripMapTripData | null;
  routePoints: TripMapRoutePoint[];
  routeLoading: boolean;
  routeError: string | null;
  enrichment?: TripEnrichment;
  enrichingTrip: boolean;
  behaviorEvents: TripBehaviorEvent[];
  behaviorLoading: boolean;
  syncing: boolean;
  syncMessage: string | null;
  syncIsSuccess: boolean;
  onShowEventInDetails?: (eventId: string) => void;
  selectedBehaviorEventId?: string | null;
  onBehaviorEventSelect?: (eventId: string | null) => void;
  onMapReady?: (actions: { centerRoute: () => void; focusBehaviorEvent: (eventId: string) => void }) => void;
}

const DEFAULT_LAYERS = DEFAULT_TRIP_MAP_LAYERS;

export function TripsMapCard({
  isDarkMode,
  vehicleId,
  selectedTrip,
  routePoints,
  routeLoading,
  routeError,
  enrichment,
  enrichingTrip,
  behaviorEvents,
  behaviorLoading,
  syncing,
  syncMessage,
  syncIsSuccess,
  onShowEventInDetails,
  selectedBehaviorEventId,
  onBehaviorEventSelect,
  onMapReady,
}: TripsMapCardProps) {
  const isDark = isDarkMode;
  const [layers, setLayers] = useState<TripMapLayerState>(DEFAULT_LAYERS);
  const [popover, setPopover] = useState<TripMapPopoverState | null>(null);
  const { address: startAddress } = useAddress(selectedTrip?.startLatitude, selectedTrip?.startLongitude);
  const { address: endAddress } = useAddress(selectedTrip?.endLatitude, selectedTrip?.endLongitude);

  const endpointLabels = useMemo(
    () => ({
      start: startAddress?.formatted ?? null,
      end: endAddress?.formatted ?? null,
    }),
    [startAddress?.formatted, endAddress?.formatted],
  );

  const quality = useMemo(
    () => deriveTripMapQuality(selectedTrip, enrichment, routePoints.length, routeError, behaviorLoading),
    [selectedTrip, enrichment, routePoints.length, routeError, behaviorLoading],
  );

  const handleEventSelect = useCallback(
    (state: TripMapPopoverState | null) => {
      setPopover(state);
      onBehaviorEventSelect?.(state?.event.id ?? null);
    },
    [onBehaviorEventSelect],
  );

  const {
    mapContainerRef,
    mapRef,
    mapLoaded,
    mapError,
    handleCenterRoute,
    focusBehaviorEvent,
    hasMapboxToken,
  } = useTripsRouteMap({
    isDarkMode,
    vehicleId,
    selectedTrip,
    routePoints,
    enrichment,
    behaviorEvents,
    layers,
    onEventSelect: handleEventSelect,
    selectedBehaviorEventId,
    endpointLabels,
  });

  // Reset matched-route toggle when enrichment arrives
  useEffect(() => {
    if (quality.hasMatchedGeometry) {
      setLayers((prev) => ({ ...prev, showMatchedRoute: true }));
    }
  }, [quality.hasMatchedGeometry, selectedTrip?.id]);

  // Keep popover anchored on map move/zoom
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !popover) return;
    const update = () => {
      const ev = popover.event;
      if (ev.latitude == null || ev.longitude == null) return;
      const point = map.project([ev.longitude, ev.latitude]);
      setPopover((prev) => (prev ? { ...prev, x: point.x, y: point.y } : null));
    };
    map.on('move', update);
    map.on('zoom', update);
    return () => {
      map.off('move', update);
      map.off('zoom', update);
    };
  }, [mapRef, popover?.event.id, mapLoaded]);

  useEffect(() => {
    onMapReady?.({ centerRoute: handleCenterRoute, focusBehaviorEvent });
  }, [focusBehaviorEvent, handleCenterRoute, onMapReady]);

  const toggleLayer = (key: keyof TripMapLayerState) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const hasRoute = routePoints.length > 0 && !routeError;
  const frameHeight = selectedTrip
    ? 'h-[min(40vh,380px)] sm:h-[min(44vh,420px)] xl:h-auto xl:flex-1 xl:min-h-[360px]'
    : 'h-[200px] sm:h-[240px] xl:h-auto xl:flex-1 xl:min-h-[300px]';

  return (
    <div className={tv.mapPanel}>
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/50 bg-muted/30">
            <Icon name="route" className={`w-4 h-4 shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
          <div className="min-w-0">
            <p className={tv.sectionEyebrow}>Kartenansicht</p>
            <h2 className={`${tv.sectionTitle} truncate`}>
              {selectedTrip
                ? TRIPS_COPY.mapTitleTrip(
                    new Date(selectedTrip.startTime).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    }),
                  )
                : TRIPS_COPY.mapTitle}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {syncMessage && (
            <span
              className={`text-[10px] font-medium px-2 py-1 rounded-lg border ${
                syncIsSuccess
                  ? 'border-emerald-500/20 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400'
                  : 'border-amber-500/20 bg-amber-500/8 text-amber-700 dark:text-amber-400'
              }`}
            >
              {syncMessage}
            </span>
          )}
          {hasRoute && mapLoaded && !mapError && (
            <button
              type="button"
              onClick={handleCenterRoute}
              className={`sq-map-liquid-pill flex-row gap-1.5 py-1.5 px-2.5 text-[10px] font-semibold pointer-events-auto ${tv.focusRing}`}
            >
              <Icon name="crosshair" className="w-3 h-3" />
              <span className="hidden sm:inline">{TRIPS_COPY.centerRoute}</span>
            </button>
          )}
        </div>
      </div>

      <div className={`relative ${frameHeight} ${tv.mapFrame} shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] bg-muted/15`}>
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

        {mapError && (
          <div className={`${tv.overlay} z-20`}>
            <div className="sq-map-liquid-empty mx-4 max-w-sm text-center">
              <Icon name="map" className={`w-7 h-7 mx-auto mb-2 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
              <p className="text-sm font-semibold text-foreground">{TRIPS_COPY.mapUnavailableTitle}</p>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{TRIPS_COPY.mapUnavailableHint}</p>
              {!hasMapboxToken && import.meta.env.DEV && (
                <p className="mt-2 text-[9px] font-mono text-muted-foreground/80">VITE_MAPBOX_ACCESS_TOKEN fehlt</p>
              )}
            </div>
          </div>
        )}

        {!mapError && !mapLoaded && (
          <div className={`${tv.overlay} z-20`}>
            <div className="sq-map-liquid-loading flex flex-col items-center gap-2">
              <Icon name="loader-2" className={`w-6 h-6 animate-spin ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
              <span className="text-xs font-medium text-muted-foreground">{TRIPS_COPY.loadingMap}</span>
            </div>
          </div>
        )}

        {routeLoading && mapLoaded && !mapError && (
          <div className={`${tv.overlay} z-20 bg-background/35`}>
            <div className="sq-map-liquid-loading flex flex-col items-center gap-2">
              <Icon name="loader-2" className={`w-6 h-6 animate-spin ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
              <span className="text-xs font-medium text-foreground">{TRIPS_COPY.loadingRoute}</span>
            </div>
          </div>
        )}

        {enrichingTrip && mapLoaded && !mapError && !routeLoading && (
          <div className={`${tv.overlay} z-20 bg-background/25`}>
            <div className="sq-map-liquid-loading flex flex-col items-center gap-2">
              <Icon name="loader-2" className={`w-5 h-5 animate-spin ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
              <span className="text-xs font-medium text-muted-foreground">{TRIPS_COPY.enrichingTrip}</span>
            </div>
          </div>
        )}

        {selectedTrip && mapLoaded && !mapError && (
          <>
            <TripMapSummaryOverlay trip={selectedTrip} isDark={isDark} />
            <TripMapDataQualityOverlay quality={quality} routeLoading={routeLoading} />
          </>
        )}

        {hasRoute && mapLoaded && !mapError && (
          <>
            <TripMapLayerControls
              layers={layers}
              hasMatchedGeometry={quality.hasMatchedGeometry}
              hasRoute={hasRoute}
              onToggle={toggleLayer}
            />
            <TripMapLegend />
          </>
        )}

        {popover && (
          <TripEventPopover
            event={popover.event}
            x={popover.x}
            y={popover.y}
            onClose={() => setPopover(null)}
            onShowInDetails={
              onShowEventInDetails
                ? () => onShowEventInDetails(popover.event.id)
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
