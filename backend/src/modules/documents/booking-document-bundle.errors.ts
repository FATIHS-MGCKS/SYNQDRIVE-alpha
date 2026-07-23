/**
 * Controlled internal errors for booking document bundle pointer wiring.
 * These are not user-facing API errors — they signal engineering/monitoring issues.
 */
export class BookingDocumentBundlePointerMappingError extends Error {
  readonly code = 'BOOKING_BUNDLE_POINTER_MAPPING_MISSING' as const;

  constructor(public readonly documentType: string) {
    super(`No bundle pointer mapping for document type: ${documentType}`);
    this.name = 'BookingDocumentBundlePointerMappingError';
  }
}

export class BookingDocumentBundleResolverConflictError extends Error {
  readonly code = 'BOOKING_BUNDLE_LEGAL_RESOLVER_CONFLICT' as const;

  constructor(
    public readonly organizationId: string,
    public readonly bookingId: string,
    public readonly conflicts: Array<{ documentType: string; code: string; message: string }>,
  ) {
    super(
      `Legal document resolver conflict for booking ${bookingId}: ${conflicts
        .map((c) => `${c.documentType}:${c.code}`)
        .join(', ')}`,
    );
    this.name = 'BookingDocumentBundleResolverConflictError';
  }
}
