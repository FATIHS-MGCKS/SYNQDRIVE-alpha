#!/usr/bin/env ts-node
/**
 * F1-EXP-01 — prepare blind review packs (no OCR shown to reviewers).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  BLIND_PACK_MAX_BYTES,
  buildBlindRows,
  F1_REL,
  loadOcrPredictions,
  loadPhase3e11Manifest,
  reviewerTemplateHeader,
  reviewerTemplateRow,
  verifySourceIntegrity,
} from './ldi-f1-exp01-prepare-blind-review.lib';

function main(): void {
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const movDir = process.env.LDI10D_MOV_DIR ?? '/tmp/ldi10d-phase3e8-movs';
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  const base = path.join(repoRoot, F1_REL);
  const blindImg = path.join(base, 'blind-images');
  const packs = path.join(base, 'blind-packs');
  fs.mkdirSync(blindImg, { recursive: true });
  fs.mkdirSync(packs, { recursive: true });

  const integrity = verifySourceIntegrity(repoRoot, movDir);
  let cropsReconstructed = 0;
  if (integrity.cropsOnDisk < integrity.manifestCropCount) {
    execSync('python3 backend/scripts/ops/ldi10d-phase3e11-export-review-crops.py', { cwd: repoRoot, stdio: 'pipe' });
    cropsReconstructed = integrity.manifestCropCount - integrity.cropsOnDisk;
  }

  const rows = buildBlindRows(repoRoot, blindImg);
  const preds = loadOcrPredictions(repoRoot);

  const provenance = rows.map((r) => ({
    blindReviewId: r.blindReviewId,
    blindImageFile: r.blindImageFile,
    internalReviewId: r.internalReviewId,
    videoFile: `TC_${String(r.videoNum).padStart(5, '0')}.MOV`,
    videoNum: r.videoNum,
    frameOffsetSec: r.secondIndex,
    stratum: r.stratum,
    ocrQualityClass: r.ocrQualityClass,
    cropSha256: r.cropSha256,
    syncUtcNote: 'See OCR checkpoint via internalReviewId after labeling — not for reviewers',
  }));
  fs.writeFileSync(
    path.join(base, 'LDI_F1_EXP01_PROVENANCE_MANIFEST.json'),
    JSON.stringify({ schema: 'LDI_F1_EXP01_PROVENANCE_V1', headSha, integrity, items: provenance }, null, 2),
  );

  const predLines = [
    'blind_review_id,internal_review_id,video_num,second_index,stratum,ocr_label_class,predicted_lat,predicted_lon,predicted_speed,predicted_timestamp',
    ...rows.map((r) => {
      const p = preds.get(r.internalReviewId) ?? {};
      return [
        r.blindReviewId,
        r.internalReviewId,
        r.videoNum,
        r.secondIndex,
        r.stratum,
        p.label_class ?? '',
        p.expected_lat ?? '',
        p.expected_lon ?? '',
        p.expected_speed ?? '',
        p.expected_timestamp ?? '',
      ].join(',');
    }),
  ];
  fs.writeFileSync(path.join(base, 'LDI_F1_EXP01_OCR_PREDICTIONS.csv'), predLines.join('\n'));

  const header = reviewerTemplateHeader();
  const aLines = [header, ...rows.map((r) => reviewerTemplateRow(r, 'REVIEWER_A'))];
  const bLines = [header, ...rows.map((r) => reviewerTemplateRow(r, 'REVIEWER_B'))];
  fs.writeFileSync(path.join(base, 'LDI_F1_EXP01_REVIEWER_A_TEMPLATE.csv'), aLines.join('\n'));
  fs.writeFileSync(path.join(base, 'LDI_F1_EXP01_REVIEWER_B_TEMPLATE.csv'), bLines.join('\n'));

  fs.writeFileSync(
    path.join(base, 'LDI_F1_EXP01_BLIND_REVIEW_README.md'),
    [
      '# F1-EXP-01 Blind review instructions',
      '',
      '1. Open **only** `blind-packs/F1_EXP01_BLIND_PACK_*.zip` — images named `F1BR-*.png`.',
      '2. Do **not** open `LDI_F1_EXP01_OCR_PREDICTIONS.csv` until labeling is complete.',
      '3. Fill `LDI_F1_EXP01_REVIEWER_A_TEMPLATE.csv` and `LDI_F1_EXP01_REVIEWER_B_TEMPLATE.csv` independently.',
      '4. After both are complete, run `npm run ldi-f1-exp01-evaluate-labels`.',
      '',
      'Status: **HUMAN_LABELING_PENDING**',
    ].join('\n'),
  );

  const packManifest: Array<{ zip: string; files: string[]; bytes: number }> = [];
  let packIdx = 1;
  let batch: string[] = [];
  let batchBytes = 0;
  const flush = () => {
    if (!batch.length) return;
    const zipName = `F1_EXP01_BLIND_PACK_${String(packIdx).padStart(2, '0')}.zip`;
    const zipPath = path.join(packs, zipName);
    const listFile = path.join(packs, `_batch_${packIdx}.txt`);
    fs.writeFileSync(listFile, batch.map((f) => path.join(blindImg, f)).join('\n'));
    execSync(
      `python3 -c "import zipfile; z=zipfile.ZipFile('${zipPath}','w',zipfile.ZIP_DEFLATED); [z.write(p, __import__('os').path.basename(p)) for p in open('${listFile}').read().splitlines()]; z.close()"`,
      { stdio: 'pipe' },
    );
    packManifest.push({ zip: zipName, files: [...batch], bytes: fs.statSync(zipPath).size });
    packIdx++;
    batch = [];
    batchBytes = 0;
    fs.unlinkSync(listFile);
  };

  for (const r of rows) {
    const size = fs.statSync(path.join(blindImg, r.blindImageFile)).size;
    if (batch.length && batchBytes + size > BLIND_PACK_MAX_BYTES) flush();
    batch.push(r.blindImageFile);
    batchBytes += size;
  }
  flush();

  fs.writeFileSync(
    path.join(base, 'LDI_F1_EXP01_BLIND_PACK_MANIFEST.json'),
    JSON.stringify({ schema: 'LDI_F1_EXP01_BLIND_PACKS_V1', maxBytes: BLIND_PACK_MAX_BYTES, packs: packManifest }, null, 2),
  );

  fs.writeFileSync(
    path.join(base, 'LDI_F1_EXP01_OWNER_REPORT.md'),
    [
      '# F1-EXP-01 Owner Report',
      '',
      `- Frames prepared: **${rows.length}**`,
      `- MOV SHA-256: **${integrity.movShaOk ? 'PASS' : 'FAIL'}**`,
      `- Crops reconstructed: **${cropsReconstructed}**`,
      `- Blind ZIP packs: **${packManifest.length}** (each ≤1.8 MB)`,
      '- Reviewer labels: **HUMAN_LABELING_PENDING** (empty A/B templates)',
      '- OCR predictions: **separate** `LDI_F1_EXP01_OCR_PREDICTIONS.csv` (do not share with reviewers)',
      '',
      '**STOP: WAIT_OWNER_REVIEW**',
    ].join('\n'),
  );

  const result = {
    F1_EXP01_STATUS: 'PREPARED',
    CROPS_AVAILABLE: integrity.cropsOnDisk,
    CROPS_RECONSTRUCTED: cropsReconstructed,
    BLIND_REVIEW_PACKS: packManifest.length,
    REVIEWER_A_LABELS: 'HUMAN_LABELING_PENDING',
    REVIEWER_B_LABELS: 'HUMAN_LABELING_PENDING',
    GROUND_TRUTH_COMPLETE: 'NO',
    OCR_ACCURACY_ASSESSABLE: 'NO',
    PRODUCTION_MUTATIONS: 'NONE',
    NEXT_SAFE_ACTION: 'WAIT_OWNER_REVIEW',
    headSha,
  };
  fs.writeFileSync(
    path.join(base, 'LDI_F1_EXP01_RESULT.md'),
    ['# F1-EXP-01 Result', '', '```json', JSON.stringify(result, null, 2), '```'].join('\n'),
  );

  console.log(JSON.stringify({ ok: true, ...result }));
}

main();
