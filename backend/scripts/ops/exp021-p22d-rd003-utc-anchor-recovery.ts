#!/usr/bin/env ts-node
/**
 * EXP021 P22D — RD003 independent UTC anchor recovery (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { buildClipRecoveryTable, buildP22DPayload } from './exp021-p22d-rd003-utc-anchor-recovery.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) throw new Error('usage: --out-dir <dir> [--pr 2051]');
  return path.resolve(argv[i + 1]);
}

function parsePr(argv: string[]): number {
  const i = argv.indexOf('--pr');
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : 2051;
}

function renderMd(payload: ReturnType<typeof buildP22DPayload>): string {
  const lines = [
    '# EXP021 P22D — RD003 Independent UTC Anchor Recovery',
    '',
    `**Result:** \`${payload.p22dResult}\` · PR #${payload.prNumber} · HEAD \`${payload.headSha}\``,
    '',
    '## Original sources',
    '',
    `- Video files in repo: **${payload.originalSourcesAudit.videoContainerMetadataInRepository}**`,
    `- Creation timestamps in repo: **${payload.originalSourcesAudit.videoCreationTimestampsInRepository}**`,
    `- Session bounds (sealed): ${payload.originalSourcesAudit.sessionBounds.fromSealedSummary.startedAt} → ${payload.originalSourcesAudit.sessionBounds.fromSealedSummary.stoppedAt}`,
    '',
    '## Anchor counts',
    '',
    `- Independent (visual minute transitions only): **${payload.anchors.independentUtcAnchors}**`,
    `- Visual + assumed CEST: **${payload.anchors.visualAssumedTimezoneAnchors}**`,
    `- Telemetry-derived (HF fit): **${payload.anchors.telemetryDerivedAnchors}**`,
    '',
    '## Clips',
    '',
    '| Clip | Earliest start UTC | Latest start UTC | Independent best | Telemetry fit start | Status |',
    '|------|-------------------|------------------|------------------|---------------------|--------|',
  ];
  for (const c of payload.clips) {
    lines.push(
      `| ${c.clipId} | ${c.earliestUtcStart ?? '—'} | ${c.latestUtcStart ?? '—'} | ${c.bestIndependentUtcStart ?? '—'} | ${c.telemetryDerivedStart ?? '—'} | ${c.validationStatus} |`,
    );
  }
  lines.push('', '## Quality gates', '');
  for (const [k, v] of Object.entries(payload.qualityGates)) {
    lines.push(`- **${k}:** ${JSON.stringify(v)}`);
  }
  lines.push('', '## Blockers', '');
  for (const b of payload.recoveryBlockers) lines.push(`- ${b}`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const pr = parsePr(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const payload = buildP22DPayload(repoRoot, headSha, pr);
  fs.writeFileSync(path.join(outDir, 'P22D_UTC_ANCHOR_RECOVERY.json'), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(outDir, 'P22D_AUDIT_REPORT.md'), renderMd(payload));
  fs.writeFileSync(path.join(outDir, 'P22D_RESULT.txt'), payload.completionLines.join('\n') + '\n');

  console.log(
    JSON.stringify(
      {
        ok: true,
        p22dResult: payload.p22dResult,
        clipsWithValidatedUtc: payload.qualityGates.B_clipUtcSynchronization.clipsWithValidatedUtc,
        outDir,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
