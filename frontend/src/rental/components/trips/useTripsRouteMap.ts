import 'mapbox-gl/dist/mapbox-gl.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { TripBehaviorEvent } from '../../../lib/api';
import type { TripM7aMapPayload, TripM7aMapPoint } from './m7a-map.types';
import {
  buildM7aPointFeatures,
  findM7aPointForBucketLabel,
  groupM7aPointsByCoordinate,
  isM7aMapActive,
  resolveM7aMotionBinding,
} from './m7a-map.utils';
import type {
  TripMotionMapEvent,
  TripMotionMapPayload,
  TripMotionMapPopoverState,
  TripMotionMapSample,
  TripMotionMapStop,
} from './motion-map.types';
import {
  buildMotionEventSegmentFeatures,
  buildMotionSpeedLineFeatures,
  createMotionEventMarkerElement,
  groupMotionEventsByCoordinate,
  groupMotionStopsByCoordinate,
  isMotionRouteHitAtPoint,
  motionCoordKey,
  pickMotionSampleAtPoint,
  resolveMotionEventSegment,
  type MotionEventSegment,
  type MotionRoutePickMap,
} from './motion-map.utils';
import type { TripMapLayerState, TripMapPopoverState, TripMapRoutePoint, TripMapTripData } from './trips-map.types';
import {
  bearingBetween,
  buildMeasuredSpeedLineFeatures,
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
  routeSegments: [number, number][][];
  hasUnknownGaps: boolean;
  behaviorEvents: TripBehaviorEvent[];
  layers: TripMapLayerState;
  onEventSelect: (state: TripMapPopoverState | null) => void;
  selectedBehaviorEventId?: string | null;
  endpointLabels?: { start?: string | null; end?: string | null };
  motionMapActive?: boolean;
  motionSamples?: TripMotionMapSample[];
  motionEvents?: TripMotionMapEvent[];
  motionStops?: TripMotionMapStop[];
  onMotionPopover?: (state: TripMotionMapPopoverState | null) => void;
  selectedMotionEventId?: string | null;
  motionEventAriaLabel?: (event: TripMotionMapEvent) => string;
  /** Called when the highlighted segment for the selected motion event was resolved. */
  onMotionEventSegmentResolved?: (eventId: string, segment: MotionEventSegment) => void;
  m7aMapPayload?: TripM7aMapPayload | null;
  motionMapPayload?: TripMotionMapPayload | null;
  m7aBindingNote?: string | null;
}

function buildSegmentLineFeatures(
  segments: [number, number][][],
  tripId: string,
): GeoJSON.Feature<GeoJSON.LineString>[] {
  return segments
    .filter((segment) => segment.length >= 2)
    .map((segment, index) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: segment },
      properties: { tripId, segmentIndex: index },
    }));
}

export function useTripsRouteMap({
  isDarkMode,
  vehicleId,
  selectedTrip,
  routePoints,
  routeSegments,
  hasUnknownGaps,
  behaviorEvents,
  layers,
  onEventSelect,
  selectedBehaviorEventId,
  endpointLabels,
  motionMapActive = false,
  motionSamples = [],
  motionEvents = [],
  motionStops = [],
  onMotionPopover,
  selectedMotionEventId,
  motionEventAriaLabel,
  onMotionEventSegmentResolved,
  m7aMapPayload = null,
  motionMapPayload = null,
  m7aBindingNote = null,
}: UseTripsRouteMapOptions) {
  const m7aMapActive = isM7aMapActive(m7aMapPayload);
  const m7aPoints = m7aMapActive ? m7aMapPayload!.mapPoints.filter((p) => p.positionResolved) : [];
  const m7aBinding = resolveM7aMotionBinding(motionMapPayload, m7aMapPayload);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const eventMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const endpointMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const directionMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const motionMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const lastRouteFitKeyRef = useRef<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(
    MAPBOX_TOKEN ? null : 'Karte aktuell nicht verfügbar',
  );

  const mapGeoJson = useCallback(() => {
    const empty = {
      lines: { type: 'FeatureCollection' as const, features: [] as GeoJSON.Feature<GeoJSON.LineString>[] },
    };
    if (!selectedTrip || !vehicleId) return empty;
    if (routeSegments.length > 0) {
      return {
        lines: {
          type: 'FeatureCollection' as const,
          features: buildSegmentLineFeatures(routeSegments, selectedTrip.id),
        },
      };
    }
    if (routePoints.length >= 2) {
      return {
        lines: {
          type: 'FeatureCollection' as const,
          features: [{
            type: 'Feature' as const,
            geometry: {
              type: 'LineString' as const,
              coordinates: routePoints.map((point) => [point.longitude, point.latitude]),
            },
            properties: { tripId: selectedTrip.id, segmentIndex: 0 },
          }],
        },
      };
    }
    return empty;
  }, [routePoints, routeSegments, selectedTrip, vehicleId]);

  const fitMapToRoute = useCallback((force = false) => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const geo = mapGeoJson();
    const fitKey = `${selectedTrip?.id ?? 'none'}:${routeSegments.length}:${routePoints.length}`;
    if (!force && lastRouteFitKeyRef.current === fitKey) return;
    lastRouteFitKeyRef.current = fitKey;

    const allCoords = geo.lines.features.flatMap(
      (feature) => (feature.geometry as GeoJSON.LineString).coordinates,
    );
    if (allCoords.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      allCoords.forEach((c) => bounds.extend(c as [number, number]));
      map.fitBounds(bounds, { padding: { top: 88, bottom: 96, left: 56, right: 56 }, maxZoom: 15 });
      return;
    }
    if (selectedTrip?.startLatitude != null && selectedTrip?.startLongitude != null) {
      map.flyTo({ center: [selectedTrip.startLongitude, selectedTrip.startLatitude], zoom: 13 });
    }
  }, [mapGeoJson, mapLoaded, routePoints.length, routeSegments.length, selectedTrip?.id, selectedTrip?.startLatitude, selectedTrip?.startLongitude]);

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
      map.addSource('motion-scrub-point', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'motion-scrub-point-layer',
        type: 'circle',
        source: 'motion-scrub-point',
        paint: {
          'circle-radius': 6,
          'circle-color': '#38bdf8',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.addSource('motion-event-segment', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'motion-event-segment-casing',
        type: 'line',
        source: 'motion-event-segment',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': isDarkMode ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.95)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 9, 16, 14],
          'line-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'motion-event-segment-line',
        type: 'line',
        source: 'motion-event-segment',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'displayKind'],
            'DECELERATION',
            isDarkMode ? '#fb7185' : '#e11d48',
            isDarkMode ? '#34d399' : '#059669',
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 8],
          'line-opacity': 1,
        },
      });
      map.addSource('motion-event-endpoints', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'motion-event-endpoints-layer',
        type: 'circle',
        source: 'motion-event-endpoints',
        paint: {
          'circle-radius': ['match', ['get', 'role'], 'start', 5, 6.5],
          'circle-color': ['match', ['get', 'role'], 'start', '#ffffff', isDarkMode ? '#0f172a' : '#1e293b'],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': ['match', ['get', 'role'], 'start', isDarkMode ? '#0f172a' : '#1e293b', '#ffffff'],
        },
      });
      map.addSource('m7a-assignment-points', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'm7a-assignment-points-layer',
        type: 'circle',
        source: 'm7a-assignment-points',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 7],
          'circle-color': [
            'match',
            ['get', 'outcome'],
            'CONFIRMED',
            isDarkMode ? '#34d399' : '#059669',
            'AMBIGUOUS',
            isDarkMode ? '#fbbf24' : '#d97706',
            isDarkMode ? '#94a3b8' : '#64748b',
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': isDarkMode ? '#0f172a' : '#ffffff',
          'circle-opacity': 0.92,
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
      if (speedSrc) {
        if (motionMapActive && motionSamples.length > 0) {
          speedSrc.setData({
            type: 'FeatureCollection',
            features: buildMotionSpeedLineFeatures(motionSamples),
          });
        } else if (routePoints.length >= 2) {
          speedSrc.setData({
            type: 'FeatureCollection',
            features: buildMeasuredSpeedLineFeatures(routePoints, hasUnknownGaps),
          });
        } else {
          speedSrc.setData({ type: 'FeatureCollection', features: [] });
        }
      }
      if (stopsSrc) {
        if (motionMapActive) {
          const stopFeatures: GeoJSON.Feature<GeoJSON.Point>[] = motionStops
            .filter((s) => s.positionResolved && s.latitude != null && s.longitude != null)
            .map((s) => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [s.longitude!, s.latitude!] },
              properties: {
                duration: s.minDurationS,
                stopId: s.id,
                observed: s.observed ? 1 : 0,
                inferred: s.inferred ? 1 : 0,
              },
            }));
          stopsSrc.setData({ type: 'FeatureCollection', features: stopFeatures });
        } else if (routePoints.length >= 2) {
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
        } else {
          stopsSrc.setData({ type: 'FeatureCollection', features: [] });
        }
      }
    } else {
      routeSrc.setData({ type: 'FeatureCollection', features: [] });
      speedSrc?.setData({ type: 'FeatureCollection', features: [] });
      stopsSrc?.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [
    mapGeoJson,
    routePoints,
    hasUnknownGaps,
    mapLoaded,
    selectedTrip?.id,
    motionMapActive,
    motionSamples,
    motionStops,
  ]);

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
    setVis('m7a-assignment-points-layer', layers.showM7aRoadAssignment && m7aMapActive);
    setVis('motion-event-segment-casing', layers.showDrivingEvents);
    setVis('motion-event-segment-line', layers.showDrivingEvents);
    setVis('motion-event-endpoints-layer', layers.showDrivingEvents);
  }, [
    layers.showSpeed,
    layers.showStops,
    layers.showM7aRoadAssignment,
    layers.showDrivingEvents,
    mapLoaded,
    m7aMapActive,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const src = map.getSource('m7a-assignment-points') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    if (!layers.showM7aRoadAssignment || !m7aMapActive) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    src.setData({ type: 'FeatureCollection', features: buildM7aPointFeatures(m7aPoints) });
  }, [mapLoaded, layers.showM7aRoadAssignment, m7aMapActive, m7aPoints, selectedTrip?.id]);

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
      if (!isAbuse && layers.showDrivingEvents && motionMapActive) return;
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
  }, [
    behaviorEvents,
    selectedTrip?.id,
    layers.showDrivingEvents,
    layers.showAbuseEvents,
    mapLoaded,
    isDarkMode,
    onEventSelect,
    selectedBehaviorEventId,
    motionMapActive,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !selectedTrip || !motionMapActive) return;
    motionMarkersRef.current.forEach((m) => m.remove());
    motionMarkersRef.current = [];

    if (!layers.showDrivingEvents) return;
    const grouped = groupMotionEventsByCoordinate(motionEvents);
    grouped.forEach((eventsAtPoint) => {
      const ev = eventsAtPoint[0];
      if (!ev || ev.latitude == null || ev.longitude == null) return;
      const open = () => {
        const point = map.project([ev.longitude!, ev.latitude!]);
        if (eventsAtPoint.length > 1) {
          onMotionPopover?.({
            kind: 'pickList',
            items: eventsAtPoint.map((item) => ({ type: 'event', event: item })),
            x: point.x,
            y: point.y,
          });
        } else {
          onMotionPopover?.({ kind: 'event', event: ev, x: point.x, y: point.y });
        }
      };
      const el = createMotionEventMarkerElement(
        ev,
        isDarkMode,
        open,
        eventsAtPoint.some((item) => selectedMotionEventId === item.id),
        motionEventAriaLabel?.(ev),
      );
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([ev.longitude!, ev.latitude!])
        .addTo(map);
      motionMarkersRef.current.push(marker);
    });
  }, [
    motionEvents,
    motionMapActive,
    layers.showDrivingEvents,
    mapLoaded,
    selectedTrip?.id,
    isDarkMode,
    onMotionPopover,
    selectedMotionEventId,
    motionEventAriaLabel,
  ]);

  // Selected motion event → highlight the route segment covered by its time window
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const segSrc = map.getSource('motion-event-segment') as mapboxgl.GeoJSONSource | undefined;
    const endSrc = map.getSource('motion-event-endpoints') as mapboxgl.GeoJSONSource | undefined;
    if (!segSrc || !endSrc) return;
    const clear = () => {
      segSrc.setData({ type: 'FeatureCollection', features: [] });
      endSrc.setData({ type: 'FeatureCollection', features: [] });
    };
    if (!motionMapActive || !layers.showDrivingEvents || !selectedMotionEventId) {
      clear();
      return;
    }
    const ev = motionEvents.find((e) => e.id === selectedMotionEventId);
    if (!ev) {
      clear();
      return;
    }
    const segment = resolveMotionEventSegment(ev, motionSamples);
    const { line, endpoints } = buildMotionEventSegmentFeatures(segment, ev);
    segSrc.setData({ type: 'FeatureCollection', features: line });
    endSrc.setData({ type: 'FeatureCollection', features: endpoints });
    onMotionEventSegmentResolved?.(ev.id, segment);
  }, [
    mapLoaded,
    motionMapActive,
    layers.showDrivingEvents,
    selectedMotionEventId,
    motionEvents,
    motionSamples,
    onMotionEventSegmentResolved,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !motionMapActive || !layers.showSpeed) return;

    const showSampleAt = (sample: TripMotionMapSample, x: number, y: number) => {
      const scrubSrc = map.getSource('motion-scrub-point') as mapboxgl.GeoJSONSource | undefined;
      if (scrubSrc && sample.latitude != null && sample.longitude != null) {
        scrubSrc.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [sample.longitude, sample.latitude] },
            properties: {},
          }],
        });
      }
      const m7aPoint =
        layers.showM7aRoadAssignment && m7aMapActive
          ? findM7aPointForBucketLabel(m7aMapPayload, sample.bucketLabelUtc, m7aBinding)
          : null;
      const bindingNote =
        layers.showM7aRoadAssignment && m7aMapActive && !m7aBinding.compatible
          ? m7aBindingNote
          : null;
      onMotionPopover?.({ kind: 'sample', sample, m7aPoint, m7aBindingNote: bindingNote, x, y });
    };

    const pickFromPoint = (point: mapboxgl.Point) => {
      const sample = pickMotionSampleAtPoint(
        map as unknown as MotionRoutePickMap,
        motionSamples,
        { x: point.x, y: point.y },
      );
      if (sample) showSampleAt(sample, point.x, point.y);
    };

    let scrubActive = false;
    const endScrub = () => {
      if (!scrubActive) return;
      scrubActive = false;
      try {
        map.dragPan.enable();
      } catch {
        /* noop */
      }
    };

    const onMove = (e: mapboxgl.MapMouseEvent) => {
      if (e.originalEvent instanceof MouseEvent && e.originalEvent.buttons !== 0) return;
      if (e.originalEvent instanceof MouseEvent) pickFromPoint(e.point);
    };
    const onTouchStart = (e: mapboxgl.MapTouchEvent) => {
      if (e.points.length !== 1) return;
      if (isMotionRouteHitAtPoint(
        map as unknown as MotionRoutePickMap,
        motionSamples,
        { x: e.point.x, y: e.point.y },
      )) {
        scrubActive = true;
        try {
          map.dragPan.disable();
        } catch {
          /* noop */
        }
        pickFromPoint(e.point);
      }
    };
    const onTouchMove = (e: mapboxgl.MapTouchEvent) => {
      if (!scrubActive || e.points.length !== 1) return;
      if (e.originalEvent.cancelable) e.originalEvent.preventDefault();
      pickFromPoint(e.point);
    };
    const onTouchEnd = () => endScrub();
    const onTouchCancel = () => endScrub();

    const stopsByCoord = groupMotionStopsByCoordinate(motionStops);
    const onStopClick = (e: mapboxgl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['stop-points-ring', 'stop-points-center'] });
      const stopId = features[0]?.properties?.stopId as string | undefined;
      if (!stopId) return;
      const stop = motionStops.find((s) => s.id === stopId);
      if (!stop || stop.latitude == null || stop.longitude == null) return;
      const key = motionCoordKey(stop.latitude, stop.longitude);
      const atPoint = stopsByCoord.get(key) ?? [stop];
      if (atPoint.length > 1) {
        onMotionPopover?.({
          kind: 'pickList',
          items: atPoint.map((item) => ({ type: 'stop', stop: item })),
          x: e.point.x,
          y: e.point.y,
        });
      } else {
        onMotionPopover?.({ kind: 'stop', stop, x: e.point.x, y: e.point.y });
      }
    };

    map.on('mousemove', onMove);
    map.on('touchstart', onTouchStart);
    map.on('touchmove', onTouchMove);
    map.on('touchend', onTouchEnd);
    map.on('touchcancel', onTouchCancel);
    map.on('click', onStopClick);
    return () => {
      map.off('mousemove', onMove);
      map.off('touchstart', onTouchStart);
      map.off('touchmove', onTouchMove);
      map.off('touchend', onTouchEnd);
      map.off('touchcancel', onTouchCancel);
      map.off('click', onStopClick);
      endScrub();
      const scrubSrc = map.getSource('motion-scrub-point') as mapboxgl.GeoJSONSource | undefined;
      scrubSrc?.setData({ type: 'FeatureCollection', features: [] });
    };
  }, [
    mapLoaded,
    motionMapActive,
    layers.showSpeed,
    layers.showM7aRoadAssignment,
    motionSamples,
    motionStops,
    onMotionPopover,
    m7aMapActive,
    m7aMapPayload,
    m7aBinding,
    m7aBindingNote,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !m7aMapActive || !layers.showM7aRoadAssignment) return;

    const grouped = groupM7aPointsByCoordinate(m7aPoints);
    const onM7aClick = (e: mapboxgl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['m7a-assignment-points-layer'] });
      const label = features[0]?.properties?.bucketLabelUtc as string | undefined;
      if (!label) return;
      const point = m7aPoints.find((p) => p.bucketLabelUtc === label);
      if (!point || point.latitude == null || point.longitude == null) return;
      const key = `${Math.round(point.latitude * 1e5)}:${Math.round(point.longitude * 1e5)}`;
      const atPoint = grouped.get(key) ?? [point];
      if (atPoint.length > 1) {
        onMotionPopover?.({ kind: 'm7aPickList', points: atPoint, x: e.point.x, y: e.point.y });
      } else {
        onMotionPopover?.({ kind: 'm7aPoint', point, x: e.point.x, y: e.point.y });
      }
    };

    map.on('click', onM7aClick);
    return () => {
      map.off('click', onM7aClick);
    };
  }, [mapLoaded, m7aMapActive, layers.showM7aRoadAssignment, m7aPoints, onMotionPopover]);

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
