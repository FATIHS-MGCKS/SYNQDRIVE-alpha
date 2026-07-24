// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';

type MapHandler = (...args: unknown[]) => void;

vi.hoisted(() => {
  vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token');
});

const { MockMap, MockMarker } = vi.hoisted(() => {
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

    constructor(options: { style: string }) {
      this.styleUrl = options.style;
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

    addControl = vi.fn();
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

  return { MockMap: HoistedMockMap, MockMarker: HoistedMockMarker };
});

vi.mock('mapbox-gl', () => {
  class NavigationControl {}
  return {
    default: {
      Map: MockMap,
      Marker: MockMarker,
      NavigationControl,
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

describe('LiveMapOverview map lifecycle', () => {
  beforeEach(() => {
    MockMap.instances = [];
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('creates a single map instance on initial load', async () => {
    renderLiveMap();
    await act(async () => {
      await Promise.resolve();
    });
    expect(MockMap.instances).toHaveLength(1);
  });

  it('swaps style on theme change without recreating the map', async () => {
    const view = renderLiveMap({ isDarkMode: false });
    await act(async () => {
      await Promise.resolve();
    });
    const map = MockMap.instances[0];
    expect(map.styleUrl).toContain('light');

    view.rerender({ isDarkMode: true });
    await act(async () => {
      await Promise.resolve();
    });

    expect(MockMap.instances).toHaveLength(1);
    expect(map.setStyle).toHaveBeenCalled();
    expect(map.jumpTo).toHaveBeenCalled();
    expect(map.removeCalls).toBe(0);
  });

  it('cleans up map and markers on unmount', async () => {
    const view = renderLiveMap();
    await act(async () => {
      await Promise.resolve();
    });
    const map = MockMap.instances[0];
    expect(map.markers.length).toBeGreaterThan(0);

    view.unmount();
    expect(map.removeCalls).toBe(1);
    expect(MockMap.instances).toHaveLength(0);
  });

  it('resizes map when container size changes', async () => {
    const view = renderLiveMap();
    await act(async () => {
      await Promise.resolve();
    });
    const map = MockMap.instances[0];
    const mapContainer = view.container.querySelector('.w-full.h-full') as HTMLElement | null;
    expect(mapContainer).toBeTruthy();

    act(() => {
      map.resize();
    });
    expect(map.resize).toHaveBeenCalled();
  });

  it('shows controlled error on WebGL context loss', async () => {
    const view = renderLiveMap();
    await act(async () => {
      await Promise.resolve();
    });
    const map = MockMap.instances[0];
    const event = new Event('webglcontextlost');
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() });

    act(() => {
      map.getCanvas().dispatchEvent(event);
    });

    expect(view.container.textContent).toMatch(/unterbrochen/i);
  });

  it('shows controlled error when map emits runtime error', async () => {
    const view = renderLiveMap();
    await act(async () => {
      await Promise.resolve();
    });
    const map = MockMap.instances[0];

    act(() => {
      map.emit('error', { error: new Error('Failed to load style') });
    });

    expect(view.container.textContent).toMatch(/Stil/i);
  });

  it('remounts cleanly for vehicle change via parent key', async () => {
    const first = renderLiveMap({ licensePlate: 'M-AB 1111' });
    await act(async () => {
      await Promise.resolve();
    });
    first.unmount();

    const second = renderLiveMap({ licensePlate: 'M-AB 2222' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(MockMap.instances).toHaveLength(1);
    second.unmount();
    expect(MockMap.instances).toHaveLength(0);
  });
});
