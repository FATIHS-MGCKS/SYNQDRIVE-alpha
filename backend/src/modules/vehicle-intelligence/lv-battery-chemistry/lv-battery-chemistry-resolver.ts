import { BatteryChemistry } from '../battery-health/battery-v2-domain';
import { normalizeBatteryType, selectBestBatterySpec } from '../battery-health/battery-status';
import type {
  ChemistryEvidenceInput,
  ChemistryLayerResolution,
  ConfirmedBatterySpecInput,
  LvBatteryChemistry,
  LvBatteryChemistryResolverInput,
  ResolvedLvBatteryChemistry,
  VerifiedManualChemistryInput,
} from './lv-battery-chemistry-resolver.types';
import {
  LvBatteryChemistryConfidence,
  LvBatteryChemistrySource,
} from './lv-battery-chemistry-resolver.types';

const UNKNOWN: ChemistryLayerResolution = {
  chemistry: BatteryChemistry.UNKNOWN,
  source: LvBatteryChemistrySource.UNKNOWN,
  confidence: LvBatteryChemistryConfidence.LOW,
  verifiedAt: null,
  evidence: ['no_decisive_source'],
};

const WORKSHOP_DOCUMENT_SOURCES = new Set([
  'WORKSHOP_MEASUREMENT',
  'DOCUMENT_CONFIRMED',
]);

const MANUAL_EVIDENCE_SOURCES = new Set(['MANUAL_REPORT']);

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? date.toISOString() : null;
}

function mapRawToChemistry(raw: string | null | undefined): LvBatteryChemistry | null {
  const normalized = normalizeBatteryType(raw);
  if (normalized === 'UNKNOWN') return null;
  return normalized as LvBatteryChemistry;
}

function hasPositiveVolt(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function extractChemistryFromEvidence(
  evidence: ChemistryEvidenceInput,
): LvBatteryChemistry | null {
  const direct = mapRawToChemistry(evidence.chemistryRaw);
  if (direct) return direct;

  const meta = evidence.metadataJson;
  if (!meta || typeof meta !== 'object') return null;

  const raw =
    (meta.batteryType as string | undefined) ??
    (meta.chemistry as string | undefined) ??
    (meta.batteryChemistry as string | undefined) ??
    null;
  return mapRawToChemistry(raw);
}

function isConfirmedBatterySpec(spec: ConfirmedBatterySpecInput): boolean {
  const chemistry = mapRawToChemistry(spec.batteryType);
  if (!chemistry) return false;
  if (spec.confirmed === true) return true;

  const confidence = spec.sourceConfidence ?? 0;
  if (confidence >= 0.75) return true;

  const sourceType = (spec.sourceType ?? '').trim().toUpperCase();
  if (
    hasPositiveVolt(spec.batteryVolt) &&
    (sourceType === 'MANUAL' || sourceType === 'DIMO' || sourceType === 'VIN_DECODE')
  ) {
    return sourceType === 'MANUAL' || confidence >= 0.5;
  }

  return false;
}

function isDecisive(layer: ChemistryLayerResolution): boolean {
  return layer.chemistry !== BatteryChemistry.UNKNOWN;
}

function chemistriesConflict(a: LvBatteryChemistry, b: LvBatteryChemistry): boolean {
  return (
    a !== BatteryChemistry.UNKNOWN &&
    b !== BatteryChemistry.UNKNOWN &&
    a !== b
  );
}

export function resolveFromConfirmedBatterySpec(
  specs: ConfirmedBatterySpecInput[] | null | undefined,
): ChemistryLayerResolution {
  if (!specs?.length) return UNKNOWN;

  const confirmed = specs.filter(isConfirmedBatterySpec);
  if (!confirmed.length) return UNKNOWN;

  const best = selectBestBatterySpec(
    confirmed.map((spec) => ({
      batteryType: spec.batteryType ?? null,
      batteryVolt: spec.batteryVolt ?? null,
      sourceConfidence: spec.sourceConfidence ?? null,
      createdAt: spec.createdAt ?? null,
    })),
  );
  if (!best) return UNKNOWN;

  const bestInput =
    confirmed.find(
      (spec) =>
        (spec.batteryType ?? null) === best.batteryType &&
        (spec.batteryVolt ?? null) === best.batteryVolt,
    ) ?? confirmed[0];

  const chemistry = mapRawToChemistry(bestInput.batteryType);
  if (!chemistry) return UNKNOWN;

  return {
    chemistry,
    source: LvBatteryChemistrySource.BATTERY_SPEC,
    confidence: LvBatteryChemistryConfidence.HIGH,
    verifiedAt: toIso(bestInput.updatedAt ?? bestInput.createdAt),
    evidence: [
      'spec:confirmed_battery_spec',
      `spec:source_type:${(bestInput.sourceType ?? 'UNKNOWN').toUpperCase()}`,
      `spec:chemistry:${chemistry}`,
    ],
  };
}

export function resolveFromWorkshopDocumentEvidence(
  evidence: ChemistryEvidenceInput[] | null | undefined,
): ChemistryLayerResolution {
  if (!evidence?.length) return UNKNOWN;

  const candidates = evidence
    .filter((row) => WORKSHOP_DOCUMENT_SOURCES.has(row.sourceType))
    .map((row) => ({
      row,
      chemistry: extractChemistryFromEvidence(row),
      observedAtMs: toIso(row.observedAt)
        ? Date.parse(toIso(row.observedAt)!)
        : 0,
    }))
    .filter(
      (entry): entry is typeof entry & { chemistry: LvBatteryChemistry } =>
        entry.chemistry != null,
    )
    .sort((a, b) => b.observedAtMs - a.observedAtMs);

  const best = candidates[0];
  if (!best) return UNKNOWN;

  return {
    chemistry: best.chemistry,
    source: LvBatteryChemistrySource.WORKSHOP_DOCUMENT,
    confidence: LvBatteryChemistryConfidence.HIGH,
    verifiedAt: toIso(best.row.observedAt),
    evidence: [
      `evidence:${best.row.sourceType.toLowerCase()}`,
      `evidence:chemistry:${best.chemistry}`,
    ],
  };
}

export function resolveFromVerifiedManual(input: {
  manual?: VerifiedManualChemistryInput | null;
  evidence?: ChemistryEvidenceInput[] | null;
}): ChemistryLayerResolution {
  const manualEvidence = (input.evidence ?? [])
    .filter((row) => MANUAL_EVIDENCE_SOURCES.has(row.sourceType))
    .map((row) => ({
      row,
      chemistry: extractChemistryFromEvidence(row),
      observedAtMs: toIso(row.observedAt)
        ? Date.parse(toIso(row.observedAt)!)
        : 0,
    }))
    .filter(
      (entry): entry is typeof entry & { chemistry: LvBatteryChemistry } =>
        entry.chemistry != null,
    )
    .sort((a, b) => b.observedAtMs - a.observedAtMs);

  if (manualEvidence[0]) {
    const best = manualEvidence[0];
    return {
      chemistry: best.chemistry,
      source: LvBatteryChemistrySource.MANUAL_VERIFIED,
      confidence: LvBatteryChemistryConfidence.MEDIUM,
      verifiedAt: toIso(best.row.observedAt),
      evidence: [
        'manual:evidence_report',
        `manual:chemistry:${best.chemistry}`,
      ],
    };
  }

  const manual = input.manual;
  if (!manual) return UNKNOWN;

  const chemistry = mapRawToChemistry(manual.batteryType);
  if (!chemistry) return UNKNOWN;

  const sourceType = (manual.sourceType ?? '').trim().toUpperCase();
  if (sourceType !== 'MANUAL' && sourceType !== '') return UNKNOWN;

  return {
    chemistry,
    source: LvBatteryChemistrySource.MANUAL_VERIFIED,
    confidence: LvBatteryChemistryConfidence.MEDIUM,
    verifiedAt: toIso(manual.verifiedAt),
    evidence: [
      'manual:verified_entry',
      `manual:chemistry:${chemistry}`,
    ],
  };
}

/**
 * Central LV battery chemistry resolver — pure, tenant-independent domain function.
 *
 * Priority: confirmed spec → workshop/document evidence → verified manual.
 * Voltage alone is never used.
 */
export function resolveLvBatteryChemistry(
  input: LvBatteryChemistryResolverInput,
): ResolvedLvBatteryChemistry {
  const spec = resolveFromConfirmedBatterySpec(input.specs);
  const workshop = resolveFromWorkshopDocumentEvidence(input.workshopDocumentEvidence);
  const manual = resolveFromVerifiedManual({
    manual: input.verifiedManual,
    evidence: input.manualEvidence,
  });

  if (
    isDecisive(spec) &&
    isDecisive(workshop) &&
    chemistriesConflict(spec.chemistry, workshop.chemistry)
  ) {
    return {
      chemistry: BatteryChemistry.UNKNOWN,
      source: LvBatteryChemistrySource.UNKNOWN,
      confidence: LvBatteryChemistryConfidence.LOW,
      verifiedAt: null,
      evidence: [
        'conflict:spec_vs_workshop_document',
        ...spec.evidence,
        ...workshop.evidence,
      ],
    };
  }

  if (isDecisive(spec)) {
    return spec;
  }

  if (isDecisive(workshop)) {
    return workshop;
  }

  if (
    isDecisive(manual) &&
    isDecisive(workshop) &&
    chemistriesConflict(manual.chemistry, workshop.chemistry)
  ) {
    return {
      chemistry: BatteryChemistry.UNKNOWN,
      source: LvBatteryChemistrySource.UNKNOWN,
      confidence: LvBatteryChemistryConfidence.LOW,
      verifiedAt: null,
      evidence: [
        'conflict:manual_vs_workshop_document',
        ...manual.evidence,
        ...workshop.evidence,
      ],
    };
  }

  if (isDecisive(manual)) {
    return manual;
  }

  return {
    chemistry: BatteryChemistry.UNKNOWN,
    source: LvBatteryChemistrySource.UNKNOWN,
    confidence: LvBatteryChemistryConfidence.LOW,
    verifiedAt: null,
    evidence: ['unresolved'],
  };
}

/** Whether lead-acid resting/SOC curves may be applied for this chemistry. */
export function isLeadAcidCurveApplicable(chemistry: LvBatteryChemistry): boolean {
  return (
    chemistry === BatteryChemistry.LEAD_ACID ||
    chemistry === BatteryChemistry.AGM ||
    chemistry === BatteryChemistry.EFB
  );
}

/** Policy may share AGM-like thresholds with EFB — storage must preserve distinct chemistry. */
export function policyMayUseAgmLikeThresholds(chemistry: LvBatteryChemistry): boolean {
  return chemistry === BatteryChemistry.AGM || chemistry === BatteryChemistry.EFB;
}
