import { evaluateAllInstalledDevices } from './pdi-identity-drift-shadow.evaluator';
import {
  PdiIdentityDriftConfidence,
  PdiIdentityDriftReasonCode,
  type PdiInstalledDeviceObservationInput,
} from './pdi-identity-drift-shadow.types';

const NOW = new Date('2026-10-22T12:00:00.000Z');
const SYNC_RUN = 'sync-run-test';

function device(
  partial: Partial<PdiInstalledDeviceObservationInput> & {
    physicalDeviceId: string;
    vehicleId: string;
    expectedSerial: string;
  },
): PdiInstalledDeviceObservationInput {
  return {
    dimoTokenId: 100001,
    identityStatus: 'VERIFIED',
    inventoryStatus: 'INSTALLED',
    activeInstallAssignmentCount: 1,
    observedSerial: partial.expectedSerial,
    mirrorSyncedAt: NOW,
    mirrorRawJsonSha256: 'abc',
    ...partial,
  };
}

function evaluateThreeVehicleFixture(
  overrides: Partial<Record<'a' | 'b' | 'c', Partial<PdiInstalledDeviceObservationInput>>>,
) {
  const serials = {
    a: 'R1-TEST-VEHICLE-AAA',
    b: 'R1-TEST-VEHICLE-BBB',
    c: 'R1-TEST-VEHICLE-CCC',
  };
  const devices = [
    device({
      physicalDeviceId: '11111111-1111-4111-8111-111111111111',
      vehicleId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expectedSerial: serials.a,
      dimoTokenId: 100001,
      ...overrides.a,
    }),
    device({
      physicalDeviceId: '22222222-2222-4222-8222-222222222222',
      vehicleId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      expectedSerial: serials.b,
      dimoTokenId: 100002,
      ...overrides.b,
    }),
    device({
      physicalDeviceId: '33333333-3333-4333-8333-333333333333',
      vehicleId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      expectedSerial: serials.c,
      dimoTokenId: 100003,
      ...overrides.c,
    }),
  ];
  const known = Object.values(serials);
  return evaluateAllInstalledDevices({
    now: NOW,
    syncRunId: SYNC_RUN,
    devices,
    knownInventorySerials: known,
  });
}

describe('pdi-identity-drift-shadow.evaluator', () => {
  it('1. three vehicles with correct serials → MATCH', () => {
    const rows = evaluateThreeVehicleFixture({});
    expect(rows.every((r) => r.reasonCode === PdiIdentityDriftReasonCode.MATCH)).toBe(true);
    expect(rows.every((r) => r.confidence === PdiIdentityDriftConfidence.HIGH)).toBe(true);
  });

  it('2. vehicle B shows vehicle A serial → SWAP_SUSPECTED on B', () => {
    const rows = evaluateThreeVehicleFixture({
      b: { observedSerial: 'R1-TEST-VEHICLE-AAA' },
    });
    const b = rows.find((r) => r.vehicleId === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(b?.reasonCode).toBe(PdiIdentityDriftReasonCode.SWAP_SUSPECTED);
  });

  it('3. unknown observed serial → UNKNOWN_DEVICE', () => {
    const rows = evaluateThreeVehicleFixture({
      c: { observedSerial: 'R1-UNKNOWN-99999999' },
    });
    const c = rows.find((r) => r.vehicleId === 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(c?.reasonCode).toBe(PdiIdentityDriftReasonCode.UNKNOWN_DEVICE);
  });

  it('4. known but wrong serial (in inventory, not other active install) → ASSIGNMENT_MISMATCH', () => {
    const devices = [
      device({
        physicalDeviceId: '33333333-3333-4333-8333-333333333333',
        vehicleId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        expectedSerial: 'R1-TEST-VEHICLE-CCC',
        dimoTokenId: 100003,
        observedSerial: 'R1-TEST-WAREHOUSE-001',
      }),
    ];
    const rows = evaluateAllInstalledDevices({
      now: NOW,
      syncRunId: SYNC_RUN,
      devices,
      knownInventorySerials: ['R1-TEST-VEHICLE-CCC', 'R1-TEST-WAREHOUSE-001'],
    });
    const c = rows.find((r) => r.vehicleId === 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(c?.reasonCode).toBe(PdiIdentityDriftReasonCode.ASSIGNMENT_MISMATCH);
  });

  it('5. missing observed serial → IDENTITY_UNCONFIRMED', () => {
    const rows = evaluateThreeVehicleFixture({
      a: { observedSerial: null },
    });
    const a = rows.find((r) => r.vehicleId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(a?.reasonCode).toBe(PdiIdentityDriftReasonCode.IDENTITY_UNCONFIRMED);
  });

  it('10. ambiguous active INSTALL assignments → IDENTITY_UNCONFIRMED', () => {
    const rows = evaluateAllInstalledDevices({
      now: NOW,
      syncRunId: SYNC_RUN,
      devices: [
        device({
          physicalDeviceId: '44444444-4444-4444-8444-444444444444',
          vehicleId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          expectedSerial: 'R1-TEST-AMBIG-0001',
          activeInstallAssignmentCount: 2,
        }),
      ],
      knownInventorySerials: ['R1-TEST-AMBIG-0001'],
    });
    expect(rows[0].reasonCode).toBe(PdiIdentityDriftReasonCode.IDENTITY_UNCONFIRMED);
    expect(rows[0].detailCodes).toContain('AMBIGUOUS_ACTIVE_INSTALL_ASSIGNMENT');
  });
});

describe('stale mirror', () => {
  it('6. stale provider evidence → UNCONFIRMED confidence (no confirmation path)', () => {
    const stale = new Date(NOW.getTime() - 26 * 60 * 60 * 1000);
    const rows = evaluateAllInstalledDevices({
      now: NOW,
      syncRunId: SYNC_RUN,
      devices: [
        device({
          physicalDeviceId: '55555555-5555-4555-8555-555555555555',
          vehicleId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          expectedSerial: 'R1-TEST-STALE-0001',
          observedSerial: 'R1-TEST-WRONG-0002',
          mirrorSyncedAt: stale,
        }),
      ],
      knownInventorySerials: ['R1-TEST-STALE-0001', 'R1-TEST-WRONG-0002'],
    });
    expect(rows[0].reasonCode).toBe(PdiIdentityDriftReasonCode.IDENTITY_UNCONFIRMED);
    expect(rows[0].confidence).toBe(PdiIdentityDriftConfidence.UNCONFIRMED);
  });
});
