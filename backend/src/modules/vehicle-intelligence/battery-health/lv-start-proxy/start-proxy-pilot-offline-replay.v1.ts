import { evaluateStartProxyCadenceGate } from './battery-start-proxy-cadence-gate';
import {
  crankPointsFromP4cForwardArchive,
  verifyP4cForwardRawArchive,
  type P4cForwardRawArchiveV1,
} from './start-proxy-pilot-raw-archive.v1';

/**
 * Offline replay from sealed P4C forward raw archive — no provider I/O.
 */
export function replayStartProxyPilotArchiveV1(archive: P4cForwardRawArchiveV1) {
  const integrity = verifyP4cForwardRawArchive(archive);
  if (!integrity.ok) {
    return { ok: false as const, reason: integrity.reason ?? 'integrity_failed' };
  }

  const points = crankPointsFromP4cForwardArchive(archive);
  const tripStartAt = new Date(archive.trip.tripStartUtc);
  const gate = evaluateStartProxyCadenceGate({
    points,
    tripStartAt,
  });

  return {
    ok: true as const,
    gate,
    pointCount: points.length,
    queryFingerprint: archive.query.queryFingerprint,
  };
}
