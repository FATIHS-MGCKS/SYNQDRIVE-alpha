import {
  EnergyEventConfidence,
  EnergyEventKind,
  VehicleEnergyEventDetectionSource,
  type VehicleEnergyEvent,
} from '@prisma/client';
import { projectCanonicalProductEnergyEvents } from '../canonical-energy-events.projection';
import { isErdRechargeProductReadDedupeEnabled } from './erd-recharge-product-read-dedupe.config';
import {
  ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE,
  proveErdRechargeProductReadDuplicate,
} from './erd-recharge-product-read-identity.policy';
import { applyRechargeProductReadDedupe } from './erd-recharge-product-read-dedupe';
import { ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM } from '../erd-recharge-projection/erd-recharge-projection.constants';

const v2Cutover = new Date('2026-09-04T12:00:00.000Z');
const T0 = new Date('2026-06-01T10:00:00.000Z');
const T1 = new Date('2026-06-01T11:00:00.000Z');

function recharge(partial: Partial<VehicleEnergyEvent> & { id: string }): VehicleEnergyEvent {
  return {
    vehicleId: 'veh-a',
    kind: EnergyEventKind.RECHARGE,
    detectionMechanism: 'recharge',
    startTime: T0,
    endTime: T1,
    durationSeconds: 3600,
    confidence: EnergyEventConfidence.HIGH,
    dimoSegmentId: 'dimo-default',
    canonicalChargeSessionId: null,
    detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE,
    sourceEventKey: null,
    socDeltaPercent: 10,
    energyDeltaKwh: 5,
    rawDetectionMeta: {},
    ...partial,
  } as VehicleEnergyEvent;
}

function canonicalErd(partial: Partial<VehicleEnergyEvent> & { id: string }): VehicleEnergyEvent {
  return recharge({
    detectionMechanism: ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
    detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
    canonicalChargeSessionId: 'session-1',
    sourceEventKey: 'erd:physical:v1:veh-a:fp-1',
    ...partial,
  });
}

function legacyDimo(partial: Partial<VehicleEnergyEvent> & { id: string }): VehicleEnergyEvent {
  return recharge({
    detectionMechanism: 'recharge',
    detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE,
    canonicalChargeSessionId: null,
    ...partial,
  });
}

describe('erd-recharge-product-read-dedupe (E5.5)', () => {
  describe('config', () => {
    it('R29: invalid read-dedupe env value behaves OFF', () => {
      expect(isErdRechargeProductReadDedupeEnabled({})).toBe(false);
      expect(isErdRechargeProductReadDedupeEnabled({ ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '0' })).toBe(false);
      expect(isErdRechargeProductReadDedupeEnabled({ ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: 'false' })).toBe(false);
      expect(isErdRechargeProductReadDedupeEnabled({ ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: 'yes' })).toBe(false);
      expect(isErdRechargeProductReadDedupeEnabled({ ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: '1' })).toBe(true);
      expect(isErdRechargeProductReadDedupeEnabled({ ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED: 'true' })).toBe(true);
    });
  });

  describe('identity policy', () => {
    it('R5: EXACT_DIMO_ID duplicate proof', () => {
      const c = canonicalErd({ id: 'c1', dimoSegmentId: 'dimo-x' });
      const l = legacyDimo({ id: 'l1', dimoSegmentId: 'dimo-x' });
      expect(proveErdRechargeProductReadDuplicate(c, l)).toBe(
        ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE.EXACT_DIMO_ID,
      );
    });

    it('R7: time overlap only → NONE evidence', () => {
      const c = canonicalErd({
        id: 'c1',
        dimoSegmentId: 'dimo-canonical',
        startTime: T0,
        endTime: T1,
      });
      const l = legacyDimo({
        id: 'l1',
        dimoSegmentId: 'dimo-other',
        startTime: T0,
        endTime: T1,
      });
      expect(proveErdRechargeProductReadDuplicate(c, l)).toBe(
        ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE.NONE,
      );
    });

    it('R8: fallback canonical null dimo → NONE', () => {
      const c = canonicalErd({ id: 'c1', dimoSegmentId: null });
      const l = legacyDimo({ id: 'l1' });
      expect(proveErdRechargeProductReadDuplicate(c, l)).toBe(
        ERD_RECHARGE_PRODUCT_READ_DEDUPE_EVIDENCE.NONE,
      );
    });
  });

  describe('applyRechargeProductReadDedupe', () => {
    it('R1/R4: flag OFF preserves all legacy rows', () => {
      const rows = [legacyDimo({ id: 'l1' }), legacyDimo({ id: 'l2', dimoSegmentId: 'd2' })];
      const off = applyRechargeProductReadDedupe(rows, false);
      expect(off.visible.map((r: VehicleEnergyEvent) => r.id).sort()).toEqual(['l1', 'l2']);
    });

    it('R2: flag OFF coexistence unchanged', () => {
      const rows = [canonicalErd({ id: 'c1' }), legacyDimo({ id: 'l1' })];
      const off = applyRechargeProductReadDedupe(rows, false);
      expect(off.visible).toHaveLength(2);
    });

    it('R3: canonical only visible when ON', () => {
      const rows = [canonicalErd({ id: 'c1', dimoSegmentId: 'd1' })];
      const on = applyRechargeProductReadDedupe(rows, true);
      expect(on.visible.map((r: VehicleEnergyEvent) => r.id)).toEqual(['c1']);
    });

    it('R6/R11: lineage full cover hides legacy coalesced parent', () => {
      const l = legacyDimo({
        id: 'legacy-coalesced',
        dimoSegmentId: 'dimo-coalesced-parent',
        rawDetectionMeta: { coalescedFromSegmentIds: ['dimo-d1', 'dimo-d2'] },
      });
      const c1 = canonicalErd({ id: 'c1', dimoSegmentId: 'dimo-d1' });
      const c2 = canonicalErd({ id: 'c2', dimoSegmentId: 'dimo-d2', sourceEventKey: 'erd:physical:v1:veh-a:fp-2' });
      const on = applyRechargeProductReadDedupe([l, c1, c2], true);
      expect(on.visible.map((r: VehicleEnergyEvent) => r.id).sort()).toEqual(['c1', 'c2']);
    });

    it('R12: partial lineage coverage keeps legacy visible', () => {
      const l = legacyDimo({
        id: 'legacy-coalesced',
        dimoSegmentId: 'dimo-coalesced-parent',
        rawDetectionMeta: { coalescedFromSegmentIds: ['dimo-d1', 'dimo-d2'] },
      });
      const c1 = canonicalErd({ id: 'c1', dimoSegmentId: 'dimo-d1' });
      const on = applyRechargeProductReadDedupe([l, c1], true);
      expect(on.visible.map((r: VehicleEnergyEvent) => r.id).sort()).toEqual(['c1', 'legacy-coalesced']);
    });

    it('R7 ON: time-only overlap shows both', () => {
      const c = canonicalErd({ id: 'c1', dimoSegmentId: 'dimo-a' });
      const l = legacyDimo({ id: 'l1', dimoSegmentId: 'dimo-b' });
      const on = applyRechargeProductReadDedupe([c, l], true);
      expect(on.visible).toHaveLength(2);
    });

    it('R10: malformed canonical cannot suppress legacy', () => {
      const malformed = recharge({
        id: 'bad',
        detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
        detectionMechanism: ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
        canonicalChargeSessionId: null,
        sourceEventKey: null,
      });
      const l = legacyDimo({ id: 'l1' });
      const on = applyRechargeProductReadDedupe([malformed, l], true);
      expect(on.visible.map((r: VehicleEnergyEvent) => r.id).sort()).toEqual(['bad', 'l1']);
    });

    it('R13: multiple legacy duplicates suppressed individually', () => {
      const c = canonicalErd({ id: 'c1', dimoSegmentId: 'dimo-shared' });
      const l1 = legacyDimo({ id: 'l1', dimoSegmentId: 'dimo-shared' });
      const l2 = legacyDimo({ id: 'l2', dimoSegmentId: 'dimo-unrelated' });
      const on = applyRechargeProductReadDedupe([c, l1, l2], true);
      expect(on.visible.map((r: VehicleEnergyEvent) => r.id).sort()).toEqual(['c1', 'l2']);
    });

    it('R14/R15: unrelated and historical legacy remain visible', () => {
      const c = canonicalErd({ id: 'c1', dimoSegmentId: 'dimo-a' });
      const l = legacyDimo({ id: 'l-hist', dimoSegmentId: 'dimo-hist-only' });
      const on = applyRechargeProductReadDedupe([c, l], true);
      expect(on.visible.some((r: VehicleEnergyEvent) => r.id === 'l-hist')).toBe(true);
    });

    it('R30: deterministic ordering by startTime then id', () => {
      const early = legacyDimo({
        id: 'b',
        startTime: new Date('2026-06-01T08:00:00.000Z'),
        endTime: new Date('2026-06-01T09:00:00.000Z'),
      });
      const late = legacyDimo({
        id: 'a',
        startTime: new Date('2026-06-01T10:00:00.000Z'),
        endTime: T1,
      });
      const on = applyRechargeProductReadDedupe([late, early], true);
      expect(on.visible.map((r: VehicleEnergyEvent) => r.id)).toEqual(['b', 'a']);
    });

    it('R31: cross-vehicle rows are not deduped against each other in policy batch', () => {
      const c = canonicalErd({ id: 'c1', vehicleId: 'veh-1', dimoSegmentId: 'dimo-x' });
      const l = legacyDimo({ id: 'l1', vehicleId: 'veh-2', dimoSegmentId: 'dimo-x' });
      const on = applyRechargeProductReadDedupe([c, l], true);
      expect(on.visible).toHaveLength(2);
    });
  });

  describe('projectCanonicalProductEnergyEvents composition', () => {
    it('R16: REFUEL non-regression covered by canonical-energy-events.projection.spec (no RECHARGE rows here)', () => {
      expect(true).toBe(true);
    });

    it('R5 projection: exact dimo suppresses legacy in product read', () => {
      const c = canonicalErd({ id: 'c1', dimoSegmentId: 'dimo-same' });
      const l = legacyDimo({ id: 'l1', dimoSegmentId: 'dimo-same' });
      const product = projectCanonicalProductEnergyEvents([c, l], v2Cutover, true);
      expect(product.map((r: VehicleEnergyEvent) => r.id)).toEqual(['c1']);
    });
  });
});
