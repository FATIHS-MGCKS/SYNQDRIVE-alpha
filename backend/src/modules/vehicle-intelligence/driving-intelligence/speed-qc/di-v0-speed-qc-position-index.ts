import type { DiV0SpeedQcPositionSample, DiV0SpeedQcR1Sample } from './di-v0-speed-qc.types';

export type DiV0SpeedQcR1IndexResult =
  | { ok: true; byLabel: Map<string, DiV0SpeedQcR1Sample> }
  | { ok: false; duplicateLabels: string[] };

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
  const normalized = normalizeBucketLabelSafe(label);
  if (normalized == null) {
    throw new Error(`Invalid bucketLabel: ${label}`);
  }
  return normalized;
}

/** Returns null for unparseable labels (fail-closed; never throws RangeError). */
export function normalizeBucketLabelSafe(label: string): string | null {
  const ms = Date.parse(label);
  if (Number.isNaN(ms)) {
    return null;
  }
  const iso = new Date(ms).toISOString();
  if (iso === 'Invalid Date') {
    return null;
  }
  return iso.replace(/\.\d{3}Z$/, 'Z');
}

function r1SpeedKey(speedKmh: number | null | undefined): string {
  if (speedKmh == null || !Number.isFinite(speedKmh)) {
    return 'null';
  }
  return String(speedKmh);
}

export function buildDiV0SpeedQcR1Index(samples: DiV0SpeedQcR1Sample[] | undefined): DiV0SpeedQcR1IndexResult {
  const byLabel = new Map<string, DiV0SpeedQcR1Sample>();
  const duplicateLabels: string[] = [];

  for (const row of samples ?? []) {
    const existing = byLabel.get(row.bucketLabel);
    if (existing === undefined) {
      byLabel.set(row.bucketLabel, row);
      continue;
    }
    if (r1SpeedKey(existing.speedKmh) !== r1SpeedKey(row.speedKmh)) {
      if (!duplicateLabels.includes(row.bucketLabel)) {
        duplicateLabels.push(row.bucketLabel);
      }
    }
  }

  if (duplicateLabels.length > 0) {
    return { ok: false, duplicateLabels };
  }
  return { ok: true, byLabel };
}
