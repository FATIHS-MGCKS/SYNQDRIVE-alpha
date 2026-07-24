import { describe, expect, it, vi } from 'vitest';
import {
  captureMapCamera,
  classifyMapRuntimeError,
  mapErrorMessage,
  resolveLiveMapStyle,
  restoreMapCamera,
} from './live-map-instance';

describe('live-map-instance', () => {
  it('resolves light and dark styles', () => {
    expect(resolveLiveMapStyle(false)).toContain('light');
    expect(resolveLiveMapStyle(true)).toContain('dark');
  });

  it('captures and restores camera state', () => {
    const jumpTo = vi.fn();
    const map = {
      getCenter: () => ({ lng: 9.48, lat: 51.31 }),
      getZoom: () => 16,
      getBearing: () => -10,
      getPitch: () => 45,
      jumpTo,
    };

    const camera = captureMapCamera(map as never);
    expect(camera.center).toEqual([9.48, 51.31]);
    restoreMapCamera(map as never, camera);
    expect(jumpTo).toHaveBeenCalledWith({
      center: [9.48, 51.31],
      zoom: 16,
      bearing: -10,
      pitch: 45,
    });
  });

  it('classifies runtime errors', () => {
    expect(classifyMapRuntimeError(new Error('Failed to load style'))).toBe('style_load');
    expect(classifyMapRuntimeError(new Error('WebGL context lost'))).toBe('webgl_context_lost');
    expect(classifyMapRuntimeError(new Error('Failed to fetch'))).toBe('network_unavailable');
    expect(classifyMapRuntimeError(new Error('network'))).toBe('runtime');
  });

  it('returns user-facing map error messages', () => {
    expect(mapErrorMessage('webgl_context_lost')).toMatch(/unterbrochen/i);
    expect(mapErrorMessage('style_load')).toMatch(/Stil/i);
    expect(mapErrorMessage('network_unavailable')).toMatch(/Verbindung/i);
    expect(mapErrorMessage('missing_token')).toMatch(/nicht verfügbar/i);
  });
});
