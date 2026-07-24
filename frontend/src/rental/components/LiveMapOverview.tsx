import { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAddress } from '../../lib/useAddress';
import { createSedanMarkerEl, updateSedanRotation, shortestRotation } from '../../lib/vehicleMarker';
import { LiquidGlassLens } from '../../components/surface';
import { cn } from '../../components/ui/utils';
import {
  projectLngLatToScreen,
  shouldSnapMarkerMove,
  startMarkerAnimation,
  type MarkerAnimationPolicy,
  type MarkerAnimationSession,
} from '../lib/live-map-marker-animation';
import {
  captureMapCamera,
  classifyMapRuntimeError,
  detachMapInstance,
  mapErrorMessage,
  removeMapMarker,
  resolveLiveMapStyle,
  restoreMapCamera,
} from '../lib/live-map-instance';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
const DEFAULT_CENTER: [number, number] = [9.4797, 51.3127];
const DEFAULT_ZOOM = 16;

const LIVE_ACCENT = '#3b82f6';
const LIVE_GLOW = 'rgba(59,130,246,0.35)';

/** Camera follow duration */
const MAP_FOLLOW_DURATION_MS = 2000;

export interface LiveMapOverviewProps {
  targetPosition: [number, number] | null;
  initialPosition?: [number, number] | null;
  heading: number | null;
  speedKmh: number | null;
  licensePlate: string;
  waitingForPosition?: boolean;
  isLiveTracking?: boolean;
  className?: string;
  isDarkMode?: boolean;
  operatorHint?: string | null;
  operatorHintSub?: string | null;
  /** Reserved for a later reduced-motion prompt. */
  animationPolicy?: MarkerAnimationPolicy;
}

function createMarkerWrap(): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  wrap.style.width = '32px';
  wrap.style.height = '32px';
  return wrap;
}

export function LiveMapOverview({
  targetPosition,
  initialPosition,
  heading,
  speedKmh,
  licensePlate,
  waitingForPosition = false,
  isLiveTracking = false,
  className = '',
  isDarkMode = false,
  operatorHint = null,
  operatorHintSub = null,
  animationPolicy,
}: LiveMapOverviewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const markerWrapRef = useRef<HTMLDivElement | null>(null);
  const sedanMarkerRef = useRef<HTMLDivElement | null>(null);
  const plateOverlayRef = useRef<HTMLDivElement | null>(null);
  const animationSessionRef = useRef<MarkerAnimationSession | null>(null);
  const animationPolicyRef = useRef(animationPolicy);
  const styleUrlRef = useRef<string | null>(null);
  const isDarkModeRef = useRef(isDarkMode);
  const syncPlateOverlayRef = useRef<(lngLat?: [number, number] | null) => void>(() => {});
  animationPolicyRef.current = animationPolicy;
  isDarkModeRef.current = isDarkMode;

  const [loaded, setLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const posLat = targetPosition ? targetPosition[1] : null;
  const posLng = targetPosition ? targetPosition[0] : null;
  const { address: currentAddress } = useAddress(posLat, posLng);

  const displayPositionRef = useRef<[number, number] | null>(null);
  const currentRotationRef = useRef(0);
  const initialCenterRef = useRef<[number, number]>(
    targetPosition ?? initialPosition ?? DEFAULT_CENTER,
  );

  const syncPlateOverlay = useCallback((lngLat?: [number, number] | null) => {
    const overlay = plateOverlayRef.current;
    const map = mapRef.current;
    const pos = lngLat ?? displayPositionRef.current;
    if (!overlay || !map || !loaded || !pos) {
      if (overlay) overlay.style.visibility = 'hidden';
      return;
    }
    overlay.style.visibility = 'visible';
    overlay.style.transform = projectLngLatToScreen(
      (point) => map.project(point),
      pos,
    );
  }, [loaded]);
  syncPlateOverlayRef.current = syncPlateOverlay;

  const removeVehicleMarker = useCallback(() => {
    removeMapMarker(markerRef.current);
    markerRef.current = null;
    markerWrapRef.current = null;
    sedanMarkerRef.current = null;
  }, []);

  const applyMarkerFrame = useCallback(
    (lngLat: [number, number], rotationDeg: number) => {
      if (!mapRef.current || !loaded) return;

      const smoothRotation = shortestRotation(currentRotationRef.current, rotationDeg);
      currentRotationRef.current = smoothRotation;
      displayPositionRef.current = lngLat;

      if (!markerRef.current) {
        const wrap = createMarkerWrap();
        const sedanEl = createSedanMarkerEl(
          smoothRotation,
          LIVE_ACCENT,
          LIVE_GLOW,
          isDarkModeRef.current,
        );
        wrap.appendChild(sedanEl);
        markerWrapRef.current = wrap;
        sedanMarkerRef.current = sedanEl;

        const marker = new mapboxgl.Marker({ element: wrap, anchor: 'center' })
          .setLngLat(lngLat)
          .addTo(mapRef.current);
        markerRef.current = marker;
      } else {
        markerRef.current.setLngLat(lngLat);
        const sedanEl = sedanMarkerRef.current;
        if (sedanEl) updateSedanRotation(sedanEl, smoothRotation);
      }

      syncPlateOverlay(lngLat);
    },
    [loaded, syncPlateOverlay],
  );

  const stopMarkerAnimation = useCallback(() => {
    animationSessionRef.current?.cancel();
    animationSessionRef.current = null;
  }, []);
  const stopMarkerAnimationRef = useRef(stopMarkerAnimation);
  const removeVehicleMarkerRef = useRef(removeVehicleMarker);
  stopMarkerAnimationRef.current = stopMarkerAnimation;
  removeVehicleMarkerRef.current = removeVehicleMarker;

  // ── Core animation loop: GPS interpolation + dead reckoning (imperative, no React state per frame)
  useEffect(() => {
    if (!targetPosition) return;

    stopMarkerAnimation();

    const currentHeading = heading ?? 0;
    const currentSpeed = speedKmh ?? 0;

    if (displayPositionRef.current == null) {
      applyMarkerFrame(targetPosition, currentHeading);
      return;
    }

    const from = displayPositionRef.current;
    const to = targetPosition;

    if (shouldSnapMarkerMove(from, to)) {
      applyMarkerFrame(to, currentHeading);
      return;
    }

    animationSessionRef.current = startMarkerAnimation({
      from,
      to,
      heading: currentHeading,
      speedKmh: currentSpeed,
      reducedMotion: animationPolicyRef.current?.reducedMotion,
      onFrame: ({ position, heading: frameHeading }) => {
        applyMarkerFrame(position, frameHeading);
      },
    });

    return stopMarkerAnimation;
  }, [targetPosition, heading, speedKmh, applyMarkerFrame, stopMarkerAnimation]);

  // Sync marker when map becomes loaded
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const pos = displayPositionRef.current ?? targetPosition;
    if (pos) applyMarkerFrame(pos, heading ?? 0);
  }, [loaded, targetPosition, heading, applyMarkerFrame]);

  // Update marker arrow palette when theme changes (map instance stays alive)
  useEffect(() => {
    if (!loaded || !sedanMarkerRef.current) return;
    const parent = sedanMarkerRef.current.parentElement;
    if (!parent) return;
    const next = createSedanMarkerEl(
      currentRotationRef.current,
      LIVE_ACCENT,
      LIVE_GLOW,
      isDarkMode,
    );
    parent.replaceChild(next, sedanMarkerRef.current);
    sedanMarkerRef.current = next;
  }, [isDarkMode, loaded]);

  // Create map once; register listeners once; cleanup on unmount
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (!MAPBOX_TOKEN) {
      setMapError(mapErrorMessage('missing_token'));
      setLoaded(false);
      return;
    }

    setMapError(null);
    setLoaded(false);

    let disposed = false;
    const initialStyle = resolveLiveMapStyle(isDarkModeRef.current);
    styleUrlRef.current = initialStyle;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: initialStyle,
        center: initialCenterRef.current,
        zoom: DEFAULT_ZOOM,
        pitch: 45,
        bearing: -10,
        interactive: true,
        attributionControl: false,
      });
    } catch (err) {
      setMapError(mapErrorMessage(classifyMapRuntimeError(err)));
      return;
    }

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    const onLoad = () => {
      if (disposed) return;
      setLoaded(true);
      setMapError(null);
      syncPlateOverlayRef.current();
    };

    const onMapChange = () => {
      syncPlateOverlayRef.current();
    };

    const onMapError = (event: mapboxgl.ErrorEvent) => {
      if (disposed) return;
      const kind = classifyMapRuntimeError(event.error);
      setMapError(mapErrorMessage(kind));
    };

    const onWebGlContextLost = (event: Event) => {
      event.preventDefault();
      if (disposed) return;
      setMapError(mapErrorMessage('webgl_context_lost'));
      setLoaded(false);
    };

    map.on('load', onLoad);
    map.on('error', onMapError);
    map.on('move', onMapChange);
    map.on('zoom', onMapChange);
    map.on('resize', onMapChange);

    const canvas = map.getCanvas();
    canvas.addEventListener('webglcontextlost', onWebGlContextLost);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (disposed) return;
            try {
              map.resize();
            } catch {
              // Map may be mid-style-swap or teardown.
            }
            syncPlateOverlayRef.current();
          })
        : null;
    resizeObserver?.observe(mapContainerRef.current);

    return () => {
      disposed = true;
      stopMarkerAnimationRef.current();
      removeVehicleMarkerRef.current();
      map.off('load', onLoad);
      map.off('error', onMapError);
      map.off('move', onMapChange);
      map.off('zoom', onMapChange);
      map.off('resize', onMapChange);
      canvas.removeEventListener('webglcontextlost', onWebGlContextLost);
      resizeObserver?.disconnect();
      detachMapInstance(map);
      mapRef.current = null;
      styleUrlRef.current = null;
      setLoaded(false);
    };
  }, []);

  // Controlled style swap on theme change — preserve camera, keep map instance
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const nextStyle = resolveLiveMapStyle(isDarkMode);
    if (styleUrlRef.current === nextStyle) return;

    const camera = captureMapCamera(map);
    styleUrlRef.current = nextStyle;

    const onStyleLoad = () => {
      restoreMapCamera(map, camera);
      syncPlateOverlayRef.current();
      setMapError(null);
    };

    const onStyleError = (event: mapboxgl.ErrorEvent) => {
      const kind = classifyMapRuntimeError(event.error);
      if (kind === 'style_load' || kind === 'runtime') {
        setMapError(mapErrorMessage('style_load'));
      }
    };

    map.once('style.load', onStyleLoad);
    map.once('error', onStyleError);

    try {
      map.setStyle(nextStyle, { diff: false });
    } catch (err) {
      setMapError(mapErrorMessage(classifyMapRuntimeError(err)));
    }

    return () => {
      map.off('style.load', onStyleLoad);
      map.off('error', onStyleError);
    };
  }, [isDarkMode, loaded]);

  // Gentle camera follow on new GPS target
  useEffect(() => {
    if (!mapRef.current || !loaded || !targetPosition || mapError) return;
    mapRef.current.easeTo({
      center: targetPosition,
      zoom: mapRef.current.getZoom(),
      duration: MAP_FOLLOW_DURATION_MS,
    });
  }, [loaded, mapError, targetPosition]);

  useEffect(() => stopMarkerAnimation, [stopMarkerAnimation]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground text-xs ${className}`}>
        {mapErrorMessage('missing_token')}
      </div>
    );
  }

  const isInitialLoading = !loaded || (!targetPosition && !waitingForPosition);
  const showPlateOverlay = Boolean(licensePlate && !waitingForPosition && loaded && !mapError);

  return (
    <div className={`synq-map-hud-surface relative w-full h-full ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full" />
      {mapError && (
        <div className="sq-map-liquid-overlay rounded-lg">
          <div className="sq-map-liquid-empty mx-3 max-w-[17.5rem]">
            <p className="text-xs font-semibold text-foreground">{mapError}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              Live-Positionsanzeige ist vorübergehend nicht verfügbar.
            </p>
          </div>
        </div>
      )}
      {isInitialLoading && !mapError && (
        <div className="sq-map-liquid-overlay rounded-lg">
          <div className="sq-map-liquid-loading flex flex-col items-center gap-2">
            <svg className="h-6 w-6 animate-spin text-[color:var(--brand)]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs font-medium text-muted-foreground">Loading map...</span>
          </div>
        </div>
      )}
      {waitingForPosition && loaded && !mapError && (
        <div className="sq-map-liquid-overlay rounded-lg">
          <div className="sq-map-liquid-empty mx-3 max-w-[17.5rem]">
            <p className="text-xs font-semibold text-foreground">
              {operatorHint ?? 'No coordinates available'}
            </p>
            {(operatorHintSub ?? !operatorHint) && (
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {operatorHintSub ??
                  (isLiveTracking
                    ? 'Waiting for live GPS signal'
                    : 'Connect vehicle telematics for live location')}
              </p>
            )}
          </div>
        </div>
      )}
      {showPlateOverlay && (
        <div
          ref={plateOverlayRef}
          className="pointer-events-none absolute left-0 top-0 z-10"
          style={{ visibility: 'hidden' }}
        >
          <div className="liquid-glass-lens__plate-anchor">
            <LiquidGlassLens
              variant="vehicleMapCallout"
              renderMode="lens"
              intensity="subtle"
              className="pointer-events-none"
            >
              <span className="liquid-glass-lens__plate-badge">{licensePlate}</span>
            </LiquidGlassLens>
          </div>
        </div>
      )}
      {operatorHint && !waitingForPosition && loaded && !mapError && (
        <div className="pointer-events-none absolute top-2.5 right-2.5 z-10 max-w-[11rem] sm:top-3 sm:right-3">
          <LiquidGlassLens
            variant="vehicleHudBadge"
            renderMode={operatorHintSub ? 'shell' : 'lens'}
            intensity="subtle"
            className="pointer-events-none"
          >
            <div
              className={cn(
                'liquid-glass-lens__hud-badge flex-col items-start gap-0.5',
                operatorHintSub && 'liquid-glass-lens__hud-badge--wrap',
              )}
            >
              <p className="liquid-glass-lens__hud-badge__text">{operatorHint}</p>
              {operatorHintSub && (
                <p className="liquid-glass-lens__hud-badge__subtext">{operatorHintSub}</p>
              )}
            </div>
          </LiquidGlassLens>
        </div>
      )}
      {currentAddress && currentAddress.formatted !== '—' && !waitingForPosition && !mapError && (
        <div className="pointer-events-none absolute top-2.5 left-2.5 z-10 max-w-[12.5rem] sm:top-3 sm:left-3">
          <LiquidGlassLens
            variant="vehicleHudBadge"
            renderMode="shell"
            intensity="subtle"
            className="pointer-events-none"
          >
            <div className="liquid-glass-lens__hud-badge flex-col items-start gap-0 liquid-glass-lens__hud-badge--wrap">
              <p className="liquid-glass-lens__hud-badge__text truncate w-full">
                {currentAddress.street
                  ? `${currentAddress.street}${currentAddress.houseNumber ? ` ${currentAddress.houseNumber}` : ''}`
                  : (currentAddress.city ?? '—')}
              </p>
              {currentAddress.street && currentAddress.city && (
                <p className="liquid-glass-lens__hud-badge__subtext truncate w-full">
                  {currentAddress.city}
                </p>
              )}
            </div>
          </LiquidGlassLens>
        </div>
      )}
    </div>
  );
}
