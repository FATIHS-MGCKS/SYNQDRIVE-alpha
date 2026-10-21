import { createHash } from 'crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, fsyncSync, openSync, closeSync } from 'fs';
import { dirname } from 'path';

import {
  buildP4hRawArchiveInput,
  sealP4hRawArchive,
  verifyP4hRawArchive,
  type P4hRawArchiveV1,
} from './p4h-raw-archive.v1';

export function atomicWriteJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  writeFileSync(tmp, payload, 'utf8');
  try {
    const fd = openSync(tmp, 'r+');
    fsyncSync(fd);
    closeSync(fd);
  } catch {
    /* fsync best-effort */
  }
  renameSync(tmp, path);
}

export function sha256FileHex(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function verifyArchiveFile(path: string): {
  ok: boolean;
  digest: string;
  reason?: string;
} {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as P4hRawArchiveV1;
  const integrity = verifyP4hRawArchive(raw);
  const fileDigest = sha256FileHex(path);
  if (!integrity.ok) {
    return { ok: false, digest: fileDigest, reason: integrity.reason };
  }
  return { ok: true, digest: fileDigest };
}

export function persistencePreflight(archiveRoot: string): {
  ok: boolean;
  reason?: string;
} {
  mkdirSync(`${archiveRoot}/raw`, { recursive: true });
  const probePath = `${archiveRoot}/.write_probe.json`;
  const probe = { probe: true, at: new Date().toISOString() };
  atomicWriteJson(probePath, probe);
  const readBack = JSON.parse(readFileSync(probePath, 'utf8'));
  if (!readBack.probe) {
    return { ok: false, reason: 'readback_failed' };
  }
  const sealed = sealP4hRawArchive(
    buildP4hRawArchiveInput({
      capturedAtUtc: new Date().toISOString(),
      extractorGateVersion: '1.0.0',
      vehicleLabel: 'Persistence probe',
      vehicleId: '00000000-0000-0000-0000-000000000099',
      tripId: '00000000-0000-0000-0000-000000000099',
      tripStartUtc: '2026-01-01T12:00:00.000Z',
      telemetryUrl: 'https://telemetry-api.dimo.zone/query',
      windowFromUtc: '2026-01-01T11:59:30.000Z',
      windowToUtc: '2026-01-01T12:02:00.000Z',
      requestIndex: 0,
      httpStatus: 200,
      requestStatus: 'ok',
      errorMessage: null,
      retries: 0,
      points: [
        {
          timestamp: '2026-01-01T11:59:55.000Z',
          voltage: 12.5,
          rpm: 0,
        },
      ],
    }),
  );
  const probeArchivePath = `${archiveRoot}/raw/_persistence_probe.p4h-raw.v1.json`;
  atomicWriteJson(probeArchivePath, sealed);
  const verified = verifyArchiveFile(probeArchivePath);
  if (!verified.ok) {
    return { ok: false, reason: verified.reason ?? 'sha_roundtrip_failed' };
  }
  return { ok: true };
}
