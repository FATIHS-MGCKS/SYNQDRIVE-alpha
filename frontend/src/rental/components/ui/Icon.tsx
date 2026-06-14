// Central rental-side icon primitive.
//
// Resolution order (3-tier):
//   1. LUCIDE_FALLBACK — explicit lucide-react components for icons that have
//      no acceptable thin-line equivalent in lets-icons or solar (the
//      automotive / fleet set: Car, Truck, Wrench, Fuel, Gauge, Disc, Tire,
//      Battery, BatteryCharging, Thermometer, Snowflake, Wind, Droplet, Heart,
//      etc.) AND vehicle health / dashboard warning indicators that the user
//      has explicitly asked to leave untouched (Tacho-Warnleuchten use case).
//   2. ICONIFY_MAP — preferred path: kebab-case name → lets-icons identifier
//      (matches the Figma „Lets Icons" pack the design system was sourced
//      from). For names that don't exist in lets-icons we fall back to the
//      visually compatible thin-line set from `solar` (also on Iconify).
//   3. Unknown name → renders nothing in production, console.warn in dev.
//
// The kebab-case naming follows the lucide convention so downstream call
// sites can mechanically convert `<Car className="…" />` to
// `<Icon name="car" className="…" />` with no behavioural change. All
// Tailwind sizing/coloring (`w-4 h-4 text-amber-500` etc.) keeps working
// because both lucide and Iconify use `currentColor` and inherit the wrapping
// element's sizing.

import { Icon as IconifyIcon, type IconProps as IconifyProps } from '@iconify/react';
import type { CSSProperties, ComponentType, SVGAttributes } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  Baby,
  Ban,
  Battery,
  BatteryCharging,
  Bot,
  Car,
  Circle,
  CircleDot,
  Disc,
  Droplet,
  FileSignature,
  Fuel,
  Gauge,
  Hash,
  Heart,
  Image as LucideImage,
  Lightbulb,
  Monitor,
  MoreHorizontal,
  OctagonAlert,
  Paintbrush,
  Paperclip,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  Printer,
  Receipt,
  Ruler,
  Signal,
  SignalZero,
  Snowflake,
  Sparkles,
  Sun,
  Thermometer,
  ToggleLeft,
  ToggleRight,
  TrendingDown,
  TrendingUp,
  Truck,
  Type as TypeIcon,
  UserCheck,
  UserCog,
  UserX,
  Wifi,
  WifiOff,
  Wind,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Variant
// ─────────────────────────────────────────────────────────────────────────────

export type IconVariant = 'light' | 'regular' | 'fill' | 'duotone' | 'duotone-line';

const LETS_VARIANT_SUFFIX: Record<IconVariant, string> = {
  light: '-light',
  regular: '',
  fill: '-fill',
  duotone: '-duotone',
  'duotone-line': '-duotone-line',
};

// ─────────────────────────────────────────────────────────────────────────────
// 1) Lucide fallback — automotive, vehicle health & user-protected icons
// ─────────────────────────────────────────────────────────────────────────────

const LUCIDE_FALLBACK: Record<string, LucideIcon> = {
  // Automotive (no acceptable iconify equivalent in lets-icons / solar)
  car: Car,
  truck: Truck,
  wrench: Wrench,
  fuel: Fuel,
  gauge: Gauge,
  odometer: Gauge,
  disc: Disc,
  circle: Circle,
  'circle-dot': CircleDot,
  tire: Circle, // alias used as `Circle as TireIcon`
  'tire-icon': Circle,

  // Vehicle health / dashboard warning indicators (user-protected:
  // „Tacho-Warnleuchten" must remain unchanged)
  battery: Battery,
  'battery-charging': BatteryCharging,
  thermometer: Thermometer,
  snowflake: Snowflake,
  sun: Sun,
  wind: Wind,
  droplet: Droplet,
  heart: Heart,

  // Diagonal arrows (lets-icons & solar offer no thin-line diagonals)
  'arrow-up-right': ArrowUpRight,
  'arrow-down-right': ArrowDownRight,
  'arrow-down-left': ArrowDownLeft,

  // Trending / analytics (no clean iconify equivalent)
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  activity: Activity,

  // Status / alerts where lucide reads more naturally than the iconify subs
  'alert-triangle': AlertTriangle,
  'alert-circle': AlertCircle,
  'octagon-alert': OctagonAlert,
  ban: Ban,
  'more-horizontal': MoreHorizontal,

  // Communication variants (rich phone family — solar splits these awkwardly)
  'phone-call': PhoneCall,
  'phone-incoming': PhoneIncoming,
  'phone-outgoing': PhoneOutgoing,
  'phone-off': PhoneOff,

  // User variants (UserCheck/UserX/UserCog have no clean lets/solar matches)
  'user-check': UserCheck,
  'user-cog': UserCog,
  'user-x': UserX,

  // Misc (no good thin-line match in either pack)
  bot: Bot,
  sparkles: Sparkles,
  hash: Hash,
  paperclip: Paperclip,
  printer: Printer,
  wifi: Wifi,
  'wifi-off': WifiOff,
  signal: Signal,
  'signal-zero': SignalZero,
  lightbulb: Lightbulb,
  monitor: Monitor,
  baby: Baby,
  'toggle-left': ToggleLeft,
  'toggle-right': ToggleRight,
  paintbrush: Paintbrush,
  image: LucideImage,
  ruler: Ruler,
  type: TypeIcon,
  award: Award,
  'file-signature': FileSignature,
  receipt: Receipt,
};

// ─────────────────────────────────────────────────────────────────────────────
// 2) Iconify map — lets-icons preferred → solar fallback
// ─────────────────────────────────────────────────────────────────────────────

const ICONIFY_MAP: Record<string, string> = {
  // ── Layout / panels ─────────────────────────────────────────────────────
  menu: 'lets-icons:menu-light',
  layers: 'lets-icons:layers-light',
  'layout-dashboard': 'solar:widget-2-linear',
  'layout-grid': 'solar:widget-2-linear',
  'grid-3x3': 'solar:widget-2-linear',
  'panel-left-close': 'solar:sidebar-minimalistic-linear',
  'panel-left-open': 'solar:sidebar-minimalistic-linear',
  'panel-right-close': 'solar:sidebar-minimalistic-linear',
  'panel-right-open': 'solar:sidebar-minimalistic-linear',

  // ── Chevrons / arrows / orientation ─────────────────────────────────────
  'chevron-up': 'lets-icons:expand-up-light',
  'chevron-down': 'lets-icons:expand-down-light',
  'chevron-left': 'lets-icons:expand-left-light',
  'chevron-right': 'lets-icons:expand-right-light',
  'arrow-up': 'lets-icons:arrow-top-light',
  'arrow-down': 'lets-icons:arrow-down-light',
  'arrow-left': 'lets-icons:arrow-left-light',
  'arrow-right': 'lets-icons:arrow-right-light',
  'arrow-up-down': 'lets-icons:sort-light',
  sort: 'lets-icons:sort-light',
  'maximize-2': 'solar:maximize-square-linear',
  'minimize-2': 'solar:minimize-square-linear',

  // ── Status / actions ────────────────────────────────────────────────────
  check: 'lets-icons:check-fill',
  'check-circle': 'lets-icons:check-ring-round-light',
  'check-circle-2': 'lets-icons:done-ring-round-light',
  'check-square': 'solar:check-square-linear',
  x: 'lets-icons:close-round-light',
  'x-circle': 'lets-icons:close-ring-light',
  plus: 'lets-icons:add-light',
  minus: 'solar:minus-square-linear',
  'edit-3': 'lets-icons:edit-light',
  pencil: 'lets-icons:edit-light',
  'pen-tool': 'lets-icons:pen-light',
  'pen-line': 'lets-icons:pen-light',
  eraser: 'solar:eraser-linear',
  save: 'lets-icons:save-light',
  'trash-2': 'lets-icons:trash-light',
  copy: 'lets-icons:copy-light',
  eye: 'lets-icons:eye-light',
  search: 'lets-icons:search-light',
  filter: 'lets-icons:filter-light',
  send: 'lets-icons:send-light',
  download: 'lets-icons:download-light',
  upload: 'lets-icons:upload-light',
  'refresh-cw': 'lets-icons:refresh-light',
  'rotate-ccw': 'solar:refresh-linear',
  'log-out': 'solar:logout-linear',
  'external-link': 'lets-icons:external',
  'link-2': 'lets-icons:link-light',
  unlink: 'solar:link-broken-linear',
  flag: 'lets-icons:flag-light',
  'shield-alert': 'solar:shield-warning-linear',

  // ── Time ────────────────────────────────────────────────────────────────
  calendar: 'lets-icons:calendar-light',
  'calendar-clock': 'lets-icons:date-today-light',
  clock: 'lets-icons:clock-light',
  timer: 'solar:stopwatch-linear',

  // ── Communication ───────────────────────────────────────────────────────
  phone: 'lets-icons:phone-light',
  mail: 'lets-icons:e-mail-light',
  'message-square': 'lets-icons:message-light',
  'message-circle': 'lets-icons:chat-light',
  mic: 'lets-icons:mic-light',
  'volume-2': 'solar:volume-linear',
  bell: 'lets-icons:bell-light',
  headphones: 'lets-icons:headphones-fill-light',
  'share-2': 'solar:share-linear',
  'thumbs-up': 'lets-icons:thumb-up',
  'thumbs-down': 'lets-icons:thumb-down',

  // ── People ──────────────────────────────────────────────────────────────
  user: 'lets-icons:user-light',
  users: 'solar:users-group-rounded-linear',
  'user-circle-2': 'lets-icons:user-circle-light',
  'user-plus': 'lets-icons:user-add-light',
  'id-card': 'solar:user-id-linear',

  // ── Locations ───────────────────────────────────────────────────────────
  'map-pin': 'lets-icons:pin-light',
  home: 'lets-icons:home-light',
  globe: 'lets-icons:globe-light',
  navigation: 'solar:streets-navigation-linear',
  route: 'solar:route-linear',

  // ── Files / docs ────────────────────────────────────────────────────────
  file: 'lets-icons:file-light',
  'file-text': 'lets-icons:file-light',
  'file-check': 'solar:file-check-linear',
  'file-spreadsheet': 'solar:document-text-linear',
  'clipboard-list': 'solar:clipboard-list-linear',
  'clipboard-check': 'solar:clipboard-check-linear',
  'list-todo': 'solar:clipboard-list-linear',
  'book-open': 'lets-icons:book-open-light',

  // ── Money / commerce ────────────────────────────────────────────────────
  wallet: 'lets-icons:wallet-light',
  'credit-card': 'lets-icons:credit-card-light',
  percent: 'solar:dollar-minimalistic-linear',
  tag: 'solar:tag-linear',
  'dollar-sign': 'solar:dollar-minimalistic-linear',
  euro: 'solar:euro-linear',
  'shopping-cart': 'lets-icons:basket',
  store: 'lets-icons:shop',
  package: 'lets-icons:package',

  // ── Charts / analytics ──────────────────────────────────────────────────
  'bar-chart-3': 'lets-icons:chart-light',
  'pie-chart': 'lets-icons:pie-chart',
  target: 'lets-icons:target-light',
  crosshair: 'lets-icons:gps-fixed',

  // ── Security ────────────────────────────────────────────────────────────
  shield: 'solar:shield-linear',
  'shield-check': 'solar:shield-check-linear',
  'shield-question': 'solar:shield-warning-linear',
  'shield-off': 'solar:shield-cross-linear',
  'shield-x': 'solar:shield-cross-linear',
  lock: 'lets-icons:lock-light',
  unlock: 'lets-icons:unlock-light',
  key: 'lets-icons:key-light',
  database: 'lets-icons:database-light',

  // ── System / settings ───────────────────────────────────────────────────
  cog: 'lets-icons:setting-line',
  settings: 'lets-icons:setting-line',
  'help-circle': 'lets-icons:question-light',
  info: 'lets-icons:info-light',
  rocket: 'solar:rocket-2-linear',

  // ── Media / playback ────────────────────────────────────────────────────
  play: 'lets-icons:play-light',
  pause: 'solar:pause-linear',
  square: 'solar:stop-linear',
  power: 'solar:power-linear',
  'power-off': 'solar:power-linear',

  // ── Devices ─────────────────────────────────────────────────────────────
  smartphone: 'solar:smartphone-2-linear',
  camera: 'lets-icons:camera-light',

  // ── Misc ────────────────────────────────────────────────────────────────
  star: 'lets-icons:star-light',
  crown: 'solar:crown-linear',
  briefcase: 'solar:case-linear',
  'building-2': 'solar:buildings-linear',
  moon: 'lets-icons:moon-light',
  zap: 'lets-icons:lightning-light',
  'loader-2': 'lets-icons:load-circle-light',
  loader: 'lets-icons:load-circle-light',
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export type IconName = keyof typeof LUCIDE_FALLBACK | keyof typeof ICONIFY_MAP | string;

export interface IconProps extends Omit<SVGAttributes<SVGElement>, 'children' | 'name'> {
  /** Kebab-case lucide-aligned name (e.g. `"car"`, `"check-circle"`, `"alert-triangle"`). */
  name: IconName;
  /**
   * Lets-Icons style variant. Only applied when the resolved icon is a
   * lets-icons identifier; ignored for solar / lucide. Default: `light`.
   */
  variant?: IconVariant;
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders a UI icon. See module-level comment for the resolution strategy.
 */
export function Icon({ name, variant, className, style, ...rest }: IconProps) {
  // 1) Lucide fallback (automotive, vehicle health, missing-from-iconify)
  const LucideComp = LUCIDE_FALLBACK[name];
  if (LucideComp) {
    return <LucideComp className={className} style={style} {...(rest as Record<string, unknown>)} />;
  }

  // 2) Iconify map (lets-icons preferred → solar fallback)
  let iconifyId = ICONIFY_MAP[name];
  if (iconifyId && variant && iconifyId.startsWith('lets-icons:')) {
    const stripped = iconifyId.replace(/-(light|fill|duotone|duotone-line)$/, '');
    iconifyId = `${stripped}${LETS_VARIANT_SUFFIX[variant]}`;
  }
  if (iconifyId) {
    const iconifyProps: IconifyProps = {
      icon: iconifyId,
      className,
      style,
      ...(rest as Record<string, unknown>),
    };
    return <IconifyIcon {...iconifyProps} />;
  }

  // 3) Unknown — log in dev, render nothing in prod.
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[Icon] Unknown icon name: "${name}"`);
  }
  return null;
}

/** Component-level alias, useful for props that previously typed `icon: LucideIcon`. */
export type IconComponent = ComponentType<IconProps>;

/** Introspection helper — true if `name` resolves to either a lucide or iconify icon. */
export function iconExists(name: string): boolean {
  return name in LUCIDE_FALLBACK || name in ICONIFY_MAP;
}
