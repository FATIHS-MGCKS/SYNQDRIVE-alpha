import type { FleetConnectivityVehicle } from '../../lib/api';

/** Short operational label — not the long Fleet Connectivity debug copy. */
export const OBD_UNPLUGGED_BADGE_LABEL = 'OBD unplugged';

export const OBD_UNPLUGGED_TOOLTIP =
  'Letzter bekannter OBD-Status: nicht eingesteckt';

/**
 * Canonical snapshot rule (same as Fleet Connectivity `obdPlugDisplay`):
 * only explicit `false` means unplugged; null/undefined/true are not unplugged.
 */
export function isObdSnapshotExplicitlyUnplugged(
  obdIsPluggedIn: boolean | null | undefined,
): boolean {
  return obdIsPluggedIn === false;
}

export function shouldShowObdUnpluggedBadge(
  obdIsPluggedIn: boolean | null | undefined,
): boolean {
  return isObdSnapshotExplicitlyUnplugged(obdIsPluggedIn);
}

export function buildObdPlugIndex(
  vehicles: Pick<FleetConnectivityVehicle, 'vehicleId' | 'obdIsPluggedIn'>[],
): Map<string, boolean | null> {
  const map = new Map<string, boolean | null>();
  for (const vehicle of vehicles) {
    map.set(vehicle.vehicleId, vehicle.obdIsPluggedIn ?? null);
  }
  return map;
}

export function isTelemetryOfflineAttentionItem(item: {
  title: string;
  semanticKey?: string;
}): boolean {
  if (item.semanticKey?.includes(':telemetry:offline')) return true;
  return item.title.trim() === 'Offline';
}

export function hintAlreadyMentionsObdUnplugged(hint: string | undefined): boolean {
  if (!hint) return false;
  const lower = hint.toLowerCase();
  return (
    lower.includes('obd unplugged')
    || lower.includes('obd getrennt')
    || lower.includes('not plugged')
    || lower.includes('nicht eingesteckt')
  );
}

export function appendObdUnpluggedToHint(
  hint: string | undefined,
  showObd: boolean,
): string | undefined {
  if (!showObd) return hint;
  if (hintAlreadyMentionsObdUnplugged(hint)) return hint;
  const label = OBD_UNPLUGGED_BADGE_LABEL;
  return hint ? `${hint} · ${label}` : label;
}
