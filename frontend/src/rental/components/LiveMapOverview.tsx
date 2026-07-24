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

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
const MAPBOX_STYLE = import.meta.env.VITE_MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/light-v11';
const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11';
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
  animationPolicyRef.current = animationPolicy;

  const [loaded, setLoaded] = useState(false);

  const posLat = targetPosition ? targetPosition[1] : null;
  const posLng = targetPosition ? targetPosition[0] : null;
  const { address: currentAddress } = useAddress(posLat, posLng);

  const displayPositionRef = useRef<[number, number] | null>(null);
  const currentRotationRef = useRef(0);

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

  const applyMarkerFrame = useCallback(
    (lngLat: [number, number], rotationDeg: number) => {
      if (!mapRef.current || !loaded) return;

      const smoothRotation = shortestRotation(currentRotationRef.current, rotationDeg);
      currentRotationRef.current = smoothRotation;
      displayPositionRef.current = lngLat;

      if (!markerRef.current) {
        const wrap = createMarkerWrap();
        const sedanEl = createSedanMarkerEl(smoothRotation, LIVE_ACCENT, LIVE_GLOW, isDarkMode);
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
    [isDarkMode, loaded, syncPlateOverlay],
  );

  const stopMarkerAnimation = useCallback(() => {
    animationSessionRef.current?.cancel();
    animationSessionRef.current = null;
  }, []);

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

  // Sync plate overlay on map pan/zoom (no React state)
  useEffect(() => {
    if (!mapRef.current || !loaded) return;
    const map = mapRef.current;
    const onMapChange = () => syncPlateOverlay();
    syncPlateOverlay();
    map.on('move', onMapChange);
    map.on('zoom', onMapChange);
    map.on('resize', onMapChange);
    return () => {
      map.off('move', onMapChange);
      map.off('zoom', onMapChange);
      map.off('resize', onMapChange);
    };
  }, [loaded, syncPlateOverlay]);

  // Initial map setup
  useEffect(() => {
    if (!mapContainerRef.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const style = isDarkMode ? DARK_STYLE : MAPBOX_STYLE;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style,
      center: targetPosition ?? initialPosition ?? DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 45,
      bearing: -10,
      interactive: true,
      attributionControl: false,
    });

    map.on('load', () => setLoaded(true));
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    return () => {
      stopMarkerAnimation();
      markerRef.current?.remove();
      markerRef.current = null;
      markerWrapRef.current = null;
      sedanMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [isDarkMode, stopMarkerAnimation]);

  // Gentle camera follow on new GPS target
  useEffect(() => {
    if (!mapRef.current || !loaded || !targetPosition) return;
    mapRef.current.easeTo({
      center: targetPosition,
      zoom: mapRef.current.getZoom(),
      duration: MAP_FOLLOW_DURATION_MS,
    });
  }, [loaded, targetPosition]);

  useEffect(() => stopMarkerAnimation, [stopMarkerAnimation]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground text-xs ${className}`}>
        Mapbox token not configured
      </div>
    );
  }

  const isInitialLoading = !loaded || (!targetPosition && !waitingForPosition);
  const showPlateOverlay = Boolean(licensePlate && !waitingForPosition && loaded);

  return (
    <div className={`synq-map-hud-surface relative w-full h-full ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full" />
      {isInitialLoading && (
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
      {waitingForPosition && loaded && (
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
      {operatorHint && !waitingForPosition && loaded && (
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
      {currentAddress && currentAddress.formatted !== '—' && !waitingForPosition && (
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
