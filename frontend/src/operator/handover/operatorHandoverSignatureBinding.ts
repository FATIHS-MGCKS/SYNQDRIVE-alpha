import {
  buildOperatorHandoverSignableContent,
  hashOperatorHandoverSignableContent,
  sha256FromSignatureDataUrl,
} from './operatorHandoverSignableContent';
import type { OperatorHandoverPayloadInput, OperatorHandoverFormState } from './operatorHandoverPayload';
import { buildOperatorHandoverPayload } from './operatorHandoverPayload';

export type HandoverSignerRole = 'customer' | 'operator';

export interface OperatorHandoverSignatureBinding {
  signerRole: HandoverSignerRole;
  signerReference: string | null;
  organizationId: string;
  bookingId: string;
  handoverSessionId: string;
  draftVersion: number;
  signableContentHash: string;
  imageContentSha256: string;
  signedAt: string;
  capturedBy: string;
  stationId: string | null;
  storageClientUploadId: string | null;
  typedName: string | null;
}

export interface OperatorHandoverSignatureBindingMeta {
  binding: OperatorHandoverSignatureBinding | null;
  invalidated: boolean;
  invalidatedAt: string | null;
  clientUploadId: string;
}

export function signatureClientUploadId(
  handoverSessionId: string,
  role: HandoverSignerRole,
): string {
  return `signature-${role}-${handoverSessionId}`;
}

export async function createOperatorHandoverSignatureBinding(input: {
  role: HandoverSignerRole;
  dataUrl: string;
  typedName: string | null;
  payloadInput: OperatorHandoverPayloadInput;
  organizationId: string;
  bookingId: string;
  customerId: string | null;
  handoverSessionId: string;
  draftVersion: number;
  capturedBy: string;
  stationId: string | null;
  staffId: string | null;
}): Promise<OperatorHandoverSignatureBinding> {
  const built = buildOperatorHandoverPayload(input.payloadInput);
  const handoverPayload = {
    odometerKm: built.odometerKm,
    fuelPercent: built.fuelPercent,
    fuelFull: built.fuelFull,
    exteriorClean: built.exteriorClean,
    interiorClean: built.interiorClean,
    tiresSeasonOk: built.tiresSeasonOk,
    warningLightsOn: built.warningLightsOn,
    warningLightsNotes: built.warningLightsNotes,
    notes: built.notes,
    documentsAcknowledged: built.documentsAcknowledged,
    damageIds: built.damageIds,
    technicalObservations: built.technicalObservations,
  };

  const signable = buildOperatorHandoverSignableContent(handoverPayload);
  const signableContentHash = await hashOperatorHandoverSignableContent(signable);
  const imageContentSha256 = await sha256FromSignatureDataUrl(input.dataUrl);

  return {
    signerRole: input.role,
    signerReference:
      input.role === 'customer' ? input.customerId : input.staffId || input.capturedBy,
    organizationId: input.organizationId,
    bookingId: input.bookingId,
    handoverSessionId: input.handoverSessionId,
    draftVersion: input.draftVersion,
    signableContentHash,
    imageContentSha256,
    signedAt: new Date().toISOString(),
    capturedBy: input.capturedBy,
    stationId: input.stationId,
    storageClientUploadId: signatureClientUploadId(input.handoverSessionId, input.role),
    typedName: input.typedName?.trim() || null,
  };
}

export function invalidateSignatureBindingMeta(
  meta: OperatorHandoverSignatureBindingMeta | null | undefined,
): OperatorHandoverSignatureBindingMeta | null {
  if (!meta) return null;
  return {
    ...meta,
    binding: null,
    invalidated: true,
    invalidatedAt: new Date().toISOString(),
  };
}

export const HANDOVER_SIGNATURE_CONSENT_TEXT =
  'Mit meiner Unterschrift bestätige ich, dass ich den angezeigten Übergabeinhalt (Fahrzeugzustand, Kilometerstand, Schäden, Dokumente) geprüft habe und mit dem Protokoll einverstanden bin.';

export const HANDOVER_OPERATOR_SIGNATURE_CONSENT_TEXT =
  'Mit meiner Unterschrift bestätige ich die ordnungsgemäße Durchführung der Übergabe gemäß dem erfassten Protokoll.';
