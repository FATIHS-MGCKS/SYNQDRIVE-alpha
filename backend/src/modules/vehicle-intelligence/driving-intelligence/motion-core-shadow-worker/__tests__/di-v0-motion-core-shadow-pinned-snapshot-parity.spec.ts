import * as fs from 'node:fs';
import * as path from 'node:path';
import { gunzipSync } from 'zlib';
import { parseDiV0S4EvidenceContainer } from '../../s4a-foundation/di-v0-s4a-evidence-container-parse';
import { buildDiV0S4EvidenceSnapshotHash } from '../../s4a-foundation/di-v0-s4a-identity';
import type { MotionCorePositionBucket } from '../../core/kinematics/motion-core-grid';
import { adaptMotionCoreShadowEvidenceFromParsedContainer } from '../di-v0-motion-core-shadow-evidence.adapter';
import {
  processDiV0MotionCoreShadowFromEvidenceAdaptation,
  processDiV0MotionCoreShadowTrip,
} from '../di-v0-motion-core-shadow-processor';

const PHASE5C =
  process.env.EXP021_PHASE5C_ROOT ?? '/opt/cursor/artifacts/exp021-phase5c-tesla-reference-20261021';
const EVIDENCE_DIR = path.join(PHASE5C, 'telemetry/production_export/s4_evidence');

function loadPinnedTrip(tripKey: 'TRIP_1' | 'TRIP_2') {
  const raw = gunzipSync(fs.readFileSync(path.join(EVIDENCE_DIR, `${tripKey}_evidence_payload.gz`))).toString('utf8');
  const parsed = parseDiV0S4EvidenceContainer(raw);
  const hash = buildDiV0S4EvidenceSnapshotHash(raw);
  return { raw, parsed, hash };
}

function loadReplayGrid(tripKey: string): MotionCorePositionBucket[] {
  return JSON.parse(fs.readFileSync(path.join(PHASE5C, 'replay', `${tripKey}_position_grid.json`), 'utf8'))
    .buckets as MotionCorePositionBucket[];
}

function fieldDiffCount(
  a: { payloadFingerprint: string; payload: { speeds: unknown[]; fsmLabels: unknown[] } },
  b: { payloadFingerprint: string; payload: { speeds: unknown[]; fsmLabels: unknown[] } },
): number {
  if (a.payloadFingerprint === b.payloadFingerprint) return 0;
  let n = 0;
  const sa = a.payload.speeds as Array<{ bucketLabelUtc: string; speedKmh: number | null }>;
  const sb = b.payload.speeds as Array<{ bucketLabelUtc: string; speedKmh: number | null }>;
  for (let i = 0; i < sa.length; i++) {
    if (sa[i]?.speedKmh !== sb[i]?.speedKmh) n += 1;
  }
  return n;
}

describe('di-v0-motion-core-shadow pinned snapshot parity', () => {
  for (const tripKey of ['TRIP_1', 'TRIP_2'] as const) {
    it(`${tripKey}: adapter POSITION grid matches frozen replay export label-for-label`, () => {
      if (!fs.existsSync(path.join(EVIDENCE_DIR, `${tripKey}_evidence_payload.gz`))) return;
      const { parsed } = loadPinnedTrip(tripKey);
      const adapted = adaptMotionCoreShadowEvidenceFromParsedContainer(parsed, 'API_SYNTHETIC');
      const replay = loadReplayGrid(tripKey);
      expect(adapted.buckets.length).toBe(replay.length);
      for (let i = 0; i < replay.length; i++) {
        expect(adapted.buckets[i]?.bucketLabelUtc).toBe(replay[i]?.bucketLabelUtc);
        expect(adapted.buckets[i]?.availability).toBe(replay[i]?.availability);
        expect(adapted.buckets[i]?.latitude).toBe(replay[i]?.latitude);
        expect(adapted.buckets[i]?.longitude).toBe(replay[i]?.longitude);
      }
    });

    it(`${tripKey}: processor is idempotent and matches direct adaptation path`, () => {
      if (!fs.existsSync(path.join(EVIDENCE_DIR, `${tripKey}_evidence_payload.gz`))) return;
      const { parsed, hash } = loadPinnedTrip(tripKey);
      const fixed = new Date('2026-10-21T12:00:00.000Z');
      const viaTrip = processDiV0MotionCoreShadowTrip({
        parsed,
        sourceFamily: 'API_SYNTHETIC',
        pinnedSnapshotHash: hash,
        combinedInputIdentity: 'parity-test',
        computedAt: fixed,
      });
      const viaTrip2 = processDiV0MotionCoreShadowTrip({
        parsed,
        sourceFamily: 'API_SYNTHETIC',
        pinnedSnapshotHash: hash,
        combinedInputIdentity: 'parity-test',
        computedAt: fixed,
      });
      expect(viaTrip.payloadFingerprint).toBe(viaTrip2.payloadFingerprint);

      const evidence = adaptMotionCoreShadowEvidenceFromParsedContainer(parsed, 'API_SYNTHETIC');
      const viaAdapt = processDiV0MotionCoreShadowFromEvidenceAdaptation(evidence, {
        pinnedSnapshotHash: hash,
        combinedInputIdentity: 'parity-test',
        computedAt: fixed,
      });
      expect(fieldDiffCount(viaTrip, viaAdapt)).toBe(0);
      expect(viaTrip.payloadFingerprint).toBe(viaAdapt.payloadFingerprint);
    });

    it(`${tripKey}: Tesla pinned snapshot has no usable R1_OBD sparse in container`, () => {
      if (!fs.existsSync(path.join(EVIDENCE_DIR, `${tripKey}_evidence_payload.gz`))) return;
      const { parsed } = loadPinnedTrip(tripKey);
      const adapted = adaptMotionCoreShadowEvidenceFromParsedContainer(parsed, 'API_SYNTHETIC');
      const r1 = parsed.channelManifest.find((c) => c.channel === 'R1_OBD');
      expect(r1?.outcome).toBe('NOT_APPLICABLE');
      expect(adapted.sparseSpeed.length).toBe(0);
      expect(adapted.sparseComparable).toBe(false);
      expect(adapted.limitations).toContain('SPARSE_VEHICLE_SPEED_UNAVAILABLE_IN_PINNED_SNAPSHOT');
      if (adapted.sparsePersisted.length > 0) {
        for (const s of adapted.sparsePersisted) {
          expect(s.measurementTimeUtc).toBeNull();
          expect(s.arrivalTimestampUtc).toBeNull();
        }
      }
    });
  }
});
