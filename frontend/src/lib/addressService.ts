const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';

interface ResolvedAddress {
  street: string | null;
  houseNumber: string | null;
  city: string | null;
  formatted: string;
}

const CACHE = new Map<string, ResolvedAddress>();
const IN_FLIGHT = new Map<string, Promise<ResolvedAddress>>();

const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function formatAddress(result: ResolvedAddress): string {
  const parts: string[] = [];
  if (result.street) {
    parts.push(result.houseNumber ? `${result.street} ${result.houseNumber}` : result.street);
  }
  if (result.city) parts.push(result.city);
  return parts.length > 0 ? parts.join(', ') : '—';
}

async function fetchAddress(lat: number, lng: number): Promise<ResolvedAddress> {
  if (!MAPBOX_TOKEN) return { street: null, houseNumber: null, city: null, formatted: '—' };

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=address&limit=1&access_token=${MAPBOX_TOKEN}`;

  const res = await fetch(url);
  if (!res.ok) return { street: null, houseNumber: null, city: null, formatted: '—' };

  const json = await res.json();
  const feature = json?.features?.[0];
  if (!feature) return { street: null, houseNumber: null, city: null, formatted: '—' };

  let street: string | null = null;
  let houseNumber: string | null = null;
  let city: string | null = null;

  if (feature.address) houseNumber = feature.address;
  if (feature.text) street = feature.text;

  const ctx = feature.context ?? [];
  for (const c of ctx) {
    const id = c.id ?? '';
    if (id.startsWith('place')) city = c.text;
    else if (id.startsWith('locality') && !city) city = c.text;
    else if (id.startsWith('region') && !city) city = c.text;
  }

  if (!city && feature.place_name) {
    const parts = feature.place_name.split(',').map((p: string) => p.trim());
    if (parts.length >= 2) city = parts[1];
  }

  const result: ResolvedAddress = { street, houseNumber, city, formatted: '' };
  result.formatted = formatAddress(result);
  return result;
}

export async function resolveAddress(
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<ResolvedAddress> {
  if (!isValidCoordinate(lat, lng)) {
    return { street: null, houseNumber: null, city: null, formatted: '—' };
  }

  const key = coordKey(lat as number, lng as number);

  const cached = CACHE.get(key);
  if (cached) return cached;

  const existing = IN_FLIGHT.get(key);
  if (existing) return existing;

  const promise = fetchAddress(lat as number, lng as number)
    .then((addr) => {
      CACHE.set(key, addr);
      IN_FLIGHT.delete(key);
      return addr;
    })
    .catch(() => {
      IN_FLIGHT.delete(key);
      return { street: null, houseNumber: null, city: null, formatted: '—' } as ResolvedAddress;
    });

  IN_FLIGHT.set(key, promise);
  return promise;
}

export function isLocationFresh(
  lastSeenAt: string | number | null | undefined,
  thresholdMs: number = STALE_THRESHOLD_MS,
): boolean {
  if (!lastSeenAt) return false;
  const ts = typeof lastSeenAt === 'number' ? lastSeenAt : new Date(lastSeenAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < thresholdMs;
}

export function clearAddressCache(): void {
  CACHE.clear();
}

export type { ResolvedAddress };
