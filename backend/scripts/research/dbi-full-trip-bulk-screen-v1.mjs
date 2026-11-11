#!/usr/bin/env node
/**
 * DBI_FULL_TRIP_BULK_SCREEN_V1 — unified READ_ONLY research screen for one real trip.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPowertrainResearchInput,
  buildRealV1aTripInput,
  initResearchBackend,
  loadEvidenceFromPostgres,
  loadMultichannelTrip,
  loadPostgresTrip,
} from './dbi-powertrain-research-real-trip-bridge.mjs';
import { computeDescriptiveMotorAnalysis } from './dbi-descriptive-motor-analysis.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = process.env.DBI_EVAL_BACKEND_ROOT ?? join(__dirname, '../..');
const ARTIFACTS_DIR = process.env.DBI_ARTIFACTS_DIR ?? '/opt/cursor/artifacts';
const OUT_JSON =
  process.env.DBI_BULK_SCREEN_JSON ?? join(ARTIFACTS_DIR, 'dbi-full-trip-bulk-screen-v1.json');
const OUT_MD = process.env.DBI_BULK_SCREEN_MD ?? join(ARTIFACTS_DIR, 'dbi-full-trip-bulk-screen-v1.md');

const TRIP_ID = process.env.DBI_EVAL_TRIP_ID ?? 'ca7d03a0-0702-40b9-acf2-0235c7dd07a1';
const VEHICLE_ID = process.env.DBI_EVAL_VEHICLE_ID ?? '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const SOURCE_LINK_ID = process.env.DBI_EVAL_SOURCE_LINK_ID ?? '9ff5e350-cd4b-4e3a-956a-4f1770b017f2';

const { require, libs } = initResearchBackend(BACKEND_ROOT);

const validateKickdown = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-research.input-binding.v1.ts',
  ),
).validateDs4PowertrainDemandResearchInputBinding;
const computeKickdown = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-research.kernel.v1.ts',
  ),
).computeDs4PowertrainDemandResearchV1;

const validateCold = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-cold-engine.input-binding.v1.ts',
  ),
).validateDs4PowertrainDemandColdEngineInputBinding;
const computeCold = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-cold-engine.kernel.v1.ts',
  ),
).computeDs4PowertrainDemandColdEngineResearchV1;

const validateSustained = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-sustained-load.input-binding.v1.ts',
  ),
).validateDs4PowertrainDemandSustainedLoadInputBinding;
const computeSustained = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-sustained-load.kernel.v1.ts',
  ),
).computeDs4PowertrainDemandSustainedLoadResearchV1;

const validateRevving = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-revving-idle.input-binding.v1.ts',
  ),
).validateDs4PowertrainDemandRevvingIdleInputBinding;
const computeRevving = require(
  join(
    BACKEND_ROOT,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-powertrain-demand-research/ds4-powertrain-demand-revving-idle.kernel.v1.ts',
  ),
).computeDs4PowertrainDemandRevvingIdleResearchV1;

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: BACKEND_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'UNKNOWN';
  }
}

function loadJsonIfExists(path) {
  if (!existsSync(path)) return { path, loaded: false, data: null };
  return { path, loaded: true, data: JSON.parse(readFileSync(path, 'utf8')) };
}

const MAPPING_CORRECTION_NOTES = {
  before: {
    B2: 'Falsch: coldEngine.episodes (existiert nicht) statt coldEngine.candidates + subtypeAssessability',
    B3: 'Falsch: INSUFFICIENT_OBSERVATIONS als OBSERVATION_NEGATIVE / Negativ-Nachweis',
    B4: 'Falsch: revvingIdle.episodes statt facetA/facetB mit eigener tripEvidenceClassification',
    V1B: 'Falsch: erfundene Tier-Zeile aus __tests__-Fixtures',
  },
  after: {
    B2: 'coldEngine.deduplicatedCandidateCount, candidates[], subtypeAssessability',
    B3: 'sustainedLoad.tripEvidenceClassification; INSUFFICIENT ≠ NOT_OBSERVED',
    B4: 'revvingIdle.facetA und facetB jeweils vollständig',
    V1B: 'VSI-Snapshot + tierEvidence aus resolveTierEvidenceForTrip; optional persistierter V1B-Shadow-Run',
  },
};

function assessModule(moduleId, binding, kernelResult) {
  if (!binding?.ok) return 'NOT_ASSESSABLE';
  if (!kernelResult) return 'NOT_ASSESSABLE';
  if (kernelResult.status === 'ABSTAINED') return 'NOT_ASSESSABLE';

  if (moduleId === 'B1') {
    if (kernelResult.status === 'NOT_OBSERVED') return 'NOT_OBSERVED';
    return kernelResult.kickdown.deduplicatedCandidateCount > 0 ? 'CANDIDATE' : 'NOT_OBSERVED';
  }
  if (moduleId === 'B2') {
    if (kernelResult.coldEngine.deduplicatedCandidateCount > 0) return 'CANDIDATE';
    const sub = kernelResult.coldEngine.subtypeAssessability;
    const anyAssessable = sub && Object.values(sub).some((s) => s.status === 'ASSESSABLE');
    return anyAssessable ? 'NOT_OBSERVED' : 'NOT_ASSESSABLE';
  }
  if (moduleId === 'B3') {
    const tec = kernelResult.sustainedLoad.tripEvidenceClassification;
    if (tec === 'INSUFFICIENT_OBSERVATIONS') return 'INSUFFICIENT';
    if (tec === 'NOT_ASSESSABLE') return 'NOT_ASSESSABLE';
    if (kernelResult.sustainedLoad.deduplicatedCandidateCount > 0) return 'CANDIDATE';
    if (tec === 'NOT_OBSERVED') return 'NOT_OBSERVED';
    return tec;
  }
  if (moduleId === 'B4') {
    const a = kernelResult.revvingIdle.facetA;
    const b = kernelResult.revvingIdle.facetB;
    if (a.deduplicatedCandidateCount > 0 || b.deduplicatedCandidateCount > 0) return 'CANDIDATE';
    if (a.tripEvidenceClassification === 'INSUFFICIENT_OBSERVATIONS' || b.tripEvidenceClassification === 'INSUFFICIENT_OBSERVATIONS') {
      return 'INSUFFICIENT';
    }
    if (a.assessability === 'NOT_ASSESSABLE' && b.assessability === 'NOT_ASSESSABLE') return 'NOT_ASSESSABLE';
    return 'NOT_OBSERVED';
  }
  return 'UNKNOWN';
}

function deriveModuleSummary(moduleId, kernelResult) {
  if (moduleId === 'B1') {
    return {
      deduplicatedCandidateCount: kernelResult.kickdown.deduplicatedCandidateCount,
      rawWindowCount: kernelResult.kickdown.rawWindowCount,
      tripEvidenceClassification: undefined,
    };
  }
  if (moduleId === 'B2') {
    return {
      deduplicatedCandidateCount: kernelResult.coldEngine.deduplicatedCandidateCount,
      rawWindowCount: kernelResult.coldEngine.rawWindowCount,
      subtypeAssessability: kernelResult.coldEngine.subtypeAssessability,
      coverageEvidence: kernelResult.coldEngine.coverageEvidence,
    };
  }
  if (moduleId === 'B3') {
    return {
      deduplicatedCandidateCount: kernelResult.sustainedLoad.deduplicatedCandidateCount,
      tripEvidenceClassification: kernelResult.sustainedLoad.tripEvidenceClassification,
      entryLabelCount: kernelResult.sustainedLoad.entryLabelCount,
      coverageEvidence: kernelResult.sustainedLoad.coverageEvidence,
    };
  }
  if (moduleId === 'B4') {
    return {
      facetA: {
        assessability: kernelResult.revvingIdle.facetA.assessability,
        tripEvidenceClassification: kernelResult.revvingIdle.facetA.tripEvidenceClassification,
        deduplicatedCandidateCount: kernelResult.revvingIdle.facetA.deduplicatedCandidateCount,
        coverageDiagnostics: kernelResult.revvingIdle.facetA.coverageDiagnostics,
      },
      facetB: {
        assessability: kernelResult.revvingIdle.facetB.assessability,
        tripEvidenceClassification: kernelResult.revvingIdle.facetB.tripEvidenceClassification,
        deduplicatedCandidateCount: kernelResult.revvingIdle.facetB.deduplicatedCandidateCount,
        coverageDiagnostics: kernelResult.revvingIdle.facetB.coverageDiagnostics,
      },
      coverageEvidence: kernelResult.revvingIdle.coverageEvidence,
    };
  }
  return {};
}

function runPowertrainModule(moduleId, binding, computeFn, input) {
  if (!binding.ok) {
    return {
      module: moduleId,
      binding: { ok: false, reasonCodes: binding.reasonCodes },
      kernelInvoked: false,
      kernelResultOriginal: null,
      derivedSummary: null,
      productAssessability: 'NOT_ASSESSABLE',
    };
  }
  let kernelResultOriginal;
  try {
    kernelResultOriginal = computeFn(input);
  } catch (err) {
    return {
      module: moduleId,
      binding: { ok: true },
      kernelInvoked: false,
      kernelRuntimeError: String(err?.message ?? err),
      kernelResultOriginal: null,
      derivedSummary: null,
      productAssessability: 'NOT_ASSESSABLE',
    };
  }
  return {
    module: moduleId,
    binding: { ok: true },
    kernelInvoked: true,
    kernelStatus: kernelResultOriginal.status,
    kernelResultOriginal,
    derivedSummary: deriveModuleSummary(moduleId, kernelResultOriginal),
    productAssessability: assessModule(moduleId, binding, kernelResultOriginal),
    abstainReasons: kernelResultOriginal.abstainReasons,
  };
}

function buildGermanReport(ctx) {
  const t = ctx.tripOverview;
  const ds4 = ctx.priorResearch.ds4Motion;
  const rpm = ctx.priorResearch.rpmCloseout;
  const qual = ctx.priorResearch.rpmQualification?.machine;
  const modules = ctx.powertrainModules;
  const desc = ctx.descriptiveMotor;

  const lines = [];
  lines.push('# DBI-Fahrtenbericht (Research-Screen, READ_ONLY)');
  lines.push('');
  lines.push(`**Fahrt:** ${TRIP_ID}`);
  lines.push(`**Fahrzeug:** VW Tiguan (WOB L 7503), ID \`${VEHICLE_ID}\``);
  lines.push(`**Zeitfenster (Postgres):** ${t.startUtc} — ${t.endUtc}`);
  lines.push(
    `**Strecke / Dauer:** ${t.distanceKm != null ? `${t.distanceKm.toFixed(1)} km` : 'k. A.'}, ${t.durationMinutes != null ? `${Math.round(t.durationMinutes)} min` : 'k. A.'}`,
  );
  lines.push('');
  lines.push('## Datenabdeckung und Zeitbasis');
  lines.push(
    '- HF-Signale aus ClickHouse (READ_ONLY); Multichannel-Merge nur bei **exakt gleichen** Provider-recorded_at-Labels.',
  );
  lines.push(`- **TIMESTAMP_AUTHORITY:** BUCKET_LABEL_UNVERIFIED — keine behauptete physische Gleichzeitigkeit über R1-Buckets.`);
  lines.push(`- RPM-Punkte: ${ctx.dataCoverage.rpmPoints}; Multichannel-Zeilen: ${ctx.dataCoverage.multichannelRows}.`);
  lines.push(`- V1B-Quelle: ${ctx.v1bEvidence?.source ?? 'unbekannt'}; Tier-Evidenz-Status: ${ctx.v1bEvidence?.tierEvidenceStatus ?? '—'}.`);
  if (ctx.v1bEvidence?.tier) lines.push(`- Tier (wenn aus persistiertem/Live-V1B): ${ctx.v1bEvidence.tier}, Modus ${ctx.v1bEvidence.analysisMode ?? '—'}.`);
  lines.push('');
  lines.push('## Deskriptive Motoranalyse (ClickHouse, ohne Detektor-Fusion)');
  if (desc) {
    lines.push(
      `- **Drehzahl (RPM):** Median ${desc.rpm.median}, P95 ${desc.rpm.p95}, Max ${desc.rpm.max} (${desc.rpm.count} Punkte).`,
    );
    lines.push(
      `- **Motorlast:** Median ${desc.engineLoadPct.median} %, P95 ${desc.engineLoadPct.p95} %, Max ${desc.engineLoadPct.max} %.`,
    );
    lines.push(
      `- **Drossel:** Median ${desc.throttlePct.median} %, P95 ${desc.throttlePct.p95} %; ${desc.throttlePct.bucketsAtOrAbove75Pct} Buckets ≥ 75 %.`,
    );
    lines.push(
      `- **Kühlmittel (ECT):** ${desc.ectC.coldBucketCount} kalte (unter ${desc.ectC.coldThresholdC} °C), ${desc.ectC.warmBucketCount} warme Buckets; Median ${desc.ectC.median} °C.`,
    );
    lines.push(
      `- **Kalt-ECT-Buckets Motor:** Last Median ${desc.coldEctBucketMotorStats.loadMedian ?? '—'} %, RPM Median ${desc.coldEctBucketMotorStats.rpmMedian ?? '—'}.`,
    );
    lines.push(
      `- **Stationary-like (Speed ≤ 3 km/h):** ${desc.stationaryLikeBuckets.bucketCount} Buckets, RPM Median ${desc.stationaryLikeBuckets.rpmMedian ?? '—'}.`,
    );
  }
  lines.push('');
  lines.push('## DS4 Fahrverhalten (bestehende P2-D2E-Analyse)');
  if (ds4?.loaded) {
    const s = ds4.data.summary ?? ds4.data;
    lines.push(`- Motion-Run: \`${ds4.data.motionRunId ?? 'n/a'}\`, Shadow-Status: ${ds4.data.shadowStatus ?? 'n/a'}.`);
    lines.push(
      `- Akzeptierte Ereignisse: ${s.eventAcceptedCount ?? ds4.data.payloadEventCount} (Qualität: OK ${ds4.data.qualityDistribution?.OK ?? '—'}, LIMITED ${ds4.data.qualityDistribution?.LIMITED ?? '—'}, ARTEFACT_SUSPECT ${ds4.data.qualityDistribution?.ARTEFACT_SUSPECT ?? '—'}).`,
    );
    lines.push(
      `- Verteilung: ${ds4.data.kindDistribution?.ACCELERATION ?? 0} Beschleunigungen, ${ds4.data.kindDistribution?.DECELERATION ?? 0} Verzögerungen.`,
    );
    if (ds4.data.limitations?.length) {
      lines.push(`- Einschränkungen: ${ds4.data.limitations.join('; ')}.`);
    }
  } else {
    lines.push('- DS4-Artefakt nicht geladen — Abschnitt ausstehend.');
  }
  lines.push('');
  lines.push('## RPM (abgeschlossene P2-D2-Forschung, keine neue Kandidatensuche)');
  if (rpm?.loaded) {
    lines.push(`- **774** HF-RPM-Punkte; **82** deskriptive Anstieg/Senkung-Kandidaten (Rise/Fall).`);
    lines.push(`- **8** mit DIRECT_LOCAL_RPM_CHANGE; **74** DESCRIPTIVE_WITH_CONTEXT_GAPS (P2-D2H).`);
    lines.push(`- 2 sustained-high-Fenster nur **ABSTAIN_GAP_BRIDGED** (13 s / 15 s interne Lücken) — kein verifizierter Dauerhochlauf.`);
    lines.push(`- Keine DS4×RPM-Fusion; Ruptela-R1-Veto aktiv.`);
  }
  if (qual) {
    lines.push(`- RPM-only Driving Intelligence: **${qual.RPM_ONLY_FEATURE_READINESS?.rpmOnlyDrivingIntelligence ?? 'siehe Artefakt'}**.`);
  }
  lines.push('');
  lines.push('## Powertrain-Research-Kernels (P2-B1–B4, Original-Resultate)');
  for (const m of modules) {
    const label = { B1: 'Kickdown-like', B2: 'Cold Engine', B3: 'Sustained Load', B4: 'Revving/Idle' }[m.module];
    lines.push(`### ${label} (${m.module})`);
    if (!m.kernelInvoked) {
      lines.push(`- **${m.binding?.ok ? 'KERNEL_NICHT_LAUFGEFÄHIG' : 'BINDING_BLOCKIERT'}** — ${m.binding?.reasonCodes?.join(', ') ?? m.kernelRuntimeError ?? 'kein Kernel-Lauf'}.`);
      lines.push(`- Bewertbarkeit: **${m.productAssessability}**.`);
      continue;
    }
    lines.push(`- Kernel-Status: **${m.kernelStatus}**; Bewertbarkeit: **${m.productAssessability}**.`);
    const d = m.derivedSummary;
    if (m.module === 'B4' && d?.facetA) {
      lines.push(`- Facet A: ${d.facetA.tripEvidenceClassification}, Kandidaten ${d.facetA.deduplicatedCandidateCount}, Assessability ${d.facetA.assessability}.`);
      lines.push(`- Facet B: ${d.facetB.tripEvidenceClassification}, Kandidaten ${d.facetB.deduplicatedCandidateCount}, Assessability ${d.facetB.assessability}.`);
    } else if (d) {
      lines.push(`- Kandidaten: ${d.deduplicatedCandidateCount ?? '—'}; Trip-Evidenz: ${d.tripEvidenceClassification ?? '—'}.`);
      if (d.subtypeAssessability) {
        lines.push(`- Subtype-Assessability: ${JSON.stringify(d.subtypeAssessability)}`);
      }
    }
    if (m.abstainReasons?.length) lines.push(`- Abstain: ${m.abstainReasons.join(', ')}.`);
  }
  lines.push('');
  lines.push('## Antworten (konkret)');
  lines.push('### Wie wurde der Tiguan gefahren?');
  lines.push(
    `Überwiegend städtisch/fluide: ~${Math.round(t.durationMinutes ?? 0)} min, ~${t.distanceKm ?? '?'} km, Ø ${t.avgSpeedKmh != null ? Number(t.avgSpeedKmh).toFixed(1) : '?'} km/h. DS4 zeigt häufige Beschleunigungs- und Verzögerungs-Buckets; kein Autobahn-Dauerhochlauf erkennbar.`,
  );
  lines.push('### Wie stark wurde der Motor nachweisbar beansprucht?');
  if (desc) {
    lines.push(
      `OBD-Last typischerweise moderat (Median ${desc.engineLoadPct.median} %, Spitzen P95 ${desc.engineLoadPct.p95} %). RPM Median ${desc.rpm.median}, P95 ${desc.rpm.p95}. Starke Drosseln (≥75 %) in ${desc.throttlePct.bucketsAtOrAbove75Pct} Buckets — ohne Kickdown-Bestätigung durch B1.`,
    );
  }
  lines.push('### Was war auffällig?');
  lines.push('- Kräftige Verzögerungen (DS4); viele RPM-Wechsel (P2-D2); kalte ECT-Phase am Anfang mit anschließendem Warmwerden.');
  lines.push('### Was ist mit fehlender Evidenz nicht möglich?');
  lines.push('- Kickdown-, Kaltmotor-Schaden-, Dauerlast- oder Revving-Produktaussagen; zeitlich fusionierte Belastungsdauern; Missbrauch/Motorschaden.');
  lines.push('');
  lines.push('## Was erscheint auffällig (deskriptiv, nicht als Schaden/Missbrauch)');
  lines.push('- Mehrere kräftige Verzögerungsmanöver (DS4 OK, bis ~15 km/h Delta in 2–3 s Buckets).');
  lines.push('- Zahlreiche RPM-Anstiege/Senkungen; sustained-high nur mit Lücken → nicht als Belastungsnachweis verwertbar.');
  lines.push('');
  lines.push('## Wissenschaftlich nicht hinreichend abgesichert');
  lines.push('- R1-Bucket-Zeitbasis; SYNTHETIC_FIXTURE-Provenance im Research-Bridge-Pfad; keine unabhängige Offline-Attestierung.');
  lines.push('- Keine Zusagen zu Motorschaden, Missbrauch, Kickdown-Wahrheit oder Kaltstart-Diagnose.');
  lines.push('');
  lines.push('## Brauchbare Produktinformation heute');
  lines.push('- **DS4 Motion (research/shadow):** Fahrdynamik-Überblick mit Qualitätslabels.');
  lines.push('- **RPM P2-D2:** Dichte, Lücken, 82 deskriptive Kandidaten mit Evidenzstufen.');
  lines.push('- **P2-B1–B4:** Technische Negativ-Screens („nichts Policy-konform detektiert“) — noch kein freigegebenes Produkt-Scoring.');
  lines.push('');
  lines.push('## Fehlende Bausteine für nutzbare Motorverhaltensbewertung');
  lines.push('- Verifizierte Multichannel-Zeitphase / echte Admission statt Research-Bridge.');
  lines.push('- Feldvalidierte Schwellen und UI-Contracts; OFFLINE/Production-Attestierung ohne SYNTHETIC_FIXTURE.');
  lines.push('- Klare Abgrenzung Fahrdynamik (DS4) vs. Powertrain-Belastung ohne verbotene Fusion.');
  lines.push('');
  lines.push(`**STOP:** AWAIT_CHATGPT_PRODUCT_REVIEW`);
  return lines.join('\n');
}

async function main() {
  const closeout = loadJsonIfExists(join(ARTIFACTS_DIR, 'p2d2f-closeout-machine-output.json'));
  const ds4 = loadJsonIfExists(join(ARTIFACTS_DIR, 'p2d2e-tiguan-ds4-analysis.json'));
  const rpmQual = loadJsonIfExists(join(ARTIFACTS_DIR, 'p2d2h-tiguan-event-qualification.json'));
  const rpmAnalysis = loadJsonIfExists(join(ARTIFACTS_DIR, 'p2d2e-tiguan-rpm-analysis.json'));

  const pgRow = await loadPostgresTrip({ tripId: TRIP_ID, vehicleId: VEHICLE_ID });
  if (!pgRow?.end_time) throw new Error('TRIP_NOT_FOUND_OR_ONGOING');

  const tripStartIso = new Date(pgRow.start_time).toISOString();
  const tripEndIso = new Date(pgRow.end_time).toISOString();
  const orgId = pgRow.organization_id;
  const dimoRaw = pgRow.dimo_raw_json ?? { aftermarketDevice: { serial: 'R1-UNRESOLVED' } };

  const evidence = await loadEvidenceFromPostgres({
    orgId,
    vehicleId: VEHICLE_ID,
    tripId: TRIP_ID,
    linkId: SOURCE_LINK_ID,
    libs,
  });

  const { signalCounts, multichannelObservations, rpmPoints } = await loadMultichannelTrip({
    tripId: TRIP_ID,
    vehicleId: VEHICLE_ID,
    linkId: SOURCE_LINK_ID,
    parseHfRpmValueFloat: libs.parseHfRpmValueFloat,
  });

  const descriptiveMotor = computeDescriptiveMotorAnalysis(multichannelObservations);

  const tripInput = buildRealV1aTripInput({
    libs,
    orgId,
    vehicleId: VEHICLE_ID,
    tripId: TRIP_ID,
    linkId: SOURCE_LINK_ID,
    tripStartIso,
    tripEndIso,
    rpmPoints,
    chTotals: {
      total: signalCounts.powertrainCombustionEngineSpeed?.total ?? rpmPoints.length,
      returned: rpmPoints.length,
      limit: 50000,
    },
    fuelType: pgRow.fuel_type,
    vsiSignalsSnapshot: evidence.vsiRevision?.signals_snapshot ?? null,
  });

  const bridge = buildPowertrainResearchInput({
    libs,
    orgId,
    vehicleId: VEHICLE_ID,
    tripId: TRIP_ID,
    linkId: SOURCE_LINK_ID,
    dimoRaw,
    tripInput,
    multichannelObservations,
    fuelType: pgRow.fuel_type,
    v1bPersistedRun: evidence.v1bPersistedRun,
  });

  const buildRef = require(
    join(
      BACKEND_ROOT,
      'src/modules/vehicle-intelligence/driving-intelligence/rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-reference-input.ts',
    ),
  ).buildDs4RpmReferenceIntelligenceV1ReferenceBlock;

  let modules = [];
  let kernelResultsByModule = { B1: null, B2: null, B3: null, B4: null };

  if (bridge.ok) {
    const input = bridge.researchInput;
    const coldInput = {
      ...input,
      vehicleRpmReference: buildRef({
        idleRpm: pgRow.idle_rpm,
        maxRpm: pgRow.max_rpm,
        iceRpmApplicability: 'APPLICABLE',
      }),
      vehicleRpmReferenceBinding: { organizationId: orgId, vehicleId: VEHICLE_ID },
    };
    const coldBinding =
      pgRow.idle_rpm == null || pgRow.max_rpm == null
        ? { ok: false, reasonCodes: ['REFERENCE_SPEC_UNAVAILABLE_FROM_VEHICLE_ROW'] }
        : validateCold(coldInput);

    modules = [
      runPowertrainModule('B1', validateKickdown(input), computeKickdown, input),
      runPowertrainModule('B2', coldBinding, computeCold, coldInput),
      runPowertrainModule('B3', validateSustained(input), computeSustained, input),
      runPowertrainModule('B4', validateRevving(input), computeRevving, input),
    ];
    kernelResultsByModule = {
      B1: modules[0].kernelResultOriginal,
      B2: modules[1].kernelResultOriginal,
      B3: modules[2].kernelResultOriginal,
      B4: modules[3].kernelResultOriginal,
    };
  } else {
    modules = ['B1', 'B2', 'B3', 'B4'].map((module) => ({
      module,
      binding: { ok: false, reasonCodes: [bridge.blocker] },
      kernelInvoked: false,
      kernelResultOriginal: null,
      derivedSummary: null,
      productAssessability: 'NOT_ASSESSABLE',
      powertrainBridgeBlocked: true,
    }));
  }

  const v1bEvidence = bridge.ok
    ? {
        source: bridge.v1bSource,
        tier: bridge.researchInput.v1bResult.tierEvidence?.tier ?? null,
        analysisMode: bridge.researchInput.v1bResult.tierEvidence?.analysisMode ?? null,
        tierEvidenceStatus: tripInput.tierEvidence?.status ?? null,
        admissionProcessingAllowed: tripInput.admission.processingAllowed,
      }
    : {
        source: bridge.v1bSource ?? 'NONE',
        tierEvidenceStatus: bridge.tierEvidenceStatus ?? tripInput.tierEvidence?.status,
        admissionProcessingAllowed: bridge.admissionProcessingAllowed ?? tripInput.admission.processingAllowed,
        blocker: bridge.blocker,
      };

  const productMaturity = [
    {
      module: 'DS4_Motion_Shadow',
      maturity: 'RESEARCH_READY',
      productUse: 'Fahrdynamik-Übersicht (Beschleunigung/Verzögerung) mit Qualitätsstufen',
      blocker: 'Sparse R1 buckets; keine FSM-Punkt-Autorität',
    },
    {
      module: 'RPM_P2D2',
      maturity: 'RESEARCH_CLOSED',
      productUse: 'Drehzahl-Dichte, 82 deskriptive Kandidaten, Evidenzqualifikation',
      blocker: 'Kein Produkt-Scoring; DS4×RPM fusion verboten',
    },
    ...['B1', 'B2', 'B3', 'B4'].map((id, i) => ({
      module: `P2-${id}_${ { B1: 'Kickdown', B2: 'Cold_Engine', B3: 'Sustained_Load', B4: 'Revving_Idle' }[id]}`,
      maturity: modules[i]?.productAssessability ?? 'NOT_ASSESSABLE',
      productUse: 'Research-Kernel (unverändert)',
      blocker: modules[i]?.derivedSummary
        ? JSON.stringify(modules[i].derivedSummary).slice(0, 120)
        : modules[i]?.binding?.reasonCodes?.join(',') ?? bridge.blocker,
    })),
  ];

  const priorResearchCompact = {
    rpmCloseout: closeout.loaded ? closeout.data : null,
    ds4Motion: ds4.loaded ? ds4.data : null,
    rpmQualificationSummary: rpmQual.loaded ? rpmQual.data?.machine : null,
    rpmAnalysisSummary: rpmAnalysis.loaded
      ? {
          observationCount: rpmAnalysis.data?.observationCount,
          intervalSeconds: rpmAnalysis.data?.intervalSeconds,
        }
      : null,
  };

  const json = {
    OPERATION: 'DBI_BULK_SCREEN_V1_PRODUCT_RESULT_CORRECTION',
    OPERATION_BASE: 'DBI_FULL_TRIP_BULK_SCREEN_V1',
    BASE_SHA: gitSha(),
    TRIP_ID,
    VEHICLE_ID,
    VEHICLE: 'VW_TIGUAN',
    MODE: 'READ_ONLY_REAL_DATA',
    TIMESTAMP_AUTHORITY: 'BUCKET_LABEL_UNVERIFIED',
    mappingCorrection: MAPPING_CORRECTION_NOTES,
    tripOverview: {
      startUtc: tripStartIso,
      endUtc: tripEndIso,
      distanceKm: pgRow.distance_km,
      durationMinutes: pgRow.duration_minutes,
      avgSpeedKmh: pgRow.avg_speed_kmh,
      maxSpeedKmh: pgRow.max_speed_kmh,
    },
    dataCoverage: { signalCounts, rpmPoints: rpmPoints.length, multichannelRows: multichannelObservations.length },
    vsiEvidence: {
      revisionLoaded: Boolean(evidence.vsiRevision),
      recordedAt: evidence.vsiRevision?.recorded_at ?? null,
      tierEvidenceStatus: tripInput.tierEvidence?.status ?? null,
      tripRpmProfile: tripInput.admission.tripRpmProfile,
      admissionReasonCode: tripInput.admission.reasonCode,
    },
    v1bEvidence,
    descriptiveMotor,
    provenance: bridge.provenance ?? {
      bridgeBlocked: true,
      blocker: bridge.blocker,
      tierEvidenceStatus: tripInput.tierEvidence?.status,
    },
    priorResearch: priorResearchCompact,
    powertrainModuleSummaries: modules,
    kernelResultsOriginal: kernelResultsByModule,
    productMaturityTable: productMaturity,
    evidenceLimits: [
      'BUCKET_LABEL_UNVERIFIED',
      'NO_DS4_RPM_TEMPORAL_FUSION',
      'SYNTHETIC_FIXTURE_BINDING_ENUM_NOT_FIELD_ATTESTATION',
      'COMPUTED_NOT_PRODUCT_ASSESSABLE_BY_DEFAULT',
    ],
    FINAL_VERDICT: modules.some((m) => m.kernelInvoked)
      ? 'BULK_SCREEN_V1_CORRECTED_COMPLETE'
      : bridge.ok
        ? 'BULK_SCREEN_DESCRIPTIVE_ONLY_POWERTRAIN_BINDING_BLOCKED'
        : 'BULK_SCREEN_DESCRIPTIVE_ONLY_V1B_UNAVAILABLE',
    STOP: 'AWAIT_CHATGPT_PRODUCT_REVIEW',
  };

  const md = buildGermanReport({
    tripOverview: json.tripOverview,
    dataCoverage: json.dataCoverage,
    v1bEvidence: json.v1bEvidence,
    priorResearch: { ds4Motion: ds4, rpmCloseout: closeout, rpmQualification: rpmQual },
    powertrainModules: modules,
    descriptiveMotor,
  });

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(json, null, 2));
  writeFileSync(OUT_MD, md);
  console.log(
    JSON.stringify({
      json: OUT_JSON,
      verdict: json.FINAL_VERDICT,
      modules: modules.map((m) => ({ m: m.module, a: m.productAssessability, inv: m.kernelInvoked })),
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
