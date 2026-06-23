import 'mapbox-gl/dist/mapbox-gl.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { buildTripsMapGeoJson } from '../../../lib/geospatial';
import type { TripBehaviorEvent } from '../../../lib/api';
import type { TripMapLayerState, TripMapPopoverState, TripMapRoutePoint, TripMapTripData } from './trips-map.types';
import type { TripEnrichment } from './trips-map.types';
import {
  bearingBetween,
  createDirectionMarker,
  createEndpointMarker,
  createEventMarkerElement,
} from './trips-map.utils';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';

export interface UseTripsRouteMapOptions {
  isDarkMode: boolean;
  vehicleId?: string;
  selectedTrip: TripMapTripData | null;
  routePoints: TripMapRoutePoint[];
  enrichment?: TripEnrichment;
  behaviorEvents: TripBehaviorEvent[];
  layers: TripMapLayerState;
  onEventSelect: (state: TripMapPopoverState | null) => void;
  selectedBehaviorEventId?: string | null;
  endpointLabels?: { start?: string | null; end?: string | null };
}

export function useTripsRouteMap({
  isDarkMode,
  vehicleId,
  selectedTrip,
  routePoints,
  enrichment,
  behaviorEvents,
  layers,
  onEventSelect,
  selectedBehaviorEventId,
  endpointLabels,
}: UseTripsRouteMapOptions) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const eventMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const endpointMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const directionMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const lastRouteFitKeyRef = useRef<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(
    MAPBOX_TOKEN ? null : 'Karte aktuell nicht verfügbar',
  );

  const mapGeoJson = useCallback(() => {
    const empty = {
      lines: { type: 'FeatureCollection' as const, features: [] as GeoJSON.Feature<GeoJSON.LineString>[] },
    };
    if (!routePoints.length || !selectedTrip || !vehicleId) return empty;
    if (layers.showMatchedRoute && (enrichment?.matchedGeometry?.length ?? 0) > 1) {
      return {
        lines: {
          type: 'FeatureCollection' as const,
          features: [{
            type: 'Feature' as const,
            geometry: { type: 'LineString' as const, coordinates: enrichment!.matchedGeometry },
            properties: { tripId: selectedTrip.id, matched: true },
          }],
        },
      };
    }
    return buildTripsMapGeoJson([{ tripId: selectedTrip.id, vehicleId, points: routePoints }]);
  }, [routePoints, selectedTrip, vehicleId, enrichment, layers.showMatchedRoute]);

  const fitMapToRoute = useCallback((force = false) => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const geo = mapGeoJson();
    const fitKey = `${selectedTrip?.id ?? 'none'}:${routePoints.length}`;
    if (!force && lastRouteFitKeyRef.current === fitKey) return;
    lastRouteFitKeyRef.current = fitKey;

    const coords = (geo.lines.features[0]?.geometry as GeoJSON.LineString | undefined)?.coordinates ?? [];
    if (coords.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      coords.forEach((c) => bounds.extend(c as [number, number]));
      map.fitBounds(bounds, { padding: { top: 88, bottom: 96, left: 56, right: 56 }, maxZoom: 15 });
      return;
    }
    if (selectedTrip?.startLatitude != null && selectedTrip?.startLongitude != null) {
      map.flyTo({ center: [selectedTrip.startLongitude, selectedTrip.startLatitude], zoom: 13 });
    }
  }, [mapGeoJson, mapLoaded, routePoints.length, selectedTrip?.id, selectedTrip?.startLatitude, selectedTrip?.startLongitude]);

  const handleCenterRoute = useCallback(() => {
    lastRouteFitKeyRef.current = null;
    fitMapToRoute(true);
  }, [fitMapToRoute]);

  const focusBehaviorEvent = useCallback(
    (eventId: string) => {
      const map = mapRef.current;
      if (!map || !mapLoaded) return;
      const ev = behaviorEvents.find((e) => e.id === eventId);
      if (!ev || ev.latitude == null || ev.longitude == null) return;
      map.flyTo({
        center: [ev.longitude, ev.latitude],
        zoom: Math.max(map.getZoom(), 14),
        duration: 650,
      });
      const point = map.project([ev.longitude, ev.latitude]);
      onEventSelect({ event: ev, x: point.x, y: point.y });
    },
    [behaviorEvents, mapLoaded, onEventSelect],
  );

  // Map init
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (!MAPBOX_TOKEN) {
      setMapError('Karte aktuell nicht verfügbar');
      setMapLoaded(false);
      return;
    }
    setMapError(null);
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    eventMarkersRef.current.forEach((m) => m.remove());
    eventMarkersRef.current = [];
    endpointMarkersRef.current.forEach((m) => m.remove());
    endpointMarkersRef.current = [];
    directionMarkerRef.current?.remove();
    directionMarkerRef.current = null;
    setMapLoaded(false);

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: isDarkMode
        ? 'mapbox://styles/mapbox/dark-v11'
        : (import.meta.env.VITE_MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/light-v11'),
      center: [9.4797, 51.3127],
      zoom: 11,
      pitch: 42,
      bearing: -8,
      accessToken: MAPBOX_TOKEN,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('error', () => setMapError('Karte konnte nicht geladen werden'));
    map.on('click', () => onEventSelect(null));

    map.on('load', () => {
      map.addSource('trips-routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'trips-routes-casing',
        type: 'line',
        source: 'trips-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': isDarkMode ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.85)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 16, 11],
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: 'trips-routes-line',
        type: 'line',
        source: 'trips-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': isDarkMode ? 'rgba(148,163,184,0.75)' : 'rgba(71,85,105,0.65)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 16, 4],
          'line-opacity': 0.95,
        },
      });

      map.addSource('speed-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'speed-route-layer',
        type: 'line',
        source: 'speed-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['interpolate', ['linear'], ['get', 'speed'],
            0, '#94a3b8', 5, '#3b82f6', 30, '#22c55e', 60, '#a3e635',
            80, '#eab308', 100, '#f97316', 130, '#ef4444', 160, '#dc2626'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 16, 5.5],
          'line-opacity': 0.92,
        },
      });

      map.addSource('stop-points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'stop-points-ring',
        type: 'circle',
        source: 'stop-points',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'duration'], 10, 5, 60, 8, 300, 12],
          'circle-color': 'transparent',
          'circle-stroke-width': 2,
          'circle-stroke-color': isDarkMode ? 'rgba(148,163,184,0.75)' : 'rgba(100,116,139,0.65)',
        },
      });
      map.addLayer({
        id: 'stop-points-center',
        type: 'circle',
        source: 'stop-points',
        paint: {
          'circle-radius': 2.5,
          'circle-color': isDarkMode ? '#cbd5e1' : '#64748b',
        },
      });
      setMapLoaded(true);
    });

    mapRef.current = map;
    return () => {
      eventMarkersRef.current.forEach((m) => m.remove());
      eventMarkersRef.current = [];
      endpointMarkersRef.current.forEach((m) => m.remove());
      endpointMarkersRef.current = [];
      directionMarkerRef.current?.remove();
      directionMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [isDarkMode, onEventSelect]);

  // Resize observer
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      try { mapRef.current?.resize(); } catch { /* noop */ }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Route geometry
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const routeSrc = map.getSource('trips-routes') as mapboxgl.GeoJSONSource | undefined;
    const speedSrc = map.getSource('speed-route') as mapboxgl.GeoJSONSource | undefined;
    const stopsSrc = map.getSource('stop-points') as mapboxgl.GeoJSONSource | undefined;
    if (!routeSrc) return;

    const geo = mapGeoJson();
    const hasLines = geo.lines.features.length > 0;

    if (hasLines) {
      routeSrc.setData(geo.lines);
      if (speedSrc && routePoints.length >= 2) {
        const speedFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
        for (let i = 0; i < routePoints.length - 1; i++) {
          const a = routePoints[i];
          const b = routePoints[i + 1];
          if (a.latitude && a.longitude && b.latitude && b.longitude) {
            speedFeatures.push({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: [[a.longitude, a.latitude], [b.longitude, b.latitude]] },
              properties: { speed: a.speedKmh ?? 0 },
            });
          }
        }
        speedSrc.setData({ type: 'FeatureCollection', features: speedFeatures });
      }
      if (stopsSrc && routePoints.length >= 2) {
        const stopFeatures: GeoJSON.Feature<GeoJSON.Point>[] = [];
        let stopStart = -1;
        for (let i = 0; i < routePoints.length; i++) {
          const isLowSpeed = (routePoints[i].speedKmh ?? 0) < 3;
          if (isLowSpeed && stopStart < 0) stopStart = i;
          if ((!isLowSpeed || i === routePoints.length - 1) && stopStart >= 0) {
            const stopEnd = isLowSpeed ? i : i - 1;
            if (stopEnd - stopStart + 1 >= 3) {
              const mid = Math.floor((stopStart + stopEnd) / 2);
              const p = routePoints[mid];
              const startT = new Date(routePoints[stopStart].timestamp).getTime();
              const endT = new Date(routePoints[stopEnd].timestamp).getTime();
              if (p.latitude && p.longitude) {
                stopFeatures.push({
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
                  properties: { duration: Math.max(1, Math.round((endT - startT) / 1000)) },
                });
              }
            }
            stopStart = -1;
          }
        }
        stopsSrc.setData({ type: 'FeatureCollection', features: stopFeatures });
      }
    } else {
      routeSrc.setData({ type: 'FeatureCollection', features: [] });
      speedSrc?.setData({ type: 'FeatureCollection', features: [] });
      stopsSrc?.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [mapGeoJson, routePoints, mapLoaded, selectedTrip?.id]);

  useEffect(() => {
    fitMapToRoute(false);
  }, [fitMapToRoute]);

  // Layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const setVis = (id: string, visible: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    };
    const speedOn = layers.showSpeed;
    setVis('speed-route-layer', speedOn);
    setVis('trips-routes-line', !speedOn);
    setVis('trips-routes-casing', true);
    setVis('stop-points-ring', layers.showStops);
    setVis('stop-points-center', layers.showStops);
  }, [layers.showSpeed, layers.showStops, mapLoaded]);

  // Endpoint + direction markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    endpointMarkersRef.current.forEach((m) => m.remove());
    endpointMarkersRef.current = [];
    directionMarkerRef.current?.remove();
    directionMarkerRef.current = null;

    if (!selectedTrip || routePoints.length === 0) return;

    const start = routePoints[0];
    const end = routePoints[routePoints.length - 1];
    const startLng = start?.longitude ?? selectedTrip.startLongitude;
    const startLat = start?.latitude ?? selectedTrip.startLatitude;
    const endLng = end?.longitude ?? selectedTrip.endLongitude;
    const endLat = end?.latitude ?? selectedTrip.endLatitude;

    if (startLng != null && startLat != null) {
      const startSub = endpointLabels?.start?.trim() || 'Startpunkt';
      const marker = new mapboxgl.Marker({ element: createEndpointMarker('A', '#10b981'), anchor: 'center' })
        .setLngLat([startLng, startLat])
        .setPopup(
          new mapboxgl.Popup({ closeButton: false, offset: 12, className: 'trips-map-endpoint-popup' })
            .setHTML(`<div class="trips-map-endpoint-popup__title">${startSub}</div><div class="trips-map-endpoint-popup__time">${new Date(start?.timestamp ?? selectedTrip.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>`),
        )
        .addTo(map);
      endpointMarkersRef.current.push(marker);
    }

    if (endLng != null && endLat != null && (endLng !== startLng || endLat !== startLat)) {
      const endSub = endpointLabels?.end?.trim() || 'Endpunkt';
      const marker = new mapboxgl.Marker({ element: createEndpointMarker('B', '#ef4444'), anchor: 'center' })
        .setLngLat([endLng, endLat])
        .setPopup(
          new mapboxgl.Popup({ closeButton: false, offset: 12, className: 'trips-map-endpoint-popup' })
            .setHTML(`<div class="trips-map-endpoint-popup__title">${endSub}</div><div class="trips-map-endpoint-popup__time">${new Date(end?.timestamp ?? selectedTrip.endTime ?? selectedTrip.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>`),
        )
        .addTo(map);
      endpointMarkersRef.current.push(marker);
    }

    if (startLng != null && startLat != null && endLng != null && endLat != null) {
      const idx = Math.max(1, Math.floor(routePoints.length * 0.35));
      const p = routePoints[Math.min(idx, routePoints.length - 1)];
      if (p.latitude && p.longitude) {
        const bearing = bearingBetween(startLat, startLng, endLat, endLng);
        directionMarkerRef.current = new mapboxgl.Marker({
          element: createDirectionMarker(bearing),
          anchor: 'center',
        })
          .setLngLat([p.longitude, p.latitude])
          .addTo(map);
      }
    }
  }, [selectedTrip?.id, routePoints, mapLoaded, endpointLabels?.start, endpointLabels?.end]);

  // Event markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !selectedTrip) return;

    eventMarkersRef.current.forEach((m) => m.remove());
    eventMarkersRef.current = [];

    behaviorEvents.forEach((ev) => {
      if (ev.latitude == null || ev.longitude == null) return;
      const isAbuse = ev.eventCategory === 'ABUSE';
      if (isAbuse && !layers.showAbuseEvents) return;
      if (!isAbuse && !layers.showDrivingEvents) return;

      const openPopover = () => {
        const point = map.project([ev.longitude!, ev.latitude!]);
        onEventSelect({ event: ev, x: point.x, y: point.y });
      };

      const el = createEventMarkerElement(
        ev,
        isDarkMode,
        openPopover,
        selectedBehaviorEventId === ev.id,
      );
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([ev.longitude, ev.latitude])
        .addTo(map);
      eventMarkersRef.current.push(marker);
    });
  }, [behaviorEvents, selectedTrip?.id, layers.showDrivingEvents, layers.showAbuseEvents, mapLoaded, isDarkMode, onEventSelect, selectedBehaviorEventId]);

  return {
    mapContainerRef,
    mapRef,
    mapLoaded,
    mapError,
    handleCenterRoute,
    focusBehaviorEvent,
    hasMapboxToken: Boolean(MAPBOX_TOKEN),
  };
}
