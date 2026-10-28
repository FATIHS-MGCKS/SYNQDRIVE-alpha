import { gunzipSync, gzipSync } from 'zlib';
import type { MotionManoeuvreEvent } from '../../core/kinematics/motion-event.types';
import {
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_UNKNOWN,
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY,
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
  DI_V0_MOTION_CORE_SHADOW_EVENT_FLAGS_CONSUMPTION_POLICY,
  DI_V0_MOTION_CORE_SHADOW_EVENT_FLAGS_SEMANTICS,
  DI_V0_MOTION_CORE_SHADOW_INTENSITY_USAGE_POLICY,
  DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
  mapMotionManoeuvreEventIntensity,
  readPersistedMotionEventIntensity,
  readPersistedMotionEventIntensityForPayload,
  resolveMotionCoreShadowEventRowContract,
} from '../di-v0-motion-core-shadow-event-row.contract';
import { processDiV0MotionCoreShadowFromEvidenceAdaptation } from '../di-v0-motion-core-shadow-processor';
import { buildMotionTripMapSamples, mapMotionTripMapEvents } from '../di-v0-motion-core-shadow-trip-map-read.mapper';
import {
  DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1,
  DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V2_C5_1,
  DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V3_FSM_GAP_BRIDGE,
  DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V4_C5_1_AND_FSM_GAP_BRIDGE,
} from '../di-v0-motion-core-shadow.bundle.version';
import {
  mapMotionManoeuvreEventToPersisted,
  type DiV0MotionCoreShadowPayloadV1,
  type DiV0MotionCoreShadowPersistedEventRow,
} from '../di-v0-motion-core-shadow.types';
import {
  syntheticAccelDecelDrive,
  syntheticDriveEvidence,
  syntheticDriveLabel as label,
} from './di-v0-motion-core-shadow-synthetic-drive.fixture';

function detectorEvent(overrides: Partial<MotionManoeuvreEvent> = {}): MotionManoeuvreEvent {
  return {
    trip: 0,
    kind: 'ACCELERATION',
    startLabel: label(0),
    endLabel: label(8),
    startUncertaintyS: '±1 s label + unvalidated clock offset',
    endUncertaintyS: '±1 s label + unvalidated clock offset',
    startSpeedKmh: 0,
    endSpeedKmh: 57.6,
    deltaKmh: 57.6,
    meanAccelMps2: 2,
    peakAccel1sMps2: 2.4,
    peakAccel2sMps2: 2.2,
    durationS: 8,
    steps: 8,
    coverageRatio: 1,
    quality: 'OK',
    source: 'C4_ADAPTIVE_L3',
    algorithmVersion: 'test',
    flags: ['F1'],
    ...overrides,
  };
}

/** Projection of the V1 row shape: everything except `intensity`. */
function legacyShape(row: DiV0MotionCoreShadowPersistedEventRow) {
  const { intensity: _intensity, ...rest } = row;
  return rest;
}

describe('DS4 event intensity persistence (event-row contract V2)', () => {
  describe('mapMotionManoeuvreEventToPersisted', () => {
    it('persists the six intensity fields and never peak accelerations', () => {
      const row = mapMotionManoeuvreEventToPersisted(detectorEvent());
      expect(row.intensity).toEqual({
        meanAccelMps2: 2,
        durationS: 8,
        steps: 8,
        coverageRatio: 1,
        startUncertaintyS: '±1 s label + unvalidated clock offset',
        endUncertaintyS: '±1 s label + unvalidated clock offset',
      });
      const serialized = JSON.stringify(row);
      expect(serialized).not.toContain('peakAccel1sMps2');
      expect(serialized).not.toContain('peakAccel2sMps2');
      expect(serialized).not.toContain('"source"');
      expect(serialized).not.toContain('algorithmVersion');
    });

    it('keeps kind, boundaries, speeds, delta, quality and flags byte-identical to the legacy row shape', () => {
      const ev = detectorEvent({ quality: 'ARTEFACT_SUSPECT', flags: ['SPIKE', 'K3'] });
      const row = mapMotionManoeuvreEventToPersisted(ev);
      expect(legacyShape(row)).toEqual({
        kind: 'ACCELERATION',
        startLabel: label(0),
        endLabel: label(8),
        startSpeedKmh: 0,
        endSpeedKmh: 57.6,
        deltaKmh: 57.6,
        quality: 'ARTEFACT_SUSPECT',
        flags: ['SPIKE', 'K3'],
      });
    });

    it.each([
      ['meanAccelMps2 NaN', { meanAccelMps2: Number.NaN }],
      ['meanAccelMps2 Infinity', { meanAccelMps2: Number.POSITIVE_INFINITY }],
      ['durationS negative', { durationS: -1 }],
      ['steps non-integer', { steps: 1.5 }],
      ['coverageRatio NaN', { coverageRatio: Number.NaN }],
      ['coverageRatio zero', { coverageRatio: 0 }],
      ['coverageRatio above 1', { coverageRatio: 1.01 }],
      ['meanAccelMps2 zero', { meanAccelMps2: 0 }],
      ['meanAccelMps2 negative', { meanAccelMps2: -0.5 }],
      ['startUncertaintyS empty', { startUncertaintyS: '' }],
      ['endUncertaintyS missing', { endUncertaintyS: undefined as unknown as string }],
    ])('omits the intensity block instead of fabricating values when %s', (_name, patch) => {
      const row = mapMotionManoeuvreEventToPersisted(detectorEvent(patch));
      expect(row.intensity).toBeUndefined();
      expect('intensity' in row).toBe(false);
      expect(legacyShape(row).kind).toBe('ACCELERATION');
    });

    it('does not coerce a missing duration to zero', () => {
      const out = mapMotionManoeuvreEventIntensity(detectorEvent({ durationS: undefined as unknown as number }));
      expect(out).toBeUndefined();
    });

    it('accepts coverageRatio at the upper bound of 1', () => {
      expect(mapMotionManoeuvreEventIntensity(detectorEvent({ coverageRatio: 1 }))).toBeDefined();
    });
  });

  describe('processor payload contract', () => {
    const processed = processDiV0MotionCoreShadowFromEvidenceAdaptation(syntheticDriveEvidence(), {
      pinnedSnapshotHash: 'pin-intensity',
      combinedInputIdentity: 'input-intensity',
      computedAt: new Date('2026-10-28T00:00:00Z'),
    });

    it('detects at least one acceleration and one deceleration on the synthetic drive', () => {
      const kinds = new Set(processed.payload.events.map((e) => e.kind));
      expect(kinds.has('ACCELERATION')).toBe(true);
      expect(kinds.has('DECELERATION')).toBe(true);
    });

    it('declares event-row contract V2 in payload contract and summary json', () => {
      expect(processed.payload.contract.persistence).toEqual(DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2);
      expect(processed.payload.contract.persistence?.intensityUsagePolicy).toBe(
        DI_V0_MOTION_CORE_SHADOW_INTENSITY_USAGE_POLICY,
      );
      expect(processed.payload.contract.persistence?.intensityExcludedFields).toEqual([
        'peakAccel1sMps2',
        'peakAccel2sMps2',
      ]);
      expect(processed.payload.contract.persistence?.meanAccelMps2Semantics).toContain('SECANT');
      expect(processed.payload.contract.persistence?.coverageRatioSemantics).toContain('USABLE_SAMPLES');
      expect(processed.payload.contract.persistence?.eventFlagsSemantics).toBe(
        DI_V0_MOTION_CORE_SHADOW_EVENT_FLAGS_SEMANTICS,
      );
      expect(processed.payload.contract.persistence?.eventFlagsConsumptionPolicy).toBe(
        DI_V0_MOTION_CORE_SHADOW_EVENT_FLAGS_CONSUMPTION_POLICY,
      );
      expect(processed.summary.eventRowContract).toBe(DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY);
      expect(resolveMotionCoreShadowEventRowContract(processed.payload)).toBe(
        DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
      );
    });

    it('persists intensity on every detected event with finite values', () => {
      expect(processed.payload.events.length).toBeGreaterThan(0);
      for (const ev of processed.payload.events) {
        const intensity = readPersistedMotionEventIntensity(ev);
        expect(intensity).not.toBeNull();
        expect(Number.isFinite(intensity!.meanAccelMps2)).toBe(true);
        expect(intensity!.durationS).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(intensity!.steps)).toBe(true);
        expect(intensity!.coverageRatio).toBeGreaterThan(0);
        expect(intensity!.startUncertaintyS.length).toBeGreaterThan(0);
        expect(intensity!.endUncertaintyS.length).toBeGreaterThan(0);
      }
    });

    it('does not change the bundle version, intent key, event version or speed authority', () => {
      expect(processed.payload.contract.algorithmVersions.bundle).toBe(DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1);
      expect(processed.intentKey).not.toContain('EVENT_ROW');
      expect(processed.payload.contract.algorithmVersions.events).toContain('MOTION_EVENT_PLAUSIBILITY_UNIVERSAL_V0_2');
      expect(processed.payload.contract.speedAuthority).toBe('C4_ONLY');
      for (const bundle of [
        DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1,
        DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V2_C5_1,
        DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V3_FSM_GAP_BRIDGE,
        DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V4_C5_1_AND_FSM_GAP_BRIDGE,
      ]) {
        expect(bundle).not.toContain('EVENT_ROW');
      }
    });

    it('leaves event counts, classifications and boundaries identical to the legacy projection', () => {
      const legacyRows = processed.payload.events.map(legacyShape);
      expect(legacyRows.length).toBe(processed.payload.summary.eventCount);
      expect(legacyRows.filter((e) => e.quality !== 'ARTEFACT_SUSPECT').length).toBe(
        processed.payload.summary.eventAcceptedCount,
      );
      expect(legacyRows.filter((e) => e.quality === 'ARTEFACT_SUSPECT').length).toBe(
        processed.payload.summary.eventArtefactSuspectCount,
      );
      for (const [i, row] of processed.payload.events.entries()) {
        expect(legacyRows[i]).toEqual({
          kind: row.kind,
          startLabel: row.startLabel,
          endLabel: row.endLabel,
          startSpeedKmh: row.startSpeedKmh,
          endSpeedKmh: row.endSpeedKmh,
          deltaKmh: row.deltaKmh,
          quality: row.quality,
          flags: row.flags,
        });
      }
    });

    it('survives a gzip round-trip with intensity intact and contract resolvable', () => {
      const gz = gzipSync(JSON.stringify(processed.payload));
      const decoded = JSON.parse(gunzipSync(gz).toString('utf8')) as DiV0MotionCoreShadowPayloadV1;
      expect(decoded).toEqual(processed.payload);
      expect(resolveMotionCoreShadowEventRowContract(decoded)).toBe(
        DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
      );
      expect(decoded.events.map((e) => readPersistedMotionEventIntensityForPayload(decoded, e))).toEqual(
        processed.payload.events.map((e) => e.intensity ?? null),
      );
    });

    it('does not expose intensity or peak accelerations on the trip-map API DTO', () => {
      const positions = syntheticAccelDecelDrive().map((b) => ({
        bucketLabelUtc: b.bucketLabelUtc,
        latitude: b.latitude,
        longitude: b.longitude,
        availability: b.availability,
      }));
      const { samples } = buildMotionTripMapSamples(processed.payload, positions, []);
      const sampleByLabel = new Map(samples.map((s) => [s.bucketLabelUtc, s]));
      const dtos = mapMotionTripMapEvents(processed.payload, sampleByLabel);
      expect(dtos.length).toBe(processed.payload.events.length);
      for (const dto of dtos) {
        expect(dto.peakAccel1sMps2).toBeNull();
        expect('intensity' in dto).toBe(false);
        expect('meanAccelMps2' in dto).toBe(false);
      }
    });
  });

  describe('backward compatibility with legacy bundles', () => {
    function legacyPayload(): DiV0MotionCoreShadowPayloadV1 {
      const processed = processDiV0MotionCoreShadowFromEvidenceAdaptation(syntheticDriveEvidence(), {
        pinnedSnapshotHash: 'pin-legacy',
        combinedInputIdentity: 'input-legacy',
      });
      const { persistence: _p, ...contractWithoutPersistence } = processed.payload.contract;
      return {
        ...processed.payload,
        contract: contractWithoutPersistence,
        events: processed.payload.events.map(legacyShape),
      };
    }

    it('resolves a payload without contract.persistence as V1 legacy', () => {
      const legacy = legacyPayload();
      expect(resolveMotionCoreShadowEventRowContract(legacy)).toBe(DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY);
      expect(resolveMotionCoreShadowEventRowContract({})).toBe(DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY);
      expect(resolveMotionCoreShadowEventRowContract({ contract: null })).toBe(
        DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY,
      );
    });

    it('reads legacy rows as intensity=null without throwing or fabricating', () => {
      const legacy = legacyPayload();
      expect(legacy.events.length).toBeGreaterThan(0);
      for (const ev of legacy.events) {
        expect(readPersistedMotionEventIntensity(ev)).toBeNull();
      }
    });

    it('rejects a malformed intensity block on read instead of partially trusting it', () => {
      expect(
        readPersistedMotionEventIntensity({
          intensity: { meanAccelMps2: 1.2, durationS: 4, steps: 4, coverageRatio: 1, startUncertaintyS: 'x' },
        }),
      ).toBeNull();
      expect(readPersistedMotionEventIntensity({ intensity: null })).toBeNull();
      expect(readPersistedMotionEventIntensity({})).toBeNull();
    });

    it('legacy trip-map mapping is unchanged for legacy payloads', () => {
      const legacy = legacyPayload();
      const { samples } = buildMotionTripMapSamples(legacy, [], []);
      const dtos = mapMotionTripMapEvents(legacy, new Map(samples.map((s) => [s.bucketLabelUtc, s])));
      expect(dtos.length).toBe(legacy.events.length);
      expect(dtos.every((d) => d.peakAccel1sMps2 === null)).toBe(true);
    });

    it('fail-closes intensity consumption for legacy V1 payloads even when a row carries an intensity block', () => {
      const legacy = legacyPayload();
      const rowWithIntensity = {
        ...legacy.events[0]!,
        intensity: {
          meanAccelMps2: 2,
          durationS: 8,
          steps: 8,
          coverageRatio: 1,
          startUncertaintyS: '±1 s label + unvalidated clock offset',
          endUncertaintyS: '±1 s label + unvalidated clock offset',
        },
      };
      expect(readPersistedMotionEventIntensity(rowWithIntensity)).not.toBeNull();
      expect(readPersistedMotionEventIntensityForPayload(legacy, rowWithIntensity)).toBeNull();
    });
  });

  describe('event-row contract resolution (UNKNOWN fail-closed)', () => {
    it('resolves an unrecognised declared contract as UNKNOWN', () => {
      const payload = {
        contract: {
          persistence: { eventRowContract: 'DI_V0_MOTION_CORE_EVENT_ROW_V99_FUTURE' },
        },
      };
      expect(resolveMotionCoreShadowEventRowContract(payload)).toBe(
        DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_UNKNOWN,
      );
    });

    it('resolves persistence block without eventRowContract as UNKNOWN (not V1)', () => {
      expect(
        resolveMotionCoreShadowEventRowContract({
          contract: {
            persistence: { intensityUsagePolicy: 'ORDINAL_ONLY_NOT_PHYSICALLY_VALIDATED' } as {
              eventRowContract?: unknown;
            },
          },
        }),
      ).toBe(DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_UNKNOWN);
    });

    it('fail-closes intensity consumption for UNKNOWN contract even with a valid intensity block', () => {
      const payload = {
        contract: {
          persistence: { eventRowContract: 'DI_V0_MOTION_CORE_EVENT_ROW_V99_FUTURE' },
        },
      };
      const row = {
        intensity: {
          meanAccelMps2: 2,
          durationS: 8,
          steps: 8,
          coverageRatio: 1,
          startUncertaintyS: 'x',
          endUncertaintyS: 'y',
        },
      };
      expect(readPersistedMotionEventIntensity(row)).not.toBeNull();
      expect(readPersistedMotionEventIntensityForPayload(payload, row)).toBeNull();
    });

    it('rejects persisted intensity blocks with coverageRatio outside (0,1]', () => {
      expect(
        readPersistedMotionEventIntensity({
          intensity: { meanAccelMps2: 1.2, durationS: 4, steps: 4, coverageRatio: 1.5, startUncertaintyS: 'x', endUncertaintyS: 'y' },
        }),
      ).toBeNull();
    });
  });
});
