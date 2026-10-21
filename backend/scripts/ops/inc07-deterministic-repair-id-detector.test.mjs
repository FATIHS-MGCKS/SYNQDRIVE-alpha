import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  buildIntraTripGapSplitRepairAuditId,
  canonicalizePostgresTimestampToUtcIso,
  countDeterministicIntraTripGapSplitRepairIds,
  isDeterministicIntraTripGapSplitRepairId,
} from './inc07-deterministic-repair-id-detector.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = join(__dirname, '..', '..');

const VEHICLE = '8c850ff1-4201-432b-af2e-2711dbc7ca48';
const GAP_END = new Date('2026-09-02T15:22:57.000Z');
const GAP_START = new Date('2026-09-02T15:26:12.000Z');

function buildFromTypeScriptRuntime() {
  const snippet = `
    import { buildIntraTripGapSplitRepairAuditId } from './src/modules/vehicle-intelligence/trips/reconciliation/intra-trip-gap-split-repair-id.util';
    const id = buildIntraTripGapSplitRepairAuditId(
      '${VEHICLE}',
      new Date('2026-09-02T15:22:57.000Z'),
      new Date('2026-09-02T15:26:12.000Z'),
    );
    process.stdout.write(id);
  `;
  const result = spawnSync(
    'npx',
    ['ts-node', '-r', 'tsconfig-paths/register', '-e', snippet],
    { cwd: BACKEND_ROOT, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'ts-node runtime ID failed');
  }
  return result.stdout.trim();
}

test('CASE A: runtime helper ID is recognized by ops detector', () => {
  const runtimeId = buildFromTypeScriptRuntime();
  const opsId = buildIntraTripGapSplitRepairAuditId(VEHICLE, GAP_END, GAP_START);
  assert.equal(opsId, runtimeId);
  assert.equal(
    isDeterministicIntraTripGapSplitRepairId(runtimeId, VEHICLE, GAP_END, GAP_START),
    true,
  );
  assert.equal(
    countDeterministicIntraTripGapSplitRepairIds([
      {
        id: runtimeId,
        vehicle_id: VEHICLE,
        window_from: GAP_END,
        window_to: GAP_START,
      },
    ]),
    1,
  );
});

test('CASE B: changed vehicleId is rejected', () => {
  const repairId = buildIntraTripGapSplitRepairAuditId(VEHICLE, GAP_END, GAP_START);
  assert.equal(
    isDeterministicIntraTripGapSplitRepairId(
      repairId,
      '00000000-0000-4000-8000-000000000001',
      GAP_END,
      GAP_START,
    ),
    false,
  );
});

test('CASE C: changed firstEndAt (window_from) is rejected', () => {
  const repairId = buildIntraTripGapSplitRepairAuditId(VEHICLE, GAP_END, GAP_START);
  assert.equal(
    isDeterministicIntraTripGapSplitRepairId(
      repairId,
      VEHICLE,
      new Date('2026-09-02T18:55:00.000Z'),
      GAP_START,
    ),
    false,
  );
});

test('CASE D: changed secondStartAt (window_to) is rejected', () => {
  const repairId = buildIntraTripGapSplitRepairAuditId(VEHICLE, GAP_END, GAP_START);
  assert.equal(
    isDeterministicIntraTripGapSplitRepairId(
      repairId,
      VEHICLE,
      GAP_END,
      new Date('2026-09-02T18:58:15.000Z'),
    ),
    false,
  );
});

test('CASE E: random legacy UUID is rejected', () => {
  const legacyId = randomUUID();
  assert.equal(
    isDeterministicIntraTripGapSplitRepairId(legacyId, VEHICLE, GAP_END, GAP_START),
    false,
  );
});

test('CASE F: same semantic inputs produce stable same ID', () => {
  const a = buildIntraTripGapSplitRepairAuditId(VEHICLE, GAP_END, GAP_START);
  const b = buildIntraTripGapSplitRepairAuditId(VEHICLE, GAP_END, GAP_START);
  assert.equal(a, b);
});

test('timestamp canonicalization matches Date.toISOString semantics', () => {
  assert.equal(
    canonicalizePostgresTimestampToUtcIso('2026-09-02 15:22:57.123456'),
    '2026-09-02T15:22:57.123Z',
  );
  assert.equal(
    canonicalizePostgresTimestampToUtcIso('2026-09-02T15:22:57.000Z'),
    '2026-09-02T15:22:57.000Z',
  );
  assert.equal(
    buildIntraTripGapSplitRepairAuditId(
      VEHICLE,
      '2026-09-02 15:22:57',
      '2026-09-02 15:26:12',
    ),
    buildIntraTripGapSplitRepairAuditId(VEHICLE, GAP_END, GAP_START),
  );
});
