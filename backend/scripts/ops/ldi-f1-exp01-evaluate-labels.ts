#!/usr/bin/env ts-node
/**
 * F1-EXP-01 — evaluate after human A/B labels submitted (no DIMO filters).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { wilsonCi } from './ldi10d-phase3e10-independent-validation.lib';
import { F1_REL } from './ldi-f1-exp01-prepare-blind-review.lib';

type LabelRow = {
  blind_review_id: string;
  latitude: string;
  longitude: string;
  speed_kmh: string;
  timestamp_overlay: string;
  unreadable_latitude: string;
  unreadable_longitude: string;
  unreadable_speed: string;
  unreadable_timestamp: string;
};

function parseCsv(p: string): LabelRow[] {
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
  const h = lines[0]!.split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const o: Record<string, string> = {};
    h.forEach((k, i) => {
      o[k] = cols[i] ?? '';
    });
    return o as LabelRow;
  });
}

function isFilled(r: LabelRow): boolean {
  const any =
    r.latitude.trim() ||
    r.longitude.trim() ||
    r.speed_kmh.trim() ||
    r.timestamp_overlay.trim() ||
    r.unreadable_latitude === 'YES' ||
    r.unreadable_longitude === 'YES' ||
    r.unreadable_speed === 'YES' ||
    r.unreadable_timestamp === 'YES';
  return !!any;
}

function consensus(a: LabelRow, b: LabelRow): LabelRow | null {
  const fields = ['latitude', 'longitude', 'speed_kmh', 'timestamp_overlay'] as const;
  for (const f of fields) {
    if (a[f].trim() !== b[f].trim()) return null;
  }
  return a;
}

function main(): void {
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const base = path.join(repoRoot, F1_REL);
  const pathA = path.join(base, 'LDI_F1_EXP01_REVIEWER_A_LABELS.csv');
  const pathB = path.join(base, 'LDI_F1_EXP01_REVIEWER_B_LABELS.csv');
  const templateA = path.join(base, 'LDI_F1_EXP01_REVIEWER_A_TEMPLATE.csv');

  if (!fs.existsSync(pathA) || !fs.existsSync(pathB)) {
    console.log(
      JSON.stringify({
        ok: false,
        status: 'HUMAN_LABELING_PENDING',
        message: 'Submit LDI_F1_EXP01_REVIEWER_A_LABELS.csv and LDI_F1_EXP01_REVIEWER_B_LABELS.csv',
      }),
    );
    process.exit(0);
  }

  const a = parseCsv(pathA);
  const b = parseCsv(pathB);
  const filledA = a.filter(isFilled).length;
  const filledB = b.filter(isFilled).length;
  if (filledA < a.length * 0.9 || filledB < b.length * 0.9) {
    console.log(JSON.stringify({ ok: false, status: 'INCOMPLETE_LABELS', filledA, filledB, total: a.length }));
    process.exit(0);
  }

  let agree = 0;
  const consensusRows: LabelRow[] = [];
  const disputes: string[] = [];
  for (let i = 0; i < a.length; i++) {
    const ca = consensus(a[i]!, b[i]!);
    if (ca) {
      agree++;
      consensusRows.push(ca);
    } else disputes.push(a[i]!.blind_review_id);
  }

  const predLines = fs.readFileSync(path.join(base, 'LDI_F1_EXP01_OCR_PREDICTIONS.csv'), 'utf8').trim().split('\n');
  const predHeader = predLines[0]!.split(',');
  const predByBlind = new Map<string, Record<string, string>>();
  for (let i = 1; i < predLines.length; i++) {
    const cols = predLines[i]!.split(',');
    const row: Record<string, string> = {};
    predHeader.forEach((k, j) => {
      row[k] = cols[j] ?? '';
    });
    predByBlind.set(row.blind_review_id, row);
  }

  let latMatch = 0;
  let nLat = 0;
  for (const c of consensusRows) {
    const p = predByBlind.get(c.blind_review_id) as Record<string, string> | undefined;
    if (!p || c.unreadable_latitude === 'YES') continue;
    nLat++;
    if (p.predicted_lat === c.latitude) latMatch++;
  }

  const out = {
    schema: 'LDI_F1_EXP01_EVALUATION_V1',
    interRaterExactAgreementRate: agree / a.length,
    disputeCount: disputes.length,
    consensusCount: consensusRows.length,
    latitudeExactMatchVsOcr: nLat ? latMatch / nLat : null,
    latitudeWilson: nLat ? wilsonCi(latMatch, nLat) : null,
    note: 'Run after dispute resolution; expand fields in script as needed',
  };
  fs.writeFileSync(path.join(base, 'LDI_F1_EXP01_EVALUATION.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: true, ...out }));
}

main();
