import type { PrismaService } from '@shared/database/prisma.service';
import { DocumentExtractionStatus, DocumentExtractionType } from '@prisma/client';
import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import {
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
} from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import {
  evaluateReferenceCapacityCreate,
  isAllowedReferenceCapacitySource,
} from '@modules/vehicle-intelligence/battery-health/reference-capacity/vehicle-battery-reference-capacity.policy';
import type { VehicleOnboardingHvBatteryReferenceDraft } from '../contracts/vehicle-technical-baseline-draft.v2';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import {
  readBatteryScope,
  readCapacityKwh,
  readSohSource,
} from '@modules/document-extraction/document-battery-extraction.rules';

/** Sources that imply verified provenance — never infer from client enum alone on HM ingress. */
export const HM_BATTERY_HIGH_TRUST_SOURCES: readonly BatteryReferenceCapacitySource[] = [
  BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
  BatteryReferenceCapacitySource.BMS_REPORT,
  BatteryReferenceCapacitySource.WORKSHOP_DOCUMENT,
];

const ONBOARDING_DOCUMENT_OK: DocumentExtractionStatus[] = [
  DocumentExtractionStatus.CONFIRMED,
  DocumentExtractionStatus.APPLIED,
];

const CAPACITY_MATCH_EPSILON_KWH = 0.5;

function pickDocumentPayload(confirmed: unknown, extracted: unknown): Record<string, unknown> | null {
  if (confirmed && typeof confirmed === 'object' && !Array.isArray(confirmed)) {
    return confirmed as Record<string, unknown>;
  }
  if (extracted && typeof extracted === 'object' && !Array.isArray(extracted)) {
    return extracted as Record<string, unknown>;
  }
  return null;
}

function capacityMatchesClaimed(documentKwh: number, claimedKwh: number): boolean {
  return Math.abs(documentKwh - claimedKwh) <= CAPACITY_MATCH_EPSILON_KWH;
}

function documentSupportsHighTrustSource(
  source: BatteryReferenceCapacitySource,
  effectiveType: DocumentExtractionType | null,
  payload: Record<string, unknown>,
): boolean {
  switch (source) {
    case BatteryReferenceCapacitySource.BMS_REPORT:
      return readSohSource(payload) === 'HV_BMS_REPORT';
    case BatteryReferenceCapacitySource.WORKSHOP_DOCUMENT:
      return (
        effectiveType === DocumentExtractionType.SERVICE ||
        effectiveType === DocumentExtractionType.BATTERY
      );
    case BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED:
      return (
        effectiveType === DocumentExtractionType.REGISTRATION_CERTIFICATE ||
        effectiveType === DocumentExtractionType.BATTERY
      );
    default:
      return false;
  }
}

export function assertHmOnlyBatteryInputContract(dto: RegisterHmOnlyVehicleDto): void {
  if (dto.hvBatteryReferenceServiceEventId?.trim()) {
    throw new VehicleOnboardingError(
      'INVALID_CAPTURE_PAYLOAD',
      'HM_ONLY canonical registration does not accept hvBatteryReferenceServiceEventId (onboarding baseline contract is document-only)',
    );
  }
}

/**
 * Resolves HM HV battery reference for technical baseline capture.
 * High-trust sources require confirmed/applied document with matching HV capacity.
 */
export async function resolveHmOnlyHvBatteryReference(
  prisma: PrismaService,
  organizationId: string,
  dto: RegisterHmOnlyVehicleDto,
): Promise<VehicleOnboardingHvBatteryReferenceDraft | undefined> {
  assertHmOnlyBatteryInputContract(dto);

  const capacity = dto.hvBatteryUsableCapacityKwh;
  const sourceRaw = dto.hvBatteryReferenceSource?.trim();
  const documentId = dto.hvBatteryReferenceDocumentId?.trim() || null;

  if (capacity == null || !Number.isFinite(capacity) || capacity <= 0) {
    return undefined;
  }
  if (!sourceRaw || !isAllowedReferenceCapacitySource(sourceRaw as BatteryReferenceCapacitySource)) {
    return undefined;
  }
  const source = sourceRaw as BatteryReferenceCapacitySource;

  const createEval = evaluateReferenceCapacityCreate({
    capacityKwh: capacity,
    capacityType: BatteryReferenceCapacityType.USABLE,
    source,
    documentId,
    serviceEventId: null,
  });
  if (!createEval.ok) {
    return undefined;
  }

  const isHighTrust = (HM_BATTERY_HIGH_TRUST_SOURCES as readonly string[]).includes(source);

  if (isHighTrust) {
    if (!documentId) {
      return undefined;
    }
    return substantiateHighTrustReference(prisma, organizationId, {
      capacityKwh: capacity,
      source,
      documentId,
    });
  }

  if (source === BatteryReferenceCapacitySource.MANUAL_VERIFIED) {
    if (!documentId) {
      return undefined;
    }
    await assertOnboardingDocumentScope(prisma, organizationId, documentId);
    return {
      capacityKwh: capacity,
      capacityType: BatteryReferenceCapacityType.USABLE,
      source,
      documentId,
      serviceEventId: null,
    };
  }

  return undefined;
}

async function substantiateHighTrustReference(
  prisma: PrismaService,
  organizationId: string,
  input: {
    capacityKwh: number;
    source: BatteryReferenceCapacitySource;
    documentId: string;
  },
): Promise<VehicleOnboardingHvBatteryReferenceDraft | undefined> {
  const doc = await prisma.vehicleDocumentExtraction.findUnique({
    where: { id: input.documentId },
    select: {
      organizationId: true,
      vehicleId: true,
      status: true,
      effectiveDocumentType: true,
      confirmedData: true,
      extractedData: true,
    },
  });

  if (!doc || doc.organizationId !== organizationId || doc.vehicleId != null) {
    throw new VehicleOnboardingError(
      'TECHNICAL_BASELINE_EVIDENCE_SCOPE_MISMATCH',
      'Battery reference document is not available for this organization onboarding case',
      { documentId: input.documentId },
    );
  }

  if (!ONBOARDING_DOCUMENT_OK.includes(doc.status)) {
    throw new VehicleOnboardingError(
      'INVALID_CAPTURE_PAYLOAD',
      'Battery reference document is not confirmed or applied — cannot substantiate reference source',
      { documentId: input.documentId, status: doc.status },
    );
  }

  const payload = pickDocumentPayload(doc.confirmedData, doc.extractedData);
  if (!payload) {
    throw new VehicleOnboardingError(
      'INVALID_CAPTURE_PAYLOAD',
      'Battery reference document has no confirmed extraction payload',
      { documentId: input.documentId },
    );
  }

  if (readBatteryScope(payload) !== 'hv') {
    throw new VehicleOnboardingError(
      'INVALID_CAPTURE_PAYLOAD',
      'Battery reference document does not substantiate HV capacity',
      { documentId: input.documentId },
    );
  }

  const docKwh = readCapacityKwh(payload);
  if (docKwh == null || !capacityMatchesClaimed(docKwh, input.capacityKwh)) {
    throw new VehicleOnboardingError(
      'INVALID_CAPTURE_PAYLOAD',
      'Battery reference document capacity does not match stated usable capacity',
      { documentId: input.documentId, documentKwh: docKwh, claimedKwh: input.capacityKwh },
    );
  }

  if (!documentSupportsHighTrustSource(input.source, doc.effectiveDocumentType, payload)) {
    throw new VehicleOnboardingError(
      'INVALID_CAPTURE_PAYLOAD',
      'Battery reference document does not authorize the requested reference source',
      { documentId: input.documentId, source: input.source },
    );
  }

  return {
    capacityKwh: input.capacityKwh,
    capacityType: BatteryReferenceCapacityType.USABLE,
    source: input.source,
    documentId: input.documentId,
    serviceEventId: null,
  };
}

async function assertOnboardingDocumentScope(
  prisma: PrismaService,
  organizationId: string,
  documentId: string,
): Promise<void> {
  const doc = await prisma.vehicleDocumentExtraction.findUnique({
    where: { id: documentId },
    select: { organizationId: true, vehicleId: true },
  });
  if (!doc || doc.organizationId !== organizationId || doc.vehicleId != null) {
    throw new VehicleOnboardingError(
      'TECHNICAL_BASELINE_EVIDENCE_SCOPE_MISMATCH',
      'Battery reference document is not available for this organization onboarding case',
      { documentId },
    );
  }
}