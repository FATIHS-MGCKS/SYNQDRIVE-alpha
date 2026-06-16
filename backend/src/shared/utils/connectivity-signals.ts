/**
 * Extract OBD / cellular connectivity fields from DIMO signalsLatest payload
 * (stored on VehicleLatestState.rawPayloadJson).
 */

export interface JammingIncidentDto {
  detectedAt: string | null;
  /** Coordinates or short location hint when available */
  where: string | null;
  /** Reverse-geocoded address when available in pipeline; otherwise null */
  lastKnownAddress: string | null;
  /** True when derived from latest snapshot only — not a persisted incident history. */
  isSnapshotIndication?: true;
}

export interface ConnectivitySnapshotExtras {
  obdIsPluggedIn: boolean | null;
  jammingDetectedCount: number;
  jammingIncidents: JammingIncidentDto[];
}

function parseBoolSignal(signal: unknown): boolean | null {
  if (signal == null) return null;
  if (typeof signal === 'boolean') return signal;
  if (typeof signal === 'object' && signal !== null && 'value' in signal) {
    const v = (signal as { value?: unknown }).value;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number' && !Number.isNaN(v)) return v >= 0.5;
  }
  return null;
}

function signalTimestampIso(signal: unknown): string | null {
  if (signal == null || typeof signal !== 'object') return null;
  const t = (signal as { timestamp?: unknown }).timestamp;
  if (typeof t !== 'string') return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseJammingCount(signal: unknown): { count: number; ts: string | null } {
  if (signal == null) return { count: 0, ts: null };
  const ts = signalTimestampIso(signal);
  if (typeof signal === 'number' && !Number.isNaN(signal)) {
    return { count: Math.max(0, Math.floor(signal)), ts };
  }
  if (typeof signal === 'boolean') {
    return { count: signal ? 1 : 0, ts };
  }
  if (typeof signal === 'object' && signal !== null && 'value' in signal) {
    const v = (signal as { value?: unknown }).value;
    if (typeof v === 'number' && !Number.isNaN(v)) {
      return { count: Math.max(0, Math.floor(v)), ts };
    }
    if (typeof v === 'boolean') {
      return { count: v ? 1 : 0, ts };
    }
  }
  return { count: 0, ts };
}

function formatWhereFromSignals(signals: Record<string, unknown>): string | null {
  const loc = signals.currentLocationCoordinates as
    | { value?: { latitude?: number; longitude?: number } }
    | undefined;
  const lat = loc?.value?.latitude;
  const lng = loc?.value?.longitude;
  if (lat == null || lng == null) return null;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/**
 * Build snapshot indication for UI — at most one row; count reflects
 * aggregate value from the latest telemetry snapshot, not event history.
 */
export function extractConnectivitySnapshot(
  signals: Record<string, unknown> | null | undefined,
): ConnectivitySnapshotExtras {
  if (!signals || typeof signals !== 'object') {
    return { obdIsPluggedIn: null, jammingDetectedCount: 0, jammingIncidents: [] };
  }

  const obdRaw = signals.obdIsPluggedIn;
  const jamRaw = signals.connectivityCellularIsJammingDetected;

  const obdIsPluggedIn = parseBoolSignal(obdRaw);
  const { count, ts } = parseJammingCount(jamRaw);
  const where = formatWhereFromSignals(signals);

  const incidents: JammingIncidentDto[] = [];
  if (count > 0) {
    incidents.push({
      detectedAt: ts,
      where,
      lastKnownAddress: null,
      isSnapshotIndication: true,
    });
  }

  return {
    obdIsPluggedIn,
    jammingDetectedCount: count,
    jammingIncidents: incidents,
  };
}
