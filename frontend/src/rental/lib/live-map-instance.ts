import type mapboxgl from 'mapbox-gl';

export const LIVE_MAP_LIGHT_STYLE =
  import.meta.env.VITE_MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/light-v11';
export const LIVE_MAP_DARK_STYLE = 'mapbox://styles/mapbox/dark-v11';

export type LiveMapErrorKind =
  | 'missing_token'
  | 'init_failed'
  | 'style_load'
  | 'runtime'
  | 'webgl_context_lost';

export interface LiveMapCameraState {
  center: mapboxgl.LngLatLike;
  zoom: number;
  bearing: number;
  pitch: number;
}

export function resolveLiveMapStyle(isDarkMode: boolean): string {
  return isDarkMode ? LIVE_MAP_DARK_STYLE : LIVE_MAP_LIGHT_STYLE;
}

export function captureMapCamera(map: mapboxgl.Map): LiveMapCameraState {
  const center = map.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

export function restoreMapCamera(map: mapboxgl.Map, camera: LiveMapCameraState): void {
  map.jumpTo({
    center: camera.center,
    zoom: camera.zoom,
    bearing: camera.bearing,
    pitch: camera.pitch,
  });
}

export function mapErrorMessage(kind: LiveMapErrorKind): string {
  switch (kind) {
    case 'missing_token':
      return 'Karte ist derzeit nicht verfügbar.';
    case 'init_failed':
      return 'Karte konnte nicht initialisiert werden.';
    case 'style_load':
      return 'Kartenstil konnte nicht geladen werden.';
    case 'webgl_context_lost':
      return 'Kartenanzeige wurde unterbrochen. Bitte Seite neu laden.';
    case 'runtime':
    default:
      return 'Karte vorübergehend nicht verfügbar.';
  }
}

export function classifyMapRuntimeError(err: unknown): LiveMapErrorKind {
  if (err instanceof Error) {
    if (/style/i.test(err.message)) return 'style_load';
    if (/webgl|context/i.test(err.message)) return 'webgl_context_lost';
  }
  return 'runtime';
}

export function removeMapMarker(marker: mapboxgl.Marker | null | undefined): void {
  marker?.remove();
}

export function detachMapInstance(map: mapboxgl.Map | null | undefined): void {
  if (!map) return;
  try {
    map.remove();
  } catch {
    // Map may already be removed during fast unmount/navigation.
  }
}
