#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 3E.5 runner — MOV OCR pack validation report.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  BASELINE_AMBIGUOUS,
  BASELINE_ASSOCIATED,
  BASELINE_UNKNOWN,
  PACK_REL,
  runPhase3e5Analysis,
} from './ldi10d-phase3e5-mov-ocr-validation.lib';

const VITERBI_ASSOCIATED = 300;
const VITERBI_AMBIGUOUS = 357;
const VITERBI_UNKNOWN = 479;

function outDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10d');
  }
  return path.resolve(argv[i + 1]);
}

function main(): void {
  const out = outDir(process.argv.slice(2));
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  const a = runPhase3e5Analysis(repoRoot);
  if (!a.preflight.ok) {
    console.error(JSON.stringify({ ok: false, phase: '3E.5', errors: a.preflight.errors }));
    process.exit(1);
  }

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E5_OCR_VALIDATION.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E5_OCR_VALIDATION_V1',
        headSha,
        sourcePack: PACK_REL,
        framesSampleInZip: a.preflight.framesSamplePresent,
        frameCrosscheckSource: 'LDI10D_PHASE3E4_IPHONE_GPS_OBSERVATIONS.json (18 review frames)',
        stats: a.validation.stats,
        verificationBreakdown: a.validation.rows.reduce(
          (acc, row) => {
            acc[row.verification] = (acc[row.verification] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E5_VERIFIED_OBSERVATIONS.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E5_VERIFIED_OBSERVATIONS_V1',
        headSha,
        criteria:
          'PARSED rows with +51/+9 in raw OCR, corridor/lon band, DIMO haversine ≤35 m, no implausible jump; optional 3E.4 frame cross-check ≤15 m',
        verified: a.validation.verified,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E5_SPATIAL_COMPARISON.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E5_SPATIAL_COMPARISON_V1',
        headSha,
        verifiedPairCount: a.validation.verified.length,
        haversineM: a.validation.spatial,
        roadIdGroundTruth: 'NOT_ASSESSABLE',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E5_ROAD_MATCHING_AT_VERIFIED.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E5_ROAD_MATCHING_AT_VERIFIED_V1',
        headSha,
        note: 'Outcome distribution at verified iPhone overlay UTC only; not road-ID accuracy.',
        tripWidePinnedCounts: {
          baseline: { ASSOCIATED: BASELINE_ASSOCIATED, AMBIGUOUS: BASELINE_AMBIGUOUS, UNKNOWN: BASELINE_UNKNOWN },
          viterbi: { ASSOCIATED: VITERBI_ASSOCIATED, AMBIGUOUS: VITERBI_AMBIGUOUS, UNKNOWN: VITERBI_UNKNOWN },
        },
        atVerifiedIphoneUtc: a.validation.roadAtVerified,
        roadMatchingAccuracy: 'NOT_ASSESSABLE',
        viterbiImprovementProven: 'NO',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E5_TIMESTAMP_SYNC.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E5_TIMESTAMP_SYNC_V1',
        headSha,
        overlayUtcSource: 'ChatGPT pack (CEST→UTC); joined to DIMO buckets ±2 s',
        meanAlignmentNote: 'No arbitrary shift applied',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E5_STOP_CONTEXT.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E5_STOP_CONTEXT_V1',
        headSha,
        observedStandstills: 0,
        inferredStopCandidates: a.validation.stopCandidates,
        labelingNote: 'Low overlay speed ≠ confirmed standstill; no tachometer OCR in pack',
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E5_FAILURE_REGISTER.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_PHASE3E5_FAILURE_REGISTER_V1',
        headSha,
        items: [
          {
            id: 'FM_NO_FRAME_CROPS_IN_LIGHT_ZIP',
            severity: 'LIMITATION',
            description: 'CURSOR_LIGHT zip lacks frames_sample; frame validation uses Phase 3E.4 review pack only.',
          },
          {
            id: 'FM_OCR_PARTIAL_ROWS',
            severity: 'DATA_QUALITY',
            description: `${a.validation.stats.partialCount} PARTIAL_REVIEW_REQUIRED rows excluded from verified set.`,
          },
          {
            id: 'FM_LON_OCR_ERRORS',
            severity: 'DATA_QUALITY',
            description: 'Examples: 9.545266, 9.572081, 9.873 fragment — rejected by lon band.',
          },
          {
            id: 'FM_GPS_FREEZE',
            severity: 'FINDING',
            description: `${a.validation.stats.freezeCandidates} rows with repeated coords and changing displayed speed.`,
          },
          {
            id: 'FM_ROAD_ID_GT',
            severity: 'GAP',
            description: 'Independent road-identity labels absent — accuracy NOT_ASSESSABLE.',
          },
        ],
      },
      null,
      2,
    ),
  );

  const reportMd = [
    '# LDI-10D Phase 3E.5 — Forschungsbericht (MOV OCR Pack)',
    '',
    '## Quelle',
    `- Pack: \`${PACK_REL}\` (206 Zeilen @ 5 s, ChatGPT/Tesseract)`,
    `- Frame-Crops im Light-ZIP: **${a.preflight.framesSamplePresent ? 'JA' : 'NEIN'}** → Kreuzvalidierung über **Phase 3E.4** Review-Frames (18 Punkte)`,
    '',
    '## OCR-Validierung',
    `| Metrik | Wert |`,
    `| --- | ---: |`,
    `| Zeilen gesamt | ${a.validation.stats.total} |`,
    `| PARTIAL_REVIEW_REQUIRED | ${a.validation.stats.partialCount} |`,
    `| **Verifiziert für Vergleich** | **${a.validation.stats.verifiedCount}** |`,
    `| DIMO-Abweisung (>35 m / fehlendes Bucket) | ${a.validation.stats.dimoRejections} |`,
    `| Positions-Sprung-Abweisung | ${a.validation.stats.jumpRejections} |`,
    `| GPS-Freeze-Kandidaten (Koordinate gleich, Speed ändert sich) | ${a.validation.stats.freezeCandidates} |`,
    '',
    '### Verifikationskriterien (strikt)',
    '1. Kein `PARTIAL_REVIEW_REQUIRED`',
    '2. Explizites `+51…,+9…` in `raw_ocr`',
    '3. Korridor lat und lon-Band',
    '4. DIMO POSITION Haversine ≤ 35 m (Bucket ±2 s)',
    '5. Kein unrealistischer Sprung vs. letzte verifizierte Zeile derselben Aufnahme',
    '',
    '## Räumlicher Vergleich (nur verifizierte Punkte)',
    `| Median | ${a.validation.spatial.medianM?.toFixed(2) ?? 'N/A'} m |`,
    `| P90 | ${a.validation.spatial.p90M?.toFixed(2) ?? 'N/A'} m |`,
    `| P95 | ${a.validation.spatial.p95M?.toFixed(2) ?? 'N/A'} m |`,
    `| Robuste Paare (≤500 m) | ${a.validation.spatial.robustCount} |`,
    '',
    '## Road Matching (Phase 3E.3 Kontext, keine Ground Truth)',
    `An verifizierten iPhone-UTC-Zeitstempeln: Baseline-Verteilung ${JSON.stringify(a.validation.roadAtVerified.baseline)} · Viterbi ${JSON.stringify(a.validation.roadAtVerified.viterbi)} · Widersprüchliche Labels **${a.validation.roadAtVerified.disagreementBuckets}** Buckets.`,
    `Trip-weit pinned (1 136 s): Baseline ASSOCIATED **${BASELINE_ASSOCIATED}** · Viterbi **${VITERBI_ASSOCIATED}** — **Verbesserung bewiesen: NEIN**`,
    '',
    '## Stillstand / Kontext',
    '- **OBSERVED** Standstill: **0**',
    `- **INFERRED_CANDIDATE**: ${a.validation.stopCandidates.length} Intervalle (niedrige Overlay-Geschwindigkeit, nicht bestätigt)`,
    '',
    '## Governance',
    'QC_MUTATIONS=NONE · PRODUCTION_MUTATIONS=NONE · L3 unverändert · Viterbi nicht aktiviert',
    '',
    '**STOP: WAIT_OWNER_REVIEW**',
  ].join('\n');

  fs.writeFileSync(path.join(out, 'LDI10D_PHASE3E5_RESEARCH_REPORT.md'), reportMd);

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E5_OWNER_DECISION.md'),
    [
      '# Owner decision — Phase 3E.5',
      '',
      '| Gate | Result |',
      '| --- | --- |',
      `| Verified iPhone points for DIMO compare | **${a.validation.stats.verifiedCount}** / 206 |`,
      `| Road-ID accuracy | **NOT_ASSESSABLE** |`,
      `| Viterbi promotion | **BLOCKED** |`,
    ].join('\n'),
  );

  const result = {
    LDI10D_PHASE: '3E5',
    SOURCE_PACK: 'CHATGPT_MOV_OCR_5S',
    FRAMES_IN_ZIP: a.preflight.framesSamplePresent ? 'YES' : 'NO',
    OCR_ROWS_TOTAL: a.validation.stats.total,
    OCR_PARTIAL_ROWS: a.validation.stats.partialCount,
    VERIFIED_FOR_COMPARISON: a.validation.stats.verifiedCount,
    MEDIAN_SPATIAL_DISAGREEMENT_M: a.validation.spatial.medianM,
    P95_SPATIAL_DISAGREEMENT_M: a.validation.spatial.p95M,
    ROAD_ID_GROUND_TRUTH_STATUS: 'NOT_ASSESSABLE',
    ROAD_MATCHING_IMPROVEMENT_PROVEN: 'NO',
    OBSERVED_STANDSTILLS: 0,
    INFERRED_STOP_CANDIDATES: a.validation.stopCandidates.length,
    QC_MUTATIONS: 'NONE',
    PRODUCTION_MUTATIONS: 'NONE',
    DEPLOY_EXECUTED: 'NO',
    NEXT_SAFE_ACTION: 'WAIT_OWNER_REVIEW',
    STOP: 'WAIT_OWNER_REVIEW',
    headSha,
  };

  fs.writeFileSync(
    path.join(out, 'LDI10D_PHASE3E5_RESULT.md'),
    ['# LDI-10D Phase 3E.5 — Result', '', '```json', JSON.stringify(result, null, 2), '```'].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, ...result }));
}

main();
