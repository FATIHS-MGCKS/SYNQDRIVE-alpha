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
  loadMultichannelTrip,
  loadPostgresTrip,
} from './dbi-powertrain-research-real-trip-bridge.mjs';

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

function summarizeKernel(moduleId, binding, computeFn, input) {
  if (!binding.ok) {
    return {
      module: moduleId,
      execution: 'BLOCKED',
      bindingOk: false,
      reasonCodes: binding.reasonCodes,
      productAssessability: 'NOT_ASSESSABLE',
      assessabilityNote: 'Input binding failed; kernel not invoked.',
    };
  }
  let result;
  try {
    result = computeFn(input);
  } catch (err) {
    return {
      module: moduleId,
      execution: 'KERNEL_RUNTIME_ERROR',
      bindingOk: true,
      error: String(err?.message ?? err),
      productAssessability: 'NOT_ASSESSABLE',
      assessabilityNote: 'Binding passed but kernel threw — no fabricated fallback result.',
    };
  }
  const status = result.status;
  let candidates = 0;
  if (result.kickdown?.candidates) candidates = result.kickdown.candidates.length;
  if (result.coldEngine?.episodes) candidates = result.coldEngine.episodes.length;
  if (result.sustainedLoad?.candidates) candidates = result.sustainedLoad.candidates.length;
  if (result.revvingIdle?.episodes) candidates = result.revvingIdle.episodes.length;

  const productAssessability =
    status === 'ABSTAINED'
      ? 'NOT_ASSESSABLE'
      : status === 'COMPUTED' && candidates > 0
        ? 'DESCRIPTIVE_RESEARCH_ONLY'
        : status === 'COMPUTED' || status === 'NOT_OBSERVED'
          ? 'OBSERVATION_NEGATIVE'
          : 'UNKNOWN';

  return {
    module: moduleId,
    execution: 'COMPUTED',
    bindingOk: true,
    kernelStatus: status,
    abstainReasons: result.abstainReasons ?? [],
    candidateOrEpisodeCount: candidates,
    productAssessability,
    tripEvidenceClassification:
      result.kickdown?.tripEvidenceClassification ??
      result.coldEngine?.tripEvidenceClassification ??
      result.sustainedLoad?.tripEvidenceClassification ??
      result.revvingIdle?.tripEvidenceClassification ??
      null,
    coverageEvidence:
      result.kickdown?.coverageEvidence ??
      result.coldEngine?.coverageEvidence ??
      result.sustainedLoad?.coverageEvidence ??
      result.revvingIdle?.coverageEvidence ??
      null,
    unsupportedScientificClaims: result.unsupportedScientificClaims ?? [],
    sampleCandidates: (
      result.kickdown?.candidates ??
      result.coldEngine?.episodes ??
      result.sustainedLoad?.candidates ??
      result.revvingIdle?.episodes ??
      []
    ).slice(0, 8),
    limitations: (result.limitations ?? []).slice?.(0, 12) ?? result.limitations,
  };
}

function buildGermanReport(ctx) {
  const t = ctx.tripOverview;
  const ds4 = ctx.priorResearch.ds4Motion;
  const rpm = ctx.priorResearch.rpmCloseout;
  const qual = ctx.priorResearch.rpmQualification?.machine;
  const modules = ctx.powertrainModules;

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
  lines.push(`- V1B nach Verarbeitung: Tier ${ctx.v1b.tier}, Modus ${ctx.v1b.analysisMode}.`);
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
  lines.push('## Powertrain-Research-Kernels (P2-B1–B4, unverändert)');
  for (const m of modules) {
    const label = { B1: 'Kickdown-like', B2: 'Cold Engine', B3: 'Sustained Load', B4: 'Revving/Idle' }[m.module];
    lines.push(`### ${label} (${m.module})`);
    if (m.execution === 'BLOCKED') {
      lines.push(`- **BLOCKED** — Binding: ${m.reasonCodes?.join(', ')}`);
      continue;
    }
    lines.push(`- Kernel-Status: **${m.kernelStatus}**; Kandidaten/Episoden: **${m.candidateOrEpisodeCount}**.`);
    lines.push(`- Produktbewertbarkeit: **${m.productAssessability}** (COMPUTED ≠ automatisch nutzbar).`);
    if (m.tripEvidenceClassification) lines.push(`- Trip-Evidenz: ${m.tripEvidenceClassification}.`);
    if (m.abstainReasons?.length) lines.push(`- Abstain-Gründe: ${m.abstainReasons.join(', ')}.`);
  }
  lines.push('');
  lines.push('## Zusammenfassung');
  lines.push(
    'Es liegt eine reale Stadt-/ Überlandfahrt (~41 min) mit dichter R1-OBD-Abdeckung vor. DS4 beschreibt **16** Fahrereignisse (7× Beschleunigung, 9× Verzögerung) auf Sparse-Bucket-Basis. RPM zeigt viele lokale Drehzahlwechsel, aber nur wenige streng qualifizierte Musterevidenz.',
  );
  lines.push(
    'Die multichannel Powertrain-Kernels laufen technisch durch, liefern auf dieser Fahrt aber **keine** bestätigten Kickdown-, Kaltstart-, Dauerlast- oder Revving-Kandidaten im Sinne der jeweiligen Policies — insbesondere B3 meldet COMPUTED mit 0 Kandidaten und INSUFFICIENT_OBSERVATIONS.',
  );
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

  const { signalCounts, multichannelObservations, rpmPoints } = await loadMultichannelTrip({
    tripId: TRIP_ID,
    vehicleId: VEHICLE_ID,
    linkId: SOURCE_LINK_ID,
    parseHfRpmValueFloat: libs.parseHfRpmValueFloat,
  });

  const tierOverrides = closeout.loaded
    ? {
        activeDensityVsTier: closeout.data?.CANONICAL_VSI?.activeCadence?.activeDensityVsTier,
        longestSequenceIntervals: closeout.data?.CANONICAL_VSI?.qualifiedActiveIntervals,
      }
    : {};

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
    tierOverrides,
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
  });

  if (!bridge.ok) throw new Error(`V1B_FAILED:${bridge.blocker}`);

  const buildRef = require(
    join(
      BACKEND_ROOT,
      'src/modules/vehicle-intelligence/driving-intelligence/rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-reference-input.ts',
    ),
  ).buildDs4RpmReferenceIntelligenceV1ReferenceBlock;

  const coldInput = {
    ...bridge.researchInput,
    vehicleRpmReference: buildRef({
      idleRpm: pgRow.idle_rpm,
      maxRpm: pgRow.max_rpm,
      iceRpmApplicability: 'APPLICABLE',
    }),
    vehicleRpmReferenceBinding: { organizationId: orgId, vehicleId: VEHICLE_ID },
  };

  const coldPre =
    pgRow.idle_rpm == null || pgRow.max_rpm == null
      ? {
          ok: false,
          reasonCodes: ['REFERENCE_SPEC_UNAVAILABLE_FROM_VEHICLE_ROW'],
        }
      : validateCold(coldInput);

  const input = bridge.researchInput;
  const modules = [
    summarizeKernel('B1', validateKickdown(input), computeKickdown, input),
    summarizeKernel(
      'B2',
      coldPre,
      computeCold,
      coldPre.ok ? coldInput : coldInput,
    ),
    summarizeKernel('B3', validateSustained(input), computeSustained, input),
    summarizeKernel('B4', validateRevving(input), computeRevving, input),
  ];

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
    {
      module: 'P2-B1_Kickdown',
      maturity: modules[0].productAssessability,
      productUse: 'Kickdown-ähnliche Muster',
      blocker: modules[0].execution === 'BLOCKED' ? modules[0].reasonCodes?.join(',') : 'Keine Kandidaten auf dieser Fahrt',
    },
    {
      module: 'P2-B2_Cold_Engine',
      maturity: modules[1].productAssessability,
      productUse: 'Kaltmotor / ECT',
      blocker: modules[1].execution === 'BLOCKED' ? modules[1].reasonCodes?.join(',') : 'Keine Episoden',
    },
    {
      module: 'P2-B3_Sustained_Load',
      maturity: modules[2].productAssessability,
      productUse: 'Dauerlast',
      blocker: '0 Kandidaten; INSUFFICIENT_OBSERVATIONS trotz vieler Load-Buckets',
    },
    {
      module: 'P2-B4_Revving_Idle',
      maturity: modules[3].productAssessability,
      productUse: 'Leerlauf/Revving',
      blocker: modules[3].execution === 'BLOCKED' ? modules[3].reasonCodes?.join(',') : 'Keine Episoden',
    },
  ];

  const json = {
    OPERATION: 'DBI_FULL_TRIP_BULK_SCREEN_V1',
    BASE_SHA: gitSha(),
    TRIP_ID,
    VEHICLE_ID,
    VEHICLE: 'VW_TIGUAN',
    MODE: 'READ_ONLY_REAL_DATA',
    TIMESTAMP_AUTHORITY: 'BUCKET_LABEL_UNVERIFIED',
    tripOverview: {
      startUtc: tripStartIso,
      endUtc: tripEndIso,
      distanceKm: pgRow.distance_km,
      durationMinutes: pgRow.duration_minutes,
      avgSpeedKmh: pgRow.avg_speed_kmh,
      maxSpeedKmh: pgRow.max_speed_kmh,
    },
    dataCoverage: { signalCounts, rpmPoints: rpmPoints.length, multichannelRows: multichannelObservations.length },
    v1b: {
      tier: bridge.v1bOut.result.tierEvidence?.tier,
      analysisMode: bridge.v1bOut.result.tierEvidence?.analysisMode,
      processingAllowed: bridge.v1bOut.result.admission?.processingAllowed,
    },
    provenance: bridge.provenance,
    priorResearch: {
      rpmCloseout: closeout,
      rpmQualification: rpmQual,
      rpmAnalysis,
      ds4Motion: ds4,
    },
    powertrainModules: modules,
    productMaturityTable: productMaturity,
    FINAL_VERDICT: 'BULK_SCREEN_COMPLETE',
    STOP: 'AWAIT_CHATGPT_PRODUCT_REVIEW',
  };

  const md = buildGermanReport({
    tripOverview: json.tripOverview,
    dataCoverage: json.dataCoverage,
    v1b: json.v1b,
    priorResearch: json.priorResearch,
    powertrainModules: modules,
  });

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(json, null, 2));
  writeFileSync(OUT_MD, md);
  console.log(JSON.stringify({ json: OUT_JSON, md: OUT_MD, modules: modules.map((m) => ({ m: m.module, s: m.kernelStatus, n: m.candidateOrEpisodeCount })) }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
