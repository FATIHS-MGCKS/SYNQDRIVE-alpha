import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Navigation, AlertTriangle, Award, User, Clock, Gauge, MapPin, RefreshCw,
  Zap, ChevronDown, ChevronUp, Thermometer, Activity, Wind, Fuel, TrendingUp,
  AlertCircle, Shield, Loader2, BarChart3, Route, Play, CheckCircle2, ArrowUp, ArrowDown,
} from 'lucide-react';
import { api } from '../../lib/api';
import type { TripEnrichment, TripBehaviorEvent, SpeedingSection } from '../../lib/api';
import { buildTripsMapGeoJson } from '../../lib/geospatial';
import { useAddress } from '../../lib/useAddress';
import mapboxgl from 'mapbox-gl';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';

type BehaviorEnrichmentStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'SKIPPED_NO_HF_DATA'
  | 'FAILED_TRANSIENT'
  | 'FAILED_PERMANENT'
  | null;

interface TripData {
  id: string;
  vehicleId: string;
  dimoSegmentId?: string;
  tripStatus: 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  startTime: string;
  endTime?: string;
  startLatitude?: number;
  startLongitude?: number;
  endLatitude?: number;
  endLongitude?: number;
  distanceKm?: number;
  durationMinutes?: number;
  avgSpeedKmh?: number;
  maxSpeedKmh?: number;
  drivingScore?: number;
  drivingStyleScore?: number;
  safetyScore?: number;
  scoreSource?: 'trip_driving_impact' | 'vehicle_trip_compat' | 'derived';
  fuelUsedLiters?: number;
  avgConsumptionLPer100Km?: number;
  fuelConfidence?: string;
  energyUsedKwh?: number;
  avgConsumptionKwhPer100Km?: number;
  energyConfidence?: string;
  citySharePercent?: number;
  highwaySharePercent?: number;
  countrySharePercent?: number;
  outsideTemperatureStartC?: number;
  engineTempStartC?: number;
  engineTempEndC?: number;
  avgRpm?: number;
  avgThrottlePosition?: number;
  avgEngineLoad?: number;
  speedingPercent?: number;
  maxOverSpeedKmh?: number;
  speedingSegments?: number;
  speedingSectionsJson?: SpeedingSection[];
  speedingSectionCount?: number;
  speedingDistanceM?: number;
  speedingDurationS?: number;
  speedingExposurePct?: number;
  avgOverSpeedKmh?: number;
  harshBrakeCount?: number;
  harshAccelCount?: number;
  harshCornerCount?: number;
  totalAccelerationEvents?: number;
  hardAccelerationEvents?: number;
  totalBrakingEvents?: number;
  hardBrakingEvents?: number;
  fullBrakingEvents?: number;
  corneringEvents?: number;
  abuseEvents?: number;
  speedingEvents?: number;
  accelerationEventCount?: number;
  brakingEventCount?: number;
  abuseEventCount?: number;
  hardAccelerationCount?: number;
  hardBrakingCount?: number;
  fullBrakingCount?: number;
  possibleImpactCount?: number;
  kickdownCount?: number;
  coldEngineAbuseCount?: number;
  longIdleCount?: number;
  abuseScore?: number;
  behaviorEnrichedAt?: string;
  /**
   * @deprecated Internal pipeline status — do NOT use for UI decisions.
   * Use `behaviorReady` instead.
   */
  behaviorEnrichmentStatus?: BehaviorEnrichmentStatus;
  behaviorEnrichmentAttempts?: number;
  drivingImpactComputedAt?: string;
  gapEnded?: boolean;
  enrichedAt?: string;
  driverName?: string;
  assignmentStatus?: 'ASSIGNED_DRIVER' | 'ASSIGNED_USER' | 'ASSIGNED_BOOKING_CUSTOMER' | 'PRIVATE_UNASSIGNED' | 'UNKNOWN_ASSIGNMENT' | null;
  assignmentSubjectType?: 'DRIVER' | 'USER' | 'BOOKING_CUSTOMER' | null;
  assignmentSubjectId?: string | null;
  isPrivateTrip?: boolean;
  scoreEligible?: boolean;
  events?: any[];
  /** True when behavior analysis is complete and counts/events can be displayed. */
  behaviorReady?: boolean;
  /** True when trip data is incomplete (no end time, low data quality, anomaly). */
  detailsLimited?: boolean;
}

interface RoutePoint {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  timestamp: string;
}

interface TripsViewProps {
  isDarkMode: boolean;
  vehicleId?: string;
  selectedDate?: string;
  selectedDriver?: string;
  fuelType?: string;
  onTripsLoaded?: (trips: TripData[]) => void;
}

/** Resolve speeding sections from enrichment or DB trip data */
function getSpeedingSections(trip: TripData, enr?: TripEnrichment | null): SpeedingSection[] {
  if (enr?.speedingSections?.length) return enr.speedingSections;
  if (trip.speedingSectionsJson?.length) return trip.speedingSectionsJson;
  return [];
}

function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return '--';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDistance(km: number | null | undefined): string {
  if (km == null) return '--';
  return `${km.toFixed(1)} km`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function TripsView({ isDarkMode, vehicleId, selectedDate, selectedDriver, fuelType, onTripsLoaded }: TripsViewProps) {
  const isEv = fuelType === 'Electric' || fuelType === 'PHEV';
  const [trips, setTrips] = useState<TripData[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<TripData | null>(null);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [enrichments, setEnrichments] = useState<Record<string, TripEnrichment>>({});
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [behaviorEvents, setBehaviorEvents] = useState<Record<string, TripBehaviorEvent[]>>({});
  const [behaviorLoading, setBehaviorLoading] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [mapShowSpeed, setMapShowSpeed] = useState(true);
  const [mapShowSpeeding, setMapShowSpeeding] = useState(true);
  const [mapShowDrivingEvents, setMapShowDrivingEvents] = useState(true);
  const [mapShowAbuseEvents, setMapShowAbuseEvents] = useState(true);
  const [mapShowStops, setMapShowStops] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const eventMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const onTripsLoadedRef = useRef(onTripsLoaded);
  onTripsLoadedRef.current = onTripsLoaded;
  // Track which trip IDs have had auto behavior enrichment triggered this session
  // to avoid infinite loops when status returns PENDING/IN_PROGRESS
  const autoEnrichTriggeredRef = useRef<Set<string>>(new Set());

  const isDark = isDarkMode;

  const loadTrips = useCallback(async () => {
    if (!vehicleId) { setTrips([]); onTripsLoadedRef.current?.([]); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const from = selectedDate ? `${selectedDate}T00:00:00.000Z` : undefined;
      const to = selectedDate ? `${selectedDate}T23:59:59.999Z` : undefined;
      const driver = selectedDriver && selectedDriver !== 'all' ? selectedDriver : undefined;
      const data = await api.vehicleIntelligence.trips(vehicleId, { from, to, driver });
      const list = data ?? [];
      setTrips(list);
      onTripsLoadedRef.current?.(list);
    } catch {
      setTrips([]); setLoadError('Failed to load trips'); onTripsLoadedRef.current?.([]);
    }
    setLoading(false);
  }, [vehicleId, selectedDate, selectedDriver]);

  useEffect(() => { loadTrips(); }, [loadTrips]);

  const mapGeoJson = useMemo(() => {
    const empty = { heatmap: { type: 'FeatureCollection' as const, features: [] as GeoJSON.Feature<GeoJSON.Point>[] }, lines: { type: 'FeatureCollection' as const, features: [] as GeoJSON.Feature<GeoJSON.LineString>[] } };
    if (!routePoints.length || !selectedTrip || !vehicleId) return empty;
    const enrichment = enrichments[selectedTrip.id];
    if (enrichment?.matchedGeometry?.length > 1) {
      const coords = enrichment.matchedGeometry;
      return {
        ...empty,
        lines: { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: coords }, properties: { tripId: selectedTrip.id } }] },
      };
    }
    return buildTripsMapGeoJson([{ tripId: selectedTrip.id, vehicleId, points: routePoints }]);
  }, [routePoints, selectedTrip?.id, vehicleId, enrichments]);

  const handleSync = async () => {
    if (!vehicleId || syncing) return;
    setSyncing(true); setSyncMessage(null);
    try {
      const res = await api.vehicleIntelligence.reconcileTrips(vehicleId);
      setSyncMessage(res?.message ?? (res?.applied === 0 ? 'No missing trips found' : `${res?.applied} trip(s) repaired`));
      await loadTrips();
    } catch { setSyncMessage('Check failed'); }
    setSyncing(false);
  };

  const handleSelectTrip = async (trip: TripData) => {
    if (selectedTrip?.id === trip.id) {
      setSelectedTrip(null);
      setRoutePoints([]);
      setRouteLoading(false);
      setExpandedSection(null);
      return;
    }
    setSelectedTrip(trip);
    setRoutePoints([]);
    setRouteLoading(true);
    setExpandedSection(null);
    if (!vehicleId) { setRouteLoading(false); return; }
    try {
      const route = await api.vehicleIntelligence.tripRoute(vehicleId, trip.id);
      setRoutePoints(route ?? []);
    } catch { /* fallback to empty */ }
    setRouteLoading(false);

    if (!behaviorEvents[trip.id]) {
      setBehaviorLoading(trip.id);
      try {
        const res = await api.vehicleIntelligence.tripBehaviorEvents(vehicleId, trip.id);
        // Only store events when enrichment is complete (prevents false-zero display)
        if (res?.status === 'ready') {
          setBehaviorEvents((prev) => ({ ...prev, [trip.id]: res.events ?? [] }));
        } else {
          // Mark as pending so UI can show "analyzing" instead of empty
          setBehaviorEvents((prev) => ({ ...prev, [trip.id]: [] }));
        }
      } catch { /* silent */ }
      setBehaviorLoading(null);
    }
  };

  const handleEnrichTrip = async (trip: TripData) => {
    if (!vehicleId || enrichingId) return;
    setEnrichingId(trip.id);
    try {
      const result = await api.vehicleIntelligence.enrichTrip(vehicleId, trip.id);
      if (result) { setEnrichments((prev) => ({ ...prev, [trip.id]: result })); loadTrips(); }
    } catch { /* silent */ }
    setEnrichingId(null);
  };

  // ── Map init ──
  useEffect(() => {
    if (!mapContainerRef.current || !MAPBOX_TOKEN) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    eventMarkersRef.current.forEach((m) => m.remove());
    eventMarkersRef.current = [];
    setMapLoaded(false);
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: isDarkMode ? 'mapbox://styles/mapbox/dark-v11' : (import.meta.env.VITE_MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/light-v11'),
      center: [9.4797, 51.3127], zoom: 11, pitch: 45, bearing: -10, accessToken: MAPBOX_TOKEN,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.on('load', () => {
      // Base route line (always visible as a subtle track)
      map.addSource('trips-routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'trips-routes-casing', type: 'line', source: 'trips-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': isDarkMode ? 'rgba(100,116,139,0.25)' : 'rgba(148,163,184,0.3)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 16, 10],
          'line-opacity': 1,
        },
      });
      map.addLayer({
        id: 'trips-routes-line', type: 'line', source: 'trips-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': isDarkMode ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.5)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 16, 3.5],
          'line-opacity': 1,
        },
      });

      // Speed-colored route segments
      map.addSource('speed-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'speed-route-layer', type: 'line', source: 'speed-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['interpolate', ['linear'], ['get', 'speed'],
            0, '#94a3b8',
            5, '#3b82f6',
            30, '#22c55e',
            60, '#a3e635',
            80, '#eab308',
            100, '#f97316',
            130, '#ef4444',
            160, '#dc2626'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 5],
          'line-opacity': 0.95,
        },
      });

      // Speeding sections (overlaid on top of speed route)
      map.addSource('speeding-sections', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'speeding-sections-glow', type: 'line', source: 'speeding-sections',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['match', ['get', 'severity'], 'severe', '#dc2626', 'high', '#ef4444', 'moderate', '#f97316', '#eab308'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 8, 16, 12],
          'line-opacity': 0.3, 'line-blur': 3,
        },
      });
      map.addLayer({
        id: 'speeding-sections-line', type: 'line', source: 'speeding-sections',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['match', ['get', 'severity'], 'severe', '#dc2626', 'high', '#ef4444', 'moderate', '#f97316', '#eab308'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 7],
          'line-opacity': 0.9,
          'line-dasharray': [2, 1],
        },
      });

      // Stop circles
      map.addSource('stop-points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'stop-points-ring', type: 'circle', source: 'stop-points',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'duration'], 10, 5, 60, 8, 300, 12],
          'circle-color': 'transparent',
          'circle-stroke-width': 2,
          'circle-stroke-color': isDarkMode ? 'rgba(148,163,184,0.7)' : 'rgba(100,116,139,0.6)',
          'circle-stroke-opacity': 0.9,
        },
      });
      map.addLayer({
        id: 'stop-points-center', type: 'circle', source: 'stop-points',
        paint: {
          'circle-radius': 2.5,
          'circle-color': isDarkMode ? '#cbd5e1' : '#64748b',
          'circle-opacity': 0.8,
        },
      });
      setMapLoaded(true);
    });
    mapRef.current = map;
    return () => {
      eventMarkersRef.current.forEach((m) => m.remove());
      eventMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [isDarkMode]);

  // ── Map data update ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const routeSrc = map.getSource('trips-routes') as mapboxgl.GeoJSONSource | undefined;
    const speedSrc = map.getSource('speed-route') as mapboxgl.GeoJSONSource | undefined;
    const speedingSrc = map.getSource('speeding-sections') as mapboxgl.GeoJSONSource | undefined;
    const stopsSrc = map.getSource('stop-points') as mapboxgl.GeoJSONSource | undefined;
    if (!routeSrc) return;

    // Clear previous event markers
    eventMarkersRef.current.forEach((m) => m.remove());
    eventMarkersRef.current = [];

    const hasLines = mapGeoJson.lines.features.length > 0;

    if (hasLines) {
      routeSrc.setData(mapGeoJson.lines);

      // Speed-colored segments
      if (speedSrc && routePoints.length >= 2) {
        const speedFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
        for (let i = 0; i < routePoints.length - 1; i++) {
          const a = routePoints[i], b = routePoints[i + 1];
          if (a.latitude && a.longitude && b.latitude && b.longitude) {
            speedFeatures.push({
              type: 'Feature', geometry: { type: 'LineString', coordinates: [[a.longitude, a.latitude], [b.longitude, b.latitude]] },
              properties: { speed: a.speedKmh ?? 0 },
            });
          }
        }
        speedSrc.setData({ type: 'FeatureCollection', features: speedFeatures });
      }

      // Speeding sections
      if (speedingSrc && selectedTrip) {
        const sections = getSpeedingSections(selectedTrip, enrichments[selectedTrip.id]);
        if (sections.length > 0) {
          const sectionFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = sections
            .filter((s) => s.coordinates.length >= 2)
            .map((s) => ({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: s.coordinates },
              properties: { severity: s.severity, maxOver: s.maxOverSpeedKmh, limit: s.representativeSpeedLimitKmh },
            }));
          speedingSrc.setData({ type: 'FeatureCollection', features: sectionFeatures });
        } else {
          speedingSrc.setData({ type: 'FeatureCollection', features: [] });
        }
      }

      // Detect stops from route points (speed < 3 km/h for consecutive points)
      if (stopsSrc && routePoints.length >= 2) {
        const stopFeatures: GeoJSON.Feature<GeoJSON.Point>[] = [];
        let stopStart = -1;
        for (let i = 0; i < routePoints.length; i++) {
          const isLowSpeed = (routePoints[i].speedKmh ?? 0) < 3;
          if (isLowSpeed && stopStart < 0) stopStart = i;
          if ((!isLowSpeed || i === routePoints.length - 1) && stopStart >= 0) {
            const stopEnd = isLowSpeed ? i : i - 1;
            const count = stopEnd - stopStart + 1;
            if (count >= 3) {
              const mid = Math.floor((stopStart + stopEnd) / 2);
              const p = routePoints[mid];
              const startT = new Date(routePoints[stopStart].timestamp).getTime();
              const endT = new Date(routePoints[stopEnd].timestamp).getTime();
              const durS = Math.max(1, Math.round((endT - startT) / 1000));
              if (p.latitude && p.longitude) {
                stopFeatures.push({
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
                  properties: { duration: durS },
                });
              }
            }
            stopStart = -1;
          }
        }
        stopsSrc.setData({ type: 'FeatureCollection', features: stopFeatures });
      }

      // Add event markers (driving events + abuse events)
      if (selectedTrip) {
        const tripEvents = behaviorEvents[selectedTrip.id] ?? [];
        tripEvents.forEach((ev) => {
          if (ev.latitude == null || ev.longitude == null) return;
          const isAbuse = ev.eventCategory === 'ABUSE';
          const isAccel = ev.eventCategory === 'ACCELERATION';
          if (isAbuse && !mapShowAbuseEvents) return;
          if (!isAbuse && !mapShowDrivingEvents) return;
          const color = isAbuse ? '#ef4444' : isAccel ? '#f97316' : '#3b82f6';
          const icon = isAbuse ? '⚠' : isAccel ? '▲' : '▼';
          const el = document.createElement('div');
          el.style.width = '18px';
          el.style.height = '18px';
          el.style.borderRadius = '50%';
          el.style.backgroundColor = isDarkMode ? 'rgba(23,23,23,0.9)' : 'rgba(255,255,255,0.95)';
          el.style.border = `2px solid ${color}`;
          el.style.display = 'flex';
          el.style.alignItems = 'center';
          el.style.justifyContent = 'center';
          el.style.fontSize = '9px';
          el.style.lineHeight = '1';
          el.style.cursor = 'default';
          el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.2)';
          el.textContent = icon;
          el.title = `${ev.eventType.replace(/_/g, ' ')} (${ev.classification})`;
          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([ev.longitude, ev.latitude])
            .addTo(map);
          eventMarkersRef.current.push(marker);
        });
      }

      // Fit bounds
      const coords = (mapGeoJson.lines.features[0]?.geometry as GeoJSON.LineString)?.coordinates ?? [];
      if (coords.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        coords.forEach((c) => bounds.extend(c as [number, number]));
        map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
      }
    } else {
      routeSrc.setData({ type: 'FeatureCollection', features: [] });
      if (speedSrc) speedSrc.setData({ type: 'FeatureCollection', features: [] });
      if (speedingSrc) speedingSrc.setData({ type: 'FeatureCollection', features: [] });
      if (stopsSrc) stopsSrc.setData({ type: 'FeatureCollection', features: [] });
      if (selectedTrip?.startLatitude != null && selectedTrip?.startLongitude != null) {
        map.flyTo({ center: [selectedTrip.startLongitude, selectedTrip.startLatitude], zoom: 13 });
      }
    }
  }, [mapGeoJson, selectedTrip, routePoints, enrichments, behaviorEvents, mapShowDrivingEvents, mapShowAbuseEvents, mapLoaded]);

  // ── Toggle layer visibility ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const setVis = (id: string, visible: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    };
    setVis('speed-route-layer', mapShowSpeed);
    setVis('speeding-sections-glow', mapShowSpeeding);
    setVis('speeding-sections-line', mapShowSpeeding);
    setVis('stop-points-ring', mapShowStops);
    setVis('stop-points-center', mapShowStops);
  }, [mapShowSpeed, mapShowSpeeding, mapShowStops, mapLoaded]);

  // Auto-enrich trip route when selected and not yet enriched
  useEffect(() => {
    if (!selectedTrip || !vehicleId || enrichingId) return;
    if (selectedTrip.enrichedAt || enrichments[selectedTrip.id]) return;
    handleEnrichTrip(selectedTrip);
  }, [selectedTrip?.id]);

  // Auto-trigger behavior enrichment when a completed trip is selected and
  // has never been processed (status is null/undefined).
  // Guards:
  // - Only for COMPLETED trips (not ONGOING)
  // - Only once per trip per session (autoEnrichTriggeredRef)
  // - Never if status is already set (PENDING/IN_PROGRESS/COMPLETED/SKIPPED_NO_HF_DATA/FAILED_*)
  // - behaviorLoading flag prevents overlapping requests
  useEffect(() => {
    if (!selectedTrip || !vehicleId || behaviorLoading) return;
    if (selectedTrip.tripStatus !== 'COMPLETED') return;
    // behaviorReady=true means enrichment is already done — skip
    if (selectedTrip.behaviorReady === true) return;
    // Legacy guard: if the status field is present and set, skip
    const status = selectedTrip.behaviorEnrichmentStatus;
    if (status !== null && status !== undefined) return;
    if (autoEnrichTriggeredRef.current.has(selectedTrip.id)) return;
    autoEnrichTriggeredRef.current.add(selectedTrip.id);
    const tripId = selectedTrip.id;
    // Optimistically mark as in-progress to prevent duplicate triggers
    setTrips((prev) => prev.map((t) =>
      t.id === tripId ? { ...t, behaviorEnrichmentStatus: 'IN_PROGRESS' as BehaviorEnrichmentStatus } : t,
    ));
    setBehaviorLoading(tripId);
    api.vehicleIntelligence.enrichTripBehavior(vehicleId, tripId)
      .then(async () => {
        const evts = await api.vehicleIntelligence.tripBehaviorEvents(vehicleId, tripId).catch(() => null);
        setBehaviorEvents((prev) => ({ ...prev, [tripId]: evts?.events ?? [] }));
        loadTrips();
      })
      .catch(() => {
        // Mark as failed-transient on error so user sees retry button
        setTrips((prev) => prev.map((t) =>
          t.id === tripId ? { ...t, behaviorEnrichmentStatus: 'FAILED_TRANSIENT' as BehaviorEnrichmentStatus } : t,
        ));
      })
      .finally(() => setBehaviorLoading(null));
  }, [selectedTrip?.id]);

  // Use behavior-enriched counters when available (semantically correct).
  // Returns null when analysis is not complete — callers must NOT display null as zero.
  const totalEvents = (t: TripData): number | null => {
    // If we have the explicit readiness flag and it says not ready, return null.
    // This prevents false-zero display when no analysis has run.
    if (t.behaviorReady === false) return null;
    if (t.behaviorEnrichedAt || t.behaviorReady) {
      return (
        (t.totalAccelerationEvents ?? t.accelerationEventCount ?? 0) +
        (t.totalBrakingEvents ?? t.brakingEventCount ?? 0) +
        (t.abuseEvents ?? t.abuseEventCount ?? 0)
      );
    }
    // Legacy fallback only for trips that predate the behaviorReady flag
    return (t.harshBrakeCount ?? 0) + (t.harshAccelCount ?? 0) + (t.harshCornerCount ?? 0);
  };
  const hasRoadType = (t: TripData) => t.citySharePercent != null || t.highwaySharePercent != null;

  const getConsumptionDisplay = (t: TripData, enr?: TripEnrichment) => {
    if (isEv) {
      const kwh = enr?.energyUsedKwh ?? t.energyUsedKwh;
      const avg = enr?.avgConsumptionKwhPer100Km ?? t.avgConsumptionKwhPer100Km;
      const conf = enr?.energyConfidence ?? t.energyConfidence;
      if (kwh == null) return null;
      return { value: `${kwh.toFixed(1)} kWh`, avg: avg != null ? `${avg.toFixed(1)} kWh/100km` : null, label: 'Energy', confidence: conf };
    }
    const liters = enr?.fuelUsedLiters ?? t.fuelUsedLiters;
    const avg = enr?.avgConsumptionLPer100Km ?? t.avgConsumptionLPer100Km;
    const conf = enr?.fuelConfidence ?? t.fuelConfidence;
    if (liters == null) return null;
    return { value: `${liters.toFixed(1)} L`, avg: avg != null ? `${avg.toFixed(1)} L/100km` : null, label: 'Fuel', confidence: conf };
  };

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Map */}
      <div className="rounded-xl p-4 shadow-sm border border-border mb-3 bg-card">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Route className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
            <h2 className={`text-lg font-semibold text-foreground`}>
              {selectedTrip ? `Trip Route – ${formatDate(selectedTrip.startTime)}` : 'Trip Route Map'}
            </h2>
            {selectedTrip && enrichments[selectedTrip.id]?.mapMatchConfidence > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-500">Map Matched</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {syncMessage && (
              <span className={`text-xs ${(syncMessage.includes('No missing') || syncMessage.includes('repaired') || syncMessage.includes('found')) ? (isDark ? 'text-green-400' : 'text-green-600') : isDark ? 'text-amber-400' : 'text-amber-600'}`}>{syncMessage}</span>
            )}
            <button onClick={handleSync} disabled={syncing || !vehicleId}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isDark ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'} disabled:opacity-50`}>
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> Check for Missing Trips
            </button>
          </div>
        </div>

        {/* Filter / legend bar */}
        {selectedTrip && routePoints.length > 0 && (
          <div className="flex items-center gap-3 px-3 py-2 mb-2 rounded-lg border flex-wrap bg-muted border-border">
            {/* Speed legend */}
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`}>Speed</span>
              <div className="w-16 h-1.5 rounded-full" style={{ background: 'linear-gradient(to right, #94a3b8, #3b82f6, #22c55e, #eab308, #f97316, #ef4444)' }} />
              <span className={`text-[9px] text-muted-foreground`}>0–160+</span>
            </div>

            <div className="w-px h-4 bg-border" />

            {/* Toggle: Speed */}
            <button onClick={() => setMapShowSpeed((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all ${
                mapShowSpeed
                  ? 'bg-blue-500/10 text-blue-500 border border-blue-500/30'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}>
              <Gauge className="w-3 h-3" /> Speed
            </button>

            {/* Toggle: Speeding */}
            <button onClick={() => setMapShowSpeeding((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all ${
                mapShowSpeeding
                  ? 'bg-red-500/10 text-red-500 border border-red-500/30'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}>
              <AlertCircle className="w-3 h-3" /> Speeding
            </button>

            {/* Toggle: Driving Events */}
            <button onClick={() => setMapShowDrivingEvents((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all ${
                mapShowDrivingEvents
                  ? 'bg-orange-500/10 text-orange-500 border border-orange-500/30'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}>
              <Zap className="w-3 h-3" /> Events
            </button>

            {/* Toggle: Abuse Events */}
            <button onClick={() => setMapShowAbuseEvents((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all ${
                mapShowAbuseEvents
                  ? 'bg-red-500/10 text-red-500 border border-red-500/30'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}>
              <Shield className="w-3 h-3" /> Abuse
            </button>

            {/* Toggle: Stops */}
            <button onClick={() => setMapShowStops((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all ${
                mapShowStops
                  ? 'bg-slate-500/10 text-slate-500 border border-slate-500/30'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}>
              <Clock className="w-3 h-3" /> Stops
            </button>
          </div>
        )}

        <div className="relative w-full h-[420px] rounded-xl overflow-hidden border border-border">
          <div ref={mapContainerRef} className="w-full h-full" />
          {/* Map loading overlay */}
          {!mapLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className={`w-6 h-6 animate-spin ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                <span className={`text-xs font-medium text-muted-foreground`}>Loading map...</span>
              </div>
            </div>
          )}
          {/* Route data loading overlay */}
          {routeLoading && mapLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/40 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className={`w-6 h-6 animate-spin ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                <span className={`text-xs font-medium text-foreground`}>Loading route data...</span>
              </div>
            </div>
          )}
          {/* Enrichment loading overlay */}
          {selectedTrip && enrichingId === selectedTrip.id && mapLoaded && !routeLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/30 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className={`w-5 h-5 animate-spin ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                <span className={`text-xs font-medium text-muted-foreground`}>Enriching trip data...</span>
              </div>
            </div>
          )}
          {/* Compact map-inline legend */}
          {selectedTrip && routePoints.length > 0 && (
            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 px-2.5 py-1.5 rounded-lg border border-border shadow-sm bg-card">
              <div className="flex items-center gap-1">
                <span className="w-3 h-0.5 rounded-full bg-blue-500" />
                <span className={`text-[8px] text-muted-foreground`}>Slow</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-0.5 rounded-full bg-green-500" />
                <span className={`text-[8px] text-muted-foreground`}>Normal</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-0.5 rounded-full bg-yellow-500" />
                <span className={`text-[8px] text-muted-foreground`}>Fast</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-0.5 rounded-full bg-red-500" />
                <span className={`text-[8px] text-muted-foreground`}>Speeding</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-400" style={{ borderStyle: 'solid' }} />
                <span className={`text-[8px] text-muted-foreground`}>Stop</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Trip List */}
      <div className="rounded-xl p-4 shadow-sm border border-border bg-card">
        <div className="flex items-center justify-between mb-3">
          <h2 className={`text-lg font-semibold text-foreground`}>Trip History ({trips.length})</h2>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
        </div>
        {loadError && (
          <div className="mb-3 px-3 py-2 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-xs">{loadError}</div>
        )}
        {!loading && trips.length === 0 && vehicleId && (
          <div className="py-12 px-3 rounded-xl border border-border text-center bg-muted">
            <Navigation className={`w-9 h-9 mx-auto mb-3 text-muted-foreground`} />
            <p className={`text-xs font-medium text-foreground`}>Keine Trips vorhanden</p>
            <p className={`text-xs mt-1 text-muted-foreground`}>Trips werden aus DIMO geladen. Fahrzeug mit DIMO verbinden und Sync starten.</p>
            <button onClick={handleSync} disabled={syncing}
              className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Check for Missing Trips
            </button>
          </div>
        )}

        <div className="space-y-1.5">
          {trips.map((trip) => {
            const enr = enrichments[trip.id];
            const isSelected = selectedTrip?.id === trip.id;
            const events = totalEvents(trip);
            const consumption = getConsumptionDisplay(trip, enr);
            const isOngoing = trip.tripStatus === 'ONGOING';
            const styleScore = trip.drivingStyleScore ?? trip.drivingScore ?? null;
            const safetyScore = trip.safetyScore ?? null;

            return (
              <div key={trip.id} onClick={() => handleSelectTrip(trip)}
                className={`rounded-lg border transition-all duration-200 cursor-pointer ${
                  isSelected ? 'bg-accent border-accent-foreground/20 shadow-sm'
                  : 'bg-card border-border hover:bg-accent/50 shadow-xs'
                }`}>
                <div className="p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isOngoing ? (isDark ? 'bg-amber-600/20' : 'bg-amber-100') : (isDark ? 'bg-blue-600/20' : 'bg-blue-100')
                    }`}>
                      {isOngoing
                        ? <Play className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                        : <Navigation className={`w-4 h-4 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold text-foreground`}>{formatDate(trip.startTime)}</span>
                        <span className={`text-[11px] text-muted-foreground`}>
                          {formatTime(trip.startTime)} – {trip.endTime ? formatTime(trip.endTime) : '...'}
                        </span>
                        {/* Trip status badge */}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${
                          isOngoing ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'
                        }`}>
                          {isOngoing ? 'ongoing' : 'completed'}
                        </span>
                        {trip.detailsLimited && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] bg-muted/80 text-muted-foreground" title="Some trip details are unavailable">limited</span>
                        )}
                        {trip.behaviorReady === false && !trip.detailsLimited && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] bg-blue-500/10 text-blue-400" title="Behavior analysis in progress">analyzing</span>
                        )}
                        {trip.gapEnded && (
                          <span className="px-1 py-0.5 rounded text-[8px] bg-muted text-muted-foreground">gap</span>
                        )}
                        {trip.driverName && (
                          <span className={`flex items-center gap-1 text-[10px] text-muted-foreground`}><User className="w-3 h-3" />{trip.driverName}</span>
                        )}
                        {(trip.isPrivateTrip || trip.assignmentStatus === 'PRIVATE_UNASSIGNED') && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] bg-purple-500/10 text-purple-400 uppercase tracking-wider">
                            private
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <Metric isDark={isDark} label="Dist" value={formatDistance(trip.distanceKm)} />
                      <Metric isDark={isDark} label="Time" value={formatDuration(trip.durationMinutes)} />
                      <Metric isDark={isDark} label="Events"
                        value={events === null ? '…' : String(events)}
                        color={events === null ? undefined : events > 0 ? 'orange' : 'green'}
                        icon={<Zap className="w-3 h-3" />} />
                      <Metric isDark={isDark} label="Style" value={styleScore != null ? String(Math.round(styleScore)) : '--'}
                        color={styleScore != null ? (styleScore >= 90 ? 'green' : styleScore >= 75 ? 'blue' : 'orange') : undefined}
                        icon={<Award className="w-3 h-3" />} />
                      <Metric isDark={isDark} label="Safety" value={safetyScore != null ? String(Math.round(safetyScore)) : '--'}
                        color={safetyScore != null ? (safetyScore >= 90 ? 'green' : safetyScore >= 75 ? 'blue' : 'orange') : undefined}
                        icon={<Award className="w-3 h-3" />} />
                      {trip.outsideTemperatureStartC != null && (
                        <Metric isDark={isDark} label="Temp" value={`${trip.outsideTemperatureStartC.toFixed(0)}°C`} icon={<Thermometer className="w-3 h-3" />} />
                      )}
                      {consumption && <Metric isDark={isDark} label={consumption.label} value={consumption.avg ?? consumption.value} icon={<Fuel className="w-3 h-3" />} />}
                      <div className={`p-1 rounded-lg text-muted-foreground`}>
                        {isSelected ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pl-11">
                    <span className={`flex items-center gap-1 text-[11px] text-muted-foreground`}>
                      <Gauge className="w-3 h-3" /> Avg {trip.avgSpeedKmh?.toFixed(0) ?? '--'} km/h
                    </span>
                    <span className={`flex items-center gap-1 text-[11px] text-muted-foreground`}>
                      <Gauge className="w-3 h-3" /> Max {trip.maxSpeedKmh?.toFixed(0) ?? '--'} km/h
                    </span>
                    {hasRoadType(trip) && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <div className="flex gap-0.5 h-1.5 w-20 rounded-full overflow-hidden">
                          {(trip.citySharePercent ?? 0) > 0 && <div className="bg-blue-500" style={{ width: `${trip.citySharePercent}%` }} />}
                          {(trip.highwaySharePercent ?? 0) > 0 && <div className="bg-emerald-500" style={{ width: `${trip.highwaySharePercent}%` }} />}
                          {(trip.countrySharePercent ?? 0) > 0 && <div className="bg-amber-500" style={{ width: `${trip.countrySharePercent}%` }} />}
                        </div>
                        <span className={`text-[9px] text-muted-foreground`}>Road mix</span>
                      </div>
                    )}
                    {/* Speeding: section-based summary */}
                    {(() => {
                      const sections = getSpeedingSections(trip, enr);
                      const sectionCount = sections.length || (enr?.speedingSectionCount ?? trip.speedingSectionCount ?? 0);
                      const isEnriched = !!(trip.enrichedAt || enr);
                      if (!isEnriched) return null;
                      if (sectionCount > 0) {
                        const maxSeverity = sections.length > 0
                          ? (['severe', 'high', 'moderate', 'low'] as const).find((s) => sections.some((sec) => sec.severity === s)) ?? 'low'
                          : 'low';
                        const sevColor = maxSeverity === 'severe' || maxSeverity === 'high' ? 'text-red-400' : maxSeverity === 'moderate' ? 'text-amber-400' : 'text-yellow-400';
                        return (
                          <span className={`flex items-center gap-1 text-[10px] ${sevColor}`}>
                            <AlertCircle className="w-3 h-3" /> {sectionCount} speeding {sectionCount === 1 ? 'section' : 'sections'}
                          </span>
                        );
                      }
                      return (
                        <span className={`flex items-center gap-1 text-[10px] ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                          <CheckCircle2 className="w-3 h-3" /> No speeding
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Expanded Detail */}
                {isSelected && (
                  <div className={`px-4 pb-4 pt-3 border-t border-border`} onClick={(e) => e.stopPropagation()}>
                    {enrichingId === trip.id && (
                      <div className={`mb-3 flex items-center gap-1.5 text-xs ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Enriching trip data...
                      </div>
                    )}
                    <TripAddresses trip={trip} isDark={isDark} />

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
                      <StatCell isDark={isDark} label="Accel (total)"
                        value={trip.behaviorReady ? (trip.totalAccelerationEvents ?? trip.accelerationEventCount ?? 0) : '--'}
                        warn={trip.behaviorReady ? (trip.hardAccelerationEvents ?? trip.hardAccelerationCount ?? 0) > 0 : false} />
                      <StatCell isDark={isDark} label="Brake (total)"
                        value={trip.behaviorReady ? (trip.totalBrakingEvents ?? trip.brakingEventCount ?? 0) : '--'}
                        warn={trip.behaviorReady ? (trip.hardBrakingEvents ?? trip.hardBrakingCount ?? 0) > 0 : false} />
                      <StatCell isDark={isDark} label="Abuse"
                        value={trip.behaviorReady ? (trip.abuseEvents ?? trip.abuseEventCount ?? 0) : '--'}
                        warn={trip.behaviorReady ? (trip.abuseEvents ?? trip.abuseEventCount ?? 0) > 0 : false} />
                      {trip.avgRpm != null && <StatCell isDark={isDark} label="Avg RPM" value={`${Math.round(trip.avgRpm)}`} />}
                      {trip.avgEngineLoad != null && <StatCell isDark={isDark} label="Avg Load" value={`${trip.avgEngineLoad.toFixed(1)}%`} />}
                      {trip.avgThrottlePosition != null && <StatCell isDark={isDark} label="Avg Throttle" value={`${trip.avgThrottlePosition.toFixed(1)}%`} />}
                    </div>

                    {/* Behavior Analysis Sections */}
                    <BehaviorAnalysis
                      trip={trip}
                      isDark={isDark}
                      events={behaviorEvents[trip.id] ?? []}
                      loading={behaviorLoading === trip.id}
                      expandedSection={expandedSection}
                      onToggleSection={(s) => setExpandedSection(expandedSection === s ? null : s)}
                      onEnrich={async () => {
                        if (!vehicleId) return;
                        setBehaviorLoading(trip.id);
                        try {
                          await api.vehicleIntelligence.enrichTripBehavior(vehicleId, trip.id);
                          const evts = await api.vehicleIntelligence.tripBehaviorEvents(vehicleId, trip.id);
                          setBehaviorEvents((prev) => ({ ...prev, [trip.id]: evts?.events ?? [] }));
                          loadTrips();
                        } catch { /* silent */ }
                        setBehaviorLoading(null);
                      }}
                    />

                    <div className="rounded-lg p-4 bg-muted">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* Road Type Distribution */}
                        <div>
                          <div className="flex items-center gap-1.5 mb-2.5">
                            <Wind className={`w-3.5 h-3.5 ${isDark ? 'text-indigo-400' : 'text-indigo-500'}`} />
                            <span className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Road Distribution</span>
                          </div>
                          {hasRoadType(trip) || enr ? (
                            <>
                              <div className="flex gap-0.5 h-2.5 rounded-full overflow-hidden mb-3">
                                {((enr?.citySharePercent ?? trip.citySharePercent) ?? 0) > 0 && <div className="bg-blue-500 rounded-sm" style={{ width: `${enr?.citySharePercent ?? trip.citySharePercent}%` }} />}
                                {((enr?.highwaySharePercent ?? trip.highwaySharePercent) ?? 0) > 0 && <div className="bg-emerald-500 rounded-sm" style={{ width: `${enr?.highwaySharePercent ?? trip.highwaySharePercent}%` }} />}
                                {((enr?.countrySharePercent ?? trip.countrySharePercent) ?? 0) > 0 && <div className="bg-amber-500 rounded-sm" style={{ width: `${enr?.countrySharePercent ?? trip.countrySharePercent}%` }} />}
                              </div>
                              <div className="space-y-1.5">
                                <RoadRow isDark={isDark} color="bg-blue-500" label="City" percent={enr?.citySharePercent ?? trip.citySharePercent ?? 0} km={enr?.cityKm} />
                                <RoadRow isDark={isDark} color="bg-emerald-500" label="Highway" percent={enr?.highwaySharePercent ?? trip.highwaySharePercent ?? 0} km={enr?.highwayKm} />
                                <RoadRow isDark={isDark} color="bg-amber-500" label="Country" percent={enr?.countrySharePercent ?? trip.countrySharePercent ?? 0} km={enr?.countryKm} />
                              </div>
                            </>
                          ) : (
                            <p className={`text-[11px] text-muted-foreground`}>Run trip analysis to calculate road type distribution</p>
                          )}
                        </div>

                        {/* Temperature + Performance + Consumption */}
                        <div className="space-y-3">
                          {(trip.outsideTemperatureStartC != null || enr?.outsideTemperatureStartC != null) && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                <Thermometer className={`w-3.5 h-3.5 ${((enr?.outsideTemperatureStartC ?? trip.outsideTemperatureStartC) ?? 20) > 30 ? 'text-red-400' : ((enr?.outsideTemperatureStartC ?? trip.outsideTemperatureStartC) ?? 20) < 5 ? 'text-blue-400' : 'text-muted-foreground'}`} />
                                <span className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Outside Temperature</span>
                              </div>
                              <p className={`text-sm font-bold text-foreground`}>
                                {(enr?.outsideTemperatureStartC ?? trip.outsideTemperatureStartC)?.toFixed(1)}°C
                              </p>
                            </div>
                          )}
                          {(trip.engineTempStartC != null || enr?.engineTempStartC != null) && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                <Activity className={`w-3.5 h-3.5 ${isDark ? 'text-cyan-400' : 'text-cyan-500'}`} />
                                <span className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Engine Temp</span>
                              </div>
                              <p className={`text-[11px] text-muted-foreground`}>
                                Start: {(enr?.engineTempStartC ?? trip.engineTempStartC)?.toFixed(0)}°C
                                {(enr?.engineTempEndC ?? trip.engineTempEndC) != null && <> → End: {(enr?.engineTempEndC ?? trip.engineTempEndC)?.toFixed(0)}°C</>}
                              </p>
                            </div>
                          )}

                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <Fuel className={`w-3.5 h-3.5 ${isEv ? (isDark ? 'text-emerald-400' : 'text-emerald-500') : (isDark ? 'text-cyan-400' : 'text-cyan-500')}`} />
                              <span className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>
                                {isEv ? 'Energy Consumption' : 'Fuel Consumption'}
                              </span>
                            </div>
                            {consumption ? (
                              <>
                                <p className={`text-sm font-bold text-foreground`}>{consumption.value}</p>
                                {consumption.avg && <p className={`text-[10px] text-muted-foreground`}>{consumption.avg}</p>}
                                {consumption.confidence && consumption.confidence !== 'high' && (
                                  <p className={`text-[9px] italic mt-0.5 ${isDark ? 'text-amber-500/70' : 'text-amber-600/70'}`}>
                                    {consumption.confidence === 'low' ? 'Low confidence — signal quality limited' : 'Invalid signal data'}
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className={`text-[11px] text-muted-foreground`}>
                                No {isEv ? 'energy' : 'fuel'} data available — signal not reported at trip start or end
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Speeding Sections */}
                        <div className="space-y-3">
                          {(() => {
                            const isEnriched = !!(trip.enrichedAt || enr);
                            const sections = getSpeedingSections(trip, enr);
                            const sectionCount = sections.length || (enr?.speedingSectionCount ?? trip.speedingSectionCount ?? 0);
                            const maxOver = enr?.maxOverSpeedKmh ?? trip.maxOverSpeedKmh ?? 0;
                            const distM = enr?.speedingDistanceMeters ?? trip.speedingDistanceM ?? 0;
                            const durS = enr?.speedingDurationSeconds ?? trip.speedingDurationS ?? 0;
                            const exposure = enr?.speedingExposurePercent ?? trip.speedingExposurePct ?? null;

                            if (!isEnriched) {
                              return (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <AlertCircle className={`w-3.5 h-3.5 text-muted-foreground`} />
                                    <span className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Speeding Sections</span>
                                  </div>
                                  <p className={`text-sm font-medium text-muted-foreground`}>No Data</p>
                                  <p className={`text-[9px] text-muted-foreground`}>Run trip analysis to detect speeding</p>
                                </div>
                              );
                            }

                            if (sectionCount === 0) {
                              return (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <CheckCircle2 className={`w-3.5 h-3.5 ${isDark ? 'text-green-400' : 'text-green-500'}`} />
                                    <span className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Speeding Sections</span>
                                  </div>
                                  <p className={`text-sm font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>No Speeding</p>
                                  <p className={`text-[9px] text-muted-foreground`}>Based on matched road speed limits with 5% tolerance</p>
                                </div>
                              );
                            }

                            const maxSeverity = (['severe', 'high', 'moderate', 'low'] as const).find((s) => sections.some((sec) => sec.severity === s)) ?? 'low';
                            const headerColor = maxSeverity === 'severe' || maxSeverity === 'high' ? 'text-red-400' : maxSeverity === 'moderate' ? 'text-amber-400' : (isDark ? 'text-yellow-400' : 'text-yellow-600');

                            return (
                              <div>
                                <div className="flex items-center gap-1.5 mb-2">
                                  <AlertCircle className={`w-3.5 h-3.5 ${headerColor}`} />
                                  <span className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Speeding Sections</span>
                                </div>

                                {/* Summary cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                                  <div className={`rounded-lg px-2.5 py-1.5 bg-muted`}>
                                    <p className={`text-[9px] uppercase tracking-wider text-muted-foreground`}>Sections</p>
                                    <p className={`text-sm font-bold ${headerColor}`}>{sectionCount}</p>
                                  </div>
                                  <div className={`rounded-lg px-2.5 py-1.5 bg-muted`}>
                                    <p className={`text-[9px] uppercase tracking-wider text-muted-foreground`}>Distance</p>
                                    <p className={`text-sm font-bold text-foreground`}>{distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${distM} m`}</p>
                                  </div>
                                  <div className={`rounded-lg px-2.5 py-1.5 bg-muted`}>
                                    <p className={`text-[9px] uppercase tracking-wider text-muted-foreground`}>Peak Over</p>
                                    <p className={`text-sm font-bold text-red-400`}>+{maxOver} km/h</p>
                                  </div>
                                  <div className={`rounded-lg px-2.5 py-1.5 bg-muted`}>
                                    <p className={`text-[9px] uppercase tracking-wider text-muted-foreground`}>Exposure</p>
                                    <p className={`text-sm font-bold text-foreground`}>{exposure != null ? `${exposure}%` : '—'}</p>
                                  </div>
                                </div>

                                {/* Section detail list */}
                                {sections.length > 0 && (
                                  <div className="space-y-1.5">
                                    {sections.map((sec) => {
                                      const sevColors: Record<string, string> = {
                                        severe: 'bg-red-500', high: 'bg-red-400', moderate: 'bg-amber-400', low: 'bg-yellow-400',
                                      };
                                      const sevLabel: Record<string, string> = {
                                        severe: 'Severe', high: 'High', moderate: 'Moderate', low: 'Low',
                                      };
                                      return (
                                        <div key={sec.sectionIndex} className="rounded-lg px-3 py-2 bg-muted border border-border">
                                          <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                              <span className={`inline-block w-2 h-2 rounded-full ${sevColors[sec.severity]}`} />
                                              <span className={`text-[10px] font-semibold text-foreground`}>
                                                {formatTime(sec.startedAt)} – {formatTime(sec.endedAt)}
                                              </span>
                                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                                sec.severity === 'severe' || sec.severity === 'high'
                                                  ? 'bg-red-500/15 text-red-400'
                                                  : sec.severity === 'moderate'
                                                    ? 'bg-amber-500/15 text-amber-400'
                                                    : 'bg-yellow-500/15 text-yellow-500'
                                              }`}>{sevLabel[sec.severity]}</span>
                                            </div>
                                            {sec.primaryLimitSource === 'fallback' && (
                                              <span className="text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground">Estimated limit</span>
                                            )}
                                          </div>
                                          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                                            <span className={`text-[10px] text-muted-foreground`}>
                                              {sec.durationSeconds}s · {sec.approxDistanceMeters >= 1000 ? `${(sec.approxDistanceMeters / 1000).toFixed(1)} km` : `${sec.approxDistanceMeters} m`}
                                            </span>
                                            <span className={`text-[10px] text-muted-foreground`}>
                                              Limit {sec.representativeSpeedLimitKmh} km/h
                                            </span>
                                            <span className={`text-[10px] font-medium text-red-400`}>
                                              Peak +{sec.maxOverSpeedKmh} km/h · Avg +{sec.avgOverSpeedKmh} km/h
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                <p className={`text-[8px] mt-2 text-muted-foreground`}>Based on matched road speed limits with 5% tolerance</p>
                              </div>
                            );
                          })()}

                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <Shield
                                className={`w-3.5 h-3.5 ${
                                  (trip.abuseEvents ?? trip.abuseEventCount ?? 0) > 3
                                    ? 'text-red-400'
                                    : (trip.abuseEvents ?? trip.abuseEventCount ?? 0) > 0
                                      ? 'text-amber-400'
                                      : 'text-green-400'
                                }`}
                              />
                              <span className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Behavior Analysis</span>
                            </div>
                            {trip.behaviorReady ? (
                              <>
                                <p
                                  className={`text-sm font-bold ${
                                    (trip.abuseEvents ?? trip.abuseEventCount ?? 0) > 3
                                      ? 'text-red-400'
                                      : (trip.abuseEvents ?? trip.abuseEventCount ?? 0) > 0
                                        ? (isDark ? 'text-amber-400' : 'text-amber-600')
                                        : (isDark ? 'text-green-400' : 'text-green-600')
                                  }`}
                                >
                                  {(trip.abuseEvents ?? trip.abuseEventCount ?? 0) > 3
                                    ? 'High Risk'
                                    : (trip.abuseEvents ?? trip.abuseEventCount ?? 0) > 0
                                      ? 'Moderate'
                                      : 'Clean'}
                                </p>
                                <p className={`text-[10px] text-muted-foreground`}>
                                  {trip.totalAccelerationEvents ?? trip.accelerationEventCount ?? 0} accel ·{' '}
                                  {trip.totalBrakingEvents ?? trip.brakingEventCount ?? 0} brake ·{' '}
                                  {trip.abuseEvents ?? trip.abuseEventCount ?? 0} abuse
                                </p>
                              </>
                            ) : (
                              <p className={`text-[10px] text-muted-foreground`}>Not yet analyzed</p>
                            )}
                          </div>

                          {(enr?.mapMatchConfidence ?? 0) > 0 && (
                            <div className={`mt-2 pt-2 border-t border-border`}>
                              <p className={`text-[9px] text-muted-foreground`}>Map match confidence: {Math.round((enr?.mapMatchConfidence ?? 0) * 100)}%</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {trips.length === 0 && !loading && (
            <div className={`text-center py-12 text-muted-foreground`}>
              <Navigation className="w-9 h-9 mx-auto mb-3 opacity-50" />
              <p className="text-base font-medium">No trips found</p>
              <p className="text-xs mt-1">{vehicleId ? 'Click "Check for Missing Trips" to scan for gaps' : 'Select a vehicle first'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TripAddresses({ trip, isDark }: { trip: TripData; isDark: boolean }) {
  const { address: startAddr, loading: startLoading } = useAddress(trip.startLatitude, trip.startLongitude);
  const { address: endAddr, loading: endLoading } = useAddress(trip.endLatitude, trip.endLongitude);

  if (!trip.startLatitude && !trip.endLatitude) return null;

  return (
    <div className="grid grid-cols-2 gap-3 mb-3">
      <div className={`flex items-start gap-2 p-2 rounded-lg bg-muted`}>
        <MapPin className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
        <div className="min-w-0">
          <div className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>Start</div>
          {startLoading ? (
            <Loader2 className={`w-3 h-3 animate-spin text-muted-foreground`} />
          ) : (
            <div className={`text-[11px] font-medium truncate text-foreground`}>
              {startAddr?.formatted ?? '—'}
            </div>
          )}
        </div>
      </div>
      <div className={`flex items-start gap-2 p-2 rounded-lg bg-muted`}>
        <MapPin className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
        <div className="min-w-0">
          <div className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>End</div>
          {endLoading ? (
            <Loader2 className={`w-3 h-3 animate-spin text-muted-foreground`} />
          ) : (
            <div className={`text-[11px] font-medium truncate text-foreground`}>
              {endAddr?.formatted ?? '—'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EventDetail({ isDark, label, value, highlight, icon }: { isDark: boolean; label: string; value: string; highlight?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-[11px] font-semibold ${highlight ? 'text-orange-500' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}

function BehaviorAnalysis({ trip, isDark, events, loading, expandedSection, onToggleSection, onEnrich }: {
  trip: TripData; isDark: boolean; events: TripBehaviorEvent[]; loading: boolean;
  expandedSection: string | null; onToggleSection: (s: string) => void; onEnrich: () => void;
}) {
  const accelEvents = events.filter((e) => e.eventCategory === 'ACCELERATION');
  const brakeEvents = events.filter((e) => e.eventCategory === 'BRAKING');
  const abuseEvents = events.filter((e) => e.eventCategory === 'ABUSE');

  const classColor = (c: string) => {
    if (c === 'EXTREME' || c === 'CRITICAL') return 'text-red-500';
    if (c === 'HARD' || c === 'SEVERE') return 'text-orange-500';
    if (c === 'MODERATE' || c === 'WARNING') return 'text-amber-500';
    return 'text-green-500';
  };
  const classBg = (c: string) => {
    if (c === 'EXTREME' || c === 'CRITICAL') return 'bg-red-500/10 text-red-500';
    if (c === 'HARD' || c === 'SEVERE') return 'bg-orange-500/10 text-orange-500';
    if (c === 'MODERATE' || c === 'WARNING') return 'bg-amber-500/10 text-amber-500';
    return 'bg-emerald-500/10 text-emerald-500';
  };
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const fmtAbuse = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  const enrichStatus = trip.behaviorEnrichmentStatus;

  // Loading / in-flight state
  if (loading || enrichStatus === 'PENDING' || enrichStatus === 'IN_PROGRESS') {
    return (
      <div className="rounded-lg p-4 mb-3 border border-border bg-card">
        <div className="flex items-center gap-2">
          <Loader2 className={`w-4 h-4 animate-spin ${isDark ? 'text-indigo-400' : 'text-indigo-500'}`} />
          <span className={`text-xs font-medium ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
            {enrichStatus === 'PENDING' ? 'Analysis queued...' : 'Analyzing driving behavior...'}
          </span>
        </div>
      </div>
    );
  }

  // No HF data — permanent skip, no retry
  if (enrichStatus === 'SKIPPED_NO_HF_DATA') {
    return (
      <div className="rounded-lg p-4 mb-3 border border-border bg-card">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className={`w-4 h-4 text-muted-foreground`} />
          <span className={`text-xs font-semibold text-foreground`}>Driving Behavior Analysis</span>
        </div>
        <p className={`text-[10px] text-muted-foreground`}>
          No high-frequency data available for this trip. This may happen for short trips or trips outside sensor coverage.
        </p>
      </div>
    );
  }

  // Permanent failure — no retry
  if (enrichStatus === 'FAILED_PERMANENT') {
    return (
      <div className="rounded-lg p-4 mb-3 border border-border bg-card">
        <div className="flex items-center gap-2 mb-1">
          <AlertCircle className={`w-4 h-4 text-destructive`} />
          <span className={`text-xs font-semibold text-foreground`}>Driving Behavior Analysis</span>
        </div>
        <p className={`text-[10px] text-muted-foreground`}>
          Analysis is not possible for this trip due to a permanent data issue.
        </p>
      </div>
    );
  }

  // Transient failure — show retry button
  if (enrichStatus === 'FAILED_TRANSIENT') {
    return (
      <div className="rounded-lg p-4 mb-3 border border-border bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />
            <span className={`text-xs font-semibold text-foreground`}>Driving Behavior Analysis</span>
          </div>
          <button onClick={onEnrich} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isDark ? 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}>
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
        <p className={`text-[10px] mt-1.5 text-muted-foreground`}>
          Analysis failed due to a temporary issue. You can retry now.
        </p>
      </div>
    );
  }

  const behaviorIsReady = trip.behaviorReady ?? !!trip.behaviorEnrichedAt;

  // Not yet processed — show analyze button
  if (!behaviorIsReady) {
    return (
      <div className="rounded-lg p-4 mb-3 border border-border bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className={`w-4 h-4 ${isDark ? 'text-indigo-400' : 'text-indigo-500'}`} />
            <span className={`text-xs font-semibold text-foreground`}>Driving Behavior Analysis</span>
          </div>
          <button onClick={onEnrich} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isDark ? 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
            <Activity className="w-3.5 h-3.5" /> Analyze Behavior
          </button>
        </div>
        <p className={`text-[10px] mt-1.5 text-muted-foreground`}>
          Run high-frequency analysis to detect acceleration, braking, and abuse events
        </p>
      </div>
    );
  }

  const sections = [
    {
      key: 'accel',
      label: 'Acceleration',
      icon: <ArrowUp className="w-3.5 h-3.5" />,
      count: trip.totalAccelerationEvents ?? trip.accelerationEventCount ?? accelEvents.length,
      hardCount: trip.hardAccelerationEvents ?? trip.hardAccelerationCount ?? 0,
      events: accelEvents,
      color: isDark ? 'text-blue-400' : 'text-blue-600',
    },
    {
      key: 'brake',
      label: 'Braking',
      icon: <ArrowDown className="w-3.5 h-3.5" />,
      count: trip.totalBrakingEvents ?? trip.brakingEventCount ?? brakeEvents.length,
      hardCount: trip.hardBrakingEvents ?? trip.hardBrakingCount ?? 0,
      events: brakeEvents,
      color: isDark ? 'text-orange-400' : 'text-orange-600',
    },
    {
      key: 'abuse',
      label: 'Abuse Detection',
      icon: <Shield className="w-3.5 h-3.5" />,
      count: trip.abuseEvents ?? trip.abuseEventCount ?? abuseEvents.length,
      hardCount: 0,
      events: abuseEvents,
      color: isDark ? 'text-red-400' : 'text-red-600',
    },
  ];

  return (
    <div className="space-y-2 mb-3">
      {sections.map((sec) => (
        <div key={sec.key} className="rounded-lg border border-border overflow-hidden bg-card">
          <button onClick={() => onToggleSection(sec.key)}
            className="w-full flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-accent/50">
            <div className="flex items-center gap-2">
              <span className={sec.color}>{sec.icon}</span>
              <span className={`text-xs font-semibold text-foreground`}>{sec.label}</span>
              <span className={`px-1 py-px rounded text-[10px] font-bold ${sec.count > 0 ? (sec.hardCount > 0 ? classBg('HARD') : classBg('MODERATE')) : classBg('LIGHT')}`}>
                {sec.count}
              </span>
              {sec.hardCount > 0 && (
                <span className={`text-[10px] ${classColor('HARD')}`}>{sec.hardCount} hard</span>
              )}
            </div>
            <div className={`text-muted-foreground`}>
              {expandedSection === sec.key ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>

          {expandedSection === sec.key && (
            <div className={`px-4 pb-3 border-t border-border`}>
              {sec.events.length === 0 ? (
                <p className={`text-[11px] py-3 text-muted-foreground`}>No individual event records found for this trip</p>
              ) : (
                <div className="space-y-2 mt-2">
                  {sec.events.slice(0, 50).map((ev) => (
                    <div key={ev.id} className="rounded-lg border border-border p-2.5 bg-card">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-1 py-px rounded text-[9px] font-bold ${classBg(ev.classification)}`}>
                            {ev.classification}
                          </span>
                          <span className={`text-[11px] font-semibold text-foreground`}>
                            {sec.key === 'abuse' ? fmtAbuse(ev.eventType) : (ev.eventType === ev.eventCategory ? sec.label : fmtAbuse(ev.eventType))}
                          </span>
                        </div>
                        <span className={`text-[10px] font-medium text-muted-foreground`}>
                          {fmtTime(ev.startedAt)}
                          {ev.endedAt && ev.endedAt !== ev.startedAt ? ` – ${fmtTime(ev.endedAt)}` : ''}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {ev.durationMs != null && (
                          <EventDetail isDark={isDark} label="Duration" value={ev.durationMs >= 1000 ? `${(ev.durationMs / 1000).toFixed(1)}s` : `${ev.durationMs}ms`} />
                        )}
                        {sec.key !== 'abuse' && ev.startSpeedKmh != null && (
                          <EventDetail isDark={isDark} label="Speed" value={ev.endSpeedKmh != null ? `${ev.startSpeedKmh.toFixed(0)} → ${ev.endSpeedKmh.toFixed(0)} km/h` : `${ev.startSpeedKmh.toFixed(0)} km/h`} />
                        )}
                        {sec.key !== 'abuse' && ev.peakValue != null && (
                          <EventDetail isDark={isDark} label="Intensity" value={`${ev.peakValue.toFixed(2)} ${ev.peakValueUnit === 'm/s²' ? 'm/s²' : ev.peakValueUnit ?? ''}`} highlight={ev.classification === 'HARD' || ev.classification === 'EXTREME'} />
                        )}
                        {sec.key !== 'abuse' && ev.peakG != null && (
                          <EventDetail isDark={isDark} label="G-Force" value={`${ev.peakG.toFixed(2)}g`} highlight={ev.peakG > 0.4} />
                        )}
                        {sec.key === 'abuse' && ev.peakValue != null && (
                          <EventDetail isDark={isDark} label="Peak" value={`${ev.peakValue.toFixed(1)} ${ev.peakValueUnit ?? ''}`} />
                        )}
                        {ev.maxThrottlePos != null && (
                          <EventDetail isDark={isDark} label="Throttle" value={`${ev.maxThrottlePos.toFixed(0)}%`} />
                        )}
                        {ev.maxEngineRpm != null && (
                          <EventDetail isDark={isDark} label="RPM" value={`${ev.maxEngineRpm.toFixed(0)}`} />
                        )}
                        {ev.maxCoolantTemp != null && (
                          <EventDetail isDark={isDark} label="Coolant" value={`${ev.maxCoolantTemp.toFixed(0)}°C`} />
                        )}
                        {ev.latitude != null && ev.longitude != null && (
                          <EventDetail isDark={isDark} label="Location"
                            value={`${ev.latitude.toFixed(4)}, ${ev.longitude.toFixed(4)}`}
                            icon={<MapPin className="w-2.5 h-2.5" />} />
                        )}
                        {ev.source === 'DRIVING_EVENT' && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-500">LTE</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {sec.events.length > 50 && (
                    <p className={`text-[10px] mt-1 text-muted-foreground`}>Showing first 50 of {sec.events.length} events</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Metric({ isDark, label, value, color, icon }: { isDark: boolean; label: string; value: string; color?: 'green' | 'blue' | 'orange' | 'red'; icon?: React.ReactNode }) {
  const colorClass = color === 'green' ? 'text-green-500'
    : color === 'blue' ? 'text-blue-500'
    : color === 'orange' ? 'text-orange-500'
    : color === 'red' ? 'text-red-500' : 'text-foreground';
  return (
    <div className="text-right">
      <div className={`text-[10px] mb-0.5 text-muted-foreground`}>{label}</div>
      <div className={`text-xs font-bold flex items-center justify-end gap-0.5 ${colorClass}`}>{icon}{value}</div>
    </div>
  );
}

function StatCell({ isDark, label, value, warn }: { isDark: boolean; label: string; value: string | number; warn?: boolean }) {
  return (
    <div>
      <div className={`text-[10px] uppercase tracking-wider font-semibold mb-1 text-muted-foreground`}>{label}</div>
      <div className={`text-xs font-bold ${warn ? 'text-orange-500' : 'text-green-500'}`}>{value}</div>
    </div>
  );
}

function RoadRow({ isDark, color, label, percent, km }: { isDark: boolean; color: string; label: string; percent: number; km?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-sm ${color}`} />
      <span className={`text-[11px] font-semibold w-8 text-foreground`}>{percent}%</span>
      <span className={`text-[10px] flex-1 text-muted-foreground`}>{label}</span>
      {km != null && km > 0 && <span className={`text-[10px] font-medium text-muted-foreground`}>{km.toFixed(1)} km</span>}
    </div>
  );
}
