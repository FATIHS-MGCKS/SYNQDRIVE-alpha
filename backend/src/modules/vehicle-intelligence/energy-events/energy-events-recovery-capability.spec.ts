import {
  buildRecoveryVehicleInput,
  isSyntheticQuickTokenId,
  resolveRecoveryVehicleCapabilities,
  type RecoveryVehicleDbLoad,
} from './energy-events-recovery-capability';
import {
  buildFleetFallbackVehicles,
  mergeAuditedFleetIntoDbVehicles,
} from './energy-events-recovery-read.repository';
import { runEnergyEventsRecoveryDryRun } from './energy-events-recovery-runner';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '@modules/vehicle-intelligence/battery-health/capability-preflight/battery-capability-signals.registry';
import { createDimoRequestAccounting } from './energy-events-recovery-accounting';

const VEHICLE_ID = 'clveh1234567890123456789012';

function buildDbLoad(
  overrides: Partial<RecoveryVehicleDbLoad> = {},
): RecoveryVehicleDbLoad {
  return {
    vehicleId: VEHICLE_ID,
    label: 'TEST_VEHICLE',
    tokenId: 900001,
    provider: 'LTE_R1',
    fuelType: 'GASOLINE',
    dimoAccessAvailable: true,
    existingEvents: [],
    batteryCapabilities: [],
    ...overrides,
  };
}

describe('energy-events recovery capability discovery', () => {
  it('A. ICE with zero events but fuel signal capability → REFUEL_CANDIDATE', () => {
    const resolved = resolveRecoveryVehicleCapabilities({
      row: buildDbLoad({ fuelType: 'GASOLINE', existingEvents: [] }),
      availableSignals: [
        'powertrainFuelSystemRelativeLevel',
        'powertrainFuelSystemAbsoluteLevel',
      ],
      mode: 'full',
    });

    expect(resolved.capabilityLookupStatus).toBe('ok');
    expect(resolved.relativeFuelAvailable).toBe(true);
    expect(resolved.absoluteFuelAvailable).toBe(true);
    expect(resolved.rechargeSocAvailable).toBe(false);
  });

  it('B. EV with zero events but SOC/recharge capability → RECHARGE_CANDIDATE', () => {
    const resolved = resolveRecoveryVehicleCapabilities({
      row: buildDbLoad({
        fuelType: 'ELECTRIC',
        existingEvents: [],
        batteryCapabilities: [
          {
            signalKey: RECHARGE_SEGMENTS_SIGNAL_KEY,
            status: 'AVAILABLE',
          },
        ],
      }),
      availableSignals: [
        RECHARGE_SEGMENTS_SIGNAL_KEY,
        'powertrainTractionBatteryStateOfChargeCurrent',
      ],
      mode: 'full',
    });

    expect(resolved.capabilityLookupStatus).toBe('ok');
    expect(resolved.rechargeSocAvailable).toBe(true);
    expect(resolved.relativeFuelAvailable).toBe(false);
  });

  it('C. zero events + capability lookup failure → CAPABILITY_UNKNOWN and FULL NOT READY', async () => {
    const vehicle = buildRecoveryVehicleInput(
      buildDbLoad({ fuelType: 'GASOLINE', existingEvents: [] }),
      null,
      'full',
    );

    expect(vehicle.capabilityLookupStatus).toBe('failed');

    const report = await runEnergyEventsRecoveryDryRun([vehicle], {
      fetchSegments: async () => ({
        segments: [],
        outcomes: [],
        accounting: createDimoRequestAccounting(),
      }),
      interRequestDelayMs: 0,
      windowsOverride: [
        { from: new Date('2026-08-22T00:00:00.000Z'), to: new Date('2026-08-24T00:00:00.000Z') },
      ],
      mode: 'full',
      dbComparisonEnabled: true,
      dbComparisonStatus: 'ok',
    });

    expect(report.vehicles[0]?.energyClass).toBe('CAPABILITY_UNKNOWN');
    expect(report.backfillGate).toBe('NOT READY');
    expect(report.gateBlockers).toContain('CAPABILITY_UNKNOWN:1');
    expect(report.trafficBudget.capabilityUnknownVehicles).toBe(1);
  });

  it('D. absent existing events must NOT imply NO_ENERGY_SIGNAL when probe succeeds', () => {
    const vehicle = buildRecoveryVehicleInput(
      buildDbLoad({ existingEvents: [] }),
      ['powertrainFuelSystemRelativeLevel'],
      'full',
    );

    expect(vehicle.relativeFuelAvailable).toBe(true);
    expect(vehicle.capabilityLookupStatus).toBe('ok');
  });

  it('E. synthetic QUICK profiles never appear in FULL inventory merge', () => {
    const dbVehicle = buildRecoveryVehicleInput(
      buildDbLoad({ tokenId: 900001 }),
      ['powertrainFuelSystemRelativeLevel'],
      'full',
    );
    const merged = mergeAuditedFleetIntoDbVehicles(
      [dbVehicle],
      { 900001: true, 100001: true },
      true,
    );

    expect(merged).toHaveLength(1);
    expect(merged.some((vehicle) => isSyntheticQuickTokenId(vehicle.tokenId))).toBe(
      false,
    );
  });

  it('F. FULL inventory contains only DB-mapped production vehicles', () => {
    const dbVehicle = buildRecoveryVehicleInput(
      buildDbLoad({ tokenId: 900001 }),
      ['powertrainFuelSystemRelativeLevel'],
      'full',
    );
    const merged = mergeAuditedFleetIntoDbVehicles([dbVehicle], { 900001: true }, true);

    expect(merged.every((vehicle) => vehicle.dbVehicleMapped)).toBe(true);
    expect(merged.every((vehicle) => !isSyntheticQuickTokenId(vehicle.tokenId))).toBe(
      true,
    );
  });

  it('G. QUICK mode still works with synthetic profiles', () => {
    const quickVehicles = buildFleetFallbackVehicles({
      100001: true,
      100002: true,
      100099: false,
    });

    expect(quickVehicles.length).toBeGreaterThan(0);
    expect(quickVehicles.some((vehicle) => vehicle.tokenId === 100001)).toBe(true);
    expect(quickVehicles.every((vehicle) => vehicle.capabilityLookupStatus === 'ok')).toBe(
      true,
    );
  });

  // Asserted structurally rather than against known production tokenIds, so the
  // guard itself does not commit the very identifiers it forbids.
  it('H. privacy regression — capability module has no production token fixtures', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, 'energy-events-recovery-capability.ts'),
      'utf8',
    );

    const numericLiterals = (source.match(/\b\d[\d_]*\b/g) ?? []).map(
      (literal: string) => Number(literal.replace(/_/g, '')),
    );
    const productionShapedTokenIds = numericLiterals.filter(
      (value: number) =>
        Number.isInteger(value) &&
        value >= 100_000 &&
        value <= 9_999_999 &&
        !isSyntheticQuickTokenId(value),
    );

    expect(productionShapedTokenIds).toEqual([]);
    expect(source).not.toMatch(/licensePlate/);
    expect(source).not.toMatch(/\b[A-ZÄÖÜ]{1,3}[ -][A-Z]{1,2}[ -]?\d{1,4}\b/);
  });
});

describe('energy-events recovery capability classification', () => {
  it('classifies resolved ICE fuel capability as REFUEL_CANDIDATE in runner', async () => {
    const vehicle = buildRecoveryVehicleInput(
      buildDbLoad(),
      ['powertrainFuelSystemRelativeLevel'],
      'full',
    );

    const report = await runEnergyEventsRecoveryDryRun([vehicle], {
      fetchSegments: async () => ({
        segments: [],
        outcomes: [],
        accounting: createDimoRequestAccounting(),
      }),
      interRequestDelayMs: 0,
      windowsOverride: [
        { from: new Date('2026-08-22T00:00:00.000Z'), to: new Date('2026-08-24T00:00:00.000Z') },
      ],
      mode: 'full',
      dbComparisonEnabled: true,
      dbComparisonStatus: 'ok',
    });

    expect(report.vehicles[0]?.energyClass).toBe('REFUEL_CANDIDATE');
    expect(report.trafficBudget.eligibleVehicles).toBe(1);
  });
});
