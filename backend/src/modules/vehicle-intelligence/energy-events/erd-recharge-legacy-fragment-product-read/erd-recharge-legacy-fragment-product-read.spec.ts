import {
  EnergyEventConfidence,
  EnergyEventKind,
  VehicleEnergyEventDetectionSource,
  type VehicleEnergyEvent,
} from '@prisma/client';
import { projectCanonicalProductEnergyEvents } from '../canonical-energy-events.projection';
import { ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM } from '../erd-recharge-projection/erd-recharge-projection.constants';
import { applyRechargeProductReadDedupe } from '../erd-recharge-product-read-dedupe/erd-recharge-product-read-dedupe';
import { evaluateErdRechargeWriteAuthority } from '../erd-recharge-write-authority/erd-recharge-write-authority.policy';
import { ERD_RECHARGE_WRITE_AUTHORITY } from '../erd-recharge-write-authority/erd-recharge-write-authority.constants';
import {
  applyLegacyRechargeFragmentProductRead,
  applyLegacyRechargeFragmentProductReadToProductRows,
} from './erd-recharge-legacy-fragment-product-read';
import { isErdRechargeLegacyFragmentProductReadEnabled } from './erd-recharge-legacy-fragment-product-read.config';
import {
  buildTesla20261012LegacyRechargeFragmentFixture,
  TESLA_FRAGMENT_FIXTURE_VEHICLE_ID,
} from './tesla-2026-10-12-legacy-recharge-fragment.fixture';

const V2_CUTOVER = new Date('2026-09-04T12:00:00.000Z');

function legacyRecharge(input: {
  id: string;
  vehicleId: string;
  tokenId: string;
  suffixMs: string;
  startIso: string;
  endIso: string;
  energyDeltaKwh: number;
  coalescedOnlySelf?: boolean;
}): VehicleEnergyEvent {
  const dimoSegmentId = `dimo-recharge-${input.tokenId}-${input.suffixMs}`;
  const coalescedFromSegmentIds =
    input.coalescedOnlySelf !== false ? [dimoSegmentId] : [dimoSegmentId, 'other-parent'];
  const start = new Date(input.startIso);
  const end = new Date(input.endIso);
  return {
    id: input.id,
    vehicleId: input.vehicleId,
    kind: EnergyEventKind.RECHARGE,
    detectionMechanism: 'recharge',
    detectionSource: null,
    canonicalChargeSessionId: null,
    dimoSegmentId,
    startTime: start,
    endTime: end,
    durationSeconds: Math.max(1, Math.floor((end.getTime() - start.getTime()) / 1000)),
    energyDeltaKwh: input.energyDeltaKwh,
    socDeltaPercent: 5,
    confidence: EnergyEventConfidence.HIGH,
    rawDetectionMeta: {
      coalescedFromCount: coalescedFromSegmentIds.length,
      coalescedFromSegmentIds,
    },
    createdAt: start,
    updatedAt: start,
  } as unknown as VehicleEnergyEvent;
}

describe('erd-recharge-legacy-fragment-product-read', () => {
  it('config gate is strict default OFF', () => {
    expect(isErdRechargeLegacyFragmentProductReadEnabled({})).toBe(false);
    expect(isErdRechargeLegacyFragmentProductReadEnabled({ ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED: '0' })).toBe(false);
    expect(isErdRechargeLegacyFragmentProductReadEnabled({ ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED: 'true' })).toBe(true);
    expect(isErdRechargeLegacyFragmentProductReadEnabled({ ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENABLED: '1' })).toBe(true);
  });

  it('T1: Tesla 2026-10-12 parent + seven fragments → one product RECHARGE when gate ON', () => {
    const rows = buildTesla20261012LegacyRechargeFragmentFixture();
    const { visible } = applyLegacyRechargeFragmentProductRead(rows, true);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.id).toBe('420c253b-676a-4ab6-8e89-7528d538a7d8');
    expect(visible[0]!.energyDeltaKwh).toBeCloseTo(5.259999882429838, 6);
  });

  it('T2: gate OFF → eight legacy rows unchanged', () => {
    const rows = buildTesla20261012LegacyRechargeFragmentFixture();
    const { visible } = applyLegacyRechargeFragmentProductRead(rows, false);
    expect(visible).toHaveLength(8);
  });

  it('T3: raw rows preserved — projection only filters product read', () => {
    const rows = buildTesla20261012LegacyRechargeFragmentFixture();
    expect(rows).toHaveLength(8);
    applyLegacyRechargeFragmentProductRead(rows, true);
    expect(rows).toHaveLength(8);
  });

  it('T4: two independent charge sessions → two product events', () => {
    const vehicleId = TESLA_FRAGMENT_FIXTURE_VEHICLE_ID;
    const sessionA = [
      legacyRecharge({
        id: 'env-a',
        vehicleId,
        tokenId: '111',
        suffixMs: '1000',
        startIso: '2026-10-12T08:00:00.000Z',
        endIso: '2026-10-12T10:00:00.000Z',
        energyDeltaKwh: 8,
      }),
      legacyRecharge({
        id: 'frag-a1',
        vehicleId,
        tokenId: '111',
        suffixMs: '2000',
        startIso: '2026-10-12T08:30:00.000Z',
        endIso: '2026-10-12T09:00:00.000Z',
        energyDeltaKwh: 2,
      }),
    ];
    const sessionB = [
      legacyRecharge({
        id: 'env-b',
        vehicleId,
        tokenId: '111',
        suffixMs: '3000',
        startIso: '2026-10-12T18:00:00.000Z',
        endIso: '2026-10-12T20:00:00.000Z',
        energyDeltaKwh: 6,
      }),
      legacyRecharge({
        id: 'frag-b1',
        vehicleId,
        tokenId: '111',
        suffixMs: '4000',
        startIso: '2026-10-12T18:30:00.000Z',
        endIso: '2026-10-12T19:00:00.000Z',
        energyDeltaKwh: 1.5,
      }),
    ];
    const { visible } = applyLegacyRechargeFragmentProductRead(
      [...sessionA, ...sessionB],
      true,
    );
    expect(visible.map((row) => row.id).sort()).toEqual(['env-a', 'env-b']);
  });

  it('T5: ambiguous dual-envelope ownership → fail open (keep fragment)', () => {
    const vehicleId = 'veh-ambiguous';
    const fragment = legacyRecharge({
      id: 'frag',
      vehicleId,
      tokenId: '99',
      suffixMs: '5000',
      startIso: '2026-10-12T12:30:00.000Z',
      endIso: '2026-10-12T13:00:00.000Z',
      energyDeltaKwh: 1,
    });
    const envelope1 = legacyRecharge({
      id: 'env-1',
      vehicleId,
      tokenId: '99',
      suffixMs: '1000',
      startIso: '2026-10-12T12:00:00.000Z',
      endIso: '2026-10-12T14:00:00.000Z',
      energyDeltaKwh: 5,
    });
    const envelope2 = legacyRecharge({
      id: 'env-2',
      vehicleId,
      tokenId: '99',
      suffixMs: '2000',
      startIso: '2026-10-12T12:00:00.000Z',
      endIso: '2026-10-12T14:00:00.000Z',
      energyDeltaKwh: 5,
    });
    const { visible, metricResults } = applyLegacyRechargeFragmentProductRead(
      [envelope1, envelope2, fragment],
      true,
    );
    expect(visible).toHaveLength(3);
    expect(metricResults).toContain('ambiguous_preserved');
  });

  it('T6: malformed dimo segment id → fail open', () => {
    const row = legacyRecharge({
      id: 'bad',
      vehicleId: 'veh-malformed',
      tokenId: '99',
      suffixMs: '1000',
      startIso: '2026-10-12T12:00:00.000Z',
      endIso: '2026-10-12T13:00:00.000Z',
      energyDeltaKwh: 1,
    });
    row.dimoSegmentId = 'not-a-dimo-recharge-id';
    const { visible, metricResults } = applyLegacyRechargeFragmentProductRead([row], true);
    expect(visible).toHaveLength(1);
    expect(metricResults).toContain('malformed_preserved');
  });

  it('T7: no cross-vehicle grouping', () => {
    const fragA = legacyRecharge({
      id: 'frag-a',
      vehicleId: 'vehicle-a',
      tokenId: '1',
      suffixMs: '2000',
      startIso: '2026-10-12T12:30:00.000Z',
      endIso: '2026-10-12T13:00:00.000Z',
      energyDeltaKwh: 1,
    });
    const envB = legacyRecharge({
      id: 'env-b',
      vehicleId: 'vehicle-b',
      tokenId: '1',
      suffixMs: '1000',
      startIso: '2026-10-12T12:00:00.000Z',
      endIso: '2026-10-12T14:00:00.000Z',
      energyDeltaKwh: 5,
    });
    const { visible } = applyLegacyRechargeFragmentProductRead([fragA, envB], true);
    expect(visible).toHaveLength(2);
  });

  it('T8: shuffled arrival order → deterministic single parent', () => {
    const rows = buildTesla20261012LegacyRechargeFragmentFixture();
    const shuffled = [...rows].reverse();
    const first = applyLegacyRechargeFragmentProductRead(shuffled, true);
    const second = applyLegacyRechargeFragmentProductRead(rows, true);
    expect(first.visible.map((r) => r.id)).toEqual(second.visible.map((r) => r.id));
  });

  it('T9: trips-timeline path uses canonical projection with gate', () => {
    const rows = buildTesla20261012LegacyRechargeFragmentFixture();
    const off = projectCanonicalProductEnergyEvents(rows, V2_CUTOVER, false, undefined, false);
    const on = projectCanonicalProductEnergyEvents(rows, V2_CUTOVER, false, undefined, true);
    expect(off.filter((r) => r.kind === EnergyEventKind.RECHARGE)).toHaveLength(8);
    expect(on.filter((r) => r.kind === EnergyEventKind.RECHARGE)).toHaveLength(1);
  });

  it('T10: energy values come from envelope row, never summed across fragments', () => {
    const rows = buildTesla20261012LegacyRechargeFragmentFixture();
    const parent = rows[0]!;
    const { visible } = applyLegacyRechargeFragmentProductRead(rows, true);
    expect(visible[0]!.energyDeltaKwh).toBe(parent.energyDeltaKwh);
    const fragmentSum = rows.slice(1).reduce((acc, row) => acc + (row.energyDeltaKwh ?? 0), 0);
    expect(visible[0]!.energyDeltaKwh).not.toBeCloseTo(fragmentSum, 1);
  });

  it('T11: E5.5 canonical-vs-legacy dedupe unchanged when legacy fragment gate ON', () => {
    const canonical = {
      id: 'canonical-1',
      vehicleId: 'veh-e55',
      kind: EnergyEventKind.RECHARGE,
      detectionMechanism: ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
      detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
      canonicalChargeSessionId: 'hv-1',
      sourceEventKey: 'erd:physical:v1:hv-1',
      dimoSegmentId: 'dimo-recharge-1-9000',
      startTime: new Date('2026-10-12T10:00:00.000Z'),
      endTime: new Date('2026-10-12T11:00:00.000Z'),
      durationSeconds: 3600,
      energyDeltaKwh: 5,
      rawDetectionMeta: {},
    } as unknown as VehicleEnergyEvent;
    const legacyDup = legacyRecharge({
      id: 'legacy-dup',
      vehicleId: 'veh-e55',
      tokenId: '1',
      suffixMs: '9000',
      startIso: '2026-10-12T10:00:00.000Z',
      endIso: '2026-10-12T11:00:00.000Z',
      energyDeltaKwh: 5,
    });
    const e55 = applyRechargeProductReadDedupe([canonical, legacyDup], true);
    const combined = applyLegacyRechargeFragmentProductReadToProductRows(
      e55.visible,
      true,
    );
    expect(combined.visible.map((r) => r.id)).toEqual(['canonical-1']);
  });

  it('T12: write authority gate still LEGACY without cutover env', () => {
    const gate = evaluateErdRechargeWriteAuthority({});
    expect(gate.authority).toBe(ERD_RECHARGE_WRITE_AUTHORITY.LEGACY);
  });

  it('does not suppress rows with multi-segment coalesce lineage (not incremental fragment)', () => {
    const vehicleId = 'veh-coalesced';
    const envelope = legacyRecharge({
      id: 'env',
      vehicleId,
      tokenId: '7',
      suffixMs: '1000',
      startIso: '2026-10-12T10:00:00.000Z',
      endIso: '2026-10-12T12:00:00.000Z',
      energyDeltaKwh: 6,
    });
    const notIncremental = legacyRecharge({
      id: 'maybe-frag',
      vehicleId,
      tokenId: '7',
      suffixMs: '2000',
      startIso: '2026-10-12T10:30:00.000Z',
      endIso: '2026-10-12T11:00:00.000Z',
      energyDeltaKwh: 2,
      coalescedOnlySelf: false,
    });
    const { visible } = applyLegacyRechargeFragmentProductRead([envelope, notIncremental], true);
    expect(visible).toHaveLength(2);
  });
});
