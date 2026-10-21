import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  clearTrackedPidsFile,
  initializeTrackedPidsFile,
  readTrackedPids,
  recordTrackedPid,
} from './validation-process-tracked-pids.util.mjs';

test('recordTrackedPid appends pid lines for shell cleanup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'synqdrive-val-pids-'));
  const file = join(dir, 'tracked-pids.txt');
  try {
    initializeTrackedPidsFile(file);
    process.env.VALIDATION_TRACKED_PIDS_FILE = file;
    recordTrackedPid(4242, 'phase-c-restart');
    recordTrackedPid(9999, 'replica-b');

    assert.equal(readFileSync(file, 'utf8'), '4242\tphase-c-restart\n9999\treplica-b\n');
    assert.deepEqual(readTrackedPids(file), [4242, 9999]);
    clearTrackedPidsFile(file);
    assert.deepEqual(readTrackedPids(file), []);
  } finally {
    delete process.env.VALIDATION_TRACKED_PIDS_FILE;
    rmSync(dir, { recursive: true, force: true });
  }
});
