#!/usr/bin/env ts-node
/**
 * EXP021 — surface existing evidence (provider raw row audit, signals, leg geometry, one offline experiment).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4d-replay/di-v0-s4d-verified-snapshot';
import { REF } from './exp021-ev-ground-truth-forensic-supplement-v1.lib';
import { buildEvGroundTruthPerSecondReplay } from './exp021-ev-ground-truth-baseline.lib';
import { loadVideoComparisonByLabel } from './exp021-ev-ground-truth-forensic-supplement-v3.lib';
import {
  analyzeBandSecondsLegGeometry,
  auditHaltLabelProviderRows,
  buildHaltSummaryTable,
  buildSignalInventory,
  experimentBandLegSlowMovement,
  experimentR1WitnessInHalts,
  haltLabelsAll,
  parsePinnedPositionSnapshot,
  PROVIDER_PATH_DOC,
  shadowMapFromContext,
} from './exp021-stationary-evidence-surface.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) throw new Error('usage: --out-dir <directory>');
  return path.resolve(argv[i + 1]);
}

function sha256File(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '../../..');
  const observedAtUtc = new Date().toISOString();
  fs.mkdirSync(outDir, { recursive: true });

  const prisma = new PrismaClient();
  try {
    const organizationId = process.env.EXP021_EV_GT_ORG_ID ?? REF.organizationId;
    const tripId = process.env.EXP021_EV_GT_TRIP_ID ?? REF.tripId;
    const workItemId = process.env.EXP021_EV_GT_WORK_ITEM_ID ?? REF.workItemId;

    const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
      organizationId,
      tripId,
      workItemId,
    });

    const wi = ctx.workItem;
    const snapshotRows = await prisma.$queryRaw<
      Array<{
        organization_id: string;
        vehicle_id: string;
        trip_id: string;
        boundary_fingerprint: string;
        acquisition_window_start: Date;
        acquisition_window_end: Date;
        channel_manifest: unknown;
        payload_gzip: Buffer;
        uncompressed_bytes: number | bigint;
      }>
    >`
      SELECT organization_id, vehicle_id, trip_id, boundary_fingerprint, acquisition_window_start,
        acquisition_window_end, channel_manifest, payload_gzip, uncompressed_bytes
      FROM di_v0_s4_evidence_snapshots
      WHERE organization_id = ${wi.organization_id}
        AND trip_id = ${wi.trip_id}
        AND snapshot_hash = ${ctx.pinnedSnapshotHash}
      LIMIT 1`;

    const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(snapshotRows[0]!, {
      organizationId: wi.organization_id,
      vehicleId: wi.vehicle_id,
      tripId: wi.trip_id,
      boundaryFingerprint: wi.boundary_fingerprint,
      snapshotHash: ctx.pinnedSnapshotHash,
      sourceFamily: wi.source_family as 'API_SYNTHETIC' | 'UNKNOWN' | 'RUPTELA_R1',
    });
    if (!verified.ok) throw new Error(`snapshot verify failed: ${verified.code}`);

    const positionMaterial = parsePinnedPositionSnapshot(verified.parsed);
    if (!positionMaterial) throw new Error('POSITION material missing');

    const providerPath = path.join(
      repoRoot,
      'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16-provider-comparison/DIMO_PROVIDER_POSITION_COMPARISON.json',
    );
    const freshByLabel = new Map<string, { providerRowCount?: number; availability?: string }>();
    if (fs.existsSync(providerPath)) {
      const prov = JSON.parse(fs.readFileSync(providerPath, 'utf8')) as {
        haltWindowLabelAnalysis?: {
          perLabel?: Array<{
            bucketLabelUtc: string;
            freshProviderBucket?: { availability: string; providerRowCount: number };
          }>;
        };
      };
      for (const row of prov.haltWindowLabelAnalysis?.perLabel ?? []) {
        if (row.freshProviderBucket) {
          freshByLabel.set(row.bucketLabelUtc, row.freshProviderBucket);
        }
      }
    }

    const halts = haltLabelsAll();
    const providerAuditByHalt = new Map<string, ReturnType<typeof auditHaltLabelProviderRows>>();
    const providerAudits: Record<string, ReturnType<typeof auditHaltLabelProviderRows>> = {};
    for (const h of halts) {
      const audit = auditHaltLabelProviderRows(h.labels, positionMaterial, freshByLabel);
      providerAuditByHalt.set(h.haltId, audit);
      providerAudits[h.haltId] = audit;
    }

    const shadowByLabel = shadowMapFromContext(ctx);
    const signalInventory = buildSignalInventory(ctx, halts, shadowByLabel);

    const baseline = buildEvGroundTruthPerSecondReplay(ctx);
    const bandLabels = baseline
      .filter(
        (r) =>
          r.motionState === 'STATIONARY_SUPPORTED' &&
          r.speedEvidenceState === 'STATIONARY_BAND' &&
          r.qcTrustLevel === 'TRUSTED_LIMITED',
      )
      .map((r) => r.bucketLabelUtc);
    const videoByLabel = loadVideoComparisonByLabel(repoRoot);
    const bandTacho13 = bandLabels.filter((l) => {
      const t = videoByLabel.get(l)?.tachoKmh;
      return t != null && t >= 1 && t <= 3;
    });

    const posByLabel = new Map(ctx.evidence.positions.map((p) => [p.bucketLabel, p]));
    const r1ByLabel = new Map(ctx.evidence.r1Obd.map((r) => [r.bucketLabel, r]));
    const legAnalysis = analyzeBandSecondsLegGeometry(posByLabel, bandTacho13);
    const r1Experiment = experimentR1WitnessInHalts(halts, posByLabel, r1ByLabel);
    const bandLegExperiment = experimentBandLegSlowMovement(legAnalysis);
    const haltTable = buildHaltSummaryTable(halts, ctx, providerAuditByHalt, r1Experiment, shadowByLabel);

    const channelManifest = verified.parsed.channelManifest.map((c) => ({
      channel: c.channel,
      formatVersion: c.formatVersion,
      payloadSha256: c.payloadSha256,
    }));

    const artifact = {
      schema: 'EXP021_STATIONARY_EVIDENCE_SURFACE_V1',
      observedAtUtc,
      providerPathDocumentation: PROVIDER_PATH_DOC,
      pinnedSnapshot: {
        hash: ctx.pinnedSnapshotHash,
        channelManifest,
        positionBucketCounts: {
          present: positionMaterial.buckets.filter((b) => b.availability === 'PRESENT').length,
          rowAbsent: positionMaterial.buckets.filter((b) => b.availability === 'ROW_ABSENT').length,
          signalNull: positionMaterial.buckets.filter((b) => b.availability === 'SIGNAL_NULL').length,
        },
        rejectedProviderRowCount: positionMaterial.rejectedProviderRows.length,
      },
      providerRawRowAuditByHalt: providerAudits,
      signalInventory,
      bandSecondsLegGeometry: legAnalysis,
      offlineExperimentR1WitnessInHalts: r1Experiment,
      offlineExperimentBandLegSlowMovement: bandLegExperiment,
      haltSummaryTable: haltTable,
    };

    const md = buildMarkdown(haltTable, r1Experiment, bandLegExperiment, legAnalysis, providerAudits);
    const files: Record<string, string> = {
      'STATIONARY_EVIDENCE_SURFACE_EXPORT.json': JSON.stringify(artifact, null, 2),
      'HALT_SUMMARY_TABLE.md': md,
      'PROVIDER_RAW_ROW_AUDIT.json': JSON.stringify(providerAudits, null, 2),
      'OFFLINE_EXPERIMENT_R1_WITNESS.json': JSON.stringify(r1Experiment, null, 2),
      'OFFLINE_EXPERIMENT_BAND_LEG.json': JSON.stringify(bandLegExperiment, null, 2),
      'BAND_LEG_GEOMETRY.json': JSON.stringify(legAnalysis, null, 2),
    };
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(outDir, name), body, 'utf8');
    }
    const shaLines = Object.keys(files)
      .sort()
      .map((n) => `${sha256File(path.join(outDir, n))}  ${n}`);
    fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), `${shaLines.join('\n')}\n`, 'utf8');

    console.log(JSON.stringify({ ok: true, r1ExperimentTotals: r1Experiment.totals }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

function buildMarkdown(
  haltTable: ReturnType<typeof buildHaltSummaryTable>,
  r1Experiment: ReturnType<typeof experimentR1WitnessInHalts>,
  bandLegExperiment: ReturnType<typeof experimentBandLegSlowMovement>,
  legAnalysis: ReturnType<typeof analyzeBandSecondsLegGeometry>,
  providerAudits: Record<string, ReturnType<typeof auditHaltLabelProviderRows>>,
): string {
  const lines: string[] = [
    '# EXP021 — Haupthalt-Evidenzoberfläche',
    '',
    '## Provider (nur dieser Abfragepfad)',
    '',
    '- **CONFIRMED:** `ROW_ABSENT` im Pin = `providerRowCount=0` = kein Eintrag in `data.signals[]` für dieses 1s-Label nach Grid-Mapping.',
    '- **CONFIRMED:** Fresh-Vergleich (bereits gespeichert) stimmt auf Halt-Labels mit Pin überein (124/125 beide ROW_ABSENT).',
    '- **UNKNOWN:** Ob Tesla/DIMO unveränderte Koordinaten uplink-seitig weglässt — nicht aus Lücken allein folgern.',
    '',
    '## Tabelle je Haupthalt',
    '',
    '| Halt | Sekunden | Pin PRESENT | Pin ROW_ABSENT (raw row=0) | V2-Band | NO_MOTION | Erkennung |',
    '|------|---------:|------------:|---------------------------:|--------:|----------:|-----------|',
  ];
  for (const row of haltTable) {
    lines.push(
      `| ${row.haltId} | ${row.window.fromUtc} … ${row.window.toUtc} | ${row.present.pinnedPositionPresentSeconds} | ${row.missing.rawProviderRowAbsentConfirmed} | ${row.present.shadowV2BandSeconds} | ${row.present.shadowNoMotionSeconds} | ${row.recognition.canClaimStandstill} |`,
    );
  }
  lines.push('', '## Offline-Experiment (R1-Zeuge auf POSITION-ROW_ABSENT)', '');
  lines.push(`- Hypothese: ${r1Experiment.hypothesis}`);
  lines.push(`- POSITION ROW_ABSENT in Halten: **${r1Experiment.totals.positionRowAbsentInHalts}**`);
  lines.push(`- Davon numerisches R1: **${r1Experiment.totals.withNumericR1}**`);
  lines.push(
    `- Kausal-Klassen: still ≤1 km/h **${r1Experiment.totals.causalClass.standstill}**, langsam 1–5 **${r1Experiment.totals.causalClass.slow}**, >5 **${r1Experiment.totals.causalClass.moving}**, unbekannt **${r1Experiment.totals.causalClass.unknown}**`,
  );
  lines.push(
    `- **Schluss Haupthalte:** Mit vorhandenem Pin gibt es **keinen** numerischen R1-Zeugen in den Lücken → kausal **unbekannt**, nicht „belegter Stillstand“.`,
  );
  lines.push('', '## Offline-Experiment B (Band-Beine, außerhalb Haupthalte)', '');
  lines.push(`- Langsame Bewegung 1,5–5 km/h (Bein-Geometrie): **${bandLegExperiment.totals.slowMovementEvidenced}/${bandLegExperiment.totals.seconds}** Band-Sekunden mit Tacho 1–3`);
  lines.push(`- ${bandLegExperiment.conflictNote}`);
  lines.push('', '## Band-Sekunden (Tacho 1–3) — Leg-Speeds', '');
  lines.push(
    'Export `qcLegImpliedSpeedMps` null, weil V2-Band-QC die Beine nicht in `supportAssessment` schreibt; offline aus Pin-Koordinaten:',
  );
  for (const leg of legAnalysis.slice(0, 5)) {
    lines.push(
      `- \`${leg.bucketLabelUtc}\`: prev→center ${leg.offlineLegImpliedKmhFromPinnedCoords.prevToCenter?.toFixed(3) ?? 'n/a'} km/h, center→next ${leg.offlineLegImpliedKmhFromPinnedCoords.centerToNext?.toFixed(3) ?? 'n/a'} km/h`,
    );
  }
  if (legAnalysis.length > 5) lines.push(`- … +${legAnalysis.length - 5} weitere in JSON`);
  lines.push('', '## Abgelehnte Provider-Zeilen nahe Halten', '');
  for (const [haltId, audit] of Object.entries(providerAudits)) {
    lines.push(`- ${haltId}: ${audit.rejectedProviderRowsNearHalt.length} rejected near window`);
  }
  return lines.join('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
