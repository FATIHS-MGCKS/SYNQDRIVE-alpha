export class RegistryBillingPermanentIntegrityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RegistryBillingPermanentIntegrityError';
  }
}

export function isRegistryBillingPermanentIntegrityError(error: unknown): boolean {
  return error instanceof RegistryBillingPermanentIntegrityError;
}
