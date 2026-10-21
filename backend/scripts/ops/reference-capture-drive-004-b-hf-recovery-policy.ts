/**
 * DI-EV-0035B.6 — RD004-B HF recovery policy lower-bound semantics correction CLI.
 * READ-ONLY: uses B.4 late-arrival + exact-window artifacts; no production changes.
 */
import * as fs from 'fs';
import * as path from 'path';
import { stableStringify } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-alignment';
import { assertSafeOutputPath } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-export';
import type { HfLateArrivalDifferentialRow } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-hf-aggregate-bucket-analysis';
import {
  buildRecoveryPolicyFlags,
  buildHfRuntimeFixContract,
  buildRecoveryPolicyDesign,
  buildRecoveryPolicySimulation,
  type B4WatermarkEvidence,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-b-hf-recovery-policy';
import type { OriginalHfQueryWindow } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-b-hf-exact-window-replay';
import { toRepoRelativePath } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-b-segment-b';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'docs/audits/data/rd004-segment-b');

function parseArg(prefix: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${prefix}=`));
  if (eq) return eq.split('=').slice(1).join('=').trim() || undefined;
  const idx = process.argv.indexOf(prefix);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1].trim();
  return undefined;
}

function main(): void {
  const outDir = parseArg('--out-dir') ?? DEFAULT_OUT_DIR;
  const latePath =
    parseArg('--late-arrival') ?? path.join(outDir, 'rd004-b-hf-late-arrival-analysis.json');
  const replayPath =
    parseArg('--exact-replay') ?? path.join(outDir, 'rd004-b-hf-exact-window-replay.json');
  const watermarkPath =
    parseArg('--watermark') ?? path.join(outDir, 'rd004-b-hf-watermark-recovery-analysis.json');

  const simulationOut = path.join(outDir, 'rd004-b-hf-recovery-policy-simulation.json');
  const designOut = path.join(outDir, 'rd004-b-hf-recovery-policy-design.json');
  const contractOut = path.join(outDir, 'rd004-b-hf-runtime-fix-contract.json');

  for (const p of [simulationOut, designOut, contractOut]) assertSafeOutputPath(p);

  const lateArtifact = JSON.parse(fs.readFileSync(latePath, 'utf8')) as {
    rows: HfLateArrivalDifferentialRow[];
  };
  const replayArtifact = JSON.parse(fs.readFileSync(replayPath, 'utf8')) as {
    ORIGINAL_HF_QUERY_WINDOWS: OriginalHfQueryWindow[];
  };
  const watermarkArtifact = JSON.parse(fs.readFileSync(watermarkPath, 'utf8')) as B4WatermarkEvidence;

  const lateRows = lateArtifact.rows ?? [];
  const simulation = buildRecoveryPolicySimulation({
    lateRows,
    queryWindows: replayArtifact.ORIGINAL_HF_QUERY_WINDOWS ?? [],
    b4Watermark: watermarkArtifact,
  });
  const design = buildRecoveryPolicyDesign({
    simulation,
    lateRows,
    b4Watermark: watermarkArtifact,
  });
  const contract = buildHfRuntimeFixContract(design);
  const flags = buildRecoveryPolicyFlags({ design, b4Watermark: watermarkArtifact });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(simulationOut, stableStringify(simulation));
  fs.writeFileSync(designOut, stableStringify(design));
  fs.writeFileSync(contractOut, stableStringify(contract));

  console.log(
    JSON.stringify(
      {
        ok: true,
        simulationOut: toRepoRelativePath(simulationOut, REPO_ROOT),
        designOut: toRepoRelativePath(designOut, REPO_ROOT),
        contractOut: toRepoRelativePath(contractOut, REPO_ROOT),
        flags,
      },
      null,
      2,
    ),
  );
}

main();
