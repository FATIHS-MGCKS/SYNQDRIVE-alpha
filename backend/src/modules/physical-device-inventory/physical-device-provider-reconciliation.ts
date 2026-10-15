import { PhysicalDeviceModelCode } from '@prisma/client';
import { verifyDimoConnectionFromMirrorEvidence } from '@modules/vehicle-onboarding/connection-identity/connection-modality-verification';
import { resolveTelemetrySourceFamily } from '@modules/vehicle-intelligence/telemetry-source-family';

export type ProviderSerialReconciliationResult =
  | {
      ok: true;
      evidence: string[];
      providerSerial: string;
      telemetrySourceFamily: string;
    }
  | { ok: false; reasonCode: string; evidence: string[] };

export function reconcileInventorySerialWithDimoMirror(input: {
  modelCode: PhysicalDeviceModelCode;
  inventorySerial: string;
  dimoRawJson: unknown;
  dimoExternalId: string;
}): ProviderSerialReconciliationResult {
  if (input.modelCode !== PhysicalDeviceModelCode.RUPTELA_R1) {
    return {
      ok: false,
      reasonCode: 'PROVIDER_RECONCILIATION_MODEL_UNSUPPORTED',
      evidence: [`modelCode:${input.modelCode}`],
    };
  }

  const family = resolveTelemetrySourceFamily(input.dimoRawJson);
  const verified = verifyDimoConnectionFromMirrorEvidence(
    input.dimoRawJson,
    input.dimoExternalId,
  );
  if (!verified.ok) {
    return {
      ok: false,
      reasonCode: verified.reasonCode,
      evidence: verified.evidence,
    };
  }

  const providerSerial = verified.deviceBindingEvidence?.deviceSerial?.trim() ?? null;
  if (!providerSerial) {
    return {
      ok: false,
      reasonCode: 'PROVIDER_SERIAL_MISSING',
      evidence: verified.evidence,
    };
  }

  const inventoryNorm = input.inventorySerial.trim().toUpperCase();
  const providerNorm = providerSerial.trim().toUpperCase();
  if (inventoryNorm !== providerNorm) {
    return {
      ok: false,
      reasonCode: 'PROVIDER_SERIAL_INVENTORY_MISMATCH',
      evidence: [
        ...verified.evidence,
        'inventorySerial:masked',
        'providerSerial:masked',
        `family:${family}`,
      ],
    };
  }

  return {
    ok: true,
    evidence: [...verified.evidence, 'PROVIDER_INVENTORY_SERIAL_ALIGNED'],
    providerSerial,
    telemetrySourceFamily: family,
  };
}
