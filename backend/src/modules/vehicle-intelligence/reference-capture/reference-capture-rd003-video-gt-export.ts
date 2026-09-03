/**
 * RD003 Video-GT correlation telemetry source export — lossless filtered long-form.
 *
 * SAFETY: read-only from sealed observations; no interpolation/resampling.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  extractNumericValue,
  sortByAcquisitionOrder,
  type SignalMetricsObsRow,
} from './reference-capture-signal-metrics';

export const REFERENCE_DRIVE_ID = 'DIMO_LTE_R1_REFERENCE_DRIVE_003';
export const SESSION_ID = '0fa040aa-6105-4872-9b2c-f8ad477009b8';
export const EXPECTED_SEALED_SHA256 = '81534484cdd0fa6224d9efbcf97bb445cfbe8af1fdb8ef29e9bb8204f09c32e4';
export const SEALED_EVIDENCE_ROOT =
  '/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-003';
export const EXPORT_SCHEMA_VERSION = '2026-09-03-rd003-video-gt-correlation-v1';

export const VIDEO_GT_CORRELATION_FIELDS = [
  'speed',
  'powertrainCombustionEngineSpeed',
  'obdEngineLoad',
  'obdThrottlePosition',
  'powertrainCombustionEngineTPS',
  'powertrainTransmissionActualGear',
  'powertrainTransmissionActualGearRatio',
  'currentLocationHeading',
  'currentLocationCoordinates',
  'obdRunTime',
  'powertrainTransmissionTravelledDistance',
] as const;

export type VideoGtCorrelationField = (typeof VIDEO_GT_CORRELATION_FIELDS)[number];

export const PROVENANCE_FIELDS = [
  'requestedInterval',
  'requestedAggregation',
  'hfPhysicalIdentityVersion',
  'aggregateBucketIdentity',
  'hfWindowFrom',
  'hfWindowTo',
  'hfActualQueryTo',
  'duplicateRetrieval',
] as const;

/** Documentation only — MUST NOT filter export rows. */
export const CANDIDATE_VIDEO_CLOCK_ANCHORS = [
  { fileName: 'IMG_2803.mp4', candidateStartUtc: '~19:03:49Z start candidate' },
  { fileName: 'IMG_2804.mp4', candidateStartUtc: '~19:06:00Z–19:06:23Z start candidate' },
  { fileName: 'IMG_2805.mp4', candidateStartUtc: '~19:08:37Z start candidate' },
  { fileName: 'IMG_2806.mp4', candidateStartUtc: '~19:09:50Z start candidate' },
  { fileName: 'IMG_2807.mp4', candidateStartUtc: '~19:12:10Z start candidate' },
  { fileName: 'IMG_2808.mp4', candidateStartUtc: '~19:21:00Z–19:21:14Z start candidate' },
  { fileName: 'IMG_2809.mp4', candidateStartUtc: '~19:22:30.45Z start candidate' },
  { fileName: 'IMG_2810.mp4', candidateStartUtc: '~19:23Z region, exact second unresolved' },
  { fileName: 'IMG_2811.mp4', candidateStartUtc: '~19:24:29Z–19:24:32Z start candidate' },
] as const;

export type VideoGtSourceObsRow = SignalMetricsObsRow & {
  canonicalKey?: string | null;
  rawIdentity?: string | null;
  temporalClass?: string | null;
  provenanceJson?: Record<string, unknown> | null;
};

export type VideoGtExportedRow = {
  referenceDriveId: typeof REFERENCE_DRIVE_ID;
  sessionId: typeof SESSION_ID;
  acquisitionOrdinal: number;
  providerField: string;
  canonicalKey: string | null;
  rawIdentity: string | null;
  temporalClass: string | null;
  acquisitionSurface: string;
  providerTimestamp: string | null;
  synqReceivedAt: string;
  requestStartedAt: string | null;
  requestCompletedAt: string | null;
  createdAt: string;
  sequenceNumber: number | null;
  physicalSampleFingerprint: string | null;
  rawValueJson: unknown;
  provenanceJson: Record<string, unknown>;
};

function iso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

export function isPathInside(child: string, parent: string): boolean {
  const resolvedChild = path.resolve(child);
  const resolvedParent = path.resolve(parent);
  if (resolvedChild === resolvedParent) return true;
  const rel = path.relative(resolvedParent, resolvedChild);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function assertSafeOutputPath(outputPath: string, sealedRoot: string = SEALED_EVIDENCE_ROOT): void {
  const resolved = path.resolve(outputPath);
  const sealed = path.resolve(sealedRoot);
  if (isPathInside(resolved, sealed) || resolved === sealed) {
    throw new Error(`Refusing to write derived output into sealed evidence path: ${resolved}`);
  }
}

export function assertSealedSha256(
  inputPath: string,
  expectedSha: string = EXPECTED_SEALED_SHA256,
): string {
  const actualSha = crypto.createHash('sha256').update(fs.readFileSync(inputPath)).digest('hex');
  if (actualSha !== expectedSha) {
    throw new Error(`SHA-256 mismatch: expected ${expectedSha}, got ${actualSha}`);
  }
  return actualSha;
}

export function parseSealedJsonl(filePath: string): VideoGtSourceObsRow[] {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line: string) => JSON.parse(line) as VideoGtSourceObsRow);
}

export function pickProvenance(provenance: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!provenance) return out;
  for (const key of PROVENANCE_FIELDS) {
    if (key in provenance) out[key] = provenance[key];
  }
  return out;
}

export function toExportedRow(row: VideoGtSourceObsRow, acquisitionOrdinal: number): VideoGtExportedRow {
  return {
    referenceDriveId: REFERENCE_DRIVE_ID,
    sessionId: SESSION_ID,
    acquisitionOrdinal,
    providerField: row.providerField ?? 'UNKNOWN',
    canonicalKey: row.canonicalKey ?? null,
    rawIdentity: row.rawIdentity ?? null,
    temporalClass: row.temporalClass ?? null,
    acquisitionSurface: row.acquisitionSurface ?? 'UNKNOWN',
    providerTimestamp: iso(row.providerTimestamp),
    synqReceivedAt: iso(row.synqReceivedAt) ?? '',
    requestStartedAt: iso(row.requestStartedAt),
    requestCompletedAt: iso(row.requestCompletedAt),
    createdAt: iso(row.createdAt) ?? '',
    sequenceNumber: row.sequenceNumber ?? null,
    physicalSampleFingerprint: row.physicalSampleFingerprint ?? null,
    rawValueJson: row.rawValueJson,
    provenanceJson: pickProvenance(row.provenanceJson),
  };
}

export function buildVideoGtCorrelationExport(rows: VideoGtSourceObsRow[]): {
  exportedRows: VideoGtExportedRow[];
  sourceRowCount: number;
  signalPointCount: number;
} {
  const fieldSet = new Set<string>(VIDEO_GT_CORRELATION_FIELDS);
  const filtered = rows.filter(
    (r) => r.observationKind === 'SIGNAL_POINT' && fieldSet.has(r.providerField ?? ''),
  );
  const ordered = sortByAcquisitionOrder(filtered);
  const exportedRows = ordered.map((row, idx) => toExportedRow(row, idx + 1));
  return {
    exportedRows,
    sourceRowCount: rows.length,
    signalPointCount: rows.filter((r) => r.observationKind === 'SIGNAL_POINT').length,
  };
}

export function serializeCanonicalJsonl(exportedRows: VideoGtExportedRow[]): string {
  return exportedRows.map((row) => JSON.stringify(row)).join('\n') + (exportedRows.length ? '\n' : '');
}

export function sha256Hex(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsvContent(exportedRows: VideoGtExportedRow[]): string {
  const headers = [
    'providerField',
    'canonicalKey',
    'acquisitionSurface',
    'providerTimestamp',
    'synqReceivedAt',
    'requestStartedAt',
    'requestCompletedAt',
    'sequenceNumber',
    'numericValue',
    'rawValueJson',
    'physicalSampleFingerprint',
    'requestedInterval',
    'requestedAggregation',
    'aggregateBucketIdentity',
    'hfWindowFrom',
    'hfWindowTo',
    'hfActualQueryTo',
    'acquisitionOrdinal',
  ];
  const lines = [headers.join(',')];
  for (const row of exportedRows) {
    const prov = row.provenanceJson;
    const numeric = extractNumericValue(row.rawValueJson);
    lines.push(
      [
        row.providerField,
        row.canonicalKey ?? '',
        row.acquisitionSurface,
        row.providerTimestamp ?? '',
        row.synqReceivedAt,
        row.requestStartedAt ?? '',
        row.requestCompletedAt ?? '',
        row.sequenceNumber ?? '',
        numeric == null ? '' : String(numeric),
        JSON.stringify(row.rawValueJson),
        row.physicalSampleFingerprint ?? '',
        String(prov.requestedInterval ?? ''),
        String(prov.requestedAggregation ?? ''),
        String(prov.aggregateBucketIdentity ?? ''),
        String(prov.hfWindowFrom ?? ''),
        String(prov.hfWindowTo ?? ''),
        String(prov.hfActualQueryTo ?? ''),
        String(row.acquisitionOrdinal),
      ]
        .map((v) => csvEscape(String(v)))
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

export type FieldSummary = {
  observationCount: number;
  acquisitionSurfaces: string[];
  firstProviderTimestamp: string | null;
  lastProviderTimestamp: string | null;
  firstSynqReceivedAt: string | null;
  lastSynqReceivedAt: string | null;
  nonNullCount: number;
};

export function buildPerFieldSummary(exportedRows: VideoGtExportedRow[]): Record<string, FieldSummary> {
  const byField: Record<string, VideoGtExportedRow[]> = {};
  for (const row of exportedRows) {
    if (!byField[row.providerField]) byField[row.providerField] = [];
    byField[row.providerField].push(row);
  }
  const out: Record<string, FieldSummary> = {};
  for (const [field, fieldRows] of Object.entries(byField)) {
    const surfaces = [...new Set(fieldRows.map((r) => r.acquisitionSurface))].sort();
    const providerTs = fieldRows
      .map((r) => r.providerTimestamp)
      .filter((v): v is string => v != null)
      .sort();
    const synqTs = fieldRows.map((r) => r.synqReceivedAt).sort();
    out[field] = {
      observationCount: fieldRows.length,
      acquisitionSurfaces: surfaces,
      firstProviderTimestamp: providerTs[0] ?? null,
      lastProviderTimestamp: providerTs.at(-1) ?? null,
      firstSynqReceivedAt: synqTs[0] ?? null,
      lastSynqReceivedAt: synqTs.at(-1) ?? null,
      nonNullCount: fieldRows.filter((r) => extractNumericValue(r.rawValueJson) != null).length,
    };
  }
  return out;
}

export function buildPerSurfaceCounts(exportedRows: VideoGtExportedRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of exportedRows) {
    counts[row.acquisitionSurface] = (counts[row.acquisitionSurface] ?? 0) + 1;
  }
  return counts;
}

export function buildSummary(params: {
  sealedSourcePath: string;
  sealedSourceSha256: string;
  sourceRowCount: number;
  exportedRows: VideoGtExportedRow[];
  canonicalJsonlSha256: string;
  sessionStart: string;
  sessionStop: string;
}): Record<string, unknown> {
  const perSurface = buildPerSurfaceCounts(params.exportedRows);
  return {
    evidenceId: 'DI-EV-0033',
    referenceDriveId: REFERENCE_DRIVE_ID,
    sessionId: SESSION_ID,
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    sealedSourcePath: params.sealedSourcePath,
    sealedSourceSha256: params.sealedSourceSha256,
    sourceRowCount: params.sourceRowCount,
    exportedRowCount: params.exportedRows.length,
    sessionStart: params.sessionStart,
    sessionStop: params.sessionStop,
    exportedFields: [...VIDEO_GT_CORRELATION_FIELDS],
    perField: buildPerFieldSummary(params.exportedRows),
    perSurface: perSurface,
    canonicalJsonlSha256: params.canonicalJsonlSha256,
    methodology: {
      FULL_SESSION_FILTERED_EXPORT: 'YES',
      VIDEO_CANDIDATE_WINDOWS_USED_AS_FILTER: 'NO',
      NO_INTERPOLATION_PERFORMED: 'YES',
      NO_RESAMPLING_PERFORMED: 'YES',
      NO_SMOOTHING_PERFORMED: 'YES',
      NO_VIDEO_CLOCK_ASSUMPTION_APPLIED: 'YES',
      RAW_PHYSICAL_SAMPLE_CADENCE_PROVEN: 'NO',
      REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ: 'NO',
      RD003_TELEMETRY_COVERAGE: 'FULL_SESSION',
      RD003_VIDEO_GT_COVERAGE: 'PARTIAL_SEGMENTED',
      VIDEO_ALIGNMENT_STATUS: 'PENDING_CORRELATION',
      GROUND_TRUTH_VALIDATED: 'NO',
      CONTINUOUS_VIDEO_ASSUMPTION_REMOVED: 'YES',
      ACQUISITION_ORDER_PRESERVED: 'YES',
      PROVIDER_TIME_NOT_REWRITTEN: 'YES',
    },
    candidateVideoClockAnchors: {
      classification: 'CANDIDATE_VIDEO_CLOCK_INTERPRETATION_ONLY',
      note: 'Not validated telemetry timestamps; MUST NOT be used as export filters',
      clips: CANDIDATE_VIDEO_CLOCK_ANCHORS,
    },
    referenceCaptureRuntimeChanged: false,
  };
}

export const PER_FIELD_CONVENIENCE_FILES: Record<string, string> = {
  speed: 'speed.csv',
  powertrainCombustionEngineSpeed: 'rpm.csv',
  obdThrottlePosition: 'throttle-obd.csv',
  powertrainCombustionEngineTPS: 'throttle-powertrain.csv',
  obdEngineLoad: 'engine-load.csv',
  powertrainTransmissionActualGear: 'actual-gear.csv',
  powertrainTransmissionActualGearRatio: 'actual-gear-ratio.csv',
};

export function buildPerFieldConvenienceCsvs(
  exportedRows: VideoGtExportedRow[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, fileName] of Object.entries(PER_FIELD_CONVENIENCE_FILES)) {
    const fieldRows = exportedRows.filter((r) => r.providerField === field);
    if (fieldRows.length > 0) {
      out[fileName] = buildCsvContent(fieldRows);
    }
  }
  return out;
}
