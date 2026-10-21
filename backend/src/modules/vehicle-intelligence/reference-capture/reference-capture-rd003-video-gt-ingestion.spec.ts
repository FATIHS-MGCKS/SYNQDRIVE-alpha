import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  buildExternalGtDocument,
  countAlignmentEligibleSpeedGtPoints,
  countRawExternalGtObservationsAllClips,
  externalGtDocumentSha256,
  INGESTION_EVIDENCE_ID,
  SOURCE_METHOD,
} from './reference-capture-rd003-video-gt-external-observations';
import {
  alignmentOutputSha256,
  CANONICAL_TELEMETRY_JSONL_SHA256,
  loadCanonicalTelemetryJsonl,
  runAlignmentWorkbench,
  stableStringify,
  type ExternalGtDocument,
} from './reference-capture-rd003-video-gt-alignment';

const TELEMETRY_JSONL = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/dimo-lte-r1-reference-drive-003-video-gt-correlation-source.jsonl',
);
const EXTERNAL_GT = path.resolve(
  __dirname,
  '../../../../../docs/audits/data/rd003-video-ground-truth-observations.json',
);
const ALIGN_SCRIPT = path.resolve(
  __dirname,
  '../../../../scripts/ops/reference-capture-drive-003-video-gt-align.ts',
);

const hasTelemetry = fs.existsSync(TELEMETRY_JSONL);
const hasExternalGt = fs.existsSync(EXTERNAL_GT);

function loadExternalGt(): ExternalGtDocument {
  return JSON.parse(fs.readFileSync(EXTERNAL_GT, 'utf8')) as ExternalGtDocument;
}

describe('DI-EV-0034B external GT ingestion', () => {
  it('1) real GT JSON contains observations for all nine clips', () => {
    const doc = buildExternalGtDocument();
    expect(doc.clips).toHaveLength(9);
    for (const clip of doc.clips) {
      expect(clip.observations.length).toBeGreaterThan(0);
      expect(clip.evidenceStatus).toBe('EXTERNAL_GT_INGESTED');
    }
    if (hasExternalGt) {
      const onDisk = loadExternalGt();
      expect(onDisk.clips).toHaveLength(9);
      expect(onDisk.clips.every((c) => c.observations.length > 0)).toBe(true);
    }
  });

  it('2) all alignment-eligible SPEED observations are VALIDATED + DIRECT_VISUAL', () => {
    const doc = buildExternalGtDocument();
    for (const clip of doc.clips) {
      const eligible = clip.observations.filter((o) => o.observationType === 'SPEED');
      expect(eligible.length).toBeGreaterThan(0);
      for (const obs of eligible) {
        expect(obs.confidence).toBe('VALIDATED');
        expect(obs.evidenceClass).toBe('DIRECT_VISUAL');
        expect(obs.sourceMethod).toBe(SOURCE_METHOD);
      }
    }
  });

  it('3) no interpolated video GT values were generated', () => {
    const doc = buildExternalGtDocument();
    for (const clip of doc.clips) {
      const speedTimes = clip.observations
        .filter((o) => o.observationType === 'SPEED')
        .map((o) => o.videoTimeSeconds ?? 0)
        .sort((a, b) => a - b);
      const unique = new Set(speedTimes);
      expect(unique.size).toBe(speedTimes.length);
      for (const obs of clip.observations) {
        expect(obs.notes ?? '').not.toMatch(/interpolat/i);
      }
    }
    expect(doc.note).toMatch(/not interpolated/i);
  });

  it('4) external GT ordering is deterministic', () => {
    const docA = buildExternalGtDocument();
    const docB = buildExternalGtDocument();
    expect(stableStringify(docA)).toBe(stableStringify(docB));
    for (const clip of docA.clips) {
      const times = clip.observations.map((o) => o.videoTimeSeconds ?? 0);
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]!);
      }
    }
  });

  it('5) same GT payload produces same GT SHA', () => {
    const doc = buildExternalGtDocument();
    const sha1 = externalGtDocumentSha256(doc);
    const sha2 = externalGtDocumentSha256(buildExternalGtDocument());
    expect(sha1).toBe(sha2);
    if (hasExternalGt) {
      expect(externalGtDocumentSha256(loadExternalGt())).toBe(sha1);
    }
  });

  it('6) candidate clock metadata remains candidate', () => {
    const doc = buildExternalGtDocument();
    for (const clip of doc.clips) {
      expect(clip.candidateAbsoluteTime?.status).toBe('CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY');
      if (clip.videoClock?.timezoneStatus) {
        expect(clip.videoClock.timezoneStatus).toBe('CANDIDATE');
      }
    }
  });

  it('7) IMG_2810 S2→S3 is represented as video GT, not telemetry proof', () => {
    const doc = buildExternalGtDocument();
    const clip = doc.clips.find((c) => c.fileName === 'IMG_2810.mp4');
    expect(clip).toBeDefined();
    const shift = clip!.observations.find((o) => o.observationType === 'SHIFT_TRANSITION');
    expect(shift).toBeDefined();
    expect(shift!.observationId).toBe('RD003_GT_008_SHIFT_001');
    expect(shift!.value).toBe('S2→S3');
    expect(shift!.confidence).toBe('VALIDATED');
    expect(shift!.evidenceClass).toBe('DIRECT_VISUAL');
    const gearObs = clip!.observations.filter((o) => o.observationType === 'GEAR_DISPLAY');
    expect(gearObs.map((o) => o.value)).toEqual(expect.arrayContaining(['S2', 'S3']));
  });

  it('8) IMG_2811 reverse direction remains separate from unsigned speed', () => {
    const doc = buildExternalGtDocument();
    const clip = doc.clips.find((c) => c.fileName === 'IMG_2811.mp4');
    expect(clip).toBeDefined();
    const reverse = clip!.observations.find((o) => o.observationType === 'REVERSE_MOTION');
    expect(reverse).toBeDefined();
    expect(reverse!.value).toBe('REVERSE');
    const speedObs = clip!.observations.filter((o) => o.observationType === 'SPEED');
    for (const s of speedObs) {
      expect(typeof s.value).toBe('number');
      expect(s.value).toBeGreaterThanOrEqual(0);
    }
    const direction = clip!.observations.find((o) => o.observationType === 'DIRECTION_CHANGE');
    expect(direction?.value).toBe('REVERSE_TO_FORWARD');
  });

  it('9) alignment cannot mutate external GT', () => {
    if (!hasTelemetry || !hasExternalGt) return;
    const before = fs.readFileSync(EXTERNAL_GT, 'utf8');
    const beforeSha = crypto.createHash('sha256').update(before).digest('hex');
    const outDir = fs.mkdtempSync(path.join('/tmp', 'rd003-ingest-align-'));
    execFileSync(
      'npx',
      ['ts-node', ALIGN_SCRIPT, `--out-dir=${outDir}`],
      { cwd: path.resolve(__dirname, '../../../../'), stdio: 'pipe' },
    );
    const after = fs.readFileSync(EXTERNAL_GT, 'utf8');
    const afterSha = crypto.createHash('sha256').update(after).digest('hex');
    expect(afterSha).toBe(beforeSha);
    expect(after).toBe(before);
  });

  it('10) alignment cannot mutate canonical telemetry', () => {
    if (!hasTelemetry || !hasExternalGt) return;
    const beforeSha = crypto.createHash('sha256').update(fs.readFileSync(TELEMETRY_JSONL)).digest('hex');
    const outDir = fs.mkdtempSync(path.join('/tmp', 'rd003-ingest-align-'));
    execFileSync(
      'npx',
      ['ts-node', ALIGN_SCRIPT, `--out-dir=${outDir}`],
      { cwd: path.resolve(__dirname, '../../../../'), stdio: 'pipe' },
    );
    const afterSha = crypto.createHash('sha256').update(fs.readFileSync(TELEMETRY_JSONL)).digest('hex');
    expect(afterSha).toBe(CANONICAL_TELEMETRY_JSONL_SHA256);
    expect(afterSha).toBe(beforeSha);
  });

  it('11) HF_HISTORICAL and LATEST_LIVE remain separate in real alignment', () => {
    if (!hasTelemetry || !hasExternalGt) return;
    const telemetry = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
    const externalGt = loadExternalGt();
    const result = runAlignmentWorkbench({ telemetryRows: telemetry, externalGt });
    for (const clip of result.clipAlignments) {
      const hf = clip.speedAlignmentBySurface.HF_HISTORICAL;
      const live = clip.speedAlignmentBySurface.LATEST_LIVE;
      expect(hf).toBeDefined();
      expect(live).toBeDefined();
      if (hf && 'status' in hf && live && 'status' in live) {
        expect(hf.status).not.toBe('NOT_OBSERVED');
        expect(live.status).not.toBe('NOT_OBSERVED');
      }
    }
    expect(result.alignmentSummary.SPEED_ALIGNMENT_SURFACE_PRESELECTED).toBe('NO');
  });

  it('12) failed/ambiguous alignments remain visible', () => {
    if (!hasTelemetry || !hasExternalGt) return;
    const telemetry = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
    const externalGt = loadExternalGt();
    const result = runAlignmentWorkbench({ telemetryRows: telemetry, externalGt });
    expect(result.alignmentSummary.GROUND_TRUTH_VALIDATED).toBe('NO');
    expect(result.alignmentSummary.REAL_ALIGNMENT_EXECUTED).toBeUndefined();
    const statuses = result.clipAlignments.map((c) => c.alignmentStatus);
    expect(statuses.every((s) => s === 'VALIDATED')).toBe(false);
    expect(statuses.some((s) => s !== 'PENDING_EXTERNAL_GT')).toBe(true);
  });

  it('13) clock model still uses boundary residual only', () => {
    if (!hasTelemetry || !hasExternalGt) return;
    const telemetry = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
    const externalGt = loadExternalGt();
    const result = runAlignmentWorkbench({ telemetryRows: telemetry, externalGt });
    expect(result.crossClipClockModel.CROSS_CLIP_MODEL_USES_CANDIDATE_START_RESIDUAL_AS_CLOCK_OFFSET).toBe(
      'NO',
    );
    expect(result.alignmentSummary.CROSS_CLIP_MODEL_USES_CANDIDATE_START_RESIDUAL_AS_CLOCK_OFFSET).toBe(
      'NO',
    );
  });

  it('14) DI-EV-0033 canonical telemetry SHA unchanged', () => {
    if (!hasTelemetry) return;
    expect(crypto.createHash('sha256').update(fs.readFileSync(TELEMETRY_JSONL)).digest('hex')).toBe(
      CANONICAL_TELEMETRY_JSONL_SHA256,
    );
  });

  it('15) ingestion metadata and counts match specification', () => {
    const doc = buildExternalGtDocument();
    expect((doc as { ingestionEvidenceId?: string }).ingestionEvidenceId).toBe(INGESTION_EVIDENCE_ID);
    expect(countRawExternalGtObservationsAllClips(doc)).toBe(198);
    expect(countAlignmentEligibleSpeedGtPoints(doc)).toBe(182);
    expect(doc.clips.filter((c) => c.observations.length > 0).length).toBe(9);
  });

  it('16) deterministic alignment output with ingested GT', () => {
    if (!hasTelemetry || !hasExternalGt) return;
    const telemetry = loadCanonicalTelemetryJsonl(TELEMETRY_JSONL);
    const externalGt = loadExternalGt();
    const sha1 = alignmentOutputSha256(runAlignmentWorkbench({ telemetryRows: telemetry, externalGt }));
    const sha2 = alignmentOutputSha256(runAlignmentWorkbench({ telemetryRows: telemetry, externalGt }));
    expect(sha1).toBe(sha2);
  });
});
