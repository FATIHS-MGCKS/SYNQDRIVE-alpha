import { Navigation } from 'lucide-react';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Icon } from './ui/Icon';
import { api } from '../../lib/api';
import type { TripEnrichment, TripBehaviorEvent, SpeedingSection, EnergyEvent } from '../../lib/api';
import { buildTripsMapGeoJson } from '../../lib/geospatial';
import { useAddress } from '../../lib/useAddress';
import { useRentalOrg } from '../RentalContext';
import { MisuseCasesPanel } from './MisuseCasesPanel';
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
  endTime?: string | null;
  startLatitude?: number;
  startLongitude?: number;
  endLatitude?: number;
  endLongitude?: number;
  distanceKm?: number | null;
  durationMinutes?: number;
  avgSpeedKmh?: number;
  maxSpeedKmh?: number;
  // V4.6.95 — `drivingScore` is a legacy compatibility mirror. Prefer
  // `drivingStyleScore` everywhere. Both are 0–100 model scores, never %.
  drivingScore?: number | null;
  drivingStyleScore?: number | null;
  // V4.6.95 — `safetyScore` is null when route / speed-limit data is
  // unavailable. Never coerce to 0/100.
  safetyScore?: number | null;
  hasSpeedingData?: boolean;
  safetyDataConfidence?: 'none' | 'low' | 'medium' | 'high';
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
  // V4.6.95 — `ASSIGNED_USER` / `USER` removed; trip assignment is DRIVER or BOOKING_CUSTOMER.
  assignmentStatus?: 'ASSIGNED_DRIVER' | 'ASSIGNED_BOOKING_CUSTOMER' | 'PRIVATE_UNASSIGNED' | 'UNKNOWN_ASSIGNMENT' | null;
  assignmentSubjectType?: 'DRIVER' | 'BOOKING_CUSTOMER' | null;
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

/**
 * Builds a UTC ISO timestamp for the start of a **local** calendar day.
 *
 * V4.6.71 — We cannot send `${dateYMD}T00:00:00.000Z` to the backend: the
 * trailing `Z` forces UTC-midnight interpretation, but the date picker
 * (HTML5 `<input type="date">`) yields the user's **local** calendar
 * day. In CEST/CET that misalignment erases 1–2 hours of trips per day:
 * a trip recorded in Europe at 01:55 local time has a UTC start of
 * 23:55 on the **previous** day, so a UTC-midnight filter for today
 * never matches it even though the operator selected today in the
 * picker. The explicit constructor below pins the range to the
 * browser's local timezone offset, then serialises to ISO-UTC for the
 * backend filter — startTime.gte / startTime.lte now fall on the same
 * local calendar day the user actually clicked.
 */
function localDayRangeIso(dateYMD: string): { from: string; to: string } {
  const [y, m, d] = dateYMD.split('-').map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  const end = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function TripsView({ isDarkMode, vehicleId, selectedDate, selectedDriver, fuelType, onTripsLoaded }: TripsViewProps) {
  const { orgId } = useRentalOrg();
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
  const [energyEvents, setEnergyEvents] = useState<EnergyEvent[]>([]);
  const [mapShowSpeed, setMapShowSpeed] = useState(true);
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
    if (!vehicleId) {
      setTrips([]);
      setEnergyEvents([]);
      onTripsLoadedRef.current?.([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      // V4.6.71 — Build the from/to range from the **local** calendar day,
      // not a UTC-day window. See `localDayRangeIso` for the rationale.
      const range = selectedDate ? localDayRangeIso(selectedDate) : undefined;
      const from = range?.from;
      const to = range?.to;
      const driver = selectedDriver && selectedDriver !== 'all' ? selectedDriver : undefined;
      // Trips + energy events are fetched in parallel so the timeline renders
      // in a single paint. Refuel/recharge events failing independently never
      // block trip rendering (catch is scoped).
      const [tripsData, eventsData] = await Promise.all([
        api.vehicleIntelligence.trips(vehicleId, { from, to, driver }),
        api.vehicleIntelligence
          .energyEvents(vehicleId, { from, to })
          .catch(() => [] as EnergyEvent[]),
      ]);
      const list = (tripsData ?? []) as TripData[];
      setTrips(list);
      setEnergyEvents(eventsData ?? []);
      onTripsLoadedRef.current?.(list);
    } catch {
      setTrips([]);
      setEnergyEvents([]);
      setLoadError('Failed to load trips');
      onTripsLoadedRef.current?.([]);
    }
    setLoading(false);
  }, [vehicleId, selectedDate, selectedDriver]);

  useEffect(() => { loadTrips(); }, [loadTrips]);

  // Canonical render feed for the Trip History list: trips + refuel / recharge
  // events sorted by startTime DESC so refuels appear inline between the
  // trips surrounding them. Discriminated-union items let the render loop
  // branch cleanly without overloading TripData with event fields.
  type TimelineItem =
    | { itemType: 'trip'; id: string; startTime: string; trip: TripData }
    | { itemType: 'energy-event'; id: string; startTime: string; event: EnergyEvent };

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const tripItems: TimelineItem[] = trips.map((trip) => ({
      itemType: 'trip',
      id: trip.id,
      startTime: trip.startTime,
      trip,
    }));
    const eventItems: TimelineItem[] = energyEvents.map((event) => ({
      itemType: 'energy-event',
      id: event.id,
      startTime: event.startTime,
      event,
    }));
    return [...tripItems, ...eventItems].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
  }, [trips, energyEvents]);

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

  // V4.6.89 — Keep Mapbox canvas in sync with container size.
  // Required because the map card now switches between stacked (full width,
  // fixed 420px) and side-by-side (flex-1 fills sticky column height) layouts
  // on the xl breakpoint. Without a manual resize() the canvas stays locked
  // to its mount-time dimensions and the map either crops or leaves a gap.
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const map = mapRef.current;
      if (!map) return;
      try { map.resize(); } catch { /* mapbox not ready yet */ }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // ── Map data update ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const routeSrc = map.getSource('trips-routes') as mapboxgl.GeoJSONSource | undefined;
    const speedSrc = map.getSource('speed-route') as mapboxgl.GeoJSONSource | undefined;
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
      if (stopsSrc) stopsSrc.setData({ type: 'FeatureCollection', features: [] });
      if (selectedTrip?.startLatitude != null && selectedTrip?.startLongitude != null) {
        map.flyTo({ center: [selectedTrip.startLongitude, selectedTrip.startLatitude], zoom: 13 });
      }
    }
  }, [mapGeoJson, selectedTrip, routePoints, behaviorEvents, mapShowDrivingEvents, mapShowAbuseEvents, mapLoaded]);

  // ── Toggle layer visibility ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const setVis = (id: string, visible: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    };
    setVis('speed-route-layer', mapShowSpeed);
    setVis('stop-points-ring', mapShowStops);
    setVis('stop-points-center', mapShowStops);
  }, [mapShowSpeed, mapShowStops, mapLoaded]);

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
  return (
    <div className="max-w-[1600px] mx-auto">
      {/* V4.6.89 — Map + Trip List side-by-side on xl+ screens (map left sticky, list right scrollable).
          Below xl (<1280px) falls back to the original stacked layout. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-3 items-start">
      {/* Map */}
      <div className="rounded-xl p-4 shadow-sm border border-border bg-card flex flex-col xl:sticky xl:top-2 xl:self-start xl:h-[calc(100vh-120px)] xl:min-h-[560px]">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon name="route" className={`w-[18px] h-[18px] shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
            <h2 className="text-[12px] font-semibold tracking-[-0.003em] truncate text-foreground">
              {selectedTrip ? `Trip Route – ${formatDate(selectedTrip.startTime)}` : 'Trip Route Map'}
            </h2>
            {selectedTrip && enrichments[selectedTrip.id]?.mapMatchConfidence > 0 && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-500">Map Matched</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {syncMessage && (
              <span className={`text-[11px] ${(syncMessage.includes('No missing') || syncMessage.includes('repaired') || syncMessage.includes('found')) ? (isDark ? 'text-green-400' : 'text-green-600') : isDark ? 'text-amber-400' : 'text-amber-600'}`}>{syncMessage}</span>
            )}
            <button onClick={handleSync} disabled={syncing || !vehicleId}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${isDark ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' : 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)] hover:bg-[color:color-mix(in_srgb,var(--brand)_14%,transparent)]'} disabled:opacity-50`}>
              <Icon name="refresh-cw" className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Check for Missing Trips</span>
              <span className="sm:hidden">Sync</span>
            </button>
          </div>
        </div>

        {/* Filter / legend bar */}
        {selectedTrip && routePoints.length > 0 && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 mb-2 rounded-lg border flex-wrap bg-muted border-border">
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
              <Icon name="gauge" className="w-3 h-3" /> Speed
            </button>

            {/* Toggle: Driving Events */}
            <button onClick={() => setMapShowDrivingEvents((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all ${
                mapShowDrivingEvents
                  ? 'bg-orange-500/10 text-orange-500 border border-orange-500/30'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}>
              <Icon name="zap" className="w-3 h-3" /> Events
            </button>

            {/* Toggle: Abuse Events */}
            <button onClick={() => setMapShowAbuseEvents((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all ${
                mapShowAbuseEvents
                  ? 'bg-red-500/10 text-red-500 border border-red-500/30'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}>
              <Icon name="shield" className="w-3 h-3" /> Abuse
            </button>

            {/* Toggle: Stops */}
            <button onClick={() => setMapShowStops((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all ${
                mapShowStops
                  ? 'bg-slate-500/10 text-slate-500 border border-slate-500/30'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}>
              <Icon name="clock" className="w-3 h-3" /> Stops
            </button>
          </div>
        )}

        <div className="relative w-full h-[420px] xl:h-auto xl:flex-1 xl:min-h-[360px] rounded-xl overflow-hidden border border-border">
          <div ref={mapContainerRef} className="w-full h-full" />
          {/* Map loading overlay */}
          {!mapLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70 z-10">
              <div className="flex flex-col items-center gap-2">
                <Icon name="loader-2" className={`w-6 h-6 animate-spin ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                <span className={`text-xs font-medium text-muted-foreground`}>Loading map...</span>
              </div>
            </div>
          )}
          {/* Route data loading overlay */}
          {routeLoading && mapLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/40 z-10">
              <div className="flex flex-col items-center gap-2">
                <Icon name="loader-2" className={`w-6 h-6 animate-spin ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                <span className={`text-xs font-medium text-foreground`}>Loading route data...</span>
              </div>
            </div>
          )}
          {/* Enrichment loading overlay */}
          {selectedTrip && enrichingId === selectedTrip.id && mapLoaded && !routeLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/30 z-10">
              <div className="flex flex-col items-center gap-2">
                <Icon name="loader-2" className={`w-5 h-5 animate-spin ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
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
                <span className="w-2.5 h-2.5 rounded-full border-2 border-slate-400" style={{ borderStyle: 'solid' }} />
                <span className={`text-[8px] text-muted-foreground`}>Stop</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Trip List */}
      <div className="rounded-xl p-4 shadow-sm border border-border bg-card min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">
            Trip History <span className="text-muted-foreground font-medium">({trips.length}{energyEvents.length > 0 ? ` · ${energyEvents.length} events` : ''})</span>
          </h2>
          {loading && <Icon name="loader-2" className="w-4 h-4 animate-spin text-[color:var(--brand)]" />}
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
              <Icon name="refresh-cw" className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Check for Missing Trips
            </button>
          </div>
        )}

        <div className="space-y-1.5">
          {timelineItems.map((item) => {
            if (item.itemType === 'energy-event') {
              return (
                <EnergyEventCard
                  key={item.id}
                  event={item.event}
                  isDark={isDark}
                />
              );
            }
            const trip = item.trip;
            const enr = enrichments[trip.id];
            const isSelected = selectedTrip?.id === trip.id;
            const events = totalEvents(trip);
            const isOngoing = trip.tripStatus === 'ONGOING';
            // V4.6.95 — `drivingStyleScore` is the canonical scalar.
            // `drivingScore` is a legacy compat mirror retained only for
            // older trips where the canonical column is not yet populated.
            // We never show a separate "Driving Score" anywhere in the UI.
            const styleScore = trip.drivingStyleScore ?? trip.drivingScore ?? null;
            const safetyScore = trip.safetyScore ?? null;

            return (
              <div key={trip.id} onClick={() => handleSelectTrip(trip)}
                className={`group rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden ${
                  isSelected
                    ? (isDark ? 'bg-accent/30 border-blue-500/30 shadow-sm' : 'bg-blue-50/30 border-blue-200 shadow-sm')
                    : 'bg-card border-border hover:border-muted-foreground/30 hover:shadow-md'
                }`}>
                <div className="p-3 sm:p-4 @container">
                  {/* ── Header ─────────────────────────────────────────────── */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        isOngoing
                          ? (isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-600')
                          : (isSelected
                              ? (isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600')
                              : (isDark ? 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-300' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-600'))
                      }`}>
                        {isOngoing ? <Icon name="play" className="w-4.5 h-4.5 ml-0.5" /> : <Navigation className="w-4.5 h-4.5" />}
                      </div>
                      <div className="flex flex-col min-w-0 pt-0.5">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-[10px] font-bold text-foreground">{formatDate(trip.startTime)}</span>
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {formatTime(trip.startTime)} – {trip.endTime ? formatTime(trip.endTime) : '...'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                            isOngoing ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'
                          }`}>
                            {isOngoing ? 'ongoing' : 'completed'}
                          </span>
                          {trip.detailsLimited && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-muted text-muted-foreground" title="Some trip details are unavailable">Limited</span>
                          )}
                          {trip.behaviorReady === false && !trip.detailsLimited && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-500/10 text-blue-400" title="Behavior analysis in progress">Analyzing</span>
                          )}
                          {trip.gapEnded && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-muted text-muted-foreground">Gap</span>
                          )}
                          {trip.driverName && (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                              <Icon name="user" className="w-3 h-3" />{trip.driverName}
                            </span>
                          )}
                          {(trip.isPrivateTrip || trip.assignmentStatus === 'PRIVATE_UNASSIGNED') && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400">
                              Private
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={`p-1.5 rounded-full transition-colors shrink-0 ${
                      isSelected
                        ? (isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600')
                        : 'text-muted-foreground group-hover:bg-muted'
                    }`}>
                      {isSelected ? <Icon name="chevron-up" className="w-4 h-4" /> : <Icon name="chevron-down" className="w-4 h-4" />}
                    </div>
                  </div>

                  {/* ── Metrics Grid (Bento) ─────────────────────────────────── */}
                  {/* V4.6.96 — Container-query grid: grows columns as the Trip
                      History card itself widens, not the viewport. xl
                      side-by-side layout (~415 px card) → 4 cols, stacked
                      layout (~520 px+) → 5 cols. Reduces tile width so the
                      bento doesn't "stretch" the second row's tiles. */}
                  <div className="grid grid-cols-2 @[24rem]:grid-cols-4 @[30rem]:grid-cols-5 gap-1.5">
                    <MetricTile isDark={isDark} label="Distance" value={formatDistance(trip.distanceKm)} icon={<Icon name="route" className="w-3 h-3" />} />
                    <MetricTile isDark={isDark} label="Duration" value={formatDuration(trip.durationMinutes)} icon={<Icon name="clock" className="w-3 h-3" />} />
                    <MetricTile isDark={isDark} label="Events"
                      value={events === null ? '…' : String(events)}
                      color={events === null ? undefined : events > 0 ? 'orange' : 'green'}
                      icon={<Icon name="zap" className="w-3 h-3" />} />
                    <MetricTile isDark={isDark} label="Driving Style"
                      value={styleScore != null ? <>{Math.round(styleScore)}<span className="text-muted-foreground font-normal text-[8px] ml-0.5">/100</span></> : '--'}
                      color={styleScore != null ? (styleScore >= 90 ? 'green' : styleScore >= 75 ? 'blue' : 'orange') : undefined}
                      icon={<Icon name="award" className="w-3 h-3" />} />
                    <MetricTile isDark={isDark} label="Safety"
                      value={safetyScore != null ? <>{Math.round(safetyScore)}<span className="text-muted-foreground font-normal text-[8px] ml-0.5">/100</span></> : '--'}
                      color={safetyScore != null ? (safetyScore >= 90 ? 'green' : safetyScore >= 75 ? 'blue' : 'orange') : undefined}
                      icon={<Icon name="shield" className="w-3 h-3" />} />
                  </div>

                </div>

                {/* Expanded Detail */}
                {isSelected && (
                  <div className={`px-4 pb-4 pt-0`} onClick={(e) => e.stopPropagation()}>
                    <div className="pt-4 border-t border-border/40 space-y-3">
                      {enrichingId === trip.id && (
                        <div className={`flex items-center gap-1.5 text-[11px] font-medium ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                          <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> Enriching trip data...
                        </div>
                      )}

                      {/* A. Addresses (Start | End) */}
                      <TripAddresses trip={trip} isDark={isDark} />

                      {/* B. Driving Behavior Analysis (collapsible Accel / Brake / Abuse) */}
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

                      {orgId && trip.tripStatus === 'COMPLETED' && (
                        <MisuseCasesPanel
                          orgId={orgId}
                          tripId={trip.id}
                          vehicleId={vehicleId}
                          title="Prüffälle für diesen Trip"
                          compact
                          limit={5}
                        />
                      )}

                      {/* C. Engine telemetry (Load / Throttle) */}
                      <div className={`rounded-xl border p-3 ${isDark ? 'bg-white/[0.02] border-white/[0.05]' : 'bg-slate-50/50 border-slate-100'}`}>
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <Icon name="activity" className={`w-3.5 h-3.5 ${isDark ? 'text-cyan-400' : 'text-cyan-500'}`} />
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Engine</span>
                        </div>

                        {(() => {
                          const hasEngine =
                            trip.avgEngineLoad != null ||
                            trip.avgThrottlePosition != null;

                          if (!hasEngine) {
                            return (
                              <p className="text-[11px] text-muted-foreground">
                                No {isEv ? 'energy' : 'engine'} telemetry available
                              </p>
                            );
                          }

                          return (
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                              {trip.avgEngineLoad != null && (
                                <span className="text-muted-foreground">
                                  Load <span className="text-foreground font-bold tabular-nums">{trip.avgEngineLoad.toFixed(0)}%</span>
                                </span>
                              )}
                              {trip.avgThrottlePosition != null && (
                                <span className="text-muted-foreground">
                                  Throttle <span className="text-foreground font-bold tabular-nums">{trip.avgThrottlePosition.toFixed(0)}%</span>
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* E. Map match confidence — tiny footer */}
                      {(enr?.mapMatchConfidence ?? 0) > 0 && (
                        <p className="text-[9px] text-muted-foreground text-center pt-1">
                          Map match confidence: <span className="font-semibold tabular-nums">{Math.round((enr?.mapMatchConfidence ?? 0) * 100)}%</span>
                        </p>
                      )}
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
        <Icon name="map-pin" className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
        <div className="min-w-0">
          <div className={`text-[9px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>Start</div>
          {startLoading ? (
            <Icon name="loader-2" className={`w-3 h-3 animate-spin text-muted-foreground`} />
          ) : (
            <div className={`text-[10px] font-medium truncate text-foreground`}>
              {startAddr?.formatted ?? '—'}
            </div>
          )}
        </div>
      </div>
      <div className={`flex items-start gap-2 p-2 rounded-lg bg-muted`}>
        <Icon name="map-pin" className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
        <div className="min-w-0">
          <div className={`text-[9px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>End</div>
          {endLoading ? (
            <Icon name="loader-2" className={`w-3 h-3 animate-spin text-muted-foreground`} />
          ) : (
            <div className={`text-[10px] font-medium truncate text-foreground`}>
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
          <Icon name="loader-2" className={`w-4 h-4 animate-spin ${isDark ? 'text-indigo-400' : 'text-indigo-500'}`} />
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
          <Icon name="bar-chart-3" className={`w-4 h-4 text-muted-foreground`} />
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
          <Icon name="alert-circle" className={`w-4 h-4 text-destructive`} />
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
            <Icon name="alert-triangle" className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />
            <span className={`text-xs font-semibold text-foreground`}>Driving Behavior Analysis</span>
          </div>
          <button onClick={onEnrich} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isDark ? 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}`}>
            <Icon name="refresh-cw" className="w-3.5 h-3.5" /> Retry
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
            <Icon name="bar-chart-3" className={`w-4 h-4 ${isDark ? 'text-indigo-400' : 'text-indigo-500'}`} />
            <span className={`text-xs font-semibold text-foreground`}>Driving Behavior Analysis</span>
          </div>
          <button onClick={onEnrich} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isDark ? 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
            <Icon name="activity" className="w-3.5 h-3.5" /> Analyze Behavior
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
      icon: <Icon name="arrow-up" className="w-3.5 h-3.5" />,
      count: trip.totalAccelerationEvents ?? trip.accelerationEventCount ?? accelEvents.length,
      hardCount: trip.hardAccelerationEvents ?? trip.hardAccelerationCount ?? 0,
      events: accelEvents,
      color: isDark ? 'text-blue-400' : 'text-blue-600',
    },
    {
      key: 'brake',
      label: 'Braking',
      icon: <Icon name="arrow-down" className="w-3.5 h-3.5" />,
      count: trip.totalBrakingEvents ?? trip.brakingEventCount ?? brakeEvents.length,
      hardCount: trip.hardBrakingEvents ?? trip.hardBrakingCount ?? 0,
      events: brakeEvents,
      color: isDark ? 'text-orange-400' : 'text-orange-600',
    },
    {
      key: 'abuse',
      label: 'Abuse Detection',
      icon: <Icon name="shield" className="w-3.5 h-3.5" />,
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
              <span className={`text-[10px] font-semibold text-foreground`}>{sec.label}</span>
              <span className={`px-1 py-px rounded text-[10px] font-bold ${sec.count > 0 ? (sec.hardCount > 0 ? classBg('HARD') : classBg('MODERATE')) : classBg('LIGHT')}`}>
                {sec.count}
              </span>
              {sec.hardCount > 0 && (
                <span className={`text-[10px] ${classColor('HARD')}`}>{sec.hardCount} hard</span>
              )}
            </div>
            <div className={`text-muted-foreground`}>
              {expandedSection === sec.key ? <Icon name="chevron-up" className="w-3.5 h-3.5" /> : <Icon name="chevron-down" className="w-3.5 h-3.5" />}
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
                            icon={<Icon name="map-pin" className="w-2.5 h-2.5" />} />
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

function MetricTile({ isDark, label, value, color, icon }: { isDark: boolean; label: string; value: React.ReactNode; color?: 'green' | 'blue' | 'orange' | 'red'; icon?: React.ReactNode }) {
  const colorClass = color === 'green' ? (isDark ? 'text-emerald-400' : 'text-emerald-600')
    : color === 'blue' ? (isDark ? 'text-blue-400' : 'text-blue-600')
    : color === 'orange' ? (isDark ? 'text-amber-400' : 'text-amber-600')
    : color === 'red' ? (isDark ? 'text-red-400' : 'text-red-600') : 'text-foreground';

  const bgClass = isDark ? 'bg-white/[0.02] border-white/[0.05]' : 'bg-slate-50/50 border-slate-100';

  return (
    <div className={`px-1.5 py-1.5 rounded-[10px] border ${bgClass} flex flex-col justify-center min-w-0`}>
      <div className="flex items-center gap-1 mb-0.5">
        {icon && <span className="text-muted-foreground shrink-0 opacity-70">{icon}</span>}
        <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground truncate" title={label}>{label}</span>
      </div>
      <div className={`text-[10px] font-bold tabular-nums truncate ${colorClass}`}>
        {value}
      </div>
    </div>
  );
}

// ── Energy-event card (Refuel / Recharge) ─────────────────────────────────
// Rendered inline in the Trip History list between trips. Deliberately lower
// visual weight than a trip card: single row, event-specific tint, concise
// delta readout. Does NOT open a detail panel — refuel / recharge have no
// drill-down behaviour yet (planned in a follow-up for charge-curve graphs).
function EnergyEventCard({ event, isDark }: { event: EnergyEvent; isDark: boolean }) {
  const isRefuel = event.kind === 'REFUEL';
  const date = new Date(event.startTime);
  const end = new Date(event.endTime);
  const dateLabel = date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeLabel = `${date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  })} – ${end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;

  const durationMin = Math.max(1, Math.round(event.durationSeconds / 60));

  let primaryDelta: string | null = null;
  let secondaryDelta: string | null = null;
  if (isRefuel) {
    if (event.fuelDeltaLiters != null) {
      primaryDelta = `+${event.fuelDeltaLiters.toFixed(1)} L`;
    }
    if (event.fuelDeltaPercent != null) {
      secondaryDelta = `+${event.fuelDeltaPercent.toFixed(0)} %`;
    }
  } else {
    if (event.socDeltaPercent != null) {
      primaryDelta = `+${event.socDeltaPercent.toFixed(0)} % SoC`;
    }
    if (event.energyDeltaKwh != null) {
      secondaryDelta = `+${event.energyDeltaKwh.toFixed(1)} kWh`;
    }
  }

  const accentBg = isRefuel
    ? isDark
      ? 'bg-amber-500/15'
      : 'bg-amber-100'
    : isDark
      ? 'bg-emerald-500/15'
      : 'bg-emerald-100';
  const accentText = isRefuel
    ? isDark
      ? 'text-amber-300'
      : 'text-amber-700'
    : isDark
      ? 'text-emerald-300'
      : 'text-emerald-700';
  const pillBg = isRefuel
    ? 'bg-amber-500/10 text-amber-500'
    : 'bg-emerald-500/10 text-emerald-500';

  const confidenceTint =
    event.confidence === 'HIGH'
      ? 'bg-emerald-500/10 text-emerald-500'
      : event.confidence === 'MEDIUM'
        ? 'bg-blue-500/10 text-blue-500'
        : 'bg-muted text-muted-foreground';

  return (
    <div className="rounded-xl border border-border bg-card/40 shadow-sm">
      <div className="p-3 sm:p-4 flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${accentBg}`}
        >
          {isRefuel ? (
            <Icon name="fuel" className={`w-4 h-4 ${accentText}`} />
          ) : (
            <Icon name="battery-charging" className={`w-4 h-4 ${accentText}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10px] font-bold text-foreground">{dateLabel}</span>
            <span className="text-[10px] font-medium text-muted-foreground">{timeLabel}</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${pillBg}`}
            >
              {isRefuel ? 'refuel' : 'recharge'}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${confidenceTint}`}
            >
              {event.confidence}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[10px] font-medium text-muted-foreground">
            {primaryDelta && (
              <span className={`font-semibold ${accentText}`}>{primaryDelta}</span>
            )}
            {secondaryDelta && <span>{secondaryDelta}</span>}
            <span>{durationMin} min</span>
            {event.odometerEndKm != null && (
              <span>@ {Math.round(event.odometerEndKm).toLocaleString()} km</span>
            )}
            {event.startLatitude != null && event.startLongitude != null && (
              <span className="inline-flex items-center gap-1">
                <Icon name="map-pin" className="w-2.5 h-2.5" />
                {event.startLatitude.toFixed(3)}, {event.startLongitude.toFixed(3)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
