/** Signer role for handover protocol signatures (Prompt 24). */
export type HandoverSignerRole = 'customer' | 'operator';

/** Client-submitted signature binding — ties a drawn signature to reviewed signable content. */
export interface HandoverSignatureBindingInput {
  signerRole: HandoverSignerRole;
  /** Customer or operator user id when available; never raw PII beyond ids. */
  signerReference: string | null;
  organizationId: string;
  bookingId: string;
  handoverSessionId: string;
  draftVersion: number;
  /** SHA-256 of canonical signable content (excludes signature fields). */
  signableContentHash: string;
  /** SHA-256 of signature image bytes (PNG), not the data URL string. */
  imageContentSha256: string;
  signedAt: string;
  /** Operator user id who captured the signature on device. */
  capturedBy: string;
  stationId: string | null;
  /** Stable client upload id for private storage reference. */
  storageClientUploadId: string | null;
  typedName: string | null;
}

/** Persisted signature binding snapshot stored on completion records. */
export type HandoverSignatureBindingRecord = HandoverSignatureBindingInput;

export const HANDOVER_SIGNATURE_TARGET_REF_TYPE = 'HANDOVER_SIGNATURE_BINDING' as const;
