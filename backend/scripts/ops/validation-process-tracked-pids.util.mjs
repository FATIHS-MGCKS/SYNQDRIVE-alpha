/**
 * Track PIDs spawned by multi-replica validation harnesses so shell traps can
 * terminate detached children (e.g. Phase C restart in leader probe).
 */
import { appendFileSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

export function trackedPidsFilePath() {
  return process.env.VALIDATION_TRACKED_PIDS_FILE || '';
}

export function recordTrackedPid(pid, label = 'child') {
  const file = trackedPidsFilePath();
  if (!file || !Number.isFinite(pid) || pid <= 0) return;
  appendFileSync(file, `${pid}\t${label}\n`, 'utf8');
}

export function initializeTrackedPidsFile(filePath) {
  writeFileSync(filePath, '', 'utf8');
}

export function readTrackedPids(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const pids = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [pidText] = trimmed.split('\t');
      const pid = Number(pidText);
      if (Number.isFinite(pid) && pid > 0) pids.push(pid);
    }
    return pids;
  } catch {
    return [];
  }
}

export function clearTrackedPidsFile(filePath) {
  try {
    unlinkSync(filePath);
  } catch {
    // ignore missing file
  }
}
