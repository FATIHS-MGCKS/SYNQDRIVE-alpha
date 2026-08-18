import type { TelemetryFreshness } from './vehicle-state-interpreter';

export type VehicleAttentionSeverity = 'none' | 'info' | 'warning' | 'critical';

export interface VehicleAttentionItem {
  code: string;
  severity: VehicleAttentionSeverity;
  reason: string;
  source: string;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  drilldown: {
    section: 'mapping' | 'connectivity' | 'telemetry' | 'pipeline' | 'import';
    vehicleId?: string | null;
    dimoVehicleId?: string | null;
  };
}

export interface VehicleAttentionSummary {
  severity: VehicleAttentionSeverity;
  reasons: VehicleAttentionItem[];
  primaryReason: string | null;
  reasonCount: number;
}

export type IntegrationConnectivity =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'none';

export type OwnershipState = 'assigned' | 'unassigned' | 'conflict';

export type IntegrityState = 'healthy' | 'attention' | 'conflict';

export interface VehicleAttentionInput {
  vehicleId: string | null;
  dimoVehicleId: string | null;
  registrationState: 'registered' | 'unregistered';
  ownership: OwnershipState;
  integrationConnectivity: IntegrationConnectivity;
  telemetryFreshness: TelemetryFreshness;
  telemetryAgeMs: number | null;
  platformDimoDegraded: boolean;
  lastPollStatus: 'SUCCESS' | 'FAILURE' | 'TIMEOUT' | null;
  lastPollAt: string | null;
  mappingConflict: boolean;
}

export const ATTENTION_REASON_LABELS: Record<string, string> = {
  MAPPING_CONFLICT: 'Zuordnungskonflikt',
  MISSING_ORG_MAPPING: 'Nicht zugeordnet',
  DIMO_AUTH_ERROR: 'DIMO-Autorisierung fehlgeschlagen',
  DIMO_DISCONNECTED: 'DIMO getrennt',
  TELEMETRY_PERSISTENT_OFFLINE: 'Länger offline',
  TELEMETRY_NO_SIGNAL: 'Kein Signal',
  INGESTION_ERROR: 'Ingestion-Fehler',
  PIPELINE_STALE: 'Pipeline veraltet',
};

function escalate(
  current: VehicleAttentionSeverity,
  next: VehicleAttentionSeverity,
): VehicleAttentionSeverity {
  const rank: Record<VehicleAttentionSeverity, number> = {
    none: 0,
    info: 1,
    warning: 2,
    critical: 3,
  };
  return rank[next] > rank[current] ? next : current;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PIPELINE_STALE_MS = 6 * 60 * 60 * 1000;

export function buildVehicleAttention(input: VehicleAttentionInput): VehicleAttentionSummary {
  const items: VehicleAttentionItem[] = [];
  const nowIso = new Date().toISOString();

  const push = (
    code: string,
    severity: VehicleAttentionSeverity,
    source: string,
    section: VehicleAttentionItem['drilldown']['section'],
    firstSeenAt: string | null = null,
    lastSeenAt: string | null = null,
  ) => {
    items.push({
      code,
      severity,
      reason: ATTENTION_REASON_LABELS[code] ?? code,
      source,
      firstSeenAt: firstSeenAt ?? lastSeenAt ?? nowIso,
      lastSeenAt: lastSeenAt ?? firstSeenAt ?? nowIso,
      drilldown: {
        section,
        vehicleId: input.vehicleId,
        dimoVehicleId: input.dimoVehicleId,
      },
    });
  };

  if (input.mappingConflict || input.ownership === 'conflict') {
    push('MAPPING_CONFLICT', 'critical', 'registration', 'mapping');
  }

  if (input.registrationState === 'unregistered' && input.dimoVehicleId) {
    push('MISSING_ORG_MAPPING', 'warning', 'dimo_mirror', 'import');
  }

  if (input.integrationConnectivity === 'error') {
    push('DIMO_AUTH_ERROR', 'critical', 'dimo_connection_status', 'connectivity');
  } else if (
    input.registrationState === 'registered' &&
    input.integrationConnectivity === 'disconnected'
  ) {
    push('DIMO_DISCONNECTED', 'warning', 'dimo_connection_status', 'connectivity');
  }

  if (
    input.registrationState === 'registered' &&
    input.telemetryFreshness === 'offline' &&
    input.telemetryAgeMs != null &&
    input.telemetryAgeMs >= SEVEN_DAYS_MS
  ) {
    push('TELEMETRY_PERSISTENT_OFFLINE', 'warning', 'telemetry_resolver', 'telemetry');
  }

  if (
    input.registrationState === 'registered' &&
    input.telemetryFreshness === 'no_signal' &&
    input.integrationConnectivity !== 'none'
  ) {
    push('TELEMETRY_NO_SIGNAL', 'info', 'telemetry_resolver', 'telemetry');
  }

  if (!input.platformDimoDegraded) {
    if (input.lastPollStatus === 'FAILURE' || input.lastPollStatus === 'TIMEOUT') {
      push(
        'INGESTION_ERROR',
        'critical',
        'dimo_poll_log',
        'pipeline',
        null,
        input.lastPollAt,
      );
    } else if (
      input.lastPollAt &&
      Date.now() - Date.parse(input.lastPollAt) > PIPELINE_STALE_MS &&
      input.integrationConnectivity === 'connected'
    ) {
      push('PIPELINE_STALE', 'warning', 'dimo_poll_log', 'pipeline', null, input.lastPollAt);
    }
  }

  let severity: VehicleAttentionSeverity = 'none';
  for (const item of items) {
    severity = escalate(severity, item.severity);
  }

  return {
    severity,
    reasons: items,
    primaryReason: items[0]?.code ?? null,
    reasonCount: items.length,
  };
}

export function deriveIntegrityState(attention: VehicleAttentionSummary): IntegrityState {
  if (attention.reasons.some((r) => r.code === 'MAPPING_CONFLICT')) return 'conflict';
  if (attention.severity === 'none') return 'healthy';
  return 'attention';
}

export function deriveIntegrationConnectivity(
  dimoVehicleId: string | null,
  connectionStatus: string | null | undefined,
  platformDimoDegraded: boolean,
): IntegrationConnectivity {
  if (!dimoVehicleId) return 'none';
  if (platformDimoDegraded) return 'error';
  const status = (connectionStatus ?? '').toUpperCase();
  if (status === 'CONNECTED') return 'connected';
  if (status === 'DISCONNECTED') return 'disconnected';
  return 'error';
}

export function computeDisplayTitle(
  licensePlate: string | null | undefined,
  vehicleName: string | null | undefined,
  make: string,
  model: string,
): { displayTitle: string; displaySubtitle: string } {
  const plate = licensePlate?.trim();
  const name = vehicleName?.trim();
  const mm = `${make} ${model}`.trim();
  const displayTitle = plate || name || mm || 'Fahrzeug';
  const displaySubtitle = plate ? mm : mm;
  return { displayTitle, displaySubtitle };
}

export function attentionReasonLabel(code: string): string {
  return ATTENTION_REASON_LABELS[code] ?? code;
}

export function attentionDrilldownSection(
  code: string,
): VehicleAttentionItem['drilldown']['section'] {
  if (code === 'MAPPING_CONFLICT') return 'mapping';
  if (code === 'MISSING_ORG_MAPPING') return 'import';
  if (code.startsWith('DIMO_')) return 'connectivity';
  if (code.startsWith('TELEMETRY_')) return 'telemetry';
  if (code === 'INGESTION_ERROR' || code === 'PIPELINE_STALE') return 'pipeline';
  return 'telemetry';
}

export function maskTokenId(tokenId: number | null | undefined): string | null {
  if (tokenId == null) return null;
  const s = String(tokenId);
  if (s.length <= 4) return `…${s}`;
  return `${s.slice(0, 2)}…${s.slice(-2)}`;
}
