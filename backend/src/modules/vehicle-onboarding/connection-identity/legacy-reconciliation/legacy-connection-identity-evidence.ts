import type { Prisma } from '@prisma/client';
import { DIMO_DATA_SOURCE_PROVIDER, DIMO_DATA_SOURCE_TYPE } from '@modules/dimo/dimo-vehicle-data-source-link.contract';
import { resolveTelemetrySourceFamily } from '@modules/vehicle-intelligence/telemetry-source-family';
import { VehicleConnectionModality } from '../vehicle-connection-identity.contract';
import {
  verifyDimoConnectionFromMirrorEvidence,
  type DeviceBindingEvidence,
} from '../connection-modality-verification';
import {
  enrichDimoDeviceBindingEvidence,
  type DeviceBindingAssuranceLevel,
} from '../device-binding-assurance';

export type LegacyDimoEvidenceVerdict =
  | {
      ok: true;
      telemetrySourceFamily: 'RUPTELA_R1' | 'API_SYNTHETIC';
      verifiedModality: (typeof VehicleConnectionModality)[keyof typeof VehicleConnectionModality];
      physicalDeviceReference: string | 'NOT_APPLICABLE' | 'UNKNOWN';
      deviceBindingEvidence: DeviceBindingEvidence | null;
      deviceBindingAssurance: DeviceBindingAssuranceLevel | null;
      evidence: string[];
    }
  | { ok: false; reasonCode: string; evidence: string[] };

export async function evaluateLegacyDimoLinkProviderEvidence(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    vehicleId: string;
    linkId: string;
    dimoVehicleId: string;
    externalId: string;
  },
): Promise<LegacyDimoEvidenceVerdict> {
  const dimo = await tx.dimoVehicle.findUnique({
    where: { id: input.dimoVehicleId },
    select: { id: true, externalId: true, rawJson: true, tokenId: true },
  });
  if (!dimo) {
    return { ok: false, reasonCode: 'DIMO_MIRROR_MISSING', evidence: [`mirrorId:${input.dimoVehicleId}`] };
  }

  const ext = dimo.externalId?.trim();
  const expectedExt = input.externalId?.trim();
  if (!ext || !expectedExt || ext !== expectedExt) {
    return {
      ok: false,
      reasonCode: 'DIMO_EXTERNAL_REFERENCE_MISMATCH',
      evidence: [`mirrorExternal:${ext ?? 'null'}`, `linkExternal:${expectedExt ?? 'null'}`],
    };
  }

  const family = resolveTelemetrySourceFamily(dimo.rawJson);
  if (family === 'UNKNOWN') {
    return {
      ok: false,
      reasonCode: 'TELEMETRY_SOURCE_FAMILY_UNKNOWN',
      evidence: [`externalId:${ext}`],
    };
  }

  const live = verifyDimoConnectionFromMirrorEvidence(dimo.rawJson, ext);
  if (!live.ok) {
    return { ok: false, reasonCode: live.reasonCode, evidence: live.evidence };
  }

  if (family === 'API_SYNTHETIC') {
    if (live.verifiedModality !== VehicleConnectionModality.SOFTWARE_INTEGRATION) {
      return {
        ok: false,
        reasonCode: 'MODALITY_FAMILY_CONFLICT',
        evidence: [`family:${family}`, `modality:${live.verifiedModality}`],
      };
    }
    return {
      ok: true,
      telemetrySourceFamily: 'API_SYNTHETIC',
      verifiedModality: live.verifiedModality,
      physicalDeviceReference: live.physicalDeviceReference,
      deviceBindingEvidence: null,
      deviceBindingAssurance: null,
      evidence: live.evidence,
    };
  }

  if (family === 'RUPTELA_R1') {
    if (live.verifiedModality !== VehicleConnectionModality.HARDWARE_DEVICE) {
      return {
        ok: false,
        reasonCode: 'MODALITY_FAMILY_CONFLICT',
        evidence: [`family:${family}`, `modality:${live.verifiedModality}`],
      };
    }
    if (!live.deviceBindingEvidence?.deviceSerial?.trim()) {
      return {
        ok: false,
        reasonCode: 'RUPTELA_SERIAL_MISSING',
        evidence: live.evidence,
      };
    }

    const crossTenant = await tx.vehicleDataSourceLink.findFirst({
      where: {
        provider: DIMO_DATA_SOURCE_PROVIDER,
        sourceType: DIMO_DATA_SOURCE_TYPE,
        dimoVehicleId: dimo.id,
        isActive: true,
        vehicle: { organizationId: { not: input.organizationId } },
      },
      select: { id: true },
    });
    if (crossTenant) {
      return {
        ok: false,
        reasonCode: 'DIMO_MIRROR_ACTIVE_IN_OTHER_TENANT',
        evidence: [`otherLink:${crossTenant.id}`],
      };
    }

    const enriched = live.deviceBindingEvidence
      ? enrichDimoDeviceBindingEvidence(live.deviceBindingEvidence, dimo)
      : null;
    const assurance = enriched?.assurance ?? 'INSUFFICIENT';
    if (assurance === 'INSUFFICIENT') {
      return {
        ok: false,
        reasonCode: 'DEVICE_BINDING_ASSURANCE_INSUFFICIENT',
        evidence: live.evidence,
      };
    }

    return {
      ok: true,
      telemetrySourceFamily: 'RUPTELA_R1',
      verifiedModality: live.verifiedModality,
      physicalDeviceReference: live.physicalDeviceReference,
      deviceBindingEvidence: enriched,
      deviceBindingAssurance: assurance,
      evidence: live.evidence,
    };
  }

  return {
    ok: false,
    reasonCode: 'UNSUPPORTED_TELEMETRY_FAMILY',
    evidence: [`family:${family}`],
  };
}
