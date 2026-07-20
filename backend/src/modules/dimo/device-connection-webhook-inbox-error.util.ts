export class DeviceConnectionWebhookPermanentError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'DeviceConnectionWebhookPermanentError';
  }
}

export function isPermanentWebhookError(err: unknown): boolean {
  return err instanceof DeviceConnectionWebhookPermanentError;
}

export function resolveWebhookErrorCode(err: unknown): string {
  if (err instanceof DeviceConnectionWebhookPermanentError) return err.errorCode;
  if (err instanceof Error) return err.name || 'processing_error';
  return 'processing_error';
}

export function resolveWebhookErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
