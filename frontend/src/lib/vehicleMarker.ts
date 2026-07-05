/**
 * Modern directional arrow SVG marker for fleet maps and vehicle detail maps.
 * Supports rotation by heading and status-based color accents.
 *
 * Status color mapping (SynqDrive standard):
 *   Available    → Blue   (#3b82f6)
 *   Active Rented→ Purple (#8b5cf6)
 *   Reserved     → Green  (#22c55e)
 *   Maintenance  → Red    (#ef4444)
 */

export type VehicleStatusKey = 'Available' | 'Active Rented' | 'Reserved' | 'Maintenance';

export interface StatusColor {
  primary: string;
  glow: string;
  bg: string;
  darkBg: string;
  text: string;
  darkText: string;
  badge: string;
  ring: string;
  label: string;
}

const STATUS_COLORS: Record<VehicleStatusKey, StatusColor> = {
  Available: {
    primary: '#4F86E8',
    glow: 'rgba(79,134,232,0.35)',
    bg: 'bg-brand-soft',
    darkBg: 'bg-status-info-soft',
    text: 'text-status-info',
    darkText: 'text-status-info',
    badge: 'bg-status-info',
    ring: 'ring-status-info/40',
    label: 'Available',
  },
  'Active Rented': {
    primary: '#8b5cf6',
    glow: 'rgba(139,92,246,0.35)',
    bg: 'bg-purple-50',
    darkBg: 'bg-purple-500/15',
    text: 'text-purple-700',
    darkText: 'text-purple-400',
    badge: 'bg-purple-500',
    ring: 'ring-purple-500/40',
    label: 'Active Rented',
  },
  Reserved: {
    primary: '#22c55e',
    glow: 'rgba(34,197,94,0.35)',
    bg: 'bg-emerald-50',
    darkBg: 'bg-emerald-500/15',
    text: 'text-emerald-700',
    darkText: 'text-emerald-400',
    badge: 'bg-emerald-500',
    ring: 'ring-emerald-500/40',
    label: 'Reserved',
  },
  Maintenance: {
    primary: '#ef4444',
    glow: 'rgba(239,68,68,0.35)',
    bg: 'bg-red-50',
    darkBg: 'bg-red-500/15',
    text: 'text-red-700',
    darkText: 'text-red-400',
    badge: 'bg-red-500',
    ring: 'ring-red-500/40',
    label: 'Maintenance',
  },
};

export function getStatusColor(status: string): StatusColor {
  return STATUS_COLORS[status as VehicleStatusKey] ?? STATUS_COLORS.Available;
}

export function getStatusHex(status: string): string {
  return getStatusColor(status).primary;
}

/**
 * Modern directional arrow SVG (pointing UP / north).
 * Sleek filled chevron with inner cutout for a clean navigation look.
 * 32×32 logical size, crisp on retina.
 */
function arrowSvg(color: string, isDark: boolean): string {
  const stroke = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="28" height="28">
  <defs>
    <filter id="as" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.3"/>
    </filter>
  </defs>
  <path d="M16 2 L28 26 L16 20 L4 26 Z" fill="${color}" stroke="${stroke}" stroke-width="0.5" filter="url(#as)"/>
  <path d="M16 8 L22 22 L16 18.5 L10 22 Z" fill="${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.25)'}"/>
</svg>`;
}

/**
 * Shortest-path angle interpolation to avoid 359→1° spin.
 */
export function shortestRotation(current: number, target: number): number {
  let diff = ((target - current + 540) % 360) - 180;
  return current + diff;
}

/**
 * Create an HTML element for the arrow marker with status glow and rotation.
 */
export function createSedanMarkerEl(
  headingDeg: number,
  statusColor: string,
  glowColor: string,
  isDark: boolean,
): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'synq-sedan-marker';
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.justifyContent = 'center';
  wrap.style.pointerEvents = 'none';
  wrap.style.width = '32px';
  wrap.style.height = '32px';

  const inner = document.createElement('div');
  inner.className = 'synq-sedan-inner';
  inner.style.transition = 'transform 0.8s cubic-bezier(0.25,0.46,0.45,0.94)';
  inner.style.transform = `rotate(${headingDeg}deg)`;
  inner.style.transformOrigin = 'center center';
  inner.style.filter = `drop-shadow(0 0 5px ${glowColor})`;
  inner.innerHTML = arrowSvg(statusColor, isDark);

  wrap.appendChild(inner);
  return wrap;
}

/**
 * Update rotation on an existing arrow marker element (avoids recreating DOM).
 */
export function updateSedanRotation(wrapEl: HTMLDivElement, headingDeg: number): void {
  const inner = wrapEl.querySelector('.synq-sedan-inner') as HTMLElement | null;
  if (inner) {
    inner.style.transform = `rotate(${headingDeg}deg)`;
  }
}

/**
 * Create a fleet marker element: arrow at GPS position, label floating below.
 * The container is sized to match the arrow (32x32) so Mapbox anchor:'center'
 * places the arrow center at the exact GPS coordinate.
 */
export function createFleetMarkerEl(
  headingDeg: number,
  label: string,
  status: string,
  isDark: boolean,
): HTMLDivElement {
  const sc = getStatusColor(status);
  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.width = '32px';
  container.style.height = '32px';
  container.style.pointerEvents = 'none';

  const arrow = createSedanMarkerEl(headingDeg, sc.primary, sc.glow, isDark);
  container.appendChild(arrow);

  if (label) {
    const cap = document.createElement('div');
    cap.textContent = label;
    cap.style.position = 'absolute';
    cap.style.top = '100%';
    cap.style.left = '50%';
    cap.style.transform = 'translateX(-50%)';
    cap.style.marginTop = '2px';
    cap.style.padding = '2px 7px';
    cap.style.borderRadius = '5px';
    cap.style.fontSize = '10px';
    cap.style.fontWeight = '700';
    cap.style.letterSpacing = '0.03em';
    cap.style.whiteSpace = 'nowrap';
    cap.style.maxWidth = '120px';
    cap.style.overflow = 'hidden';
    cap.style.textOverflow = 'ellipsis';
    cap.style.background = isDark ? 'rgba(23,23,23,0.92)' : 'rgba(255,255,255,0.95)';
    cap.style.color = isDark ? '#f5f5f5' : '#111827';
    cap.style.border = isDark
      ? `1px solid rgba(64,64,64,0.8)`
      : `1px solid rgba(0,0,0,0.08)`;
    cap.style.boxShadow = '0 1px 4px rgba(0,0,0,0.12)';

    const dot = document.createElement('span');
    dot.style.display = 'inline-block';
    dot.style.width = '6px';
    dot.style.height = '6px';
    dot.style.borderRadius = '50%';
    dot.style.backgroundColor = sc.primary;
    dot.style.marginRight = '4px';
    dot.style.verticalAlign = 'middle';
    cap.prepend(dot);

    container.appendChild(cap);
  }

  return container;
}
