import { createHash } from 'crypto';
import { ConflictException } from '@nestjs/common';
import type { CreateHandoverProtocolPayload } from '../handover.types';
import {
  buildHandoverCompletionCanonicalPayload,
  hashHandoverSignableContent,
  type HandoverCompletionCanonicalContext,
} from './handover-completion-payload.canonical';
import type {
  HandoverSignatureBindingInput,
  HandoverSignerRole,
} from './handover-signature-binding.types';
import { HANDOVER_SIGNATURE_BINDING_ERROR } from './handover-signature-binding.errors';

export interface ValidateSignatureBindingsContext {
  organizationId: string;
  bookingId: string;
  handoverSessionId: string;
  draftVersion: number;
  stationId: string | null;
  capturedBy: string;
  canonicalContext: HandoverCompletionCanonicalContext;
}

export interface SignatureUploadRow {
  clientUploadId: string;
  kind: string;
  status: string;
  bookingId: string;
  handoverSessionId: string | null;
  contentSha256: string | null;
  organizationId: string;
}

export function sha256FromSignatureDataUrl(dataUrl: string): string {
  const trimmed = dataUrl.trim();
  const match = /^data:([^;]+);base64,(.+)$/i.exec(trimmed);
  if (!match?.[2]) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.INVALID_IMAGE,
      message: 'Signature image format is invalid',
    });
  }
  const buffer = Buffer.from(match[2], 'base64');
  return createHash('sha256').update(buffer).digest('hex');
}

export function resolveSignatureDataUrlForRole(
  payload: CreateHandoverProtocolPayload,
  role: HandoverSignerRole,
): string | null {
  if (role === 'customer') {
    return payload.customerSignatureDataUrl?.trim() || null;
  }
  return payload.staffSignatureDataUrl?.trim() || null;
}

export function validateHandoverSignatureBindings(
  payload: CreateHandoverProtocolPayload,
  bindings: HandoverSignatureBindingInput[] | null | undefined,
  context: ValidateSignatureBindingsContext,
  uploadsByClientId: Map<string, SignatureUploadRow>,
): HandoverSignatureBindingInput[] {
  if (!bindings || bindings.length === 0) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.REQUIRED,
      message: 'Signature bindings are required',
    });
  }

  const canonical = buildHandoverCompletionCanonicalPayload(
    payload,
    context.canonicalContext,
  );
  const expectedSignableHash = hashHandoverSignableContent(canonical);

  const byRole = new Map<HandoverSignerRole, HandoverSignatureBindingInput>();
  for (const binding of bindings) {
    assertBindingScope(binding, context, expectedSignableHash);
    const dataUrl = resolveSignatureDataUrlForRole(payload, binding.signerRole);
    if (!dataUrl) {
      throw new ConflictException({
        code: HANDOVER_SIGNATURE_BINDING_ERROR.ROLE_IMAGE_MISSING,
        message: `Drawn signature image required for ${binding.signerRole}`,
        signerRole: binding.signerRole,
      });
    }
    const imageHash = sha256FromSignatureDataUrl(dataUrl);
    if (imageHash !== binding.imageContentSha256) {
      throw new ConflictException({
        code: HANDOVER_SIGNATURE_BINDING_ERROR.IMAGE_HASH_MISMATCH,
        message: 'Signature image does not match binding hash',
        signerRole: binding.signerRole,
      });
    }

    if (binding.storageClientUploadId) {
      const upload = uploadsByClientId.get(binding.storageClientUploadId);
      if (!upload) {
        throw new ConflictException({
          code: HANDOVER_SIGNATURE_BINDING_ERROR.UPLOAD_NOT_FOUND,
          message: 'Signature storage reference not found',
          signerRole: binding.signerRole,
        });
      }
      assertSignatureUploadOwnership(upload, context, binding);
      if (upload.contentSha256 && upload.contentSha256 !== binding.imageContentSha256) {
        throw new ConflictException({
          code: HANDOVER_SIGNATURE_BINDING_ERROR.UPLOAD_HASH_MISMATCH,
          message: 'Stored signature upload does not match binding',
          signerRole: binding.signerRole,
        });
      }
    }

    if (byRole.has(binding.signerRole)) {
      throw new ConflictException({
        code: HANDOVER_SIGNATURE_BINDING_ERROR.DUPLICATE_ROLE,
        message: `Duplicate signature binding for ${binding.signerRole}`,
      });
    }
    byRole.set(binding.signerRole, binding);
  }

  if (!byRole.has('customer')) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.CUSTOMER_REQUIRED,
      message: 'Customer signature binding is required',
    });
  }
  if (!byRole.has('operator')) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.OPERATOR_REQUIRED,
      message: 'Operator signature binding is required',
    });
  }

  return bindings;
}

function assertBindingScope(
  binding: HandoverSignatureBindingInput,
  context: ValidateSignatureBindingsContext,
  expectedSignableHash: string,
): void {
  if (binding.organizationId !== context.organizationId) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.SCOPE_MISMATCH,
      message: 'Signature binding organization mismatch',
    });
  }
  if (binding.bookingId !== context.bookingId) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.SCOPE_MISMATCH,
      message: 'Signature binding booking mismatch',
    });
  }
  if (binding.handoverSessionId !== context.handoverSessionId) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.SCOPE_MISMATCH,
      message: 'Signature binding handover session mismatch',
    });
  }
  if (binding.draftVersion !== context.draftVersion) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.DRAFT_VERSION_MISMATCH,
      message: 'Signature binding draft version mismatch',
    });
  }
  if (binding.signableContentHash !== expectedSignableHash) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.CONTENT_HASH_MISMATCH,
      message: 'Signature is not bound to current handover content',
    });
  }
  if (binding.capturedBy !== context.capturedBy) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.CAPTURED_BY_MISMATCH,
      message: 'Signature capturedBy does not match completing operator',
    });
  }
  if (
    context.stationId &&
    binding.stationId &&
    binding.stationId !== context.stationId
  ) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.SCOPE_MISMATCH,
      message: 'Signature binding station mismatch',
    });
  }
}

function assertSignatureUploadOwnership(
  upload: SignatureUploadRow,
  context: ValidateSignatureBindingsContext,
  binding: HandoverSignatureBindingInput,
): void {
  if (upload.organizationId !== context.organizationId) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.UPLOAD_FOREIGN,
      message: 'Signature upload belongs to another organization',
    });
  }
  if (upload.bookingId !== context.bookingId) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.UPLOAD_FOREIGN,
      message: 'Signature upload belongs to another booking',
    });
  }
  if (
    upload.handoverSessionId &&
    upload.handoverSessionId !== context.handoverSessionId
  ) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.UPLOAD_FOREIGN,
      message: 'Signature upload belongs to another handover session',
    });
  }
  if (upload.kind !== 'SIGNATURE') {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.UPLOAD_FOREIGN,
      message: 'Upload kind is not SIGNATURE',
    });
  }
  if (!['UPLOADED', 'PROCESSING'].includes(upload.status)) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.UPLOAD_INCOMPLETE,
      message: 'Signature upload is not complete',
      signerRole: binding.signerRole,
    });
  }
}
