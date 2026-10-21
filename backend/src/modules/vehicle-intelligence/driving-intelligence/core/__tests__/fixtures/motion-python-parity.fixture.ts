import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

export const PY_PROTO = '/opt/cursor/artifacts/exp021-motion-core-design/prototype';
const DIMO_RO = '/opt/cursor/artifacts/exp021-motion-core-design/inputs/dimo_readonly';

export function loadDimoSparseSpeedForTrip(videoTrip: 1 | 2): Array<{ label: string; speed_kmh: number }> {
  const p = path.join(DIMO_RO, `TRIP_${videoTrip}_dimo_speed_location_1s.json`);
  if (!fs.existsSync(p)) {
    return [];
  }
  const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    rows: Array<{ timestamp: string; speedAvg: number | null }>;
  };
  return doc.rows
    .filter((r) => r.speedAvg != null)
    .map((r) => ({
      label: r.timestamp.replace('.000Z', 'Z'),
      speed_kmh: r.speedAvg as number,
    }));
}

export function pyC4Json(grid: unknown[]): Array<Record<string, unknown>> {
  const tmpIn = '/tmp/mc-grid-in.json';
  const tmpOut = '/tmp/mc-c4-out.json';
  fs.writeFileSync(tmpIn, JSON.stringify(grid));
  execSync(
    `python3 -c "import json; from speed_candidates import c4_adaptive_l3; g=json.load(open('${tmpIn}')); o=[{'label':s.label,'value_kmh':s.value_kmh,'quality':s.quality,'support_labels':s.support_labels,'support_span_s':s.support_span_s,'flags':s.flags,'estimator':s.estimator} for s in c4_adaptive_l3(g)]; json.dump(o, open('${tmpOut}','w'))"`,
    { cwd: PY_PROTO, stdio: 'pipe' },
  );
  return JSON.parse(fs.readFileSync(tmpOut, 'utf8')) as Array<Record<string, unknown>>;
}

export interface PyFsmLabel {
  label: string;
  state: string;
  evidence_quality: string;
  reason: string;
  speed_kmh: number | null;
  position_present: boolean;
  mode: string;
  flags: string[];
}

export function pyFsmJson(
  grid: unknown[],
  mode: 'CAUSAL' | 'RETROSPECTIVE',
  sparse: Array<{ label: string; speed_kmh: number }> | null = null,
): PyFsmLabel[] {
  const tmpG = '/tmp/mc-fsm-grid.json';
  const tmpSp = '/tmp/mc-fsm-sparse.json';
  const tmpOut = '/tmp/mc-fsm-out.json';
  fs.writeFileSync(tmpG, JSON.stringify(grid));
  const sparseArg = sparse ? `json.load(open('${tmpSp}'))` : 'None';
  if (sparse) {
    fs.writeFileSync(tmpSp, JSON.stringify(sparse));
  }
  execSync(
    `python3 -c "import json; from motion_fsm import run_fsm; from speed_candidates import c4_adaptive_l3; g=json.load(open('${tmpG}')); sp=c4_adaptive_l3(g); o=run_fsm(g, sp, '${mode}', ${sparseArg}); json.dump([{'label':x.label,'state':x.state,'evidence_quality':x.evidence_quality,'reason':x.reason,'speed_kmh':x.speed_kmh,'position_present':x.position_present,'mode':x.mode,'flags':x.flags} for x in o], open('${tmpOut}','w'))"`,
    { cwd: PY_PROTO, stdio: 'pipe' },
  );
  return JSON.parse(fs.readFileSync(tmpOut, 'utf8')) as PyFsmLabel[];
}
