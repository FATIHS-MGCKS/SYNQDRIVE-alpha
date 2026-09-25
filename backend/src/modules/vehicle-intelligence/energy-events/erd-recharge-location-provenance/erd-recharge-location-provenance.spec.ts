import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.types';
import { buildErdRechargePhysicalProjectionSourceEventKey } from '../erd-recharge-projection/erd-recharge-projection-identity.policy';
import { mapRechargeSegmentToHvChargeSessionDraft } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.mapper';
import { mergeHvChargeSessionUpdate } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.merge';
import { ERD_RECHARGE_LOCATION_SOURCE_DIMO_RECHARGE_SEGMENT } from './erd-recharge-location-authority.constants';
import {
  normalizeAuthoritativeCoordinatePair,
  normalizeDimoRechargeSegmentLocation,
} from './erd-recharge-coordinate.policy';
import {
  mapDimoSegmentToAuthoritativeSessionLocations,
  mergeAuthoritativeSessionLocationMetadata,
  projectTrustedSessionLocationsToVeeCoordinates,
} from './erd-recharge-session-location.policy';
import { mapCanonicalHvChargeSessionToErdRechargeProjectionDraft } from '../erd-recharge-projection/erd-recharge-projection-mapper';
import type { HvChargeSession } from '@prisma/client';

function segment(overrides: Partial<NormalizedDimoRechargeSegment> = {}): NormalizedDimoRechargeSegment {
  return {
    segmentId: 'dimo-1',
    providerSegmentId: 'prov-1',
    fingerprint: 'fp-1',
    tokenId: 99,
    startAt: '2026-06-01T10:00:00.000Z',
    endAt: '2026-06-01T11:00:00.000Z',
    ongoing: false,
    startedBeforeRange: false,
    durationSeconds: 3600,
    durationProvenance: 'PROVIDER_DURATION',
    startLocation: { latitude: 52.1, longitude: 13.4 },
    endLocation: { latitude: 52.11, longitude: 13.41 },
    soc: { min: 20, max: 80, delta: 60, provenance: 'SEGMENT_EXTREMA' },
    currentEnergyKwh: { min: 10, max: 40, delta: 30, provenance: 'SEGMENT_EXTREMA' },
    addedEnergyKwh: { min: null, max: null, delta: 30, provenance: 'SEGMENT_EXTREMA' },
    isCharging: { anyTrue: true, allTrue: true, legacyMin01: null, legacyMax01: null },
    cableConnected: { anyTrue: true, allTrue: true, legacyMin01: null, legacyMax01: null },
    isChargingLegacy: { min: null, max: null },
    cableConnectedLegacy: { min: null, max: null },
    odometerKm: { min: 1000, max: 1000, delta: 0, provenance: 'SEGMENT_EXTREMA' },
    signalRows: [],
    sourceTimestamps: { segmentStartAt: '2026-06-01T10:00:00.000Z', segmentEndAt: '2026-06-01T11:00:00.000Z' },
    ...overrides,
  } as NormalizedDimoRechargeSegment;
}

describe('erd-recharge-location-provenance (E6.1)', () => {
  describe('coordinate validation L4–L8', () => {
    it('L4/L5: partial pairs rejected', () => {
      expect(normalizeAuthoritativeCoordinatePair({ latitude: 1, longitude: null })).toBeNull();
      expect(normalizeAuthoritativeCoordinatePair({ latitude: null, longitude: 1 })).toBeNull();
    });

    it('L6: non-finite rejected', () => {
      expect(normalizeAuthoritativeCoordinatePair({ latitude: NaN, longitude: 1 })).toBeNull();
      expect(normalizeAuthoritativeCoordinatePair({ latitude: 1, longitude: Infinity })).toBeNull();
    });

    it('L7: out of range rejected', () => {
      expect(normalizeAuthoritativeCoordinatePair({ latitude: 91, longitude: 0 })).toBeNull();
      expect(normalizeAuthoritativeCoordinatePair({ latitude: 0, longitude: 181 })).toBeNull();
    });

    it('L8: 0,0 accepted', () => {
      expect(normalizeAuthoritativeCoordinatePair({ latitude: 0, longitude: 0 })).toEqual({
        latitude: 0,
        longitude: 0,
      });
    });
  });

  describe('native session metadata L1–L3', () => {
    it('L1: both valid locations persisted', () => {
      const loc = mapDimoSegmentToAuthoritativeSessionLocations(segment());
      expect(loc.startLocation?.latitude).toBe(52.1);
      expect(loc.endLocation?.source).toBe(ERD_RECHARGE_LOCATION_SOURCE_DIMO_RECHARGE_SEGMENT);
    });

    it('L2/L3: start-only and end-only', () => {
      const startOnly = mapDimoSegmentToAuthoritativeSessionLocations(
        segment({ endLocation: { latitude: null, longitude: 13.41 } }),
      );
      expect(startOnly.startLocation).toBeDefined();
      expect(startOnly.endLocation).toBeUndefined();

      const endOnly = mapDimoSegmentToAuthoritativeSessionLocations(
        segment({ startLocation: { latitude: null, longitude: 13.4 } }),
      );
      expect(endOnly.endLocation).toBeDefined();
      expect(endOnly.startLocation).toBeUndefined();
    });
  });

  it('L9: fallback draft has no fabricated location', () => {
    const draft = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: 'org',
      vehicleId: 'veh',
      segment: segment(),
    });
    expect(draft.metadata.startLocation).toBeDefined();
    const fallbackDraft = {
      ...draft,
      source: 'TELEMETRY_POLL_FALLBACK' as const,
      metadata: { ...draft.metadata, startLocation: undefined, endLocation: undefined },
    };
    const merged = mergeAuthoritativeSessionLocationMetadata({
      existingMeta: { ...draft.metadata, startLocation: draft.metadata.startLocation! },
      incomingMeta: fallbackDraft.metadata,
      existingSource: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
      incomingSource: 'TELEMETRY_POLL_FALLBACK',
    });
    expect(merged.startLocation?.latitude).toBe(52.1);
  });

  describe('VEE projection L10–L13', () => {
    const scope = { organizationId: 'org-1', vehicleId: 'veh-1' };

    function hvSession(overrides: Partial<HvChargeSession> = {}): HvChargeSession {
      return {
        id: 'sess-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        measurementSessionId: null,
        segmentFingerprint: 'fp-anchor',
        dimoSegmentId: 'dimo-1',
        source: 'DIMO_RECHARGE_SEGMENT',
        startAt: new Date('2026-06-01T10:00:00.000Z'),
        endAt: new Date('2026-06-01T11:00:00.000Z'),
        startSocPercent: 20,
        endSocPercent: 80,
        startEnergyKwh: 10,
        endEnergyKwh: 40,
        energyAddedKwh: 30,
        deltaSocPercent: 60,
        isOngoing: false,
        quality: 'SHADOW',
        idempotencyKey: 'idem',
        providerObservedAt: new Date('2026-06-01T11:00:00.000Z'),
        receivedAt: new Date('2026-06-01T11:00:00.000Z'),
        metadata: {
          qualityStatus: 'QUALIFIED',
          startLocation: {
            latitude: 52.1,
            longitude: 13.4,
            source: 'DIMO_RECHARGE_SEGMENT',
          },
          endLocation: {
            latitude: 52.11,
            longitude: 13.41,
            source: 'DIMO_RECHARGE_SEGMENT',
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
    }

    it('L10: native both coordinates projected', () => {
      const mapped = mapCanonicalHvChargeSessionToErdRechargeProjectionDraft({
        session: hvSession(),
        scope,
      });
      expect(mapped.ok).toBe(true);
      if (!mapped.ok) return;
      expect(mapped.draft.startLatitude).toBe(52.1);
      expect(mapped.draft.endLongitude).toBe(13.41);
      expect(mapped.draft.rawDetectionMeta.startLocationProvenance).toBe(
        ERD_RECHARGE_LOCATION_SOURCE_DIMO_RECHARGE_SEGMENT,
      );
    });

    it('L11: start-only projection', () => {
      const mapped = mapCanonicalHvChargeSessionToErdRechargeProjectionDraft({
        session: hvSession({
          metadata: {
            qualityStatus: 'QUALIFIED',
            startLocation: { latitude: 1, longitude: 2, source: 'DIMO_RECHARGE_SEGMENT' },
          },
        }),
        scope,
      });
      if (!mapped.ok) throw new Error('expected ok');
      expect(mapped.draft.startLatitude).toBe(1);
      expect(mapped.draft.endLatitude).toBeNull();
    });

    it('L12: fallback projection null coordinates', () => {
      const mapped = mapCanonicalHvChargeSessionToErdRechargeProjectionDraft({
        session: hvSession({
          source: 'TELEMETRY_POLL_FALLBACK',
          dimoSegmentId: null,
        }),
        scope,
      });
      if (!mapped.ok) throw new Error('expected ok');
      expect(mapped.draft.startLatitude).toBeNull();
      expect(mapped.draft.endLatitude).toBeNull();
    });

    it('L13: untrusted metadata ignored', () => {
      const coords = projectTrustedSessionLocationsToVeeCoordinates(
        hvSession({
          metadata: {
            qualityStatus: 'QUALIFIED',
            startLocation: { latitude: 9, longitude: 9, source: 'TELEMETRY_POLL_FALLBACK' as never },
          },
        }),
      );
      expect(coords.startLatitude).toBeNull();
    });
  });

  it('L14/L15: coordinates do not affect sourceEventKey', () => {
    const keyA = buildErdRechargePhysicalProjectionSourceEventKey({
      vehicleId: 'veh-1',
      anchorSegmentFingerprint: 'fp-anchor',
    });
    const keyB = buildErdRechargePhysicalProjectionSourceEventKey({
      vehicleId: 'veh-1',
      anchorSegmentFingerprint: 'fp-anchor',
    });
    expect(keyA).toBe(keyB);
  });

  it('merge preserves valid location on invalid refresh (P3 unit)', () => {
    const existing = {
      id: 'sess',
      organizationId: 'org',
      vehicleId: 'veh',
      segmentFingerprint: 'fp',
      dimoSegmentId: 'dimo',
      source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
      startAt: new Date('2026-06-01T10:00:00.000Z'),
      endAt: new Date('2026-06-01T11:00:00.000Z'),
      startSocPercent: 20,
      endSocPercent: 80,
      startEnergyKwh: 10,
      endEnergyKwh: 40,
      energyAddedKwh: 30,
      deltaSocPercent: 60,
      isOngoing: false,
      quality: 'SHADOW',
      idempotencyKey: 'idem',
      providerObservedAt: new Date(),
      receivedAt: new Date(),
      metadata: {
        providerSegmentFingerprint: 'fp',
        durationSeconds: 3600,
        lastReconciledAt: '2026-06-01T10:00:00.000Z',
        reconcileVersion: 1,
        qualityStatus: 'QUALIFIED',
        startLocation: { latitude: 52.1, longitude: 13.4, source: 'DIMO_RECHARGE_SEGMENT' },
      },
    };
    const incoming = mapRechargeSegmentToHvChargeSessionDraft({
      organizationId: 'org',
      vehicleId: 'veh',
      segment: segment({
        startLocation: { latitude: null, longitude: null },
        soc: { min: 20, max: 85, delta: 65, provenance: 'SEGMENT_EXTREMA' },
      }),
    });
    const merged = mergeHvChargeSessionUpdate({ existing: existing as never, incoming });
    expect(merged.changed).toBe(true);
    const meta = merged.update?.metadata as { startLocation?: { latitude: number } };
    expect(meta.startLocation?.latitude).toBe(52.1);
  });
});
