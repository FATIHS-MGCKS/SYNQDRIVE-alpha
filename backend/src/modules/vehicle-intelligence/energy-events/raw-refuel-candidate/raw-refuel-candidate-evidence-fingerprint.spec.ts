import { canonicalJsonString } from './raw-refuel-candidate-canonical-json';
import { buildEvidenceRevisionFingerprint } from './raw-refuel-candidate-evidence-fingerprint';
import {
  candidateRowToEvidenceSlice,
  mergeCandidateEvidence,
} from './raw-refuel-candidate-evidence-merge';
import type { RawRefuelCandidate } from '@prisma/client';
import { buildTestObservation } from './testing/raw-refuel-candidate-test.util';

describe('raw-refuel-candidate-canonical-json', () => {
  it('canonicalizes nested objects with different key insertion order identically', () => {
    const a = canonicalJsonString({
      evidenceMeta: { z: 1, a: { y: 2, b: 3 } },
      qualityMeta: { m: 4, n: { q: 5, p: 6 } },
    });
    const b = canonicalJsonString({
      qualityMeta: { n: { p: 6, q: 5 }, m: 4 },
      evidenceMeta: { a: { b: 3, y: 2 }, z: 1 },
    });
    expect(a).toBe(b);
  });
});

describe('raw-refuel-candidate-evidence-fingerprint nested canonicalization', () => {
  it('changes fingerprint when nested evidenceMeta changes', () => {
    const base = buildTestObservation({ organizationId: 'org-1', vehicleId: 'veh-1' });
    const slice = (meta: Record<string, unknown>) => ({
      organizationId: base.organizationId,
      vehicleId: base.vehicleId,
      detectionVersion: base.detectionVersion,
      signalChannel: base.signalChannel,
      riseOnsetAt: base.riseOnsetAt,
      preFuelAbsoluteLiters: base.preFuelAbsoluteLiters,
      evidenceMeta: meta,
    });
    expect(buildEvidenceRevisionFingerprint(slice({ bucket: 'a' }))).not.toBe(
      buildEvidenceRevisionFingerprint(slice({ bucket: 'b' })),
    );
  });

  it('changes fingerprint when nested qualityMeta changes', () => {
    const base = buildTestObservation({ organizationId: 'org-1', vehicleId: 'veh-1' });
    const slice = (meta: Record<string, unknown>) => ({
      organizationId: base.organizationId,
      vehicleId: base.vehicleId,
      detectionVersion: base.detectionVersion,
      signalChannel: base.signalChannel,
      riseOnsetAt: base.riseOnsetAt,
      preFuelAbsoluteLiters: base.preFuelAbsoluteLiters,
      qualityMeta: meta,
    });
    expect(buildEvidenceRevisionFingerprint(slice({ score: 1 }))).not.toBe(
      buildEvidenceRevisionFingerprint(slice({ score: 2 })),
    );
  });
});

describe('raw-refuel-candidate-evidence-merge fingerprint parity', () => {
  it('matches persisted merged evidence fingerprint', () => {
    const existing = {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      detectionVersion: 'rfrf-v1',
      signalChannel: 'ABSOLUTE_LITERS',
      physicalEvidenceStart: new Date('2026-09-06T09:28:30.000Z'),
      physicalEvidenceEnd: new Date('2026-09-06T09:43:00.000Z'),
      riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
      riseEndAt: new Date('2026-09-06T09:43:00.000Z'),
      preFuelAbsoluteLiters: 7,
      postFuelAbsoluteLiters: 29,
      deltaAbsoluteLiters: 22,
      preFuelRelativePercent: null,
      postFuelRelativePercent: null,
      deltaRelativePercent: null,
      prePlateauSampleCount: 13,
      postPlateauSampleCount: 2,
      totalSampleCount: 15,
      maxSampleGapSeconds: 270,
      absoluteSignalTrust: 'TRUSTED',
      relativeSignalAvailable: false,
      routeEvidenceAvailable: null,
      stationaryEvidenceAvailable: null,
      scanWindowStart: new Date('2026-09-06T08:30:00.000Z'),
      scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      signalProvider: 'DIMO',
      evidenceMeta: null,
      qualityMeta: null,
    } as RawRefuelCandidate;

    const incoming = buildTestObservation({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      physicalEvidenceStart: new Date('2026-09-06T09:30:00.000Z'),
      riseOnsetAt: new Date('2026-09-06T09:34:30.000Z'),
    });

    const merged = mergeCandidateEvidence(existing, incoming, 'org-1');
    expect(merged.physicalEvidenceStart?.toISOString()).toBe('2026-09-06T09:28:30.000Z');
    expect(merged.riseOnsetAt?.toISOString()).toBe('2026-09-06T09:34:30.000Z');

    const persisted = {
      ...existing,
      physicalEvidenceStart: merged.physicalEvidenceStart,
      riseOnsetAt: merged.riseOnsetAt,
    };
    const fingerprint = buildEvidenceRevisionFingerprint(merged);
    expect(fingerprint).toBe(buildEvidenceRevisionFingerprint(candidateRowToEvidenceSlice(persisted)));
  });
});
