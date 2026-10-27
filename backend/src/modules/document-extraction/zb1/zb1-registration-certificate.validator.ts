import type { Zb1ExtractionStatus } from './zb1-registration-certificate.contract';

const VIN_INVALID_CHARS = /[IOQ]/i;

/** ISO 3779 check digit (position 9); returns null when cannot compute. */
export function computeVinCheckDigit(vin17: string): string | null {
  const transliteration: Record<string, number> = {
    A: 1,
    B: 2,
    C: 3,
    D: 4,
    E: 5,
    F: 6,
    G: 7,
    H: 8,
    J: 1,
    K: 2,
    L: 3,
    M: 4,
    N: 5,
    P: 7,
    R: 9,
    S: 2,
    T: 3,
    U: 4,
    V: 5,
    W: 6,
    X: 7,
    Y: 8,
    Z: 9,
    '0': 0,
    '1': 1,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
  };
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  if (vin17.length !== 17) return null;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    if (i === 8) continue;
    const ch = vin17[i]!.toUpperCase();
    const value = transliteration[ch];
    if (value === undefined) return null;
    sum += value * weights[i]!;
  }
  const remainder = sum % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

export function validateVinFin(raw: string | null | undefined): {
  normalized: string | null;
  status: Zb1ExtractionStatus;
  reason?: string;
} {
  if (raw == null || String(raw).trim() === '') {
    return { normalized: null, status: 'MISSING' };
  }
  const compact = String(raw).replace(/[\s\-._]/g, '').toUpperCase();
  if (compact.length !== 17) {
    return { normalized: compact, status: 'INVALID', reason: 'FIN must be 17 characters' };
  }
  if (VIN_INVALID_CHARS.test(compact)) {
    return { normalized: compact, status: 'INVALID', reason: 'FIN contains invalid characters I/O/Q' };
  }
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(compact)) {
    return { normalized: compact, status: 'INVALID', reason: 'FIN charset violation' };
  }
  const expected = computeVinCheckDigit(compact);
  const actual = compact[8];
  if (expected != null && actual !== expected) {
    return {
      normalized: compact,
      status: 'INVALID',
      reason: `FIN check digit mismatch (expected ${expected}, got ${actual})`,
    };
  }
  return { normalized: compact, status: 'EXTRACTED' };
}

/** Parse German number tokens (1.998 / 1,998 / 1998) to integer cc when plausible. */
export function parseGermanDisplacementCc(token: string | null | undefined): number | null {
  if (!token) return null;
  const cleaned = token
    .replace(/\s*cm³|\s*cm3|\s*ccm/gi, '')
    .trim()
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > 20000) return null;
  return Math.round(n);
}

export function parseGermanPowerKw(token: string | null | undefined): number | null {
  if (!token) return null;
  const m = token.match(/(\d+(?:[.,]\d+)?)\s*kW/i);
  if (!m) return null;
  const n = Number(m[1]!.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 2000) return null;
  return n;
}

export function parseMassKg(token: string | null | undefined): number | null {
  if (!token) return null;
  const m = token.match(/(\d{3,5})\s*kg/i);
  if (m) return Number(m[1]);
  const digits = token.replace(/[^\d]/g, '');
  if (digits.length >= 3 && digits.length <= 5) {
    const n = Number(digits);
    if (n >= 200 && n <= 12000) return n;
  }
  return null;
}

export function normalizeHsnTsn(raw: string | null | undefined, kind: 'HSN' | 'TSN'): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (kind === 'HSN' && digits.length === 4) return digits;
  if (kind === 'TSN' && digits.length === 3) return digits;
  if (kind === 'TSN' && digits.length > 3) return digits.slice(0, 3);
  return null;
}
