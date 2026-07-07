import {
  forwardRef,
  useRef,
  useEffect,
  useState,
  useMemo,
  useImperativeHandle,
} from 'react';
import mapboxgl from 'mapbox-gl';
import type { FeatureCollection, Feature, Point, Polygon } from 'geojson';
import type { FleetMapFeatureProperties } from '../rental/stores/useFleetMapStore';
import { FLEET_MAP_TONE_HEX } from '../rental/lib/fleetVisualState';
import { circlePolygon, isValidCoord } from '../lib/geospatial';

if (typeof document !== 'undefined' && !document.getElementById('mapbox-gl-css')) {
  const link = document.createElement('link');
  link.id = 'mapbox-gl-css';
  link.rel = 'stylesheet';
  link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.19.1/mapbox-gl.css';
  document.head.appendChild(link);
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
const MAPBOX_STYLE_LIGHT = import.meta.env.VITE_MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/light-v11';
const MAPBOX_STYLE_DARK = 'mapbox://styles/mapbox/dark-v11';

const PITCH_ZOOM_START = 14;
const PITCH_ZOOM_FULL = 17;
const PITCH_MAX_DEG = 45;
const FOCUS_ZOOM = 15;

function pitchForZoom(z: number): number {
  if (z <= PITCH_ZOOM_START) return 0;
  if (z >= PITCH_ZOOM_FULL) return PITCH_MAX_DEG;
  return ((z - PITCH_ZOOM_START) / (PITCH_ZOOM_FULL - PITCH_ZOOM_START)) * PITCH_MAX_DEG;
}

const SOURCE_ID = 'synq-fleet-vehicles';
const CLUSTER_LAYER_ID = 'synq-fleet-clusters';
const CLUSTER_COUNT_LAYER_ID = 'synq-fleet-cluster-count';
const VEHICLE_LAYER_ID = 'synq-fleet-vehicles-layer';
const VEHICLE_LABEL_LAYER_ID = 'synq-fleet-vehicle-labels';
const SELECTED_LAYER_ID = 'synq-fleet-selected-vehicle';
const SELECTED_PULSE_LAYER_ID = 'synq-fleet-selected-pulse';
const HOVER_LAYER_ID = 'synq-fleet-hovered-vehicle';
const STATIONS_GEOFENCE_SOURCE_ID = 'synq-stations-geofences';
const STATIONS_PIN_SOURCE_ID = 'synq-stations-pins';
const STATIONS_GEOFENCE_FILL_LAYER_ID = 'synq-stations-geofence-fill';
const STATIONS_GEOFENCE_LINE_LAYER_ID = 'synq-stations-geofence-line';
const STATIONS_PIN_CIRCLE_LAYER_ID = 'synq-stations-pin-circle';
const STATIONS_PIN_LABEL_LAYER_ID = 'synq-stations-pin-label';
const STATION_LAYER_IDS = [
  STATIONS_GEOFENCE_FILL_LAYER_ID,
  STATIONS_GEOFENCE_LINE_LAYER_ID,
  STATIONS_PIN_CIRCLE_LAYER_ID,
  STATIONS_PIN_LABEL_LAYER_ID,
] as const;

const DEFAULT_CENTER: [number, number] = [9.4797, 51.3127];

const DIMMED_OPACITY: mapboxgl.Expression = [
  'match',
  ['get', 'mapTone'],
  'offline',
  0.52,
  'stale',
  0.52,
  0.94,
];

const DIMMED_LABEL_OPACITY: mapboxgl.Expression = [
  'match',
  ['get', 'mapTone'],
  'offline',
  0.65,
  'stale',
  0.65,
  1,
];

const FLEET_MAP_TONE_MATCH: mapboxgl.Expression = [
  'match',
  ['get', 'mapTone'],
  'ready',
  FLEET_MAP_TONE_HEX.ready,
  'active',
  FLEET_MAP_TONE_HEX.active,
  'reserved',
  FLEET_MAP_TONE_HEX.reserved,
  'maintenance',
  FLEET_MAP_TONE_HEX.maintenance,
  'blocked',
  FLEET_MAP_TONE_HEX.blocked,
  'offline',
  FLEET_MAP_TONE_HEX.offline,
  'stale',
  FLEET_MAP_TONE_HEX.stale,
  'unknown',
  FLEET_MAP_TONE_HEX.unknown,
  [
    'match',
    ['get', 'status'],
    'Available',
    FLEET_MAP_TONE_HEX.ready,
    'Active Rented',
    FLEET_MAP_TONE_HEX.active,
    'Reserved',
    FLEET_MAP_TONE_HEX.reserved,
    'Maintenance',
    FLEET_MAP_TONE_HEX.maintenance,
    FLEET_MAP_TONE_HEX.unknown,
  ],
];

type FleetFeatureCollection = FeatureCollection<Point, FleetMapFeatureProperties>;

export interface MapboxMapHandle {
  fitAll: () => void;
  locateVehicle: (vehicleId: string) => void;
}

interface StationLike {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
}

interface StationGeofenceProperties {
  stationId: string;
  stationName: string;
  radiusMeters: number;
}

interface StationPinProperties {
  stationId: string;
  stationName: string;
}

export interface MapboxMapProps {
  center?: [number, number];
  zoom?: number;
  fleetGeoJson: FleetFeatureCollection;
  selectedVehicleId?: string | null;
  hoveredVehicleId?: string | null;
  focusVehicleId?: string | null;
  focusNonce?: number;
  onVehicleClick?: (vehicleId: string) => void;
  onVehicleHover?: (vehicleId: string | null) => void;
  className?: string;
  isDarkMode?: boolean;
  interactive?: boolean;
  showStations?: boolean;
  stations?: StationLike[];
}

function sanitizeCenter(center: [number, number]): [number, number] {
  const [lng, lat] = center;
  if (Number.isFinite(lng) && Number.isFinite(lat)) return center;
  return DEFAULT_CENTER;
}

function findVehicleCoordinates(
  fleetGeoJson: FleetFeatureCollection,
  vehicleId: string,
): [number, number] | null {
  const feature = fleetGeoJson.features.find(
    (entry) => entry.properties?.vehicleId === vehicleId,
  );
  if (!feature) return null;
  const [lng, lat] = feature.geometry.coordinates;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

function fitAllFeatures(
  map: mapboxgl.Map,
  fleetGeoJson: FleetFeatureCollection,
): void {
  if (fleetGeoJson.features.length === 0) return;
  const bounds = new mapboxgl.LngLatBounds();
  fleetGeoJson.features.forEach((feature) => {
    bounds.extend(feature.geometry.coordinates as [number, number]);
  });
  map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
}

function flyToVehicle(
  map: mapboxgl.Map,
  fleetGeoJson: FleetFeatureCollection,
  vehicleId: string,
): void {
  const coords = findVehicleCoordinates(fleetGeoJson, vehicleId);
  if (!coords) return;
  map.flyTo({
    center: coords,
    zoom: Math.max(map.getZoom(), FOCUS_ZOOM),
    duration: 700,
    essential: true,
  });
}

export const MapboxMap = forwardRef<MapboxMapHandle, MapboxMapProps>(
  function MapboxMap(
    {
      center = [9.4797, 51.3127],
      zoom = 13,
      fleetGeoJson,
      selectedVehicleId = null,
      hoveredVehicleId = null,
      focusVehicleId = null,
      focusNonce = 0,
      onVehicleClick,
      onVehicleHover,
      className = '',
      isDarkMode = false,
      interactive = true,
      showStations = true,
      stations,
    },
    ref,
  ) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const fleetGeoJsonRef = useRef(fleetGeoJson);
    const onVehicleClickRef = useRef(onVehicleClick);
    const onVehicleHoverRef = useRef(onVehicleHover);
    const sourceSignatureRef = useRef('');
    const stationsSignatureRef = useRef('');
    const lastFocusRef = useRef<{ vehicleId: string | null; nonce: number }>({
      vehicleId: null,
      nonce: 0,
    });
    const hasInitialFitRef = useRef(false);
    const [loaded, setLoaded] = useState(false);
    const [mapError, setMapError] = useState<string | null>(null);

    fleetGeoJsonRef.current = fleetGeoJson;

    const stationsGeo = useMemo(() => {
      const geofenceFeatures: Array<Feature<Polygon, StationGeofenceProperties>> = [];
      const pinFeatures: Array<Feature<Point, StationPinProperties>> = [];
      if (!stations || stations.length === 0) {
        return {
          geofences: { type: 'FeatureCollection' as const, features: geofenceFeatures },
          pins: { type: 'FeatureCollection' as const, features: pinFeatures },
          signature: '',
        };
      }
      const parts: string[] = [];
      for (const s of stations) {
        if (!isValidCoord(s.latitude, s.longitude)) continue;
        const lng = s.longitude as number;
        const lat = s.latitude as number;
        const radius = s.radiusMeters ?? 0;
        if (radius > 0) {
          geofenceFeatures.push({
            type: 'Feature',
            geometry: circlePolygon([lng, lat], radius),
            properties: {
              stationId: s.id,
              stationName: s.name,
              radiusMeters: radius,
            },
          });
        }
        pinFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: { stationId: s.id, stationName: s.name },
        });
        parts.push(`${s.id}:${lng.toFixed(6)}:${lat.toFixed(6)}:${radius}`);
      }
      return {
        geofences: { type: 'FeatureCollection' as const, features: geofenceFeatures },
        pins: { type: 'FeatureCollection' as const, features: pinFeatures },
        signature: parts.join('|'),
      };
    }, [stations]);

    useEffect(() => {
      onVehicleClickRef.current = onVehicleClick;
    }, [onVehicleClick]);

    useEffect(() => {
      onVehicleHoverRef.current = onVehicleHover;
    }, [onVehicleHover]);

    useImperativeHandle(
      ref,
      () => ({
        fitAll: () => {
          const map = mapRef.current;
          if (!map) return;
          fitAllFeatures(map, fleetGeoJsonRef.current);
        },
        locateVehicle: (vehicleId: string) => {
          const map = mapRef.current;
          if (!map) return;
          flyToVehicle(map, fleetGeoJsonRef.current, vehicleId);
        },
      }),
      [loaded],
    );

    const buildDataSignature = (data: FleetFeatureCollection): string =>
      data.features
        .map((feature) => {
          const coordinates = feature.geometry?.coordinates;
          const properties = feature.properties;
          if (!Array.isArray(coordinates) || coordinates.length < 2) return '';
          const lng = typeof coordinates[0] === 'number' ? coordinates[0].toFixed(6) : '0';
          const lat = typeof coordinates[1] === 'number' ? coordinates[1].toFixed(6) : '0';
          return [
            properties?.vehicleId ?? '',
            lng,
            lat,
            properties?.mapTone ?? properties?.status ?? '',
            properties?.heading ?? 0,
          ].join(':');
        })
        .join('|');

    useEffect(() => {
      if (!mapContainer.current || !MAPBOX_TOKEN) return;
      setLoaded(false);
      setMapError(null);
      hasInitialFitRef.current = false;
      sourceSignatureRef.current = '';
      lastFocusRef.current = { vehicleId: null, nonce: 0 };

      let map: mapboxgl.Map;
      try {
        mapboxgl.accessToken = MAPBOX_TOKEN;
        map = new mapboxgl.Map({
          container: mapContainer.current,
          style: isDarkMode ? MAPBOX_STYLE_DARK : MAPBOX_STYLE_LIGHT,
          center: sanitizeCenter(center),
          zoom,
          pitch: pitchForZoom(zoom),
          bearing: 0,
          interactive,
          attributionControl: false,
        });
      } catch (error) {
        setMapError(
          error instanceof Error ? error.message : 'Map initialization failed',
        );
        return;
      }
      mapRef.current = map;

      map.on('load', () => {
        setLoaded(true);

        map.addSource(STATIONS_GEOFENCE_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addSource(STATIONS_PIN_SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        map.addLayer({
          id: STATIONS_GEOFENCE_FILL_LAYER_ID,
          type: 'fill',
          source: STATIONS_GEOFENCE_SOURCE_ID,
          paint: {
            'fill-color': isDarkMode ? '#38bdf8' : '#0ea5e9',
            'fill-opacity': isDarkMode ? 0.1 : 0.08,
          },
        });
        map.addLayer({
          id: STATIONS_GEOFENCE_LINE_LAYER_ID,
          type: 'line',
          source: STATIONS_GEOFENCE_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': isDarkMode ? '#38bdf8' : '#0284c7',
            'line-width': 1.5,
            'line-opacity': isDarkMode ? 0.55 : 0.45,
            'line-dasharray': [2, 2],
          },
        });
        map.addLayer({
          id: STATIONS_PIN_CIRCLE_LAYER_ID,
          type: 'circle',
          source: STATIONS_PIN_SOURCE_ID,
          paint: {
            'circle-radius': 5,
            'circle-color': isDarkMode ? '#0ea5e9' : '#0284c7',
            'circle-stroke-width': 2,
            'circle-stroke-color': isDarkMode ? '#0f172a' : '#ffffff',
          },
        });
        map.addLayer({
          id: STATIONS_PIN_LABEL_LAYER_ID,
          type: 'symbol',
          source: STATIONS_PIN_SOURCE_ID,
          minzoom: 11,
          layout: {
            'text-field': ['coalesce', ['get', 'stationName'], ''],
            'text-size': 10,
            'text-offset': [0, -1.4],
            'text-anchor': 'bottom',
            'text-allow-overlap': false,
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          },
          paint: {
            'text-color': isDarkMode ? '#7dd3fc' : '#0369a1',
            'text-halo-color': isDarkMode ? '#0f172a' : '#ffffff',
            'text-halo-width': 1.4,
          },
        });

        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterRadius: 45,
          clusterMaxZoom: 14,
          promoteId: 'vehicleId',
        });

        map.addLayer({
          id: CLUSTER_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              isDarkMode ? '#1e40af' : '#60a5fa',
              20,
              isDarkMode ? '#2563eb' : '#3b82f6',
              60,
              isDarkMode ? '#3b82f6' : '#2563eb',
            ],
            'circle-radius': ['step', ['get', 'point_count'], 18, 20, 22, 60, 28],
            'circle-opacity': 0.85,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': isDarkMode ? '#0f172a' : '#ffffff',
          },
        });

        map.addLayer({
          id: CLUSTER_COUNT_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 11,
          },
          paint: { 'text-color': '#ffffff' },
        });

        map.addLayer({
          id: SELECTED_PULSE_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'vehicleId'], '']],
          paint: {
            'circle-radius': 16,
            'circle-color': 'rgba(59,130,246,0.12)',
            'circle-stroke-width': 0,
          },
        });

        map.addLayer({
          id: SELECTED_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'vehicleId'], '']],
          paint: {
            'circle-radius': 11,
            'circle-color': 'rgba(59,130,246,0.2)',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#3b82f6',
          },
        });

        map.addLayer({
          id: VEHICLE_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': [
              'case',
              ['==', ['get', 'mapTone'], 'blocked'],
              7,
              ['==', ['get', 'mapTone'], 'maintenance'],
              7,
              6,
            ],
            'circle-color': FLEET_MAP_TONE_MATCH,
            'circle-opacity': DIMMED_OPACITY,
            'circle-stroke-width': [
              'case',
              ['==', ['get', 'mapTone'], 'blocked'],
              2.5,
              ['==', ['get', 'mapTone'], 'maintenance'],
              2,
              1.5,
            ],
            'circle-stroke-color': isDarkMode ? '#0f172a' : '#ffffff',
          },
        });

        map.addLayer({
          id: HOVER_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'vehicleId'], '']],
          paint: {
            'circle-radius': 10,
            'circle-color': 'rgba(59,130,246,0.12)',
            'circle-stroke-width': 2,
            'circle-stroke-color': 'rgba(59,130,246,0.5)',
          },
        });

        map.addLayer({
          id: VEHICLE_LABEL_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          layout: {
            'text-field': ['coalesce', ['get', 'label'], ''],
            'text-size': 10,
            'text-offset': [0, 1.2],
            'text-anchor': 'top',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': isDarkMode ? '#e2e8f0' : '#111827',
            'text-halo-color': isDarkMode ? '#0f172a' : '#ffffff',
            'text-halo-width': 1.2,
            'text-opacity': DIMMED_LABEL_OPACITY,
          },
        });

        map.on('click', CLUSTER_LAYER_ID, (event) => {
          const features = map.queryRenderedFeatures(event.point, {
            layers: [CLUSTER_LAYER_ID],
          });
          const clusterFeature = features[0];
          const clusterId = clusterFeature?.properties?.cluster_id as number | undefined;
          if (clusterId == null) return;
          const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource;
          source.getClusterExpansionZoom(clusterId, (error, zoomLevel) => {
            if (error) return;
            map.easeTo({
              center: (clusterFeature.geometry as Point).coordinates as [number, number],
              zoom: zoomLevel ?? map.getZoom(),
              duration: 450,
            });
          });
        });

        map.on('click', VEHICLE_LAYER_ID, (event) => {
          const feature = event.features?.[0];
          const vehicleId = feature?.properties?.vehicleId;
          if (typeof vehicleId === 'string') {
            onVehicleClickRef.current?.(vehicleId);
          }
        });

        map.on('mousemove', VEHICLE_LAYER_ID, (event) => {
          const feature = event.features?.[0];
          const vehicleId = feature?.properties?.vehicleId;
          onVehicleHoverRef.current?.(
            typeof vehicleId === 'string' ? vehicleId : null,
          );
        });

        map.on('mouseleave', VEHICLE_LAYER_ID, () => {
          onVehicleHoverRef.current?.(null);
        });

        const applyPitchForZoom = () => {
          const targetPitch = pitchForZoom(map.getZoom());
          if (Math.abs(map.getPitch() - targetPitch) > 0.5) {
            map.setPitch(targetPitch);
          }
        };

        // Apply pitch after zoom completes — never easeTo during pinch/wheel zoom
        // (easeTo on every `zoom` event fights touch pinch and feels janky).
        map.on('zoomend', applyPitchForZoom);

        if (interactive) {
          map.touchZoomRotate.enable();
          map.dragPan.enable();
          map.scrollZoom.enable();
        }

        const setPointerCursor = () => {
          map.getCanvas().style.cursor = 'pointer';
        };
        const resetPointerCursor = () => {
          map.getCanvas().style.cursor = '';
        };
        map.on('mouseenter', CLUSTER_LAYER_ID, setPointerCursor);
        map.on('mouseleave', CLUSTER_LAYER_ID, resetPointerCursor);
        map.on('mouseenter', VEHICLE_LAYER_ID, setPointerCursor);
        map.on('mouseleave', VEHICLE_LAYER_ID, resetPointerCursor);
      });

      return () => {
        map.remove();
        mapRef.current = null;
        setLoaded(false);
      };
    }, [isDarkMode, interactive]);

    useEffect(() => {
      if (!loaded || !mapRef.current) return;
      const map = mapRef.current;
      const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (!source) return;

      const nextSignature = buildDataSignature(fleetGeoJson);
      if (nextSignature !== sourceSignatureRef.current) {
        source.setData(fleetGeoJson);
        sourceSignatureRef.current = nextSignature;
      }

      if (
        fleetGeoJson.features.length > 0 &&
        !hasInitialFitRef.current &&
        !selectedVehicleId
      ) {
        hasInitialFitRef.current = true;
        fitAllFeatures(map, fleetGeoJson);
      }
    }, [fleetGeoJson, loaded, selectedVehicleId]);

    const selectionFilter: mapboxgl.FilterSpecification = [
      'all',
      ['!', ['has', 'point_count']],
      ['==', ['get', 'vehicleId'], selectedVehicleId ?? ''],
    ];

    const hoverFilter: mapboxgl.FilterSpecification = [
      'all',
      ['!', ['has', 'point_count']],
      ['==', ['get', 'vehicleId'], hoveredVehicleId ?? ''],
    ];

    useEffect(() => {
      if (!loaded || !mapRef.current) return;
      const map = mapRef.current;
      if (!map.getLayer(SELECTED_LAYER_ID)) return;
      map.setFilter(SELECTED_LAYER_ID, selectionFilter);
      if (map.getLayer(SELECTED_PULSE_LAYER_ID)) {
        map.setFilter(SELECTED_PULSE_LAYER_ID, selectionFilter);
      }
    }, [selectedVehicleId, loaded]);

    useEffect(() => {
      if (!loaded || !mapRef.current) return;
      const map = mapRef.current;
      if (!map.getLayer(HOVER_LAYER_ID)) return;
      map.setFilter(HOVER_LAYER_ID, hoverFilter);
    }, [hoveredVehicleId, loaded]);

    useEffect(() => {
      if (!loaded || !mapRef.current || !focusVehicleId) return;
      if (
        lastFocusRef.current.vehicleId === focusVehicleId &&
        lastFocusRef.current.nonce === focusNonce
      ) {
        return;
      }
      lastFocusRef.current = { vehicleId: focusVehicleId, nonce: focusNonce };
      flyToVehicle(mapRef.current, fleetGeoJson, focusVehicleId);
    }, [focusVehicleId, focusNonce, loaded, fleetGeoJson]);

    useEffect(() => {
      if (!loaded || !mapRef.current) return;
      const map = mapRef.current;
      const geofenceSrc = map.getSource(STATIONS_GEOFENCE_SOURCE_ID) as
        | mapboxgl.GeoJSONSource
        | undefined;
      const pinSrc = map.getSource(STATIONS_PIN_SOURCE_ID) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!geofenceSrc || !pinSrc) return;
      if (stationsGeo.signature === stationsSignatureRef.current) return;
      geofenceSrc.setData(stationsGeo.geofences);
      pinSrc.setData(stationsGeo.pins);
      stationsSignatureRef.current = stationsGeo.signature;
    }, [stationsGeo, loaded]);

    useEffect(() => {
      if (!loaded || !mapRef.current) return;
      const visibility = showStations ? 'visible' : 'none';
      const map = mapRef.current;
      for (const layerId of STATION_LAYER_IDS) {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', visibility);
        }
      }
    }, [showStations, loaded]);

    if (!MAPBOX_TOKEN) {
      return (
        <div
          className={`flex items-center justify-center bg-muted/40 text-muted-foreground text-sm ${className}`}
        >
          <div className="sq-map-liquid-empty px-5 py-4 rounded-2xl text-center max-w-xs pointer-events-none">
            <p className="text-[12px] font-semibold">Map unavailable</p>
            <p className="text-[11px] mt-1 opacity-80">Mapbox token not configured</p>
          </div>
        </div>
      );
    }

    if (mapError) {
      return (
        <div
          className={`flex items-center justify-center bg-muted/40 text-muted-foreground text-sm ${className}`}
        >
          <div className="sq-map-liquid-empty px-5 py-4 rounded-2xl text-center max-w-xs">
            <p className="text-[12px] font-semibold">Map failed to load</p>
            <p className="text-[11px] mt-1 opacity-80">{mapError}</p>
          </div>
        </div>
      );
    }

    return <div ref={mapContainer} className={className} />;
  },
);
