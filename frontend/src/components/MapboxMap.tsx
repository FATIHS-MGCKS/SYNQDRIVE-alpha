import { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { FeatureCollection, Point } from 'geojson';
import type { FleetMapFeatureProperties } from '../rental/stores/useFleetMapStore';

// Inject mapbox-gl CSS once at module load time without relying on bundler CSS pipeline
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
const DEFAULT_CENTER: [number, number] = [9.4797, 51.3127];

type FleetFeatureCollection = FeatureCollection<Point, FleetMapFeatureProperties>;

interface MapboxMapProps {
  center?: [number, number];
  zoom?: number;
  fleetGeoJson: FleetFeatureCollection;
  selectedVehicleId?: string | null;
  onVehicleClick?: (vehicleId: string) => void;
  className?: string;
  isDarkMode?: boolean;
  interactive?: boolean;
}

function sanitizeCenter(center: [number, number]): [number, number] {
  const [lng, lat] = center;
  if (Number.isFinite(lng) && Number.isFinite(lat)) return center;
  return DEFAULT_CENTER;
}

export function MapboxMap({
  center = [9.4797, 51.3127],
  zoom = 13,
  fleetGeoJson,
  selectedVehicleId = null,
  onVehicleClick,
  className = '',
  isDarkMode = false,
  interactive = true,
}: MapboxMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const onVehicleClickRef = useRef(onVehicleClick);
  const sourceSignatureRef = useRef('');
  const [loaded, setLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const hasFittedRef = useRef(false);

  useEffect(() => {
    onVehicleClickRef.current = onVehicleClick;
  }, [onVehicleClick]);

  const buildDataSignature = (
    data: FleetFeatureCollection,
  ): string =>
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
          properties?.status ?? '',
          properties?.heading ?? 0,
        ].join(':');
      })
      .join('|');

  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN) return;
    setLoaded(false);
    setMapError(null);
    hasFittedRef.current = false;
    sourceSignatureRef.current = '';

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
        error instanceof Error
          ? error.message
          : 'Map initialization failed',
      );
      return;
    }
    mapRef.current = map;

    map.on('load', () => {
      setLoaded(true);

      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 45,
        clusterMaxZoom: 14,
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
        paint: {
          'text-color': '#ffffff',
        },
      });

      map.addLayer({
        id: VEHICLE_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 6,
          'circle-color': [
            'match',
            ['get', 'status'],
            'Available',
            '#3b82f6',
            'Active Rented',
            '#8b5cf6',
            'Reserved',
            '#22c55e',
            'Maintenance',
            '#ef4444',
            '#3b82f6',
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': isDarkMode ? '#0f172a' : '#ffffff',
        },
      });

      map.addLayer({
        id: SELECTED_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'vehicleId'], '']],
        paint: {
          'circle-radius': 10,
          'circle-color': 'rgba(59,130,246,0.15)',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#3b82f6',
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
            center: (clusterFeature.geometry as Point).coordinates as [
              number,
              number,
            ],
            zoom: zoomLevel ?? map.getZoom(),
            duration: 400,
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

      map.on('zoom', () => {
        const targetPitch = pitchForZoom(map.getZoom());
        if (Math.abs(map.getPitch() - targetPitch) > 1) {
          map.easeTo({ pitch: targetPitch, duration: 300 });
        }
      });

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

    if (fleetGeoJson.features.length > 0 && !hasFittedRef.current) {
      hasFittedRef.current = true;
      const bounds = new mapboxgl.LngLatBounds();
      fleetGeoJson.features.forEach((feature) => {
        bounds.extend(feature.geometry.coordinates as [number, number]);
      });
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
    }
  }, [fleetGeoJson, loaded]);

  useEffect(() => {
    if (!loaded || !mapRef.current) return;
    const map = mapRef.current;
    if (!map.getLayer(SELECTED_LAYER_ID)) return;
    map.setFilter(SELECTED_LAYER_ID, [
      'all',
      ['!', ['has', 'point_count']],
      ['==', ['get', 'vehicleId'], selectedVehicleId ?? ''],
    ]);
  }, [selectedVehicleId, loaded]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-400 text-sm ${className}`}>
        Mapbox token not configured
      </div>
    );
  }

  if (mapError) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-500 text-sm ${className}`}>
        Map failed to load: {mapError}
      </div>
    );
  }

  return <div ref={mapContainer} className={className} />;
}
