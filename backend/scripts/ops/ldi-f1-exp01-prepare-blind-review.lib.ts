/**
 * F1-EXP-01 — blind OCR ground-truth preparation (no fabricated labels).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { verifyMovSha256 } from './ldi10d-phase3e11-evidence-hardening.lib';
import { EVIDENCE_REL } from './ldi10d-phase3e10-independent-validation.lib';

export const F1_EXP01_SALT = 'SYNQDRIVE_F1_EXP01_BLIND_v1';
export const BLIND_PACK_MAX_BYTES = 1.8 * 1024 * 1024;
export const F1_REL = `${EVIDENCE_REL}/f1-exp01`;

export type SourceRow = {
  internalReviewId: string;
  videoNum: string;
  secondIndex: number;
  stratum: string;
  ocrQualityClass: string;
  cropSourcePath: string;
};

export type BlindRow = SourceRow & {
  blindReviewId: string;
  blindImageFile: string;
  cropSha256: string;
};

export function stableBlindId(videoNum: string, secondIndex: number): string {
  const h = crypto.createHash('sha256').update(`${F1_EXP01_SALT}|${videoNum}|${secondIndex}`).digest('hex');
  return `F1BR-${h.slice(0, 12).toUpperCase()}`;
}

export function sha256File(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

export function loadPhase3e11Manifest(repoRoot: string): SourceRow[] {
  const p = path.join(repoRoot, EVIDENCE_REL, 'phase3e11-review-crops/MANIFEST.json');
  const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    items: Array<{
      reviewId: string;
      videoNum: string;
      secondIndex: number;
      stratum: string;
      cropPath: string;
      expectedFromCheckpoint?: { ocr_class?: string };
    }>;
  };
  return doc.items.map((it) => ({
    internalReviewId: it.reviewId,
    videoNum: it.videoNum,
    secondIndex: it.secondIndex,
    stratum: it.stratum,
    ocrQualityClass: it.expectedFromCheckpoint?.ocr_class ?? 'UNKNOWN',
    cropSourcePath: path.join(repoRoot, it.cropPath),
  }));
}

export function loadOcrPredictions(repoRoot: string): Map<string, Record<string, unknown>> {
  const csv = fs.readFileSync(path.join(repoRoot, EVIDENCE_REL, 'LDI10D_PHASE3E11_OCR_FRAME_REVIEW.csv'), 'utf8').trim().split('\n');
  const header = csv[0]!.split(',');
  const m = new Map<string, Record<string, unknown>>();
  for (let i = 1; i < csv.length; i++) {
    const cols = csv[i]!.split(',');
    const row: Record<string, unknown> = {};
    header.forEach((h, j) => {
      row[h] = cols[j] ?? '';
    });
    m.set(String(row.review_id), row);
  }
  return m;
}

export function buildBlindRows(repoRoot: string, blindImageDir: string): BlindRow[] {
  const sources = loadPhase3e11Manifest(repoRoot);
  const out: BlindRow[] = [];
  for (const s of sources) {
    const blindReviewId = stableBlindId(s.videoNum, s.secondIndex);
    const blindImageFile = `${blindReviewId}.png`;
    const dest = path.join(blindImageDir, blindImageFile);
    if (!fs.existsSync(s.cropSourcePath)) {
      throw new Error(`missing crop ${s.cropSourcePath}`);
    }
    fs.copyFileSync(s.cropSourcePath, dest);
    out.push({
      ...s,
      blindReviewId,
      blindImageFile,
      cropSha256: sha256File(dest),
    });
  }
  out.sort((a, b) => a.blindReviewId.localeCompare(b.blindReviewId));
  return out;
}

export function reviewerTemplateHeader(): string {
  return [
    'blind_review_id',
    'blind_image_file',
    'latitude',
    'longitude',
    'speed_kmh',
    'timestamp_overlay',
    'unreadable_latitude',
    'unreadable_longitude',
    'unreadable_speed',
    'unreadable_timestamp',
    'quality_status',
    'uncertainty_notes',
    'reviewer_id',
  ].join(',');
}

export function reviewerTemplateRow(r: BlindRow, reviewerId: string): string {
  return [
    r.blindReviewId,
    r.blindImageFile,
    '',
    '',
    '',
    '',
    'NO',
    'NO',
    'NO',
    'NO',
    'PENDING',
    '',
    reviewerId,
  ].join(',');
}

export function verifySourceIntegrity(repoRoot: string, movDir: string): {
  movShaOk: boolean;
  checkpointLines: number;
  manifestCropCount: number;
  cropsOnDisk: number;
  ocrCsvRows: number;
} {
  const mov = verifyMovSha256(repoRoot, movDir);
  const ck = fs
    .readFileSync(path.join(repoRoot, EVIDENCE_REL, 'phase3e8-work/OCR_1HZ_CHECKPOINT.jsonl'), 'utf8')
    .trim()
    .split('\n').length;
  const manifest = loadPhase3e11Manifest(repoRoot);
  const cropsOnDisk = manifest.filter((s) => fs.existsSync(s.cropSourcePath)).length;
  const ocrCsv =
    fs.readFileSync(path.join(repoRoot, EVIDENCE_REL, 'LDI10D_PHASE3E11_OCR_FRAME_REVIEW.csv'), 'utf8').trim().split('\n').length - 1;
  return {
    movShaOk: mov.ok,
    checkpointLines: ck,
    manifestCropCount: manifest.length,
    cropsOnDisk,
    ocrCsvRows: ocrCsv,
  };
}
