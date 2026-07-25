import type { HandoverTechnicalObservationPayloadItem } from './operatorHandoverTechnicalObservations';

/** Mirrors backend SIGNABLE_CONTENT_KEYS subset for binding hashes. */
export interface OperatorHandoverSignableContent {
  odometerKm: number;
  fuelPercent: number;
  fuelFull: boolean;
  exteriorClean: boolean;
  interiorClean: boolean;
  tiresSeasonOk: boolean;
  warningLightsOn: boolean;
  warningLightsNotes: string | null;
  notes: string | null;
  documentsAcknowledged: boolean;
  damageIds: string[];
  technicalObservations: HandoverTechnicalObservationPayloadItem[];
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    normalized[key] = record[key];
  }
  return JSON.stringify(normalized, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sortedKeys = Object.keys(val as Record<string, unknown>).sort();
      const sorted: Record<string, unknown> = {};
      for (const k of sortedKeys) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

export function buildOperatorHandoverSignableContent(input: {
  odometerKm: number;
  fuelPercent: number;
  fuelFull: boolean;
  exteriorClean: boolean;
  interiorClean: boolean;
  tiresSeasonOk: boolean;
  warningLightsOn: boolean;
  warningLightsNotes: string | null;
  notes: string | null;
  documentsAcknowledged: boolean;
  damageIds: string[];
  technicalObservations: HandoverTechnicalObservationPayloadItem[];
}): OperatorHandoverSignableContent {
  const damageIds = [...input.damageIds]
    .filter((id) => typeof id === 'string' && id.length > 0)
    .sort();
  const technicalObservations = input.technicalObservations
    .map((obs) => ({
      description: obs.description.trim(),
      category: obs.category,
      affectedArea: obs.affectedArea,
      severity: obs.severity,
      blocksRental: obs.blocksRental === true,
    }))
    .filter((obs) => obs.description.length >= 3);

  return {
    odometerKm: Math.max(0, Math.round(input.odometerKm)),
    fuelPercent: Math.max(0, Math.min(100, Math.round(input.fuelPercent))),
    fuelFull: !!input.fuelFull,
    exteriorClean: input.exteriorClean ?? true,
    interiorClean: input.interiorClean ?? true,
    tiresSeasonOk: input.tiresSeasonOk ?? true,
    warningLightsOn: input.warningLightsOn ?? false,
    warningLightsNotes: input.warningLightsNotes?.trim() || null,
    notes: input.notes?.trim() || null,
    documentsAcknowledged: !!input.documentsAcknowledged,
    damageIds,
    technicalObservations,
  };
}

export async function hashOperatorHandoverSignableContent(
  content: OperatorHandoverSignableContent,
): Promise<string> {
  const text = stableStringify(content);
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256FromSignatureDataUrl(dataUrl: string): Promise<string> {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match?.[2]) {
    throw new Error('INVALID_SIGNATURE_IMAGE');
  }
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
