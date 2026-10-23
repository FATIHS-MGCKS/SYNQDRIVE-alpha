import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RouteContinuityStatus, RouteProcessingState } from '../../../lib/api';
import { Icon } from '../ui/Icon';
import { LiquidGlassLens } from '../../../components/surface';
import { useAddress } from '../../../lib/useAddress';
import { useLanguage } from '../../../i18n/LanguageContext';
import { TRIPS_COPY, tv } from './trips-view-ui';
import type { TripBehaviorEvent } from './trips-map.types';
import type { TripMapLayerState, TripMapPopoverState, TripMapRoutePoint, TripMapTripData } from './trips-map.types';
import { TripMapDataQualityOverlay } from './TripMapDataQualityOverlay';
import { TripMapLayerControls } from './TripMapLayerControls';
import { TripMapLegend } from './TripMapLegend';
import { TripMapSummaryOverlay } from './TripMapSummaryOverlay';
import { TripEventPopover } from './TripEventPopover';
import { deriveTripMapQuality } from './trips-map.utils';
import { DEFAULT_TRIP_MAP_LAYERS } from './utils/tripMapLayers';
import { TripMotionMapPopover } from './TripMotionMapPopover';
import { TripMotionMapStatusBanner } from './TripMotionMapStatusBanner';
import type { TripMotionMapPayload, TripMotionMapPopoverState } from './motion-map.types';
import {
  isMotionMapActive,
  motionEventLabelKey,
  resolveMotionSamplesForMap,
  type MotionEventSegment,
} from './motion-map.utils';
import type { TripMotionMapEvent, TripMotionMapPickListItem } from './motion-map.types';
import { TripM7aMapStatusBanner } from './TripM7aMapStatusBanner';
import type { TripM7aMapPayload } from './m7a-map.types';
import { isM7aMapActive, isM7aMapEvaluationPresent, resolveM7aMotionBinding } from './m7a-map.utils';
import { useTripsRouteMap } from './useTripsRouteMap';

export interface TripsMapCardProps {
  isDarkMode: boolean;
  vehicleId?: string;
  selectedTrip: TripMapTripData | null;
  routePoints: TripMapRoutePoint[];
  routeSegments: [number, number][][];
  routeQuality: import('../../../lib/api').CanonicalRouteQuality | null;
  processingState: RouteProcessingState;
  continuityStatus: RouteContinuityStatus;
  matchConfidence: number | null;
  routeProcessedAt: string | null;
  matchCoverage: number | null;
  routeLoading: boolean;
  routeError: string | null;
  behaviorEvents: TripBehaviorEvent[];
  behaviorLoading: boolean;
  syncing: boolean;
  syncMessage: string | null;
  syncIsSuccess: boolean;
  onShowEventInDetails?: (eventId: string) => void;
  selectedBehaviorEventId?: string | null;
  onBehaviorEventSelect?: (eventId: string | null) => void;
  onMapReady?: (actions: { centerRoute: () => void; focusBehaviorEvent: (eventId: string) => void }) => void;
  motionMapPayload?: TripMotionMapPayload | null;
  motionMapLoading?: boolean;
  motionMapError?: boolean;
  m7aMapPayload?: TripM7aMapPayload | null;
  m7aMapLoading?: boolean;
  m7aMapError?: boolean;
}

const DEFAULT_LAYERS = DEFAULT_TRIP_MAP_LAYERS;

export function TripsMapCard({
  isDarkMode,
  vehicleId,
  selectedTrip,
  routePoints,
  routeSegments,
  routeQuality,
  processingState,
  continuityStatus,
  matchConfidence,
  matchCoverage,
  routeProcessedAt,
  routeLoading,
  routeError,
  behaviorEvents,
  behaviorLoading,
  syncing,
  syncMessage,
  syncIsSuccess,
  onShowEventInDetails,
  selectedBehaviorEventId,
  onBehaviorEventSelect,
  onMapReady,
  motionMapPayload = null,
  motionMapLoading = false,
  motionMapError = false,
  m7aMapPayload = null,
  m7aMapLoading = false,
  m7aMapError = false,
}: TripsMapCardProps) {
  const isDark = isDarkMode;
  const { t } = useLanguage();
  const [layers, setLayers] = useState<TripMapLayerState>(DEFAULT_LAYERS);
  const [popover, setPopover] = useState<TripMapPopoverState | null>(null);
  const [motionPopover, setMotionPopover] = useState<TripMotionMapPopoverState | null>(null);
  const [selectedMotionEventId, setSelectedMotionEventId] = useState<string | null>(null);

  const motionActive = isMotionMapActive(motionMapPayload);
  const m7aActive = isM7aMapActive(m7aMapPayload);
  const m7aLayerAvailable = isM7aMapEvaluationPresent(m7aMapPayload) && m7aActive;
  const m7aBinding = useMemo(
    () => resolveM7aMotionBinding(motionMapPayload, m7aMapPayload),
    [motionMapPayload, m7aMapPayload],
  );
  const m7aBindingNote = useMemo(() => {
    if (m7aBinding.compatible || !m7aBinding.reasonKey) return null;
    return t(m7aBinding.reasonKey as never);
  }, [m7aBinding, t]);
  const resolvedMotion = useMemo(() => {
    if (!motionMapPayload || !motionActive) return null;
    return resolveMotionSamplesForMap(motionMapPayload, routePoints);
  }, [motionMapPayload, motionActive, routePoints]);
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
    () =>
      deriveTripMapQuality(selectedTrip, {
        routeQuality,
        matchConfidence,
        matchCoverage,
        continuityStatus,
        processingState,
        routeProcessedAt,
        segmentCount: routeSegments.length,
        routeError,
        behaviorLoading,
      }),
    [
      selectedTrip,
      routeQuality,
      matchConfidence,
      matchCoverage,
      continuityStatus,
      processingState,
      routeProcessedAt,
      routeSegments.length,
      routeError,
      behaviorLoading,
    ],
  );

  const motionEventAriaLabel = useCallback(
    (event: TripMotionMapEvent) => t(motionEventLabelKey(event)),
    [t],
  );

  const handleMotionPickListSelect = useCallback(
    (item: TripMotionMapPickListItem) => {
      setMotionPopover((prev) => {
        if (!prev || prev.kind !== 'pickList') return prev;
        const { x, y } = prev;
        if (item.type === 'event') {
          setSelectedMotionEventId(item.event.id);
          return { kind: 'event', event: item.event, x, y };
        }
        setSelectedMotionEventId(null);
        return { kind: 'stop', stop: item.stop, x, y };
      });
    },
    [],
  );

  const handleMotionEventSegmentResolved = useCallback(
    (eventId: string, segment: MotionEventSegment) => {
      setMotionPopover((prev) => {
        if (!prev || prev.kind !== 'event' || prev.event.id !== eventId) return prev;
        const next = { sampleCount: segment.samples.length, extended: segment.extended };
        if (prev.segment && prev.segment.sampleCount === next.sampleCount && prev.segment.extended === next.extended) {
          return prev;
        }
        return { ...prev, segment: next };
      });
    },
    [],
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
    routeSegments,
    hasUnknownGaps: quality.continuityStatus === 'GAPS_PRESENT' || quality.gpsGap,
    behaviorEvents,
    layers,
    onEventSelect: handleEventSelect,
    selectedBehaviorEventId,
    endpointLabels,
    motionMapActive: motionActive,
    motionSamples: resolvedMotion?.samples ?? [],
    motionEvents: motionMapPayload?.events ?? [],
    motionStops: motionMapPayload?.stopEpisodes ?? [],
    onMotionPopover: (state) => {
      setMotionPopover(state);
      if (state?.kind === 'event') setSelectedMotionEventId(state.event.id);
      else if (state?.kind !== 'pickList') setSelectedMotionEventId(null);
    },
    selectedMotionEventId,
    motionEventAriaLabel,
    onMotionEventSegmentResolved: handleMotionEventSegmentResolved,
    m7aMapPayload,
    motionMapPayload,
    m7aBindingNote,
  });

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

  const hasRoute =
    (quality.routeAvailable && !routeError) ||
    (motionActive && (resolvedMotion?.samples.length ?? 0) > 0);
  const frameHeight = selectedTrip
    ? 'h-[min(40vh,380px)] sm:h-[min(44vh,420px)] xl:h-auto xl:flex-1 xl:min-h-[360px]'
    : 'h-[200px] sm:h-[240px] xl:h-auto xl:flex-1 xl:min-h-[300px]';

  return (
    <div className={tv.mapPanel}>
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/50 bg-muted/30">
            <Icon name="route" className={`w-4 h-4 shrink-0 ${isDark ? 'text-brand' : 'text-brand'}`} />
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
            <LiquidGlassLens variant="fleetPanelAction" renderMode="lens" intensity="subtle">
              <button
                type="button"
                onClick={handleCenterRoute}
                className={`liquid-glass-lens__panel-action ${tv.focusRing}`}
              >
                <Icon name="crosshair" className="liquid-glass-lens__panel-action__icon" />
                <span className="liquid-glass-lens__panel-action__label hidden sm:inline">
                  {TRIPS_COPY.centerRoute}
                </span>
              </button>
            </LiquidGlassLens>
          )}
        </div>
      </div>

      <div className={`relative synq-map-hud-surface ${frameHeight} ${tv.mapFrame} shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] bg-muted/15`}>
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
              <Icon name="loader-2" className={`w-6 h-6 animate-spin ${isDark ? 'text-foreground' : 'text-brand'}`} />
              <span className="text-xs font-medium text-muted-foreground">{TRIPS_COPY.loadingMap}</span>
            </div>
          </div>
        )}

        {routeLoading && mapLoaded && !mapError && (
          <div className={`${tv.overlay} z-20 bg-background/35`}>
            <div className="sq-map-liquid-loading flex flex-col items-center gap-2">
              <Icon name="loader-2" className={`w-6 h-6 animate-spin ${isDark ? 'text-foreground' : 'text-brand'}`} />
              <span className="text-xs font-medium text-foreground">{TRIPS_COPY.loadingRoute}</span>
            </div>
          </div>
        )}

        {selectedTrip && mapLoaded && !mapError && (
          <>
            <TripMapSummaryOverlay
              trip={selectedTrip}
              isDark={isDark}
              motionEventCount={motionActive ? (motionMapPayload?.events.length ?? 0) : null}
            />
            <TripMapDataQualityOverlay quality={quality} routeLoading={routeLoading} />
            <TripMotionMapStatusBanner
              payload={motionMapPayload}
              loading={motionMapLoading}
              error={motionMapError}
            />
            <TripM7aMapStatusBanner
              payload={m7aMapPayload}
              loading={m7aMapLoading}
              error={m7aMapError}
            />
            {layers.showM7aRoadAssignment && m7aActive && motionActive && !m7aBinding.compatible && m7aBindingNote && (
              <div className="pointer-events-none absolute top-12 left-3 z-20 max-w-[min(100%,18rem)] rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-900 dark:text-amber-200 backdrop-blur-sm">
                {t('trips.m7aMap.combinedUnavailable')}: {m7aBindingNote}
              </div>
            )}
          </>
        )}

        {hasRoute && mapLoaded && !mapError && (
          <>
            <TripMapLayerControls
              layers={layers}
              hasRoute={hasRoute}
              m7aLayerAvailable={m7aLayerAvailable}
              onToggle={toggleLayer}
            />
            <TripMapLegend />
          </>
        )}

        {motionPopover && (
          <TripMotionMapPopover
            state={motionPopover}
            onClose={() => {
              setMotionPopover(null);
              setSelectedMotionEventId(null);
            }}
            onPickListSelect={handleMotionPickListSelect}
            onM7aPointSelect={(point) => {
              setMotionPopover((prev) =>
                prev
                  ? { kind: 'm7aPoint', point, x: prev.x, y: prev.y }
                  : null,
              );
            }}
          />
        )}

        {popover && !motionPopover && (
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
