import { createHash } from 'node:crypto';

export function normalizeR1Serial(serial: string | null | undefined): string | null {
  const trimmed = serial?.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

export function maskR1Serial(serial: string | null): string | null {
  if (!serial) return null;
  const norm = normalizeR1Serial(serial);
  if (!norm || norm.length < 8) return '***';
  return `${norm.slice(0, 4)}***${norm.slice(-4)}`;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function fingerprintMirrorSnapshot(input: {
  dimoTokenId: number | null;
  observedSerial: string | null;
  mirrorSyncedAt: Date | null;
  mirrorRawJsonSha256: string | null;
}): string {
  const synced = input.mirrorSyncedAt?.toISOString() ?? 'null';
  const serial = normalizeR1Serial(input.observedSerial) ?? 'null';
  const token = input.dimoTokenId ?? 'null';
  const raw = input.mirrorRawJsonSha256 ?? 'null';
  return sha256Hex(`v1|token:${token}|serial:${serial}|synced:${synced}|raw:${raw}`);
}

export function buildDriftSignature(input: {
  physicalDeviceId: string;
  reasonCode: string;
  expectedSerial: string;
  observedSerial: string | null;
}): string | null {
  if (input.reasonCode === 'MATCH') return null;
  const expected = normalizeR1Serial(input.expectedSerial) ?? '';
  const observed = normalizeR1Serial(input.observedSerial) ?? '';
  return sha256Hex(
    `v1|device:${input.physicalDeviceId}|reason:${input.reasonCode}|exp:${expected}|obs:${observed}`,
  );
}
