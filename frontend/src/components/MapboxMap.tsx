import { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { createFleetMarkerEl, updateSedanRotation, shortestRotation } from '../lib/vehicleMarker';
import { distanceM, interpolateLngLat, easeInOutCubic } from '../lib/liveMapUtils';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
const MAPBOX_STYLE_LIGHT = import.meta.env.VITE_MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/light-v11';
const MAPBOX_STYLE_DARK = 'mapbox://styles/mapbox/dark-v11';
const FLEET_TRANSITION_MS = 1800;

export interface FleetMapMarker {
  id: string;
  lng: number;
  lat: number;
  label?: string;
  status?: string;
  heading?: number;
}

interface MapboxMapProps {
  center?: [number, number];
  zoom?: number;
  markers?: FleetMapMarker[];
  className?: string;
  isDarkMode?: boolean;
  interactive?: boolean;
}

interface MarkerEntry {
  marker: mapboxgl.Marker;
  el: HTMLDivElement;
  pos: [number, number];
  rotation: number;
  animRaf: number;
}

export function MapboxMap({
  center = [9.4797, 51.3127],
  zoom = 13,
  markers = [],
  className = '',
  isDarkMode = false,
  interactive = true,
}: MapboxMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersMapRef = useRef<Map<string, MarkerEntry>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    setLoaded(false);
    hasFittedRef.current = false;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: isDarkMode ? MAPBOX_STYLE_DARK : MAPBOX_STYLE_LIGHT,
      center,
      zoom,
      pitch: 45,
      bearing: -10,
      interactive,
      attributionControl: false,
    });

    map.current.on('load', () => setLoaded(true));

    if (interactive) {
      map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    }

    return () => {
      markersMapRef.current.forEach((entry) => {
        if (entry.animRaf) cancelAnimationFrame(entry.animRaf);
        entry.marker.remove();
      });
      markersMapRef.current.clear();
      map.current?.remove();
      map.current = null;
    };
  }, [isDarkMode]);

  const animateMarker = useCallback(
    (entry: MarkerEntry, from: [number, number], to: [number, number], targetRot: number) => {
      if (entry.animRaf) cancelAnimationFrame(entry.animRaf);
      const start = performance.now();
      const smoothRot = shortestRotation(entry.rotation, targetRot);

      const tick = (now: number) => {
        const elapsed = now - start;
        const t = easeInOutCubic(Math.min(elapsed / FLEET_TRANSITION_MS, 1));
        const pos = interpolateLngLat(from, to, t);
        entry.marker.setLngLat(pos);
        entry.pos = pos;
        const rot = entry.rotation + (smoothRot - entry.rotation) * t;
        updateSedanRotation(entry.el, rot);
        if (t < 1) {
          entry.animRaf = requestAnimationFrame(tick);
        } else {
          entry.pos = to;
          entry.rotation = smoothRot;
          entry.animRaf = 0;
        }
      };
      entry.animRaf = requestAnimationFrame(tick);
    },
    [],
  );

  useEffect(() => {
    if (!map.current || !loaded) return;

    const currentIds = new Set(markers.map((m) => m.id));
    const existingMap = markersMapRef.current;

    existingMap.forEach((entry, id) => {
      if (!currentIds.has(id)) {
        if (entry.animRaf) cancelAnimationFrame(entry.animRaf);
        entry.marker.remove();
        existingMap.delete(id);
      }
    });

    markers.forEach(({ id, lng, lat, label, status, heading }) => {
      const newPos: [number, number] = [lng, lat];
      const existing = existingMap.get(id);
      if (existing) {
        const d = distanceM(existing.pos, newPos);
        const newRot = heading ?? 0;
        if (d > 2 && d < 5000) {
          animateMarker(existing, existing.pos, newPos, newRot);
        } else {
          existing.marker.setLngLat(newPos);
          existing.pos = newPos;
          const rot = shortestRotation(existing.rotation, newRot);
          updateSedanRotation(existing.el, rot);
          existing.rotation = rot;
        }
      } else {
        const el = createFleetMarkerEl(heading ?? 0, label ?? '', status ?? 'Available', isDarkMode);
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat(newPos)
          .addTo(map.current!);
        existingMap.set(id, { marker, el, pos: newPos, rotation: heading ?? 0, animRaf: 0 });
      }
    });

    if (markers.length > 0 && !hasFittedRef.current) {
      hasFittedRef.current = true;
      const bounds = new mapboxgl.LngLatBounds();
      markers.forEach(({ lng, lat }) => bounds.extend([lng, lat]));
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 800 });
    }
  }, [markers, loaded, isDarkMode, animateMarker]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-400 text-sm ${className}`}>
        Mapbox token not configured
      </div>
    );
  }

  return <div ref={mapContainer} className={className} />;
}
