import type { DiV0SpeedQcPositionSample } from './di-v0-speed-qc.types';

export type DiV0SpeedQcPositionIndexResult =
  | { ok: true; byLabel: Map<string, DiV0SpeedQcPositionSample> }
  | { ok: false; duplicateLabels: string[] };

function coordKey(p: DiV0SpeedQcPositionSample): string {
  return `${p.latitude ?? 'null'}:${p.longitude ?? 'null'}:${p.availability}:${p.positionState ?? ''}`;
}

/**
 * Builds a label index; fails closed on duplicate bucket labels with conflicting rows.
 */
export function buildDiV0SpeedQcPositionIndex(positions: DiV0SpeedQcPositionSample[]): DiV0SpeedQcPositionIndexResult {
  const byLabel = new Map<string, DiV0SpeedQcPositionSample>();
  const duplicateLabels: string[] = [];

  for (const p of positions) {
    const existing = byLabel.get(p.bucketLabel);
    if (existing === undefined) {
      byLabel.set(p.bucketLabel, p);
      continue;
    }
    if (coordKey(existing) !== coordKey(p)) {
      if (!duplicateLabels.includes(p.bucketLabel)) {
        duplicateLabels.push(p.bucketLabel);
      }
    }
  }

  if (duplicateLabels.length > 0) {
    return { ok: false, duplicateLabels };
  }
  return { ok: true, byLabel };
}

export function isValidGeoCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export function normalizeBucketLabel(label: string): string {
  return new Date(label).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
