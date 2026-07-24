// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';

type MapHandler = (...args: unknown[]) => void;

vi.hoisted(() => {
  vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token');
});

const { MockMap, MockMarker, mapConstructorOptions } = vi.hoisted(() => {
  const optionsLog: Array<Record<string, unknown>> = [];

  class HoistedMockMarker {
    private lngLat: [number, number] = [0, 0];
    private map: HoistedMockMap | null = null;
    constructor(private readonly options: { element: HTMLElement }) {}
    setLngLat(value: [number, number]) {
      this.lngLat = value;
      return this;
    }
    getLngLat() {
      return { lng: this.lngLat[0], lat: this.lngLat[1] };
    }
    addTo(map: HoistedMockMap) {
      this.map = map;
      map.markers.push(this);
      return this;
    }
    remove() {
      if (!this.map) return;
      this.map.markers = this.map.markers.filter((marker) => marker !== this);
      this.map = null;
    }
  }

  class HoistedMockMap {
    static instances: HoistedMockMap[] = [];
    markers: HoistedMockMarker[] = [];
    handlers = new Map<string, Set<MapHandler>>();
    onceHandlers = new Map<string, Set<MapHandler>>();
    styleUrl: string;
    resize = vi.fn();
    easeTo = vi.fn();
    setStyle = vi.fn(function (this: HoistedMockMap, style: string) {
      this.styleUrl = style;
      this.emit('style.load');
    });
    jumpTo = vi.fn();
    getCenter = () => ({ lng: 9.48, lat: 51.31 });
    getZoom = () => 16;
    getBearing = () => -10;
    getPitch = () => 45;
    project = (point: [number, number]) => ({ x: point[0] * 10, y: point[1] * 10 });
    canvas = document.createElement('canvas');
    removeCalls = 0;
    controls: Array<{ type: string; position?: string }> = [];

    constructor(options: Record<string, unknown>) {
      this.styleUrl = String(options.style ?? '');
      optionsLog.push(options);
      HoistedMockMap.instances.push(this);
      queueMicrotask(() => this.emit('load'));
    }

    on(event: string, handler: MapHandler) {
      const set = this.handlers.get(event) ?? new Set();
      set.add(handler);
      this.handlers.set(event, set);
    }

    once(event: string, handler: MapHandler) {
      const set = this.onceHandlers.get(event) ?? new Set();
      set.add(handler);
      this.onceHandlers.set(event, set);
    }

    off(event: string, handler: MapHandler) {
      this.handlers.get(event)?.delete(handler);
      this.onceHandlers.get(event)?.delete(handler);
    }

    emit(event: string, payload?: unknown) {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(payload);
      }
      const once = this.onceHandlers.get(event);
      if (once) {
        for (const handler of once) {
          handler(payload);
        }
        this.onceHandlers.delete(event);
      }
    }

    addControl = vi.fn(function (
      this: HoistedMockMap,
      control: { __controlType?: string },
      position?: string,
    ) {
      this.controls.push({ type: control.__controlType ?? 'unknown', position });
    });
    getCanvas() {
      return this.canvas;
    }
    remove() {
      this.removeCalls += 1;
      this.markers.forEach((marker) => marker.remove());
      this.markers = [];
      HoistedMockMap.instances = HoistedMockMap.instances.filter((map) => map !== this);
    }
  }

  return {
    MockMap: HoistedMockMap,
    MockMarker: HoistedMockMarker,
    mapConstructorOptions: optionsLog,
  };
});

vi.mock('mapbox-gl', () => {
  class NavigationControl {
    __controlType = 'navigation';
  }
  class AttributionControl {
    __controlType = 'attribution';
    constructor(public readonly options?: { compact?: boolean }) {}
  }
  return {
    default: {
      Map: MockMap,
      Marker: MockMarker,
      NavigationControl,
      AttributionControl,
      accessToken: '',
    },
  };
});

vi.mock('../../lib/useAddress', () => ({
  useAddress: () => ({ address: { formatted: '—' } }),
}));

import { LiveMapOverview } from './LiveMapOverview';

function renderLiveMap(props: Partial<ComponentProps<typeof LiveMapOverview>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  const defaultProps = {
    targetPosition: [9.48, 51.31] as [number, number],
    heading: 90,
    speedKmh: 20,
    licensePlate: 'M-AB 1234',
    isDarkMode: false,
    ...props,
  };

  act(() => {
    root.render(<LiveMapOverview {...defaultProps} />);
  });

  return {
    container,
    unmount: () =>
      act(() => {
        root.unmount();
        container.remove();
      }),
    rerender: (next: Partial<ComponentProps<typeof LiveMapOverview>>) =>
      act(() => {
        root.render(<LiveMapOverview {...defaultProps} {...next} />);
      }),
  };
}

describe('LiveMapOverview map behavior', () => {
  beforeEach(() => {
    MockMap.instances = [];
    mapConstructorOptions.length = 0;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token');
  });

  it('enables cooperative gestures for mobile page scroll', async () => {
    renderLiveMap();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mapConstructorOptions[0]?.cooperativeGestures).toBe(true);
  });

  it('adds visible Mapbox attribution control', async () => {
    renderLiveMap();
    await act(async () => {
      await Promise.resolve();
    });
    const map = MockMap.instances[0];
    expect(map.controls.some((control) => control.type === 'attribution')).toBe(true);
    expect(map.controls.find((control) => control.type === 'attribution')?.position).toBe(
      'bottom-right',
    );
  });

  it('does not re-center after manual drag when follow is disabled', async () => {
    const view = renderLiveMap();
    await act(async () => {
      await Promise.resolve();
    });
    const map = MockMap.instances[0];
    map.easeTo.mockClear();

    act(() => {
      map.emit('dragstart');
      map.emit('dragend');
    });

    view.rerender({ targetPosition: [9.5, 51.32] });
    await act(async () => {
      await Promise.resolve();
    });

    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it('follows camera on GPS updates when follow is active', async () => {
    const view = renderLiveMap();
    await act(async () => {
      await Promise.resolve();
    });
    const map = MockMap.instances[0];
    map.easeTo.mockClear();

    view.rerender({ targetPosition: [9.5, 51.32] });
    await act(async () => {
      await Promise.resolve();
    });

    expect(map.easeTo).toHaveBeenCalled();
  });

  it('uses instant camera moves when reduced motion is requested', async () => {
    const view = renderLiveMap({ animationPolicy: { reducedMotion: true } });
    await act(async () => {
      await Promise.resolve();
    });
    const map = MockMap.instances[0];
    map.easeTo.mockClear();

    view.rerender({ targetPosition: [9.5, 51.32] });
    await act(async () => {
      await Promise.resolve();
    });

    expect(map.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: 0,
      }),
    );
  });

  it('shows neutral message for Mapbox runtime errors', async () => {
    const view = renderLiveMap();
    await act(async () => {
      await Promise.resolve();
    });
    const map = MockMap.instances[0];

    act(() => {
      map.emit('error', { error: new Error('Failed to load style') });
    });

    expect(view.container.textContent).toMatch(/Stil/i);
    expect(view.container.textContent).not.toMatch(/VITE_|accessToken/i);
  });

  it('shows neutral message for network errors', async () => {
    const view = renderLiveMap();
    await act(async () => {
      await Promise.resolve();
    });
    const map = MockMap.instances[0];

    act(() => {
      map.emit('error', { error: new Error('Failed to fetch') });
    });

    expect(view.container.textContent).toMatch(/Verbindung/i);
    expect(view.container.textContent).not.toMatch(/fetch|network error/i);
  });

  it('shows operator hint for missing position', async () => {
    const view = renderLiveMap({
      targetPosition: null,
      waitingForPosition: true,
      operatorHint: 'Keine Position verfügbar',
      operatorHintSub: 'Telematik verbinden',
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(view.container.textContent).toMatch(/Keine Position verfügbar/);
    expect(view.container.textContent).toMatch(/Telematik verbinden/);
  });

  it('shows operator hint overlay for last-known style hints', async () => {
    const view = renderLiveMap({
      targetPosition: [9.48, 51.31],
      waitingForPosition: false,
      operatorHint: 'Letzte bekannte Position',
      operatorHintSub: 'vor 12 Min.',
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(view.container.textContent).toMatch(/Letzte bekannte Position/);
    expect(view.container.textContent).toMatch(/vor 12 Min/);
  });

  it('registers touch-friendly interaction listeners for drag and zoom', async () => {
    renderLiveMap();
    await act(async () => {
      await Promise.resolve();
    });
    const map = MockMap.instances[0];
    expect(map.handlers.has('dragstart')).toBe(true);
    expect(map.handlers.has('zoomstart')).toBe(true);
    expect(map.handlers.has('rotatestart')).toBe(true);
    expect(map.handlers.has('pitchstart')).toBe(true);
  });
});
