import { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { interpolateLngLat, easeInOutCubic, distanceM, bearingDeg } from '../../lib/liveMapUtils';
import { useAddress } from '../../lib/useAddress';
import { createSedanMarkerEl, updateSedanRotation, shortestRotation } from '../../lib/vehicleMarker';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
const MAPBOX_STYLE = import.meta.env.VITE_MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/light-v11';
const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11';
const DEFAULT_CENTER: [number, number] = [9.4797, 51.3127];
const DEFAULT_ZOOM = 16;

const LIVE_ACCENT = '#3b82f6';
const LIVE_GLOW = 'rgba(59,130,246,0.35)';

/** How long to animate between two real GPS points (ms). Slightly less than poll interval. */
const GPS_INTERP_DURATION_MS = 4500;
/** Dead reckoning: max seconds to predict beyond last GPS point */
const DR_MAX_PREDICT_S = 6;
/** Minimum speed (km/h) to engage dead reckoning */
const DR_MIN_SPEED_KMH = 3;
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
}

function createCalloutEl(plate: string, isDark: boolean): HTMLDivElement {
  const callout = document.createElement('div');
  callout.style.position = 'absolute';
  callout.style.bottom = '100%';
  callout.style.marginBottom = '6px';
  callout.style.left = '50%';
  callout.style.transform = 'translateX(-50%)';
  callout.style.padding = '4px 10px';
  callout.style.borderRadius = '8px';
  callout.style.fontSize = '10px';
  callout.style.fontWeight = '600';
  callout.style.letterSpacing = '0.05em';
  callout.style.whiteSpace = 'nowrap';
  callout.style.background = isDark ? 'rgba(30, 41, 59, 0.85)' : 'rgba(255, 255, 255, 0.85)';
  callout.style.backdropFilter = 'blur(4px)';
  callout.style.color = isDark ? 'rgb(226, 232, 240)' : 'rgb(30, 41, 59)';
  callout.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)';
  callout.style.border = `1px solid ${isDark ? 'rgba(71, 85, 105, 0.5)' : 'rgba(203, 213, 225, 0.6)'}`;
  callout.textContent = plate;

  const line = document.createElement('div');
  line.style.position = 'absolute';
  line.style.top = '100%';
  line.style.left = '50%';
  line.style.transform = 'translateX(-50%)';
  line.style.width = '1px';
  line.style.height = '6px';
  line.style.background = isDark ? 'rgba(71, 85, 105, 0.8)' : 'rgba(148, 163, 184, 0.8)';
  callout.appendChild(line);

  return callout;
}

/**
 * Project a GPS position forward using speed + heading (dead reckoning).
 * Returns [lng, lat] offset from `from` after `dtSeconds`.
 */
function deadReckon(
  from: [number, number],
  headingDeg: number,
  speedKmh: number,
  dtSeconds: number,
): [number, number] {
  const distKm = (speedKmh / 3600) * dtSeconds;
  const distDeg = distKm / 111.32;
  const rad = (headingDeg * Math.PI) / 180;
  const dLng = distDeg * Math.sin(rad) / Math.cos((from[1] * Math.PI) / 180);
  const dLat = distDeg * Math.cos(rad);
  return [from[0] + dLng, from[1] + dLat];
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
}: LiveMapOverviewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const markerWrapRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  const posLat = targetPosition ? targetPosition[1] : null;
  const posLng = targetPosition ? targetPosition[0] : null;
  const { address: currentAddress } = useAddress(posLat, posLng);

  const displayPositionRef = useRef<[number, number] | null>(null);
  const currentRotationRef = useRef(0);
  const rafRef = useRef<number>(0);

  // Track when the last real GPS target arrived (for dead reckoning timing)
  const lastGpsArrivalRef = useRef<number>(0);
  const lastGpsTargetRef = useRef<[number, number] | null>(null);
  const prevGpsTargetRef = useRef<[number, number] | null>(null);

  const updateMarker = useCallback(
    (lngLat: [number, number], rotationDeg: number) => {
      if (!mapRef.current || !loaded) return;
      const map = mapRef.current;
      const smoothRotation = shortestRotation(currentRotationRef.current, rotationDeg);
      currentRotationRef.current = smoothRotation;

      if (!markerRef.current) {
        const wrap = document.createElement('div');
        wrap.style.position = 'relative';
        wrap.style.width = '32px';
        wrap.style.height = '32px';
        const sedanEl = createSedanMarkerEl(smoothRotation, LIVE_ACCENT, LIVE_GLOW, isDarkMode);
        const callout = createCalloutEl(licensePlate, isDarkMode);
        wrap.appendChild(callout);
        wrap.appendChild(sedanEl);
        markerWrapRef.current = wrap;

        const marker = new mapboxgl.Marker({ element: wrap, anchor: 'center' })
          .setLngLat(lngLat)
          .addTo(map);
        markerRef.current = marker;
        return;
      }

      markerRef.current.setLngLat(lngLat);
      const wrap = markerWrapRef.current;
      if (wrap) {
        const sedanWrap = wrap.querySelector('.synq-sedan-marker') as HTMLDivElement | null;
        if (sedanWrap) updateSedanRotation(sedanWrap, smoothRotation);
        const callout = wrap.querySelector('div:first-child') as HTMLElement | null;
        if (callout && !callout.classList.contains('synq-sedan-marker')) callout.textContent = licensePlate;
      }
    },
    [loaded, licensePlate, isDarkMode],
  );

  // ── Core animation loop: GPS interpolation + dead reckoning ────────
  useEffect(() => {
    if (!targetPosition) return;

    const now = Date.now();
    const prevTarget = lastGpsTargetRef.current;

    // Track GPS arrivals
    prevGpsTargetRef.current = prevTarget;
    lastGpsTargetRef.current = targetPosition;
    lastGpsArrivalRef.current = now;

    // First point ever: snap
    if (displayPositionRef.current == null) {
      displayPositionRef.current = targetPosition;
      updateMarker(targetPosition, heading ?? 0);
      return;
    }

    const from = displayPositionRef.current;
    const to = targetPosition;
    const distM = distanceM(from, to);

    // Tiny move or teleport: snap
    if (distM < 0.5 || distM > 2000) {
      displayPositionRef.current = to;
      updateMarker(to, heading ?? 0);
      return;
    }

    // Animate from current display position to new target
    const animStart = now;
    const currentHeading = heading ?? 0;
    const currentSpeed = speedKmh ?? 0;
    const canDeadReckon = currentSpeed >= DR_MIN_SPEED_KMH && heading != null;

    const tick = () => {
      const elapsed = Date.now() - animStart;

      if (elapsed < GPS_INTERP_DURATION_MS) {
        // Phase 1: Interpolate toward the real GPS target
        const t = easeInOutCubic(Math.min(elapsed / GPS_INTERP_DURATION_MS, 1));
        const pos = interpolateLngLat(from, to, t) as [number, number];
        displayPositionRef.current = pos;
        updateMarker(pos, currentHeading);
        rafRef.current = requestAnimationFrame(tick);
      } else if (canDeadReckon) {
        // Phase 2: Dead reckoning beyond the real GPS point
        const drTime = (elapsed - GPS_INTERP_DURATION_MS) / 1000;
        if (drTime < DR_MAX_PREDICT_S) {
          // Decelerate prediction over time (less confident the further we predict)
          const confidence = 1 - (drTime / DR_MAX_PREDICT_S) * 0.6;
          const predictedSpeed = currentSpeed * confidence;
          const pos = deadReckon(to, currentHeading, predictedSpeed, drTime);
          displayPositionRef.current = pos;
          updateMarker(pos, currentHeading);
          rafRef.current = requestAnimationFrame(tick);
        }
        // After max predict time: stop, wait for next GPS
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [targetPosition, heading, speedKmh, updateMarker]);

  // Sync marker when map becomes loaded
  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const pos = displayPositionRef.current ?? targetPosition;
    if (pos) updateMarker(pos, heading ?? 0);
  }, [loaded, targetPosition, heading, updateMarker]);

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
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      markerRef.current?.remove();
      markerRef.current = null;
      markerWrapRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [isDarkMode]);

  // Gentle camera follow on new GPS target
  useEffect(() => {
    if (!mapRef.current || !loaded || !targetPosition) return;
    mapRef.current.easeTo({
      center: targetPosition,
      zoom: mapRef.current.getZoom(),
      duration: MAP_FOLLOW_DURATION_MS,
    });
  }, [loaded, targetPosition]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground text-xs ${className}`}>
        Mapbox token not configured
      </div>
    );
  }

  const isInitialLoading = !loaded || (!targetPosition && !waitingForPosition);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full" />
      {isInitialLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/50 backdrop-blur-[1px] rounded-lg z-10">
          <div className="flex flex-col items-center gap-2">
            <svg className="w-6 h-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs font-medium text-muted-foreground">Loading map...</span>
          </div>
        </div>
      )}
      {waitingForPosition && loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px] rounded-lg text-foreground">
          <div className="max-w-[280px] px-3 py-2 bg-card/85 backdrop-blur-sm border border-border rounded-lg text-center">
            <p className="text-xs font-medium">Keine Live-Position</p>
            <p className="text-xs mt-1 opacity-90">Fahrzeug mit DIMO verbinden für Echtzeit-Standort</p>
          </div>
        </div>
      )}
      {currentAddress && currentAddress.formatted !== '—' && !waitingForPosition && (
        <div className="absolute top-3 left-3 max-w-[220px] px-2.5 py-1.5 bg-card/85 backdrop-blur-sm border border-border/50 rounded-lg shadow-md text-foreground">
          <p className="text-[10px] font-semibold leading-tight truncate">{currentAddress.street ? `${currentAddress.street}${currentAddress.houseNumber ? ` ${currentAddress.houseNumber}` : ''}` : currentAddress.city ?? '—'}</p>
          {currentAddress.street && currentAddress.city && (
            <p className="text-[10px] leading-tight truncate text-muted-foreground">{currentAddress.city}</p>
          )}
        </div>
      )}
      <div className="absolute top-3 right-12 flex items-center gap-1.5 px-2.5 py-1 bg-card/85 backdrop-blur-sm border border-border/50 rounded-lg shadow-md text-foreground">
        {isLiveTracking ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span className="text-[10px] font-semibold tracking-wider">LIVE</span>
          </>
        ) : (
          <>
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
            </span>
            <span className="text-[10px] font-semibold tracking-wider">SNAPSHOT</span>
          </>
        )}
      </div>
    </div>
  );
}
