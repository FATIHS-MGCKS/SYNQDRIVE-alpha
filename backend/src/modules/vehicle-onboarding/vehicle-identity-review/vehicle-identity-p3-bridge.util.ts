import { postProcessVehicleSpecOutput } from '@modules/ai/vehicle-specs/vehicle-spec-ai.postprocess.util';
import type {
  RegistrationIdentityCanonicalIdentity,
  RegistrationIdentityFieldProvenanceEntry,
  VehicleIdentityAiV2PreviewResult,
} from './vehicle-identity-canonical.types';
import { canonicalToVehicleSpecContext } from './vehicle-identity-canonical.util';

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fieldNum(f: RegistrationIdentityCanonicalIdentity['fields'][number] | undefined): number | null {
  return num(f?.value);
}

function fieldStr(f: RegistrationIdentityCanonicalIdentity['fields'][number] | undefined): string | null {
  if (!f || f.value == null) return null;
  return String(f.value);
}

/** Reject implausible displacement for mild-hybrid variant labels (e.g. 1.5 eTSI vs 1984 cm³). */
export function detectDisplacementVariantConflict(input: {
  typeVariantVersion: string | null;
  electrificationGrade: string | null;
  confirmedDisplacementCc: number | null;
  aiDisplacementCc: number | null;
}): { conflict: boolean; code: string; message: string } | null {
  const ai = input.aiDisplacementCc;
  const confirmed = input.confirmedDisplacementCc;
  const variant = `${input.typeVariantVersion ?? ''} ${input.electrificationGrade ?? ''}`.toLowerCase();
  const mildHybridHint =
    variant.includes('etsi') || variant.includes('e-tsi') || variant.includes('mhev') || variant.includes('mild');
  if (mildHybridHint && ai != null && ai >= 1700) {
    return {
      conflict: true,
      code: 'DISPLACEMENT_VARIANT_MISMATCH',
      message: 'AI displacement conflicts with mild-hybrid variant assumption (e.g. 1.5 eTSI).',
    };
  }
  if (confirmed != null && ai != null && Math.abs(confirmed - ai) / Math.max(confirmed, 1) > 0.08) {
    return {
      conflict: true,
      code: 'DISPLACEMENT_CONFIRMED_AI_MISMATCH',
      message: 'AI displacement differs from user-confirmed displacement.',
    };
  }
  return null;
}

export function mergeAiSpecsIntoIdentityPreview(input: {
  canonical: RegistrationIdentityCanonicalIdentity;
  rawAiSpecs: Record<string, string | number | boolean | null>;
}): VehicleIdentityAiV2PreviewResult {
  const context = canonicalToVehicleSpecContext(input.canonical);
  const rawAiSystemKw = num(input.rawAiSpecs.systemMotorPowerKw);
  const { specs, rejectedFields } = postProcessVehicleSpecOutput(input.rawAiSpecs, context);

  const byKey = new Map(input.canonical.fields.map((f) => [f.key, f]));
  const conflicts: VehicleIdentityAiV2PreviewResult['conflicts'] = [];
  const suggestedFields: VehicleIdentityAiV2PreviewResult['suggestedFields'] = {};
  const now = new Date().toISOString();

  const confirmedDisplacement = fieldNum(byKey.get('displacementCc'));
  const aiDisplacement = num(specs.engineDisplacementCc);
  const displacementConflict = detectDisplacementVariantConflict({
    typeVariantVersion: fieldStr(byKey.get('typeVariantVersion')),
    electrificationGrade: fieldStr(byKey.get('electrificationGrade')),
    confirmedDisplacementCc: confirmedDisplacement,
    aiDisplacementCc: aiDisplacement,
  });
  if (displacementConflict) {
    conflicts.push({
      code: displacementConflict.code,
      fieldKey: 'displacementCc',
      message: displacementConflict.message,
    });
    specs.engineDisplacementCc = null;
  } else if (aiDisplacement != null && confirmedDisplacement == null) {
    suggestedFields.engineDisplacementCc = {
      value: aiDisplacement,
      provenance: 'AI_ESTIMATED',
      confirmationStatus: 'SUGGESTED',
      confirmedAt: null,
      documentExtractionId: input.canonical.documentExtractionId,
    };
  }

  const confirmedNominal = fieldNum(byKey.get('nominalMotorPowerKw'));
  const aiSystemKw = num(specs.systemMotorPowerKw) ?? rawAiSystemKw;
  if (confirmedNominal != null && rawAiSystemKw != null && Math.abs(confirmedNominal - rawAiSystemKw) > 3) {
    conflicts.push({
      code: 'P2_NOMINAL_VS_AI_SYSTEM_POWER',
      fieldKey: 'nominalMotorPowerKw',
      message: 'P.2 nominal power must not be treated as AI system motor power.',
    });
    specs.systemMotorPowerKw = null;
  } else if (aiSystemKw != null && confirmedNominal == null) {
    suggestedFields.systemMotorPowerKw = {
      value: aiSystemKw,
      provenance: 'AI_ESTIMATED',
      confirmationStatus: 'SUGGESTED',
      confirmedAt: null,
      documentExtractionId: input.canonical.documentExtractionId,
    };
  }

  const resolvedVariant = specs.resolvedVariant != null ? String(specs.resolvedVariant) : null;
  if (resolvedVariant) {
    suggestedFields.resolvedVariant = {
      value: resolvedVariant,
      provenance: 'AI_ESTIMATED',
      confirmationStatus: 'SUGGESTED',
      confirmedAt: null,
      documentExtractionId: input.canonical.documentExtractionId,
    };
  }

  return {
    ok: conflicts.length === 0,
    canonical: input.canonical,
    aiSpecs: specs,
    suggestedFields,
    conflicts,
    rejectedAiFields: rejectedFields,
    aiLiveInvoked: true,
  };
}
