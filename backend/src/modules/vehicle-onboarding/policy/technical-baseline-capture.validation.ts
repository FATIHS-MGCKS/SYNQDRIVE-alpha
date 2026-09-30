import type { Prisma } from '@prisma/client';
import type { VehicleOnboardingCase } from '@prisma/client';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from '../contracts/vo-document-versions';
import type { VehicleTechnicalBaselineDraftV2 } from '../contracts/vehicle-technical-baseline-draft.v2';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { buildTechnicalBaselineDraftV2FromRaw } from './technical-baseline-draft.v2.runtime';
import {
  assessBrakeBaselineState,
  assessHvBatteryBaselineState,
  assessTireBaselineState,
  parseTechnicalBaselineDraft,
} from './technical-baseline-draft.validation';

export function parseTechnicalBaselineCapturePayload(body: unknown): VehicleTechnicalBaselineDraftV2 {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new VehicleOnboardingError(
      'INVALID_CAPTURE_PAYLOAD',
      'Technical baseline body must be an object',
    );
  }
  const raw = body as Record<string, unknown>;
  if (raw.version !== VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2) {
    throw new VehicleOnboardingError(
      'UNSUPPORTED_CONTRACT_VERSION',
      'Technical baseline capture accepts only V2',
    );
  }
  const { draft, hasInvalidSection } = buildTechnicalBaselineDraftV2FromRaw(raw);
  if (hasInvalidSection) {
    throw new VehicleOnboardingError(
      'INVALID_CAPTURE_PAYLOAD',
      'Technical baseline contains invalid section data',
    );
  }
  return draft;
}

export async function assertTechnicalBaselineCaptureValidForCase(
  tx: Prisma.TransactionClient,
  caseRow: VehicleOnboardingCase,
  draft: VehicleTechnicalBaselineDraftV2,
): Promise<void> {
  const syntheticCase: VehicleOnboardingCase = {
    ...caseRow,
    draftTechnicalBaselineJson: draft as unknown as VehicleOnboardingCase['draftTechnicalBaselineJson'],
    draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
  };
  const parsed = parseTechnicalBaselineDraft(syntheticCase);
  const tireState = assessTireBaselineState(parsed, syntheticCase);
  const brakeState = assessBrakeBaselineState(parsed, syntheticCase);
  const hvState = assessHvBatteryBaselineState(parsed, syntheticCase);
  if (tireState === 'invalid' || brakeState === 'invalid' || hvState === 'invalid') {
    throw new VehicleOnboardingError(
      'INVALID_CAPTURE_PAYLOAD',
      'Technical baseline failed readiness-grade validation',
    );
  }
  if (draft.hvBatteryReference?.documentId) {
    const doc = await tx.vehicleDocumentExtraction.findUnique({
      where: { id: draft.hvBatteryReference.documentId },
      select: { organizationId: true, vehicleId: true },
    });
    if (!doc) {
      throw new VehicleOnboardingError(
        'TECHNICAL_BASELINE_EVIDENCE_SCOPE_MISMATCH',
        'Document evidence not available for capture',
      );
    }
    if (doc.organizationId !== caseRow.organizationId) {
      throw new VehicleOnboardingError(
        'TECHNICAL_BASELINE_EVIDENCE_SCOPE_MISMATCH',
        'Document evidence not available for capture',
      );
    }
    if (doc.vehicleId != null) {
      throw new VehicleOnboardingError(
        'TECHNICAL_BASELINE_EVIDENCE_SCOPE_MISMATCH',
        'Document evidence not available for capture',
      );
    }
  }
}

export function technicalBaselineSemanticEquals(
  a: VehicleTechnicalBaselineDraftV2,
  b: VehicleTechnicalBaselineDraftV2,
): boolean {
  return stableJson(a) === stableJson(b);
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}
